import { AnimatePresence, motion } from "motion/react";
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PROJECTS, edgeBetween, project, useGame, type Direction, type Player } from "./game";
import { Leaderboard } from "./Leaderboard";
import { Hud } from "./Hud";
import { PosterView } from "./PosterView";
import { Wall } from "./Wall";

// three.js is most of the download; a device that falls back to the list never needs it.
const Graph3D = lazy(() => import("./Graph3D").then((m) => ({ default: m.Graph3D })));

const KEY_DIRECTIONS: Record<string, Direction> = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left" };
const REASON_MS = 2600;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    // WebGL 2 specifically: three.js no longer draws with WebGL 1.
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

/** Reports when the 3D graph cannot be downloaded or drawn, so a bad connection leads to the list and not a blank page. */
class GraphBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("the 3D graph failed:", error);
    this.props.onFail();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const idFromHash = () => {
  const id = Number(location.hash.match(/^#\/p\/(\d+)$/)?.[1]);
  return PROJECTS.some((p) => p.id === id) ? id : null;
};

interface StartProps {
  /** Covered by a poster or the leaderboard: keys and focus must not reach the form underneath. */
  hidden: boolean;
  player: Player | null;
  onJoin: (name: string) => Promise<Player>;
  onStart: (id: number, as: Player) => Promise<void>;
  onBoard: () => void;
  onForget: () => void;
}

function StartNote({ hidden, player, onJoin, onStart, onBoard, onForget }: StartProps) {
  const [name, setName] = useState("");
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const as = player ?? (await onJoin(name));
      await onStart(choice ? Number(choice) : PROJECTS[Math.floor(Math.random() * PROJECTS.length)].id, as);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="start" inert={hidden}>
      <motion.form className="start-note" onSubmit={begin} initial={{ scale: 0.7, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: -1.5, opacity: 1 }}>
        <h1>31 Hops</h1>
        <p>
          Every BioHackathon project is a sticky note, and a thread joins the ones working on the same thing. Travel the
          threads with the arrow keys and visit all 31 in as few hops as you can. The clock breaks ties, and where you
          start matters.
        </p>
        {player ? (
          <p className="start-player">
            Playing as <strong>{player.name}</strong>.{" "}
            <button type="button" className="quiet-button" onClick={onForget}>
              Not you?
            </button>
          </p>
        ) : (
          <label>
            Your name on the leaderboard
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={20} autoComplete="nickname" required autoFocus />
          </label>
        )}
        <label>
          Start at
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">A random project</option>
            {PROJECTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}. {p.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="start-actions">
          <button className="marker-button" disabled={busy}>
            {busy ? "Starting…" : "Start the clock"}
          </button>
          <button type="button" className="quiet-button" onClick={onBoard}>
            See the leaderboard
          </button>
        </div>
      </motion.form>
    </div>
  );
}

export function App() {
  const { player, run, saving, join, start, hop, abandon, forget } = useGame();
  const [boardOpen, setBoardOpen] = useState(false);
  const [openId, setOpenId] = useState(idFromHash);
  const [overview, setOverview] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [canDraw] = useState(webglAvailable);
  const [graphFailed, setGraphFailed] = useState(false);
  // Whether the open sheet was reached from inside the app, in which case "back" closes it.
  const openedHere = useRef(false);
  const playing = canDraw && !graphFailed;
  const onGraph = playing && run !== null && player !== null;

  useEffect(() => {
    const onHash = () => {
      const id = idFromHash();
      // A hash change while the app is open came from a tap inside it, whichever view made it.
      if (id !== null) openedHere.current = true;
      setOpenId(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("sheet-open", openId !== null);
    // Only the graph locks scrolling; the start note has to scroll on a short landscape phone.
    document.body.classList.toggle("playing", onGraph);
  }, [openId, onGraph]);

  useEffect(() => {
    if (!reason) return;
    const timer = setTimeout(() => setReason(null), REASON_MS);
    return () => clearTimeout(timer);
  }, [reason, run?.hops]);

  const travel = useCallback(
    (to: number) => {
      if (!run) return;
      const edge = edgeBetween(run.current, to);
      if (!edge) return;
      setOverview(false);
      setReason(edge.reason);
      hop(to);
    },
    [run, hop],
  );

  const move = useCallback(
    (direction: Direction) => {
      const to = run ? project(run.current).arrows[direction] : null;
      if (to !== null) travel(to);
    },
    [run, travel],
  );

  const openSheet = (id: number) => {
    location.hash = `#/p/${id}`;
  };

  const closeSheet = () => {
    if (openedHere.current) {
      openedHere.current = false;
      history.back();
    } else {
      // Arrived by a link straight to a poster: there is nothing of ours to go back to.
      history.replaceState(null, "", `${location.pathname}${location.search}#/`);
      setOpenId(null);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (boardOpen) return;
      if (event.key === "Escape" && openId !== null) return closeSheet();
      if (!onGraph || openId !== null || event.metaKey || event.ctrlKey || event.altKey) return;
      const direction = KEY_DIRECTIONS[event.key];
      if (direction) {
        event.preventDefault();
        // One hop per press: a held key would otherwise run the star across the graph.
        if (!event.repeat) move(direction);
      } else if ((event.key === "Enter" || event.key === " ") && !(event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement)) {
        event.preventDefault();
        if (run) openSheet(run.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, openId, boardOpen, onGraph, move]);

  const tapNote = (id: number) => {
    if (!run) return;
    if (id === run.current) openSheet(id);
    else travel(id);
  };

  // The page behind is locked, so the sheet has to hold focus for arrow keys and Space to scroll it.
  const focusSheet = useCallback((node: HTMLDivElement | null) => node?.focus({ preventScroll: true }), []);

  const sheet = (
    <AnimatePresence>
      {openId !== null && (
        <motion.div
          key={openId}
          ref={focusSheet}
          tabIndex={-1}
          className="sheet-overlay"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 260, damping: 32 }}
        >
          <PosterView
            p={project(openId)}
            onClose={closeSheet}
            onHop={
              onGraph && run && openId === run.current
                ? (to) => {
                    closeSheet();
                    travel(to);
                  }
                : undefined
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  );

  const hidden = openId !== null || boardOpen;
  const board = <AnimatePresence>{boardOpen && <Leaderboard player={player} onClose={() => setBoardOpen(false)} />}</AnimatePresence>;
  if (!playing) {
    const note = graphFailed
      ? "The 3D graph did not load, so here they are as a list. Reload to try again."
      : "This device cannot draw the 3D graph, so here they are as a list.";
    return (
      <>
        <Wall note={note} hidden={hidden} />
        {sheet}
      </>
    );
  }

  return (
    <>
      {run && player ? (
        <>
          <GraphBoundary onFail={() => setGraphFailed(true)}>
            <Suspense fallback={<p className="loading">Pinning up the notes…</p>}>
              <Graph3D run={run} overview={overview} onMove={move} onTap={tapNote} />
            </Suspense>
          </GraphBoundary>
          <Hud
            run={run}
            player={player}
            saving={saving}
            reason={reason}
            overview={overview}
            hidden={hidden}
            onMove={move}
            onOpen={() => openSheet(run.current)}
            onOverview={() => setOverview((was) => !was)}
            onBoard={() => setBoardOpen(true)}
            onRestart={() => {
              setOverview(false);
              abandon();
            }}
          />
        </>
      ) : (
        <StartNote hidden={hidden} player={player} onJoin={join} onStart={start} onBoard={() => setBoardOpen(true)} onForget={forget} />
      )}
      {sheet}
      {board}
    </>
  );
}
