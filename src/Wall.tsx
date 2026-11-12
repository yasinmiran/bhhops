import { useState } from "react";
import { POSTERS, TOTAL_STARS, nextRank, posterThumb, rank, scorePoster, totals, type useProgress } from "./game";
import { Star } from "./Star";

type Game = ReturnType<typeof useProgress>;

function shareText(cleared: number, gold: number): string {
  return cleared === POSTERS.length
    ? `I cleared all ${POSTERS.length} windows of the BioHackathon Poster Hunt with ${gold} gold stars.`
    : `I cleared ${cleared} of ${POSTERS.length} windows in the BioHackathon Poster Hunt. ${gold} gold stars so far.`;
}

function Share({ cleared, gold }: { cleared: number; gold: number }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const payload = { text: shareText(cleared, gold), url: location.href.split("#")[0] };
    try {
      if (navigator.share) return await navigator.share(payload);
      await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
      setCopied(true);
    } catch {
      // Dismissing the share sheet is not an error worth showing.
    }
  };
  return (
    <button className="marker-button" onClick={share}>
      {copied ? "Copied to clipboard" : "Share my score"}
    </button>
  );
}

export function Wall({ game, onPavilion }: { game: Game; onPavilion?: () => void }) {
  const { cleared, gold, paper } = totals(game.progress);
  const upcoming = nextRank(cleared);
  const done = cleared === POSTERS.length;

  return (
    <div className="wall-page">
      <header className="wall-head">
        <h1>Poster Hunt</h1>
        <p className="lede">
          31 teams, 31 flipcharts taped to the windows. Each one hides behind frosted glass until you answer a question that
          only the poster can tell you.
        </p>

        <div className="scoreboard">
          <div className="score-sticker" aria-label={`${gold + paper} of ${TOTAL_STARS} stars`}>
            <Star kind="gold" />
            <strong>{gold + paper}</strong>
          </div>
          <div className="score-text">
            <p className="score-main">
              {cleared} of {POSTERS.length} windows clear
            </p>
            <p className="score-rank">
              {rank(cleared)}
              {upcoming && `, ${upcoming[0] - cleared} more to become "${upcoming[1]}"`}
            </p>
          </div>
        </div>
        {done && <p className="finale">Every window is clear. You have read the whole hackathon.</p>}
        <div className="wall-actions">
          {onPavilion && (
            <button className="marker-button" onClick={onPavilion}>
              Walk the pavilion in 3D
            </button>
          )}
          {cleared > 0 && <Share cleared={cleared} gold={gold} />}
        </div>
      </header>

      <ol className="wall">
        {POSTERS.map((poster, index) => {
          const score = scorePoster(poster, game.progress);
          return (
            <li key={poster.id} id={`sheet-${poster.id}`} className={`sheet tilt-${index % 5}`} style={{ aspectRatio: String(poster.aspect) }}>
              <a href={`#/p/${poster.id}`} aria-label={`Project ${poster.id}: ${poster.title}${score.cleared ? ", cleared" : ""}`}>
                <img
                  className={score.cleared ? "sheet-image" : "sheet-image frosted"}
                  src={posterThumb(poster.id)}
                  alt=""
                  loading={index < 6 ? "eager" : "lazy"}
                />
                {!score.cleared && <span className="sheet-number">{poster.id}</span>}
                {score.cleared && (
                  <span className="sheet-stars">
                    {score.stars.map((kind, i) => (
                      <Star key={i} kind={kind} />
                    ))}
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ol>

      <footer className="wall-foot">
        <p>
          Gold star: right on the first try. Paper star: right after a wrong guess. Your progress stays on this device.
        </p>
        <p>Posters by the project teams of BioHackathon Europe 2026, photographed at Campus Belloch.</p>
        {(gold > 0 || paper > 0) && (
          <button
            className="quiet-button"
            onClick={() => confirm("Frost every window again and lose your stars?") && game.reset()}
          >
            Start over
          </button>
        )}
      </footer>
    </div>
  );
}
