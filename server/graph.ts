import { readFileSync } from "node:fs";

interface GraphFile {
  nodes: { id: number }[];
  edges: { a: number; b: number }[];
}

// The same file the client plays on, so the server and the game can never disagree about a link.
const graph = JSON.parse(readFileSync(new URL("../src/graph.json", import.meta.url), "utf8")) as GraphFile;

export const PROJECT_IDS = new Set(graph.nodes.map((node) => node.id));
const linked = new Set(graph.edges.flatMap((edge) => [`${edge.a}-${edge.b}`, `${edge.b}-${edge.a}`]));
export const isLinked = (a: number, b: number) => linked.has(`${a}-${b}`);

/** Longest walk the server will store; a tour of 31 projects needs at least 30 hops and wandering needs a few times that. */
export const MAX_PATH = 1500;

export type PathCheck = { ok: true; complete: boolean } | { ok: false; why: string };

/** Checks that a path is a walk along links, and that it stops the moment every project has been seen. */
export function checkPath(path: unknown): PathCheck {
  if (!Array.isArray(path) || path.length === 0 || path.length > MAX_PATH) return { ok: false, why: "path has the wrong shape" };
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const id: unknown = path[i];
    if (typeof id !== "number" || !PROJECT_IDS.has(id)) return { ok: false, why: "unknown project in path" };
    if (i > 0 && !isLinked(path[i - 1] as number, id)) return { ok: false, why: `projects ${path[i - 1]} and ${id} are not linked` };
    if (seen.size === PROJECT_IDS.size) return { ok: false, why: "path continues after the tour was complete" };
    seen.add(id);
  }
  return { ok: true, complete: seen.size === PROJECT_IDS.size };
}
