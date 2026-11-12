import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { clock } from "./api";
import { IconButton } from "./icons";
import { PROJECTS, place, project, special, theme, type Direction, type Player, type Project, type Run, type Saving } from "./game";

const GLYPH: Record<Direction, string> = { up: "↑", right: "→", down: "↓", left: "←" };

interface HudProps {
  run: Run;
  player: Player;
  saving: Saving;
  overview: boolean;
  hidden: boolean;
  onMove: (direction: Direction) => void;
  onOpen: () => void;
  onOverview: () => void;
  onBoard: () => void;
  onRestart: () => void;
  /** The mute button, which the start note shows too. */
  soundSwitch: ReactNode;
}

/** Elapsed time, ticking once a second until the server has given the official time. */
function Timer({ run }: { run: Run }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (run.result) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run.result, run.startedAt]);
  return <>{clock(run.result ? run.result.durationMs : now - run.startedAt)}</>;
}

async function share(run: Run): Promise<void> {
  const result = run.result!;
  const payload = {
    text: `I toured all ${PROJECTS.length} BioHackathon projects in ${result.hops} hops and ${clock(result.durationMs)}. Place ${result.rank} of ${result.finishers}.`,
    url: location.href.split("#")[0],
  };
  try {
    if (navigator.share) await navigator.share(payload);
    else await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
  } catch {
    // Dismissing the share sheet is not an error worth showing.
  }
}

function ArrowKey({ direction, here, onMove }: { direction: Direction; here: Project; onMove: (direction: Direction) => void }) {
  const to = here.arrows[direction];
  return (
    <button
      className={`dpad-key dpad-${direction}`}
      disabled={to === null}
      onClick={() => onMove(direction)}
      aria-label={to === null ? `Nothing ${direction}` : special(to) ? `Go ${direction} into ${place(to).name}` : `Go ${direction} to project ${to}, ${place(to).name}`}
    >
      {GLYPH[direction]}
    </button>
  );
}

export function Hud({ run, player, saving, overview, hidden, onMove, onOpen, onOverview, onBoard, onRestart, soundSwitch }: HudProps) {
  const here = project(run.current);
  // Par depends on where the tour began: some starts allow a shorter tour than others.
  const par = project(run.start).par;
  const [finaleSeen, setFinaleSeen] = useState(false);
  useEffect(() => {
    if (!run.complete) setFinaleSeen(false);
  }, [run.complete]);

  return (
    <div
      className="hud"
      inert={hidden}
      // A mouse or touch press should not leave a button focused, or the next Enter would press it again instead of opening the poster.
      onClick={(event) => event.detail > 0 && (document.activeElement as HTMLElement | null)?.blur()}
    >
      <header className="hud-top">
        <div>
          <h1>31 Hops</h1>
          <p className="hud-score">
            <motion.strong key={run.visited.length} initial={{ scale: 1.5 }} animate={{ scale: 1 }}>
              {run.visited.length}
            </motion.strong>{" "}
            of {PROJECTS.length} projects, {run.hops} {run.hops === 1 ? "hop" : "hops"}
          </p>
          <p className="hud-par">
            <span className="hud-time">
              <Timer run={run} />
            </span>{" "}
            on the clock, par {par} from this start
          </p>
          {saving === "retrying" && <p className="hud-warning">Not saved yet. Trying again…</p>}
        </div>
        <div className="hud-side">
          <IconButton picture="board" label="Leaderboard" onClick={onBoard} />
          <IconButton picture={overview ? "backToHelix" : "wholeGraph"} label={overview ? "Back to the helix" : "Whole graph"} onClick={onOverview} />
          <IconButton picture="startOver" label="Start over" onClick={onRestart} />
          {soundSwitch}
        </div>
      </header>

      <AnimatePresence>
        {run.complete && !finaleSeen && (
          <motion.div className="finale" initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} exit={{ opacity: 0 }}>
            <h2>
              All {PROJECTS.length} projects in {run.hops} hops
            </h2>
            {run.result ? (
              <p>
                {clock(run.result.durationMs)} on the clock. {player.name}, you are in place {run.result.rank} of {run.result.finishers}.{" "}
                {run.hops < par
                  ? `Par from project ${run.start} is ${par}: ${par - run.hops} under, thanks to a wormhole.`
                  : run.hops === par
                    ? `That is par from project ${run.start}: no shorter walk exists.`
                    : `Par from project ${run.start} is ${par}, so ${run.hops - par} over.`}
              </p>
            ) : (
              <p>{saving === "retrying" ? "Can't reach the server to record it. Still trying…" : "Recording your score…"}</p>
            )}
            <div className="finale-actions">
              <button className="marker-button" onClick={onBoard}>
                Leaderboard
              </button>
              {run.result && (
                <button className="marker-button" onClick={() => share(run)}>
                  Share
                </button>
              )}
              <button className="marker-button" onClick={onRestart}>
                Play again
              </button>
              <button className="quiet-button" onClick={() => setFinaleSeen(true)}>
                Keep looking around
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="hud-bottom">
        <div className="hud-row">
          <AnimatePresence mode="wait" initial={false}>
            <motion.button
              key={here.id}
              className="hud-card"
              style={{ borderColor: theme(here.primary).color }}
              onClick={onOpen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.14 }}
            >
              <span className="card-number">Project {here.id}</span>
              <span className="card-title">{here.title}</span>
              <span className="card-open">What is this project?</span>
            </motion.button>
          </AnimatePresence>

          <div className="dpad" role="group" aria-label="Move the helix">
            <ArrowKey direction="up" here={here} onMove={onMove} />
            <ArrowKey direction="left" here={here} onMove={onMove} />
            <button className="dpad-key dpad-enter" onClick={onOpen} aria-label={`Open project ${here.id}, ${here.name}`}>
              Enter
            </button>
            <ArrowKey direction="right" here={here} onMove={onMove} />
            <ArrowKey direction="down" here={here} onMove={onMove} />
          </div>
        </div>
      </footer>
    </div>
  );
}
