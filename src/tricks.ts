import graph from "./graph.json" with { type: "json" };

/* The map lies a little, and bites. Some real threads are not drawn until the helix stands at one end,
   some drawn threads join nothing, a few notes are not projects, two wormholes throw the helix
   somewhere else and one black hole ends the tour. Everything here is worked out from the graph and
   never rolled, so every player gets the same map. The server reads this file too: it has to know
   where a wormhole is and where it leads to tell a fair tour from a made-up one. */

export interface Spot {
  x: number;
  y: number;
  z: number;
}

type Direction = "up" | "right" | "down" | "left";
interface Node extends Spot {
  id: number;
  arrows: Record<Direction, number | null>;
}

const PROJECTS = graph.nodes as Node[];
const EDGES: { a: number; b: number }[] = graph.edges;
const byId = new Map(PROJECTS.map((p) => [p.id, p]));
const project = (id: number) => byId.get(id)!;
const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** A thread that looks like a link and is not one. It drops as soon as the helix visits any of `ends`. */
export interface LooseEnd {
  key: string;
  from: Spot;
  to: Spot;
  ends: number[];
}

/** A note that looks like a project, hung on a loose end. */
export interface Phantom extends Spot {
  id: number;
  name: string;
}

/** A place on the graph that is not a project and does something to whoever steps on it from `anchor`. */
export interface Special extends Spot {
  id: number;
  /** A wormhole throws the helix to another project. The black hole ends the tour. */
  kind: "blackhole" | "wormhole";
  name: string;
  /** The one project it can be reached from. */
  anchor: number;
  /** The arrow key that leads to it from there. */
  direction: Direction;
}

const HIDDEN_COUNT = 7;
const LOOSE_COUNT = 6;
const SPECIAL_KINDS = ["blackhole", "wormhole", "wormhole"] as const;
const PHANTOM_NAMES = ["Why is there an RJ45 socket on the toilet wall? Some core dumps need a wired connection.", "Coffee break"];
/** How far a special place or a phantom hangs from the project it is tied to. */
const REACH = 4.4;
/** Nothing is placed, and no fake thread passes, closer to a note than this. */
const CLEARANCE = 2.6;
/** A thread that is not a link leaves a note at least this far round from every real one, so the two never read as one. */
const MIN_SPREAD = (28 * Math.PI) / 180;
const BEARINGS: Record<Direction, number> = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };

/** An order that looks arbitrary and is the same on every device. */
const scramble = (n: number) => Math.imul(n + 0x9e3779b9, 2654435761) >>> 0;
const flat = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
const bearing = (from: Spot, to: Spot) => Math.atan2(to.y - from.y, to.x - from.x);
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** How close the straight line from `from` to `to` comes to `point`. */
function passes(from: Spot, to: Spot, point: Spot): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const along = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (from.x + dx * along), point.y - (from.y + dy * along));
}

const linked = new Map(PROJECTS.map((p) => [p.id, [] as number[]]));
for (const edge of EDGES) {
  linked.get(edge.a)!.push(edge.b);
  linked.get(edge.b)!.push(edge.a);
}

