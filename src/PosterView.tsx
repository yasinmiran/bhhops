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
    // Safari does not focus a button on click, and the arrow keys look around the poster from wherever focus is.
    event.currentTarget.focus({ preventScroll: true });
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
  /** Set when a game is running and this project is where the helix is; neighbours then become moves. */
  onHop?: (to: number) => void;
}

export function PosterView({ p, onClose, onHop }: PosterViewProps) {
  const scroll = (pages: number) => (event: React.MouseEvent<HTMLButtonElement>) => {
    const sheet = event.currentTarget.closest(".sheet-overlay");
    sheet?.scrollBy({ top: pages * sheet.clientHeight * 0.6, behavior: "smooth" });
  };

  return (
    <div className="poster-page">
      <nav className="poster-nav">
        <button className="marker-button small" onClick={onClose}>
          ← Back to the projects
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

      <section className="explainer">
        <h2>In short</h2>
        <p className="one-liner">{p.oneLiner}</p>
        {p.explainer && (
          <dl className="story">
            <dt>The problem</dt>
            <dd>{p.explainer.problem}</dd>
            <dt>This week</dt>
            <dd>{p.explainer.thisWeek}</dd>
            <dt>Why it matters</dt>
            <dd>{p.explainer.whyItMatters}</dd>
          </dl>
        )}
      </section>

      {p.explainer && (p.explainer.done.length > 0 || p.explainer.next.length > 0) && (
        <section className="status">
          {p.explainer.done.length > 0 && (
            <div className="status-note status-done">
              <h3>Done</h3>
              <ul>
                {p.explainer.done.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {p.explainer.next.length > 0 && (
            <div className="status-note status-next">
              <h3>Still to do</h3>
              <ul>
                {p.explainer.next.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {p.explainer && p.explainer.glossary.length > 0 && (
        <section>
          <h2>Words you may not know</h2>
          <dl className="glossary">
            {p.explainer.glossary.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <PosterFrame p={p} />

      <section>
        <h2>On the poster</h2>
        <ul className="highlights">
          {p.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {p.links.length > 0 && <p className="links">Links: {p.links.join(", ")}</p>}
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

      {/* The same keys the keyboard uses here, drawn where the arrow pad sits in the game. */}
      <div className="sheet-keys">
        <button className="dpad-key sheet-back" onClick={onClose}>
          <span aria-hidden="true">←</span> Back
        </button>
        <span className="sheet-scroll">
          Scroll
          <button className="dpad-key" onClick={scroll(-1)} aria-label="Scroll up">
            ↑
          </button>
          <button className="dpad-key" onClick={scroll(1)} aria-label="Scroll down">
            ↓
          </button>
        </span>
      </div>
    </div>
  );
}
