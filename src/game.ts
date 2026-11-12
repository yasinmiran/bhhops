import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import graphData from "./graph.json";
import posterData from "./posters.json";
import { SPECIALS, landing, type Spot } from "./tricks";

export type Direction = "up" | "right" | "down" | "left";
export const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];

interface PosterEntry {
  id: number;
  title: string;
  leads: string;
  posterTitle: string;
  oneLiner: string;
  highlights: string[];
  motif: string;
  links: string[];
  aspect: number;
  explainer?: {
    problem: string;
    thisWeek: string;
    whyItMatters: string;
    glossary: { term: string; meaning: string }[];
    done: string[];
    next: string[];
  };
}

interface GraphNode {
  id: number;
  name: string;
  primary: string;
  themes: string[];
  x: number;
  y: number;
  z: number;
  arrows: Record<Direction, number | null>;
  /** Fewest hops in which a tour starting here can visit every project. */
  par: number;
}

export interface Theme {
  id: string;
  label: string;
  color: string;
  x: number | null;
  y: number | null;
}

export interface Edge {
  a: number;
  b: number;
  reason: string;
  theme: string | null;
}

export type Project = PosterEntry & GraphNode;

const graph = graphData as { par: number; themes: Theme[]; nodes: GraphNode[]; edges: Edge[] };
const posters = new Map((posterData as PosterEntry[]).map((p) => [p.id, p]));

export const PAR = graph.par;
export const THEMES = graph.themes;
export const EDGES = graph.edges;
const specialsById = new Map(SPECIALS.map((s) => [s.id, s]));
/** The black hole or wormhole with this number, or null for a project. */
export const special = (id: number) => specialsById.get(id) ?? null;

// A project beside a black hole or a wormhole gives it the arrow key it had to spare.
export const PROJECTS: Project[] = graph.nodes.map((node) => {
  const arrows = { ...node.arrows };
  for (const beside of SPECIALS) if (beside.anchor === node.id) arrows[beside.direction] = beside.id;
  return { ...posters.get(node.id)!, ...node, arrows };
});

const projectsById = new Map(PROJECTS.map((p) => [p.id, p]));
const themesById = new Map(THEMES.map((t) => [t.id, t]));
export const project = (id: number) => projectsById.get(id)!;
export const theme = (id: string) => themesById.get(id)!;

export const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const edgesByKey = new Map(EDGES.map((e) => [edgeKey(e.a, e.b), e]));
export const edgeBetween = (a: number, b: number) => edgesByKey.get(edgeKey(a, b)) ?? null;
/** Anything an arrow can lead to: a project, the black hole or a wormhole. */
export const place = (id: number): Spot & { id: number; name: string } => projectsById.get(id) ?? specialsById.get(id)!;
/** Whether one press of an arrow can take the helix from a project to there. */
export const canHop = (from: number, to: number) => Boolean(edgeBetween(from, to)) || special(to)?.anchor === from;

/** The projects one hop away, with the arrow that leads to each. */
export function neighbours(id: number): { direction: Direction; project: Project; reason: string }[] {
  const from = project(id);
  return DIRECTIONS.flatMap((direction) => {
    const to = from.arrows[direction];
    return to === null || special(to) ? [] : [{ direction, project: project(to), reason: edgeBetween(id, to)?.reason ?? "" }];
  });
}

const pad = (id: number) => String(id).padStart(2, "0");
export const posterImage = (id: number) => `./posters/${pad(id)}.webp`;
export const posterThumb = (id: number) => `./posters/${pad(id)}-thumb.webp`;

export interface Player {
  token: string;
  name: string;
}

/** The server's verdict on a finished tour. */
export interface Result {
  hops: number;
  durationMs: number;
  rank: number;
  finishers: number;
}

/** What is stored and sent: the walk itself. Everything else is worked out from it. */
interface Tour {
  id: number;
  path: number[];
  /** When the tour began, on this device's clock. */
  startedAt: number;
  result: Result | null;
  /** The helix went into the black hole. The walk stays as it was; the tour cannot go on. */
  lost?: boolean;
}

/** One tour as the game shows it. */
export interface Run {
  start: number;
  current: number;
  visited: number[];
  walked: string[];
  /** Hops that count: the walk up to the moment every project had been seen. */
  hops: number;
  complete: boolean;
  startedAt: number;
  result: Result | null;
  lost: boolean;
  /** The wormhole the last move went through, if it did. */
  via: number | null;
  /** How many places the walk holds: it grows on every move, including one that lands where it began. */
  steps: number;
}