function connectedWithout(hidden: Set<string>): boolean {
  const reached = new Set([PROJECTS[0].id]);
  const queue = [PROJECTS[0].id];
  for (let at = queue.pop(); at !== undefined; at = queue.pop()) {
    for (const next of linked.get(at)!) {
      if (reached.has(next) || hidden.has(edgeKey(at, next))) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached.size === PROJECTS.length;
}

/** Keys of the links that stay undrawn until the helix has stood at one end. What is drawn still joins every project, each by two threads or more. */
export const HIDDEN_THREADS: ReadonlySet<string> = (() => {
  const hidden = new Set<string>();
  const drawn = new Map(PROJECTS.map((p) => [p.id, linked.get(p.id)!.length]));
  const order = [...EDGES].sort((a, b) => scramble(a.a * 64 + a.b) - scramble(b.a * 64 + b.b));
  for (const edge of order) {
    if (hidden.size === HIDDEN_COUNT) break;
    if (drawn.get(edge.a)! <= 2 || drawn.get(edge.b)! <= 2) continue;
    const key = edgeKey(edge.a, edge.b);
    hidden.add(key);
    if (!connectedWithout(hidden)) {
      hidden.delete(key);
      continue;
    }
    drawn.set(edge.a, drawn.get(edge.a)! - 1);
    drawn.set(edge.b, drawn.get(edge.b)! - 1);
  }
  return hidden;
})();

/** Whether a thread from `from` to `to` that is not a link would stand clear of the real threads at `from` and of every other note. */
function plausible(from: number, to: Spot, skip: number[] = []): boolean {
  const start = project(from);
  if (linked.get(from)!.some((id) => turn(bearing(start, project(id)), bearing(start, to)) < MIN_SPREAD)) return false;
  return PROJECTS.every((p) => p.id === from || skip.includes(p.id) || passes(start, to, p) >= CLEARANCE);
}

const used = new Set<number>();

/** Fake threads between projects that are close enough to pass for linked. Each project carries one at most. */
const betweenProjects: LooseEnd[] = (() => {
  const lengths = EDGES.map((edge) => flat(project(edge.a), project(edge.b))).sort((a, b) => a - b);
  const longest = lengths[Math.floor(lengths.length * 0.75)];
  const pairs = PROJECTS.flatMap((a) => PROJECTS.filter((b) => b.id > a.id).map((b) => [a, b] as const))
    .filter(([a, b]) => !linked.get(a.id)!.includes(b.id) && flat(a, b) <= longest)
    .filter(([a, b]) => linked.get(a.id)!.length <= 3 && linked.get(b.id)!.length <= 3)
    .filter(([a, b]) => plausible(a.id, b, [b.id]) && plausible(b.id, a, [a.id]))
    .sort(([a, b], [c, d]) => scramble(a.id * 64 + b.id) - scramble(c.id * 64 + d.id));
  const loose: LooseEnd[] = [];
  for (const [a, b] of pairs) {
    if (loose.length === LOOSE_COUNT) break;
    if (used.has(a.id) || used.has(b.id)) continue;
    used.add(a.id);
    used.add(b.id);
    loose.push({ key: `loose-${a.id}-${b.id}`, from: a, to: b, ends: [a.id, b.id] });
  }
  return loose;
})();

/** Empty places beside a project with an arrow key to spare, inside the area the real notes cover. The first few
    become the black hole and the wormholes; what is left over holds the notes that are not projects. */
const hangers: (Spot & { anchor: number })[] = (() => {
  const reachX = Math.max(...PROJECTS.map((p) => Math.abs(p.x)));
  const reachY = Math.max(...PROJECTS.map((p) => Math.abs(p.y)));
  const found: (Spot & { anchor: number })[] = [];
  const anchors = PROJECTS.filter((p) => linked.get(p.id)!.length <= 3 && !used.has(p.id)).sort((a, b) => scramble(a.id * 7) - scramble(b.id * 7));
  for (const anchor of anchors) {
    if (found.length === SPECIAL_KINDS.length + PHANTOM_NAMES.length) break;
    for (let step = 0; step < 12; step++) {
      const angle = ((step * 5) % 12) * (Math.PI / 6) + anchor.id;
      const spot = { x: anchor.x + Math.cos(angle) * REACH, y: anchor.y + Math.sin(angle) * REACH, z: anchor.z - 0.4 };
      const roomy =
        Math.abs(spot.x) <= reachX &&
        Math.abs(spot.y) <= reachY &&
        PROJECTS.every((p) => flat(p, spot) >= CLEARANCE * 1.3) &&
        found.every((other) => flat(other, spot) >= CLEARANCE * 2) &&
        plausible(anchor.id, spot);
      if (!roomy) continue;
      found.push({ ...spot, anchor: anchor.id });
      break;
    }
  }
  return found;
})();

/** The spare arrow key at a project that points most nearly at `to`. */
function spareArrow(from: Node, to: Spot): Direction {
  const spare = (Object.keys(BEARINGS) as Direction[]).filter((direction) => from.arrows[direction] === null);
  return spare.sort((a, b) => turn(BEARINGS[a], bearing(from, to)) - turn(BEARINGS[b], bearing(from, to)))[0];
}

const lastProject = Math.max(...PROJECTS.map((p) => p.id));

export const SPECIALS: Special[] = hangers.slice(0, SPECIAL_KINDS.length).map((spot, i) => ({
  ...spot,
  id: lastProject + 1 + i,
  kind: SPECIAL_KINDS[i],
  name: SPECIAL_KINDS[i] === "blackhole" ? "a black hole" : "a wormhole",
  direction: spareArrow(project(spot.anchor), spot),
}));

const phantomHangers = hangers.slice(SPECIAL_KINDS.length);

export const PHANTOMS: Phantom[] = phantomHangers.map((spot, i) => ({ x: spot.x, y: spot.y, z: spot.z, id: lastProject + SPECIALS.length + 1 + i, name: PHANTOM_NAMES[i] }));

export const LOOSE_ENDS: LooseEnd[] = [
  ...betweenProjects,
  ...phantomHangers.map((spot, i) => ({ key: `loose-${spot.anchor}-phantom-${PHANTOMS[i].id}`, from: project(spot.anchor), to: PHANTOMS[i], ends: [spot.anchor] })),
];

/** Where a wormhole entered as step `step` of tour `tourId` throws the helix. Fixed by those two numbers, so the
    game can show it at once, the server can check it, and nobody can pick it. */
export function landing(tourId: number, step: number): number {
  let h = Math.imul(tourId ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return PROJECTS[((h ^ (h >>> 15)) >>> 0) % PROJECTS.length].id;
}
