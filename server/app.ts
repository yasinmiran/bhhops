import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import express, { type NextFunction, type Request, type Response } from "express";
import { checkPath } from "./graph.ts";

export interface AppOptions {
  db: DatabaseSync;
  adminToken?: string;
  /** Injected in tests to move time. */
  now?: () => number;
}

const NAME_MIN = 2;
const NAME_MAX = 20;
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
/** Faster than this per hop and it was not a person pressing keys. */
const FASTEST_HOP_MS = 100;
const LEADERBOARD_SIZE = 50;
// The venue shares one address, so limits are per player; only sign-ups, which have no player yet, share a budget.
const LIMITS = { playerPerMinute: 400, signupsPerMinute: 90, adminFailuresPerMinute: 30 };

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Player {
  id: number;
  name: string;
}

interface RunRow {
  id: number;
  path: string;
  hops: number;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
}

interface BoardRow {
  playerId: number;
  name: string;
  hops: number;
  durationMs: number;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest();

export function createApp({ db, adminToken, now = Date.now }: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  let minute = 0;
  let hits = new Map<string, number>();
  function spend(key: string, max: number): void {
    const current = Math.floor(now() / 60_000);
    if (current !== minute) {
      minute = current;
      hits = new Map();
    }
    const used = hits.get(key) ?? 0;
    if (used >= max) throw new HttpError(429, "Too many requests, wait a minute");
    hits.set(key, used + 1);
  }

  function player(req: Request): Player {
    const token = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const found = token
      ? (db.prepare("SELECT id, name FROM players WHERE token_hash = ?").get(sha256(token).toString("hex")) as Player | undefined)
      : undefined;
    if (!found) throw new HttpError(401, "Sign in again: this device's player was not found");
    spend(`p:${found.id}`, LIMITS.playerPerMinute);
    return found;
  }

  /** Every finished player's best run, best first: fewest hops, then least time, then who got there first. */
  function board(): BoardRow[] {
    return db
      .prepare(
        `SELECT p.id AS playerId, p.name, r.hops, r.duration_ms AS durationMs
         FROM runs r JOIN players p ON p.id = r.player_id
         WHERE r.id = (
           SELECT best.id FROM runs best
           WHERE best.player_id = r.player_id AND best.finished_at IS NOT NULL
           ORDER BY best.hops, best.duration_ms, best.finished_at LIMIT 1
         )
         ORDER BY r.hops, r.duration_ms, r.finished_at`,
      )
      .all() as unknown as BoardRow[];
  }

  function standing(playerId: number) {
    const rows = board();
    const index = rows.findIndex((row) => row.playerId === playerId);
    return index < 0 ? null : { rank: index + 1, hops: rows[index].hops, durationMs: rows[index].durationMs };
  }

  function activeRun(playerId: number): RunRow | undefined {
    return db
      .prepare(
        `SELECT id, path, hops, started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs
         FROM runs WHERE player_id = ? AND finished_at IS NULL ORDER BY id DESC LIMIT 1`,
      )
      .get(playerId) as RunRow | undefined;
  }

  app.post("/api/players", (req, res) => {
    spend("signups", LIMITS.signupsPerMinute);
    const raw: unknown = req.body?.name;
    const name = typeof raw === "string" ? raw.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new HttpError(400, `Names are ${NAME_MIN} to ${NAME_MAX} characters`);
    }
    if (!NAME_PATTERN.test(name)) throw new HttpError(400, "Use letters, numbers, spaces, dots, dashes or underscores");

    const token = randomBytes(24).toString("hex");
    try {
      db.prepare("INSERT INTO players (token_hash, name, name_key, created_at) VALUES (?, ?, ?, ?)").run(
        sha256(token).toString("hex"),
        name,
        name.toLowerCase(),
        now(),
      );
    } catch (error) {
      if (String(error).includes("UNIQUE")) throw new HttpError(409, "That name is taken. Pick another");
      throw error;
    }
    res.status(201).json({ token, name });
  });

  app.get("/api/me", (req, res) => {
    const me = player(req);
    const run = activeRun(me.id);
    res.json({
      name: me.name,
      now: now(),
      run: run ? { id: run.id, path: JSON.parse(run.path) as number[], startedAt: run.startedAt } : null,
      best: standing(me.id),
    });
  });