/** The part of a walk that counts for the score: it ends when the last project is first reached. */
function counted(path: number[]): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    if (!special(path[i])) seen.add(path[i]);
    if (seen.size === PROJECTS.length) return path.slice(0, i + 1);
  }
  return path;
}

function view(tour: Tour): Run {
  const scored = counted(tour.path);
  const visited = [...new Set(tour.path.filter((id) => !special(id)))];
  const steps = tour.path.slice(1).map((id, i) => [tour.path[i], id]);
  const before = tour.path.at(-2);
  return {
    start: tour.path[0],
    current: tour.path.at(-1)!,
    visited,
    walked: [...new Set(steps.filter(([a, b]) => edgeBetween(a, b)).map(([a, b]) => edgeKey(a, b)))],
    // Stepping into a wormhole is a hop; being thrown out of it is not.
    hops: scored.length - 1 - scored.filter((id) => special(id)).length,
    complete: visited.length === PROJECTS.length,
    startedAt: tour.startedAt,
    result: tour.result,
    lost: tour.lost ?? false,
    via: before !== undefined && special(before) ? before : null,
    steps: tour.path.length,
  };
}

const PLAYER_KEY = "31hops.player.v1";
/** Outlives "Not you?", so the name this device last played under can be taken up again. */
const LAST_PLAYER_KEY = "31hops.last-player.v1";
const TOUR_KEY = "31hops.tour.v1";
const RETRY_MS = 4000;

function load<T>(key: string, valid: (value: any) => boolean): T | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return value !== null && valid(value) ? (value as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing: the game still works for this visit.
  }
}

const validPlayer = (p: any) => typeof p.token === "string" && typeof p.name === "string";
/** Two names the server would treat as the same one. */
const nameKey = (name: string) => name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

export const lastPlayer = () => load<Player>(LAST_PLAYER_KEY, validPlayer);
/** Whether place i of a stored walk could have been reached from the one before it. */
function validStep(t: { id: number; path: number[] }, i: number): boolean {
  const id = t.path[i];
  const before = t.path[i - 1];
  const hole = special(id);
  // A wormhole is always followed by where it threw the helix, so a walk never ends in one.
  if (hole) return hole.kind === "wormhole" && before === hole.anchor && i < t.path.length - 1;
  if (!projectsById.has(id)) return false;
  if (i === 0) return true;
  return special(before) ? id === landing(t.id, i - 1) : Boolean(edgeBetween(before, id));
}

const validTour = (t: any) =>
  Number.isInteger(t.id) &&
  Array.isArray(t.path) &&
  t.path.length > 0 &&
  t.path.every((id: unknown, i: number) => typeof id === "number" && validStep(t, i)) &&
  typeof t.startedAt === "number";

interface ServerRun {
  id: number;
  path: number[];
  startedAt: number;
}

export type Saving = "saved" | "saving" | "retrying";

