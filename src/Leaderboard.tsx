import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, clock, type ApiError, type Board, type BoardRow } from "./api";
import { PAR, type Player } from "./game";

const REFRESH_MS = 10_000;

function Row({ row }: { row: BoardRow }) {
  return (
    <tr className={row.me ? "board-me" : undefined}>
      <td className="board-rank">{row.rank}</td>
      <td className="board-name">{row.name}</td>
      <td>{row.hops}</td>
      <td>{clock(row.durationMs)}</td>
    </tr>
  );
}

export function Leaderboard({ player, onClose }: { player: Player | null; onClose: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Board>("GET", "/leaderboard", undefined, player?.token).then(
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
  }, [player?.token]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const outsideTop = board?.me && !board.top.some((row) => row.me) ? board.me : null;

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
          Fewest hops wins. Equal hops: the faster tour wins. The shortest tour possible is {PAR} hops, and only from some
          starts.
          {board && ` ${board.finishers} of ${board.players} players have finished.`}
        </p>
        {error && <p className="error">{error}</p>}
        {board && board.top.length === 0 && <p className="board-empty">Nobody has finished a tour yet. Be the first.</p>}
        {board && board.top.length > 0 && (
          <div className="board-scroll">
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
                {board.top.map((row) => (
                  <Row key={row.rank} row={row} />
                ))}
                {outsideTop && <Row row={{ ...outsideTop, me: true }} />}
              </tbody>
            </table>
          </div>
        )}
        {!board && !error && <p className="board-empty">Loading…</p>}
      </motion.div>
    </motion.div>
  );
}
