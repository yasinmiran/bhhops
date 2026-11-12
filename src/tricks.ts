import { EDGES, PROJECTS, edgeKey, project } from "./game";

/* The map lies a little. Some real threads are not drawn until the helix stands at one end, some drawn
   threads join nothing, and a few notes are not projects. Everything here is worked out from the graph
   and never rolled, so every player gets the same lies. The server knows none of it: it scores the walk. */

export interface Spot {
  x: number;
  y: number;
  z: number;
}

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

const HIDDEN_COUNT = 7;
const LOOSE_COUNT = 6;
const PHANTOM_NAMES = ["Coffee break", "Lunch queue", "Wi-Fi password", "Lost lanyard"];
/** How far a phantom hangs from the project it pretends to be linked to. */
const PHANTOM_REACH = 4.4;
/** Nothing is placed, and no fake thread passes, closer to a note than this. */
const CLEARANCE = 2.6;
/** A fake thread leaves a note at least this far round from every real one, so the two never read as one. */
const MIN_SPREAD = (28 * Math.PI) / 180;

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

/** Whether a fake thread from `from` to `to` would stand clear of the real threads at `from` and of every other note. */
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

/** Notes that are not projects, each hung on a fake thread from a project with room beside it, inside the area the real notes cover. */
export const PHANTOMS: Phantom[] = (() => {
  const reachX = Math.max(...PROJECTS.map((p) => Math.abs(p.x)));
  const reachY = Math.max(...PROJECTS.map((p) => Math.abs(p.y)));
  const phantoms: (Phantom & { anchor: number })[] = [];
  const anchors = PROJECTS.filter((p) => linked.get(p.id)!.length <= 3 && !used.has(p.id)).sort((a, b) => scramble(a.id * 7) - scramble(b.id * 7));
  for (const anchor of anchors) {
    if (phantoms.length === PHANTOM_NAMES.length) break;
    for (let step = 0; step < 12; step++) {
      const angle = ((step * 5) % 12) * (Math.PI / 6) + anchor.id;
      const spot = { x: anchor.x + Math.cos(angle) * PHANTOM_REACH, y: anchor.y + Math.sin(angle) * PHANTOM_REACH, z: anchor.z - 0.4 };
      const roomy =
        Math.abs(spot.x) <= reachX &&
        Math.abs(spot.y) <= reachY &&
        PROJECTS.every((p) => flat(p, spot) >= CLEARANCE * 1.3) &&
        phantoms.every((other) => flat(other, spot) >= CLEARANCE * 2) &&
        plausible(anchor.id, spot);
      if (!roomy) continue;
      phantoms.push({ ...spot, id: PROJECTS.length + phantoms.length + 1, name: PHANTOM_NAMES[phantoms.length], anchor: anchor.id });
      break;
    }
  }
  return phantoms;
})() as Phantom[];

export const LOOSE_ENDS: LooseEnd[] = [
  ...betweenProjects,
  ...(PHANTOMS as (Phantom & { anchor: number })[]).map((phantom) => ({
    key: `loose-${phantom.anchor}-phantom-${phantom.id}`,
    from: project(phantom.anchor),
    to: phantom,
    ends: [phantom.anchor],
  })),
];
