import { AnimatePresence, motion } from "motion/react";
import { PAR, PROJECTS, isComplete, project, theme, type Direction, type Run } from "./game";

const GLYPH: Record<Direction, string> = { up: "↑", right: "→", down: "↓", left: "←" };
const DPAD_ORDER: Direction[] = ["up", "left", "right", "down"];

interface HudProps {
  run: Run;
  best: number | null;
  reason: string | null;
  overview: boolean;
  hidden: boolean;
  onMove: (direction: Direction) => void;
  onOpen: () => void;
  onOverview: () => void;
  onRestart: () => void;
}

function shareText(run: Run): string {
  return `I toured all ${PROJECTS.length} BioHackathon projects in ${run.hops} hops (par ${PAR}).`;
}

async function share(run: Run): Promise<void> {
  const payload = { text: shareText(run), url: location.href.split("#")[0] };
  try {
    if (navigator.share) await navigator.share(payload);
    else await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
  } catch {
    // Dismissing the share sheet is not an error worth showing.
  }
}

export function Hud({ run, best, reason, overview, hidden, onMove, onOpen, onOverview, onRestart }: HudProps) {
  const here = project(run.current);
  const done = isComplete(run);

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
            Par {PAR}
            {best !== null && `, your best ${best}`}
          </p>
        </div>
        <div className="hud-side">
          <button className="marker-button small" onClick={onOverview}>
            {overview ? "Back to the star" : "Whole graph"}
          </button>
          <button className="quiet-button" onClick={onRestart}>
            Start over
          </button>
        </div>
      </header>

      <AnimatePresence>
        {done && (
          <motion.div className="finale" initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} exit={{ opacity: 0 }}>
            <h2>All {PROJECTS.length} projects in {run.hops} hops</h2>
            <p>{run.hops <= PAR ? `Par is ${PAR}. You matched or beat it.` : `Par is ${PAR}. ${run.hops - PAR} over.`}</p>
            <div className="finale-actions">
              <button className="marker-button" onClick={() => share(run)}>
                Share my score
              </button>
              <button className="marker-button" onClick={onRestart}>
                Play again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="hud-bottom">
        <AnimatePresence>
          {reason && (
            <motion.p key={reason + run.hops} className="hud-reason" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {reason}
            </motion.p>
          )}
        </AnimatePresence>

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
              <span className="card-open">See the poster</span>
            </motion.button>
          </AnimatePresence>

          <div className="dpad" role="group" aria-label="Move the star">
            {DPAD_ORDER.map((direction) => {
              const to = here.arrows[direction];
              return (
                <button
                  key={direction}
                  className={`dpad-key dpad-${direction}`}
                  disabled={to === null}
                  onClick={() => onMove(direction)}
                  aria-label={to === null ? `Nothing ${direction}` : `Go ${direction} to project ${to}, ${project(to).name}`}
                >
                  {GLYPH[direction]}
                </button>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
}
