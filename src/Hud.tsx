import { AnimatePresence, motion } from "motion/react";
import { POSTERS, rank, scorePoster, totals, type useProgress } from "./game";
import { Star } from "./Star";

type Game = ReturnType<typeof useProgress>;

interface HudProps {
  game: Game;
  centered: number;
  showHint: boolean;
  hidden: boolean;
  onStep: (delta: number) => void;
  onOpen: () => void;
  onJump: (index: number) => void;
  onList: () => void;
}

/** The ring seen from above: one dot per window, filled once it is clear. */
function Compass({ game, centered, onJump }: Pick<HudProps, "game" | "centered" | "onJump">) {
  return (
    <svg className="compass" viewBox="-50 -50 100 100" role="group" aria-label="All windows, seen from above">
      {POSTERS.map((poster, index) => {
        const angle = (index / POSTERS.length) * Math.PI * 2 - Math.PI / 2;
        const cleared = scorePoster(poster, game.progress).cleared;
        return (
          <circle
            key={poster.id}
            className={`compass-dot${cleared ? " compass-clear" : ""}${index === centered ? " compass-here" : ""}`}
            cx={Math.cos(angle) * 40}
            cy={Math.sin(angle) * 40}
            r={index === centered ? 5.5 : 3.6}
            onClick={() => onJump(index)}
          >
            <title>
              Project {poster.id}
              {cleared ? ", clear" : ""}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

export function Hud({ game, centered, showHint, hidden, onStep, onOpen, onJump, onList }: HudProps) {
  const { cleared, gold, paper } = totals(game.progress);
  const poster = POSTERS[centered];
  const isClear = scorePoster(poster, game.progress).cleared;

  return (
    <div className="hud" inert={hidden}>
      <header className="hud-top">
        <div>
          <h1>Poster Hunt</h1>
          <p className="hud-score">
            <span className="mini-sticker">
              <Star kind="gold" />
              <motion.strong key={gold + paper} initial={{ scale: 1.8 }} animate={{ scale: 1 }}>
                {gold + paper}
              </motion.strong>
            </span>
            {cleared} of {POSTERS.length} windows clear
          </p>
          <p className="hud-rank">{rank(cleared)}</p>
        </div>
        <div className="hud-side">
          <Compass game={game} centered={centered} onJump={onJump} />
          <button className="quiet-button" onClick={onList}>
            Show as a list
          </button>
        </div>
      </header>

      <footer className="hud-bottom">
        <AnimatePresence>
          {showHint && (
            <motion.p className="hud-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Drag sideways to walk along the windows
            </motion.p>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={poster.id}
            className="hud-caption"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.14 }}
          >
            <p className="poster-number">Project {poster.id}</p>
            <p className="hud-title">{poster.title}</p>
          </motion.div>
        </AnimatePresence>
        <div className="hud-controls">
          <button className="marker-button round" onClick={() => onStep(-1)} aria-label="Previous window">
            ‹
          </button>
          <motion.button className="marker-button" onClick={onOpen} whileTap={{ scale: 0.96 }}>
            {isClear ? "Look again" : "Clear this window"}
          </motion.button>
          <button className="marker-button round" onClick={() => onStep(1)} aria-label="Next window">
            ›
          </button>
        </div>
      </footer>
    </div>
  );
}