export function useGame() {
  const [player, setPlayer] = useState<Player | null>(() => load<Player>(PLAYER_KEY, validPlayer));
  const [tour, setTour] = useState<Tour | null>(() => load<Tour>(TOUR_KEY, validTour));
  const [saving, setSaving] = useState<Saving>("saved");
  const busy = useRef(false);

  useEffect(() => {
    store(PLAYER_KEY, player);
    if (player) store(LAST_PLAYER_KEY, player);
  }, [player]);
  useEffect(() => store(TOUR_KEY, tour), [tour]);

  const forget = useCallback(() => {
    setPlayer(null);
    setTour(null);
  }, []);

  // On load, the server's copy settles what the tour is: it may have moved on from another device.
  useEffect(() => {
    if (!player) return;
    let alive = true;
    api<{ now: number; run: ServerRun | null }>("GET", "/me", undefined, player.token).then(
      ({ now, run }) => {
        if (!alive) return;
        setTour((local) => {
          if (!run) return local?.result ? local : null;
          // Reloading the page is no way out of the black hole.
          if (local?.id === run.id && local.lost) return local;
          const ahead = local?.id === run.id && local.path.length > run.path.length && run.path.every((id, i) => local.path[i] === id);
          return ahead ? local : { id: run.id, path: run.path, startedAt: Date.now() - (now - run.startedAt), result: null };
        });
      },
      (error: ApiError) => {
        // The server no longer knows this player (removed, or the database was reset).
        if (alive && error.status === 401) forget();
      },
    );
    return () => {
      alive = false;
    };
    // Runs once per player; later changes are pushed, not pulled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.token]);

  // Push the walk after every hop: one request at a time, always the newest path,
  // and nothing at all when the server already has every hop.
  const latest = useRef({ player, tour });
  latest.current = { player, tour };
  const saved = useRef({ id: -1, length: 0 });
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const push = useCallback(async () => {
    const { player: as, tour: now } = latest.current;
    if (busy.current || !as || !now || now.result) return;
    const path = counted(now.path);
    const alreadySaved = saved.current.id === now.id ? saved.current.length : 1;
    if (path.length <= alreadySaved) return;

    busy.current = true;
    clearTimeout(retryTimer.current);
    setSaving((was) => (was === "retrying" ? was : "saving"));
    let delivered = false;
    try {
      const answer = await api<{ finished: boolean } & Partial<Result>>("PUT", `/runs/${now.id}`, { path }, as.token);
      saved.current = { id: now.id, length: path.length };
      delivered = true;
      setSaving("saved");
      if (answer.finished) {
        const result = { hops: answer.hops!, durationMs: answer.durationMs!, rank: answer.rank!, finishers: answer.finishers! };
        setTour((current) => (current && current.id === now.id ? { ...current, result } : current));
      }
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 401) forget();
      // The server refused this tour for good (restarted elsewhere, or not a valid walk): drop it.
      // Only that tour: a late refusal of an old one must not take away the tour started since.
      else if (status === 404 || status === 409 || status === 422) setTour((current) => (current?.id === now.id ? null : current));
      else {
        setSaving("retrying");
        retryTimer.current = setTimeout(() => void push(), RETRY_MS);
      }
    } finally {
      busy.current = false;
    }
    // Hops made while that request was in flight still need sending. After a failure the timer does it instead.
    if (delivered) void push();
  }, [forget]);

  const scoredLength = tour ? counted(tour.path).length : 0;
  useEffect(() => {
    void push();
  }, [push, player?.token, tour?.id, scoredLength]);
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  /** Claims a name, or takes up again the one this device last played under. Rejects with a message to show if it is taken or the server is unreachable. */
  const join = useCallback(async (name: string): Promise<Player> => {
    const last = lastPlayer();
    if (last && nameKey(last.name) === nameKey(name)) {
      try {
        await api("GET", "/me", undefined, last.token);
        setPlayer(last);
        return last;
      } catch (error) {
        // The server no longer knows that player, so the name is free to claim again.
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    }
    const joined = await api<Player>("POST", "/players", { name });
    setPlayer(joined);
    return joined;
  }, []);

  /** Starts the clock on a new tour. `as` is for the moment right after joining, before the new player has rendered. */
  const start = useCallback(
    async (from: number, as: Player | null = player) => {
      if (!as) throw new ApiError(401, "Pick a name first");
      try {
        const run = await api<ServerRun & { now: number }>("POST", "/runs", { start: from }, as.token);
        setTour({ id: run.id, path: run.path, startedAt: Date.now(), result: null });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) forget();
        throw error;
      }
    },
    [player, forget],
  );

  /** Moves along a link; a hop to somewhere that is not joined to the current project is ignored. */
  const hop = useCallback((to: number) => {
    setTour((now) => {
      if (!now || now.lost) return now;
      const at = now.path.at(-1)!;
      const hole = special(to);
      if (!hole) return edgeBetween(at, to) ? { ...now, path: [...now.path, to] } : now;
      // With every project seen the tour is scored, and the holes have nothing left to give or take.
      if (hole.anchor !== at || view(now).complete) return now;
      if (hole.kind === "blackhole") return { ...now, lost: true };
      return { ...now, path: [...now.path, to, landing(now.id, now.path.length)] };
    });
  }, []);

  /** Gives the tour up, here and on the server, so a reload does not bring it back. */
  const abandon = useCallback(() => {
    const { player: as, tour: now } = latest.current;
    // If this does not get through, starting the next tour removes the old one anyway.
    if (as && now && !now.result) void api("DELETE", `/runs/${now.id}`, undefined, as.token).catch(() => undefined);
    setTour(null);
  }, []);

  return { player, run: tour ? view(tour) : null, saving, join, start, hop, abandon, forget };
}
