import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PROJECTS, canHop, lastPlayer, project, special, useGame, type Direction, type Player } from "./game";
import { Leaderboard } from "./Leaderboard";
import { Critters } from "./Critters";
import { Hud } from "./Hud";
import { IconButton } from "./icons";
import { PosterView } from "./PosterView";
import { sound, useMuted } from "./sound";
import { StartPicker } from "./StartPicker";
import { Wall } from "./Wall";

// three.js is most of the download; a device that falls back to the list never needs it.
const Graph3D = lazy(() => import("./Graph3D").then((m) => ({ default: m.Graph3D })));
const StartMap = lazy(() => import("./StartMap").then((m) => ({ default: m.StartMap })));

const SHEET_SCROLL_STEP = 90;
const KEY_DIRECTIONS: Record<string, Direction> = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left" };

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

const LINKS = [
  { href: "https://github.com/yasinmiran/bhhops", label: "Source of this game", github: true },
  { href: "https://github.com/elixir-europe/biohackathon-projects-2026", label: "The 31 project descriptions", github: true },
  { href: "https://biohackathon-europe.org/", label: "BioHackathon Europe", github: false },
];

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

/** Turns the game's sounds off and on again. */
export function SoundSwitch() {
  const [muted, toggle] = useMuted();
  // The name stays "Mute" and the pressed state says whether it is on, which is how a screen reader expects a toggle.
  return <IconButton picture={muted ? "soundOff" : "soundOn"} label="Mute" hint={muted ? "Unmute" : "Mute"} pressed={muted} onClick={toggle} />;
}

/** The black screen once the black hole has the helix, with the news told as a crawl into the distance. */
function Oblivion({ hop, seen, onRetry }: { hop: number; seen: number; onRetry: () => void }) {
  // The way out appears only once the screen has gone dark: a key already on its way down must not press it unseen.
  const [dark, setDark] = useState(false);
  return (
    // The helix needs a moment to fall in before the lights go out.
    <motion.div
      className="oblivion"
      role="alertdialog"
      aria-labelledby="oblivion-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.9, duration: 0.9 }}
      onAnimationComplete={() => setDark(true)}
    >
      <div className="oblivion-stage">
        <div className="oblivion-plane">
          <div className="oblivion-crawl">
            <p className="oblivion-episode">Hop {hop}</p>
            <h2 id="oblivion-title">Oblivion</h2>
            <p>You just went into the oblivion.</p>
            <p>
              The black hole has your helix, and {seen} of {PROJECTS.length} projects went in with it. No thread leads out. No arrow key works
              here.
            </p>
            <p>Far above, a turtle walks on, a croissant has places to be, and the leaderboard does not know your name.</p>
            <p>There is one way back. It is the button.</p>
          </div>
        </div>
      </div>
      {dark && (
        <button className="oblivion-retry" autoFocus onClick={onRetry}>
          Try again
        </button>
      )}
    </motion.div>
  );
}

interface StartProps {
  /** Covered by a poster or the leaderboard: keys and focus must not reach the form underneath. */
  hidden: boolean;
  player: Player | null;
  onJoin: (name: string) => Promise<Player>;
  onStart: (id: number, as: Player) => Promise<void>;
  onBoard: () => void;
  onForget: () => void;
  /** The map could not be downloaded or drawn; the game could not be either. */
  onMapFail: () => void;
}

function StartNote({ hidden, player, onJoin, onStart, onBoard, onForget, onMapFail }: StartProps) {
  const still = useReducedMotion();
  const [name, setName] = useState(() => lastPlayer()?.name ?? "");
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const as = player ?? (await onJoin(name));
      await onStart(choice ?? PROJECTS[Math.floor(Math.random() * PROJECTS.length)].id, as);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="start" inert={hidden}>
      <motion.form className="start-note" onSubmit={begin} initial={{ scale: 0.7, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: -0.8, opacity: 1 }}>
        <div className="start-intro">
        <h1>31 Hops</h1>
        <p>
          Every BioHackathon project is a sticky note, and a thread joins the ones working on the same thing. Travel the
          threads with the arrow keys and visit all 31 in as few hops as you can. The clock breaks ties.
        </p>
        <p>
          Do not trust the map. Some threads are loose ends, some only show once you reach them, and a few notes are
          not projects at all. A wormhole throws you somewhere else. The black hole ends your tour.
        </p>
        {player ? (
          <p className="start-player">
            Playing as <strong>{player.name}</strong>.{" "}
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                // Whoever says this is not that player, so their name is not offered back to them.
                setName("");
                onForget();
              }}
            >
              Not you?
            </button>
          </p>
        ) : (
          <div className="field">
            <label htmlFor="player-name">Your name on the leaderboard</label>
            <input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              // A remembered name is replaced by typing, without clearing it first.
              onFocus={(e) => e.target.select()}
              minLength={2}
              maxLength={20}
              autoComplete="given-name"
              required
              autoFocus
            />
          </div>
        )}
        </div>
        <div className="start-pick field">
          <span id="start-label">Where you start matters. Pick a project, or leave it to chance</span>
          <GraphBoundary onFail={onMapFail}>
            <Suspense fallback={<div className="start-map" />}>
              <StartMap value={choice} onChange={setChoice} />
            </Suspense>
          </GraphBoundary>
          <StartPicker value={choice} onChange={setChoice} labelledBy="start-label" />
        </div>
        <div className="start-go">
        {error && <p className="error">{error}</p>}
        <div className="start-actions">
          <motion.button
            className="marker-button"
            disabled={busy}
            // A slow beat while it waits to be pressed.
            animate={busy || still ? { scale: 1 } : { scale: [1, 1.05, 1] }}
            transition={busy || still ? { duration: 0.1 } : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            whileHover={{ scale: 1.07, rotate: -1.5 }}
            whileTap={{ scale: 0.95 }}
          >
            {busy ? "Starting…" : "Start the clock"}
          </motion.button>
          <IconButton picture="board" label="Leaderboard" onClick={onBoard} />
          <SoundSwitch />
        </div>
        </div>
      </motion.form>
      <footer className="start-links">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
            {link.github && <GithubMark />}
            {link.label}
          </a>
        ))}
      </footer>
    </div>
  );
}