  app.post("/api/runs", (req, res) => {
    const me = player(req);
    const start: unknown = req.body?.start;
    const check = checkPath([start]);
    if (!check.ok) throw new HttpError(400, "Pick a project to start from");
    // One tour at a time: starting again gives up the unfinished one.
    db.prepare("DELETE FROM runs WHERE player_id = ? AND finished_at IS NULL").run(me.id);
    const at = now();
    const created = db
      .prepare("INSERT INTO runs (player_id, path, hops, started_at, updated_at) VALUES (?, ?, 0, ?, ?)")
      .run(me.id, JSON.stringify([start]), at, at);
    res.status(201).json({ id: Number(created.lastInsertRowid), path: [start], startedAt: at, now: at });
  });

  app.put("/api/runs/:id", (req, res) => {
    const me = player(req);
    const run = db
      .prepare(
        `SELECT id, path, hops, started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs
         FROM runs WHERE id = ? AND player_id = ?`,
      )
      .get(Number(req.params.id), me.id) as RunRow | undefined;
    if (!run) throw new HttpError(404, "That tour is gone. Start a new one");
    if (run.finishedAt !== null) {
      // A repeat of the final save, for example after a lost response: answer with the result again.
      return res.json({ finished: true, hops: run.hops, durationMs: run.durationMs, ...rankOf(me.id) });
    }

    const path: unknown = req.body?.path;
    const check = checkPath(path);
    if (!check.ok) throw new HttpError(422, check.why);
    const next = path as number[];
    const stored = JSON.parse(run.path) as number[];
    // History cannot be rewritten: what was saved must be the beginning of what is sent now.
    if (next.length < stored.length || stored.some((id, i) => next[i] !== id)) {
      throw new HttpError(409, "This tour was continued somewhere else");
    }

    const at = now();
    const hops = next.length - 1;
    if (!check.complete) {
      db.prepare("UPDATE runs SET path = ?, hops = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), hops, at, run.id);
      return res.json({ finished: false, hops });
    }

    const durationMs = at - run.startedAt;
    if (durationMs < hops * FASTEST_HOP_MS) throw new HttpError(422, "That was faster than anyone can press keys");
    db.prepare("UPDATE runs SET path = ?, hops = ?, updated_at = ?, finished_at = ?, duration_ms = ? WHERE id = ?").run(
      JSON.stringify(next),
      hops,
      at,
      at,
      durationMs,
      run.id,
    );
    res.json({ finished: true, hops, durationMs, ...rankOf(me.id) });
  });

  /** Where the player's best run stands, and how many players have finished at all. */
  function rankOf(playerId: number) {
    const rows = board();
    const index = rows.findIndex((row) => row.playerId === playerId);
    return { rank: index + 1, finishers: rows.length, best: index < 0 ? null : { hops: rows[index].hops, durationMs: rows[index].durationMs } };
  }

  app.get("/api/leaderboard", (req, res) => {
    const rows = board();
    const token = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const me = token ? (db.prepare("SELECT id FROM players WHERE token_hash = ?").get(sha256(token).toString("hex")) as { id: number } | undefined) : undefined;
    const mine = me ? rows.findIndex((row) => row.playerId === me.id) : -1;
    const playing = db.prepare("SELECT count(*) AS n FROM players").get() as { n: number };
    res.set("cache-control", "no-store").json({
      top: rows.slice(0, LEADERBOARD_SIZE).map((row, i) => ({ rank: i + 1, name: row.name, hops: row.hops, durationMs: row.durationMs, me: i === mine })),
      me: mine < 0 ? null : { rank: mine + 1, name: rows[mine].name, hops: rows[mine].hops, durationMs: rows[mine].durationMs },
      finishers: rows.length,
      players: playing.n,
    });
  });

  app.post("/api/admin/remove-player", (req, res) => {
    const token = req.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!adminToken || !timingSafeEqual(sha256(token), sha256(adminToken))) {
      spend(`admin:${req.ip}`, LIMITS.adminFailuresPerMinute);
      throw new HttpError(401, "not allowed");
    }
    const name: unknown = req.body?.name;
    if (typeof name !== "string") throw new HttpError(400, "name is required");
    const removed = db.prepare("DELETE FROM players WHERE name_key = ?").run(name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase());
    res.json({ removed: Number(removed.changes) });
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "not found")));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    // express.json() reports a malformed or oversized body through an error carrying its own status.
    const status = (error as { status?: number }).status;
    if (status && status >= 400 && status < 500) return res.status(status).json({ error: "That request could not be read" });
    console.error(error);
    res.status(500).json({ error: "Something broke on the server" });
  });

  return app;
}
