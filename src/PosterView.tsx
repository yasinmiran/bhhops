import { motion } from "motion/react";
import { useRef, useState } from "react";
import { POSTERS, posterImage, scorePoster, type Poster, type Question, type useProgress } from "./game";
import { Star } from "./Star";

type Game = ReturnType<typeof useProgress>;

function QuestionNote({ poster, index, question, game }: { poster: Poster; index: number; question: Question; game: Game }) {
  const tries = game.triesFor(poster.id, index);
  const solved = tries.at(-1) === question.answer;
  const [justWrong, setJustWrong] = useState(false);
  const [justSolved, setJustSolved] = useState(false);

  const choose = (option: number) => {
    const right = option === question.answer;
    setJustWrong(!right);
    setJustSolved(right);
    game.answer(poster.id, index, option);
  };

  return (
    <li className={`note note-${question.difficulty}${justWrong ? " note-shake" : ""}`} onAnimationEnd={() => setJustWrong(false)}>
      <div className="note-head">
        <h3>{question.question}</h3>
        <Star kind={solved ? (tries.length === 1 ? "gold" : "paper") : "none"} slap={justSolved} />
      </div>
      <ul className="options">
        {question.options.map((option, i) => {
          const tried = tries.includes(i);
          const state = solved && i === question.answer ? "right" : tried ? "wrong" : "open";
          return (
            <li key={i}>
              <motion.button
                className={`option option-${state}`}
                disabled={solved || tried}
                onClick={() => choose(i)}
                whileTap={{ scale: 0.97 }}
              >
                {option}
              </motion.button>
            </li>
          );
        })}
      </ul>
      <p className="note-status" aria-live="polite">
        {solved
          ? tries.length === 1
            ? "Right on the first try."
            : "Right. A paper star for getting there."
          : tries.length > 0 && `Not that one. Look at: ${question.hint}`}
      </p>
    </li>
  );
}

function PosterFrame({ poster }: { poster: Poster }) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);

  const toggle = (event: React.MouseEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
    setZoomed((was) => !was);
    // After the image has grown, bring the tapped spot back under the finger.
    requestAnimationFrame(() => {
      const el = frame.current;
      if (el) el.scrollTo(at.x * el.scrollWidth - el.clientWidth / 2, at.y * el.scrollHeight - el.clientHeight / 2);
    });
  };

  return (
    <figure className="poster-figure">
      <div ref={frame} className={zoomed ? "poster-frame zoomed" : "poster-frame"} style={{ aspectRatio: String(poster.aspect) }}>
        <img src={posterImage(poster.id)} alt={`Poster of project ${poster.id}: ${poster.motif}`} onClick={toggle} />
      </div>
      <figcaption>{zoomed ? "Drag to look around. Tap to zoom out." : "Tap the poster to zoom in."}</figcaption>
    </figure>
  );
}

export function PosterView({ poster, game }: { poster: Poster; game: Game }) {
  const score = scorePoster(poster, game.progress);
  const position = POSTERS.indexOf(poster);
  const rest = [...POSTERS.slice(position + 1), ...POSTERS.slice(0, position)];
  const next = rest.find((p) => !scorePoster(p, game.progress).cleared) ?? rest[0];

  return (
    <div className="poster-page">
      <nav className="poster-nav">
        <a href="#/">Back to the wall</a>
        <span className="poster-stars">
          {score.stars.map((kind, i) => (
            <Star key={i} kind={kind} />
          ))}
        </span>
      </nav>

      <header className="poster-head">
        <p className="poster-number">Project {poster.id}</p>
        <h1>{poster.title}</h1>
        <p className="poster-leads">Led by {poster.leads}</p>
      </header>

      <PosterFrame poster={poster} />

      <section>
        <h2>{score.cleared ? "Window clear" : "Clear this window"}</h2>
        <ol className="notes">
          {poster.questions.map((question, i) => (
            <QuestionNote key={i} poster={poster} index={i} question={question} game={game} />
          ))}
        </ol>
      </section>

      {score.cleared && (
        <motion.section className="reveal" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <h2>What the team did</h2>
          <p className="one-liner">{poster.oneLiner}</p>
          <ul className="highlights">
            {poster.highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {poster.links.length > 0 && <p className="links">On the poster: {poster.links.join(", ")}</p>}
        </motion.section>
      )}

      {next && (
        <a className="marker-button next-poster" href={`#/p/${next.id}`}>
          Next window: project {next.id}
        </a>
      )}
    </div>
  );
}