export function App() {
  const { player, run, saving, join, start, hop, abandon, forget } = useGame();
  const [boardOpen, setBoardOpen] = useState(false);
  const [openId, setOpenId] = useState(idFromHash);
  const [overview, setOverview] = useState(false);
  const [canDraw] = useState(webglAvailable);
  const [graphFailed, setGraphFailed] = useState(false);
  // Whether the open sheet was reached from inside the app, in which case "back" closes it.
  const openedHere = useRef(false);
  const sheetOverlay = useRef<HTMLDivElement | null>(null);
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

  // The party popper goes off when the last project is reached, not when a finished tour is reloaded.
  const wasComplete = useRef(run?.complete ?? false);
  useEffect(() => {
    const complete = run?.complete ?? false;
    if (complete && !wasComplete.current) sound.finale();
    wasComplete.current = complete;
  }, [run?.complete]);

  const travel = useCallback(
    (to: number) => {
      if (!run || run.lost || !canHop(run.current, to)) return;
      const hole = special(to);
      // Once the tour is scored the holes do nothing, so they make no sound either.
      if (hole && run.complete) return;
      if (hole) sound[hole.kind === "blackhole" ? "oblivion" : "warp"]();
      else if (run.visited.includes(to)) sound.hop();
      else sound.discover(run.visited.length + 1);
      setOverview(false);
      hop(to);
    },
    [run, hop],
  );

  const move = useCallback(
    (direction: Direction) => {
      if (!run || run.lost) return;
      const to = project(run.current).arrows[direction];
      if (to !== null) travel(to);
      else sound.bump();
    },
    [run, travel],
  );

  const openSheet = (id: number) => {
    sound.page();
    location.hash = `#/p/${id}`;
  };

  const closeSheet = () => {
    sound.page();
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
      if (openId !== null) {
        if (event.key === "Escape") return closeSheet();
        const overlay = sheetOverlay.current;
        // A zoomed poster keeps the arrows for looking around it.
        if (!overlay || event.metaKey || event.ctrlKey || event.altKey || overlay.querySelector(".zoomed")) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          closeSheet();
        } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !overlay.contains(document.activeElement)) {
          // The browser scrolls the sheet itself while focus is inside it; this covers focus having gone elsewhere.
          event.preventDefault();
          overlay.scrollBy({ top: event.key === "ArrowUp" ? -SHEET_SCROLL_STEP : SHEET_SCROLL_STEP });
        }
        return;
      }
      // In the black hole no key does anything but the one button on screen.
      if (!onGraph || run?.lost || event.metaKey || event.ctrlKey || event.altKey) return;
      const direction = KEY_DIRECTIONS[event.key];
      if (direction) {
        event.preventDefault();
        // One hop per press: a held key would otherwise run the helix across the graph.
        if (!event.repeat) move(direction);
      } else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
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
  const focusSheet = useCallback((node: HTMLDivElement | null) => {
    // A sheet that is still sliding away unmounts after the next one has opened, and must not take the newer one's place.
    if (!node) return;
    sheetOverlay.current = node;
    node.focus({ preventScroll: true });
  }, []);

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
          <Critters active={!hidden && !run.complete && !run.lost} />
          <Hud
            run={run}
            player={player}
            saving={saving}
            overview={overview}
            hidden={hidden || run.lost}
            onMove={move}
            onOpen={() => openSheet(run.current)}
            onOverview={() => setOverview((was) => !was)}
            onBoard={() => setBoardOpen(true)}
            onRestart={() => {
              setOverview(false);
              abandon();
            }}
            soundSwitch={<SoundSwitch />}
          />
          {run.lost && (
            <Oblivion
              hop={run.hops + 1}
              seen={run.visited.length}
              onRetry={() => {
                setOverview(false);
                abandon();
              }}
            />
          )}
        </>
      ) : (
        <StartNote
          hidden={hidden}
          player={player}
          onJoin={join}
          onStart={start}
          onBoard={() => setBoardOpen(true)}
          onForget={forget}
          onMapFail={() => setGraphFailed(true)}
        />
      )}
      {sheet}
      {board}
    </>
  );
}
