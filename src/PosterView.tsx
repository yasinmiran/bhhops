import { motion } from "motion/react";
import { useRef, useState } from "react";
import { neighbours, posterImage, theme, type Project } from "./game";

function PosterFrame({ p }: { p: Project }) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
    setZoomed((was) => !was);
    if (zoomed) return;
    // After the image has grown, bring the tapped spot back under the finger.
    requestAnimationFrame(() => {
      const el = frame.current;
      if (el) el.scrollTo(at.x * el.scrollWidth - el.clientWidth / 2, at.y * el.scrollHeight - el.clientHeight / 2);
    });
  };

  return (
    <figure className="poster-figure">
      {/* The width is capped by the screen's height, so a tall sheet is never cut off at the bottom. */}
      <div
        ref={frame}
        className={zoomed ? "poster-frame zoomed" : "poster-frame"}
        style={{ aspectRatio: String(p.aspect), width: `min(100%, calc(86dvh * ${p.aspect}))` }}
      >
        <button type="button" className="poster-zoom" onClick={toggle} aria-label={zoomed ? "Zoom out" : "Zoom in"}>
          <img src={posterImage(p.id)} alt={`Poster of project ${p.id}: ${p.motif}`} draggable={false} />
        </button>
      </div>
      <figcaption>{zoomed ? "Scroll to look around. Tap to zoom out." : "Tap the poster to zoom in."}</figcaption>
    </figure>
  );
}

interface PosterViewProps {
  p: Project;
  onClose: () => void;
  /** Set when a game is running and this project is where the star is; neighbours then become moves. */
  onHop?: (to: number) => void;
}

export function PosterView({ p, onClose, onHop }: PosterViewProps) {
  return (
    <div className="poster-page">
      <nav className="poster-nav">
        <button className="quiet-button" onClick={onClose}>
          Back to the projects
        </button>
      </nav>

      <header className="poster-head">
        <p className="poster-number">Project {p.id}</p>
        <h1>{p.title}</h1>
        <p className="poster-leads">Led by {p.leads}</p>
        <ul className="chips">
          {p.themes.map((id) => (
            <li key={id} style={{ background: theme(id).color }}>
              {theme(id).label}
            </li>
          ))}
        </ul>
      </header>

      <PosterFrame p={p} />

      <section>
        <h2>What the team did</h2>
        <p className="one-liner">{p.oneLiner}</p>
        <ul className="highlights">
          {p.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {p.links.length > 0 && <p className="links">On the poster: {p.links.join(", ")}</p>}
      </section>

      <section>
        <h2>One hop away</h2>
        <ul className="hops">
          {neighbours(p.id).map(({ project: next, reason }) => (
            <li key={next.id}>
              <motion.button className="hop" disabled={!onHop} onClick={() => onHop?.(next.id)} whileTap={{ scale: 0.97 }}>
                <span className="hop-number" style={{ background: theme(next.primary).color }}>
                  {next.id}
                </span>
                <span>
                  <strong>{next.name}</strong>
                  <span className="hop-reason">{reason}</span>
                </span>
              </motion.button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
