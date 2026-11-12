import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, clock, type ApiError, type Board, type BoardRow } from "./api";
import { PAR, type Player } from "./game";

const REFRESH_MS = 10_000;

const MEDALS = ["gold", "silver", "bronze"];

function Row({ row }: { row: BoardRow }) {
  const medal: string | undefined = MEDALS[row.rank - 1];
  return (
    <tr className={row.me ? "board-me" : undefined}>
      <td className="board-rank" aria-label={medal && `${row.rank}, ${medal}`}>
        {medal ? <span className={`medal medal-${medal}`}>{row.rank}</span> : row.rank}
      </td>
      <td className="board-name">{row.name}</td>
      <td>{row.hops}</td>
      <td>{clock(row.durationMs)}</td>
    </tr>
  );
}

export function Leaderboard({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Board>("GET", `/leaderboard?page=${page}`, undefined, player?.token).then(
        (next) => {
          if (!alive) return;
          setBoard(next);
          setError(null);
        },
        (e: ApiError) => alive && setError(e.message),
      );
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [player?.token, page, retry]);

  // A new page starts at its top, with the player's own row in view if it is on it.
  useEffect(() => {
    const table = scroller.current;
    if (!table) return;
    table.scrollTop = 0;
    table.querySelector(".board-me")?.scrollIntoView({ block: "nearest" });
  }, [board?.page]);

  // Steps from the page the server last answered with, which is the last page if the asked one no longer exists.
  // Asking again for a page whose request failed has to send it again; the state alone would not change.
  const go = (to: number) => (to === page && error ? setRetry((n) => n + 1) : setPage(to));
  const turn = (by: number) => board && go(Math.min(board.pages, Math.max(1, board.page + by)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.repeat) return;
      else if (event.key === "ArrowLeft") turn(-1);
      else if (event.key === "ArrowRight") turn(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const mineElsewhere = board?.me && !board.rows.some((row) => row.me) ? board.me : null;
  const paged = board !== null && board.pages > 1;

  return (
    <motion.div className="board-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="board"
        role="dialog"
        aria-modal="true"
        aria-label="Leaderboard"
        initial={{ y: 40, rotate: -3 }}
        animate={{ y: 0, rotate: -0.6 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="board-head">
          <h2>Leaderboard</h2>
          <button className="marker-button small" onClick={onClose} autoFocus>
            Close
          </button>
        </header>
        <p className="board-rule">
          Fewest hops wins, then the faster tour. The shortest tour possible is {PAR} hops, and only from some starts.
          {board && ` ${board.finishers} of ${board.players} players have finished.`}
        </p>
        {error && <p className="error">{error}</p>}
        {board && board.rows.length === 0 && <p className="board-empty">Nobody has finished a tour yet. Be the first.</p>}
        {board && board.rows.length > 0 && (
          <div className="board-scroll" ref={scroller}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Place</th>
                  <th scope="col">Player</th>
                  <th scope="col">Hops</th>
                  <th scope="col">Time</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <Row key={row.rank} row={row} />
                ))}
                {/* A short last page keeps the height of a full one, so the pager stays under the finger. */}
                {paged &&
                  Array.from({ length: board.pageSize - board.rows.length }, (_, i) => (
                    <tr key={`blank-${i}`} aria-hidden="true">
                      <td colSpan={4} />
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {paged && (
          <nav className="board-pager" aria-label="Leaderboard pages">
            <button className="marker-button small" disabled={board.page <= 1} onClick={() => turn(-1)}>
              Previous
            </button>
            <span>
              Page {board.page} of {board.pages}
            </span>
            <button className="marker-button small" disabled={board.page >= board.pages} onClick={() => turn(1)}>
              Next
            </button>
          </nav>
        )}
        {mineElsewhere && (
          <button className="quiet-button board-mine" onClick={() => go(Math.ceil(mineElsewhere.rank / board!.pageSize))}>
            You are in place {mineElsewhere.rank}. Show my page
          </button>
        )}
        {!board && !error && <p className="board-empty">Loading…</p>}
      </motion.div>
    </motion.div>
  );
}
