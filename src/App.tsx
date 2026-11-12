import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { POSTERS, scorePoster, useProgress } from "./game";
import { Hud } from "./Hud";
import { PosterView } from "./PosterView";
import type { Ring } from "./ring";
import { aimRing, createRing, stepRing, webglAvailable } from "./ring";
import { Wall } from "./Wall";

// three.js is most of the download; people who stay in the list never need it.
const Scene = lazy(() => import("./Scene").then((m) => ({ default: m.Scene })));

type View = "pavilion" | "list";
const VIEW_KEY = "posterhunt.view";
/** How long the poster sheet takes to slide away before the wall may start its reveal. */
const REVEAL_DELAY_MS = 450;

function initialView(): View {
  if (!webglAvailable()) return "list";
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "pavilion" || saved === "list") return saved;
  } catch {
    // Fall through to the default.
  }
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "list" : "pavilion";
}

const posterFromHash = () => {
  const id = Number(location.hash.match(/^#\/p\/(\d+)$/)?.[1]);
  return POSTERS.find((p) => p.id === id) ?? null;
};

export function App() {
  const game = useProgress();
  const [poster, setPoster] = useState(posterFromHash);
  const [view, setView] = useState<View>(initialView);
  const [centered, setCentered] = useState(() => Math.max(0, POSTERS.findIndex((p) => p === posterFromHash())));
  const [moved, setMoved] = useState(false);
  const ring = useRef<Ring>(createRing(centered));

  const scores = useMemo(() => POSTERS.map((p) => scorePoster(p, game.progress)), [game.progress]);
  // The pavilion keeps showing the old scores while a poster is open, so a window
  // clears in front of the player when they come back, not behind the sheet.
  const [shownScores, setShownScores] = useState(scores);
  useEffect(() => {
    if (poster) return;
    const timer = setTimeout(() => setShownScores(scores), REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [poster, scores]);

  useEffect(() => {
    const onHash = () => setPoster(posterFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (poster) aimRing(ring.current, POSTERS.indexOf(poster));
    document.body.classList.toggle("sheet-open", poster !== null);
  }, [poster]);

  useEffect(() => {
    document.body.classList.toggle("pavilion", view === "pavilion");
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // The choice then lasts for this visit only.
    }
  }, [view]);

  const step = (delta: number) => {
    setMoved(true);
    stepRing(ring.current, delta);
  };

  const open = (index: number) => {
    setMoved(true);
    aimRing(ring.current, index);
    location.hash = `#/p/${POSTERS[index].id}`;
  };

  useEffect(() => {
    if (view !== "pavilion" || poster) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, poster]);

  return (
    <>
      {view === "pavilion" ? (
        <>
          <Suspense fallback={<p className="loading">Opening the pavilion…</p>}>
            <Scene
              ring={ring}
              scores={shownScores}
              focused={poster !== null}
              centered={centered}
              onCenter={setCentered}
              onPick={open}
              onDragStart={() => setMoved(true)}
            />
          </Suspense>
          <Hud
            game={game}
            centered={centered}
            showHint={!moved}
            hidden={poster !== null}
            onStep={step}
            onOpen={() => open(centered)}
            onJump={(index) => aimRing(ring.current, index)}
            onList={() => setView("list")}
          />
        </>
      ) : (
        <Wall game={game} onPavilion={webglAvailable() ? () => setView("pavilion") : undefined} />
      )}

      <AnimatePresence>
        {poster && (
          <motion.div
            key={poster.id}
            className="sheet-overlay"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
          >
            <PosterView poster={poster} game={game} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
