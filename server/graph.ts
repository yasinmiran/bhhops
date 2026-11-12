import { readFileSync } from "node:fs";
import { SPECIALS, landing } from "../src/tricks.ts";

interface GraphFile {
  nodes: { id: number }[];
  edges: { a: number; b: number }[];
}

// The same file the client plays on, so the server and the game can never disagree about a link.
const graph = JSON.parse(readFileSync(new URL("../src/graph.json", import.meta.url), "utf8")) as GraphFile;

export const PROJECT_IDS = new Set(graph.nodes.map((node) => node.id));
const linked = new Set(graph.edges.flatMap((edge) => [`${edge.a}-${edge.b}`, `${edge.b}-${edge.a}`]));
export const isLinked = (a: number, b: number) => linked.has(`${a}-${b}`);
/** The project each wormhole is entered from. The black hole never shows up in a path: a tour that falls in is over. */
const WORMHOLES = new Map(SPECIALS.filter((special) => special.kind === "wormhole").map((special) => [special.id, special.anchor]));

/** Longest walk the server will store; a tour of 31 projects needs at least 30 hops and wandering needs a few times that. */
export const MAX_PATH = 1500;

export type PathCheck = { ok: true; complete: boolean; hops: number } | { ok: false; why: string };

/**
 * Checks that a path is a walk along links, and that it stops the moment every project has been seen.
 * A wormhole may be stepped into from the project beside it, and the step after it has to be the one
 * place that wormhole leads on this tour. Being thrown is not a hop; stepping in is.
 */
export function checkPath(path: unknown, tourId: number): PathCheck {
  if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH) return { ok: false, why: "path has the wrong shape" };
  const seen = new Set<number>();
  let thrown = 0;
  for (let i = 0; i < path.length; i++) {
    const id: unknown = path[i];
    const before = path[i - 1] as number;
    if (typeof id !== "number") return { ok: false, why: "unknown project in path" };
    if (seen.size === PROJECT_IDS.size) return { ok: false, why: "path continues after the tour was complete" };
    if (WORMHOLES.has(id)) {
      if (i === 0 || before !== WORMHOLES.get(id)) return { ok: false, why: `nothing leads from ${before ?? "nowhere"} into that wormhole` };
      continue;
    }
    if (!PROJECT_IDS.has(id)) return { ok: false, why: "unknown project in path" };
    if (i > 0 && WORMHOLES.has(before)) {
      if (id !== landing(tourId, i - 1)) return { ok: false, why: "that wormhole does not lead there" };
      thrown++;
    } else if (i > 0 && !isLinked(before, id)) {
      return { ok: false, why: `projects ${before} and ${id} are not linked` };
    }
    seen.add(id);
  }
  // The game always sends a wormhole together with where it led, so a path that stops inside one was made by hand.
  if (WORMHOLES.has(path.at(-1) as number)) return { ok: false, why: "path ends inside a wormhole" };
  return { ok: true, complete: seen.size === PROJECT_IDS.size, hops: path.length - 1 - thrown };
}
