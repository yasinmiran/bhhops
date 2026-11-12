import { useCallback, useEffect, useState } from "react";
import graphData from "./graph.json";
import posterData from "./posters.json";

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
export const PROJECTS: Project[] = graph.nodes.map((node) => ({ ...posters.get(node.id)!, ...node }));

const projectsById = new Map(PROJECTS.map((p) => [p.id, p]));
const themesById = new Map(THEMES.map((t) => [t.id, t]));
export const project = (id: number) => projectsById.get(id)!;
export const theme = (id: string) => themesById.get(id)!;

export const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const edgesByKey = new Map(EDGES.map((e) => [edgeKey(e.a, e.b), e]));
export const edgeBetween = (a: number, b: number) => edgesByKey.get(edgeKey(a, b)) ?? null;

/** The projects one hop away, with the arrow that leads to each. */
export function neighbours(id: number): { direction: Direction; project: Project; reason: string }[] {
  const from = project(id);
  return DIRECTIONS.flatMap((direction) => {
    const to = from.arrows[direction];
    return to === null ? [] : [{ direction, project: project(to), reason: edgeBetween(id, to)?.reason ?? "" }];
  });
}

const pad = (id: number) => String(id).padStart(2, "0");
export const posterImage = (id: number) => `./posters/${pad(id)}.webp`;
export const posterThumb = (id: number) => `./posters/${pad(id)}-thumb.webp`;

/** One tour of the graph: where the player is, what they have seen, and how many hops it took. */
export interface Run {
  current: number;
  visited: number[];
  walked: string[];
  hops: number;
}

const RUN_KEY = "31hops.run.v1";
const BEST_KEY = "31hops.best.v1";

function loadRun(): Run | null {
  try {
    const run = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as Run | null;
    const valid =
      run !== null &&
      projectsById.has(run.current) &&
      Array.isArray(run.visited) &&
      run.visited.every((id) => projectsById.has(id)) &&
      Array.isArray(run.walked) &&
      Number.isInteger(run.hops);
    return valid ? run : null;
  } catch {
    return null;
  }
}

function loadBest(): number | null {
  try {
    const best = Number(localStorage.getItem(BEST_KEY));
    return Number.isInteger(best) && best > 0 ? best : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private browsing: the game still works for this visit.
  }
}

export const isComplete = (run: Run) => run.visited.length === PROJECTS.length;

export function useRun() {
  const [run, setRun] = useState<Run | null>(loadRun);
  const [best, setBest] = useState<number | null>(loadBest);

  useEffect(() => {
    if (run) store(RUN_KEY, JSON.stringify(run));
  }, [run]);

  useEffect(() => {
    if (!run || !isComplete(run) || (best !== null && best <= run.hops)) return;
    setBest(run.hops);
    store(BEST_KEY, String(run.hops));
  }, [run, best]);

  const start = useCallback((from: number) => setRun({ current: from, visited: [from], walked: [], hops: 0 }), []);

  /** Moves along a link; a hop to a project that is not joined to the current one is ignored. */
  const hop = useCallback((to: number) => {
    setRun((now) => {
      if (!now || !edgeBetween(now.current, to)) return now;
      const key = edgeKey(now.current, to);
      return {
        current: to,
        visited: now.visited.includes(to) ? now.visited : [...now.visited, to],
        walked: now.walked.includes(key) ? now.walked : [...now.walked, key],
        hops: now.hops + 1,
      };
    });
  }, []);

  const abandon = useCallback(() => setRun(null), []);

  return { run, best, start, hop, abandon };
}
