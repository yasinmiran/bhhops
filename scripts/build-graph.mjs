// Turns the themed project list into the playable graph: which projects are joined,
// where each one sits, which arrow key leads where, and the par for a full tour.
// Usage: node scripts/build-graph.mjs   (reads scripts/themes.json, writes src/graph.json)
import { readFileSync, writeFileSync } from "node:fs";

const { themes, projects, links } = JSON.parse(readFileSync(new URL("./themes.json", import.meta.url), "utf8"));

// Four arrow keys, so no project may have more than four neighbours.
const MAX_DEGREE = 4;
const TARGET_EDGES = Math.round(projects.length * 1.55);
const EDGE_LENGTH = 3.4;
const COLORS = ["#b9d531", "#f6d94a", "#f39130", "#ee3f6c", "#2f8fce", "#9a78c9", "#3bb7a4", "#e2674f", "#86c9ea", "#6fb565", "#f7b189", "#cdb0ea", "#d9c24a"];

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const ids = projects.map((p) => p.id);
const byId = new Map(projects.map((p) => [p.id, p]));
const themeById = new Map(themes.map((t) => [t.id, t]));
const members = new Map(themes.map((t) => [t.id, projects.filter((p) => p.themes.includes(t.id)).length]));
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const explicit = new Map(links.map((l) => [pairKey(l.a, l.b), l.reason]));

/** How much two projects have in common, and the words for it. A theme few projects share says more than a common one. */
function affinity(a, b) {
  const shared = byId.get(a).themes.filter((t) => byId.get(b).themes.includes(t));
  let weight = shared.reduce((sum, t) => sum + 1 / Math.log2(1 + members.get(t)), 0);
  if (byId.get(a).primary === byId.get(b).primary) weight += 0.35;
  const stated = explicit.get(pairKey(a, b));
  if (stated) weight += 1.5;
  const rarest = [...shared].sort((x, y) => members.get(x) - members.get(y));
  return {
    weight,
    theme: rarest[0] ?? null,
    reason: stated ?? (rarest.length ? `Both: ${rarest.slice(0, 2).map((t) => themeById.get(t).label).join(", ")}` : "Neighbours by chance"),
  };
}

const pairs = [];
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) pairs.push({ a: ids[i], b: ids[j], ...affinity(ids[i], ids[j]) });
}
pairs.sort((x, y) => y.weight - x.weight || x.a - y.a || x.b - y.b);

// A spanning tree of the strongest ties first, so the whole graph can be walked;
// then more strong ties for loops, which is what makes route choice interesting.
const degree = new Map(ids.map((id) => [id, 0]));
const group = new Map(ids.map((id) => [id, id]));
const find = (id) => (group.get(id) === id ? id : find(group.get(id)));
const edges = [];
const take = (pair) => {
  edges.push(pair);
  degree.set(pair.a, degree.get(pair.a) + 1);
  degree.set(pair.b, degree.get(pair.b) + 1);
};
const room = (pair) => degree.get(pair.a) < MAX_DEGREE && degree.get(pair.b) < MAX_DEGREE;

// The tree keeps one slot free on every node, so later loops are not starved.
for (const pair of pairs) {
  if (find(pair.a) === find(pair.b)) continue;
  if (degree.get(pair.a) >= MAX_DEGREE - 1 || degree.get(pair.b) >= MAX_DEGREE - 1) continue;
  take(pair);
  group.set(find(pair.a), find(pair.b));
}
if (new Set(ids.map(find)).size > 1) throw new Error("could not connect every project within the degree limit");
for (const pair of pairs) {
  if (edges.length >= TARGET_EDGES || pair.weight <= 0) break;
  if (!edges.includes(pair) && room(pair)) take(pair);
}

// A project with a single link is a dead end the player has to walk into and back out of.
for (const id of ids) {
  if (degree.get(id) >= 2) continue;
  const second = pairs.find((pair) => (pair.a === id || pair.b === id) && !edges.includes(pair) && room(pair));
  if (second) take(second);
}

const neighbours = new Map(ids.map((id) => [id, []]));
for (const e of edges) {
  neighbours.get(e.a).push(e.b);
  neighbours.get(e.b).push(e.a);
}

// Layout: springs along edges, repulsion between all, a pull towards same-theme projects.
const random = seeded(31);
const pos = new Map(ids.map((id) => [id, { x: (random() - 0.5) * 20, y: (random() - 0.5) * 20 }]));
for (let step = 0; step < 900; step++) {
  const heat = 0.5 * (1 - step / 900) + 0.01;
  const move = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p = pos.get(ids[i]);
      const q = pos.get(ids[j]);
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const d = Math.max(0.3, Math.hypot(dx, dy));
      const push = (EDGE_LENGTH * EDGE_LENGTH) / d / d;
      move.get(ids[i]).x += (dx / d) * push;
      move.get(ids[i]).y += (dy / d) * push;
      move.get(ids[j]).x -= (dx / d) * push;
      move.get(ids[j]).y -= (dy / d) * push;
    }
  }
  for (const e of edges) {
    const p = pos.get(e.a);
    const q = pos.get(e.b);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const d = Math.max(0.01, Math.hypot(dx, dy));
    const pull = (d - EDGE_LENGTH) / EDGE_LENGTH;
    move.get(e.a).x += (dx / d) * pull * 1.6;
    move.get(e.a).y += (dy / d) * pull * 1.6;
    move.get(e.b).x -= (dx / d) * pull * 1.6;
    move.get(e.b).y -= (dy / d) * pull * 1.6;
  }
  for (const id of ids) {
    const m = move.get(id);
    const length = Math.hypot(m.x, m.y) || 1;
    const capped = Math.min(length, 1.5) * heat;
    const p = pos.get(id);
    p.x += (m.x / length) * capped - p.x * 0.004;
    p.y += (m.y / length) * capped - p.y * 0.004;
  }
}
// The springs tend to settle into a tall shape. Widen it a little so the whole graph
// also reads on a landscape screen; the stretch is small enough not to distort the links.
{
  const span = (axis) => Math.max(...ids.map((id) => pos.get(id)[axis])) - Math.min(...ids.map((id) => pos.get(id)[axis]));
  const stretch = Math.min(1.25, Math.max(1, (0.95 * span("y")) / span("x")));
  for (const id of ids) pos.get(id).x *= stretch;
}

const centre = { x: ids.reduce((s, id) => s + pos.get(id).x, 0) / ids.length, y: ids.reduce((s, id) => s + pos.get(id).y, 0) / ids.length };

/** Gives each neighbour its own arrow key, choosing the assignment whose directions fit best overall. */
function arrowsFor(id) {
  const DIRECTIONS = { up: [0, 1], right: [1, 0], down: [0, -1], left: [-1, 0] };
  const names = Object.keys(DIRECTIONS);
  const around = neighbours.get(id);
  const fit = (to, dir) => {
    const dx = pos.get(to).x - pos.get(id).x;
    const dy = pos.get(to).y - pos.get(id).y;
    const d = Math.hypot(dx, dy) || 1;
    return (dx / d) * DIRECTIONS[dir][0] + (dy / d) * DIRECTIONS[dir][1];
  };
  let best = { score: -Infinity, arrows: {} };
  const assign = (index, used, score, arrows) => {
    if (index === around.length) {
      if (score > best.score) best = { score, arrows: { ...arrows } };
      return;
    }
    for (const dir of names) {
      if (used.has(dir)) continue;
      used.add(dir);
      arrows[dir] = around[index];
      assign(index + 1, used, score + fit(around[index], dir), arrows);
      delete arrows[dir];
      used.delete(dir);
    }
  };
  assign(0, new Set(), 0, {});
  return Object.fromEntries(names.map((dir) => [dir, best.arrows[dir] ?? null]));
}

// Par: a good (not proven shortest) walk that visits every project, counted in hops.
const hops = new Map(ids.map((from) => {
  const distance = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    for (const next of neighbours.get(at)) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(at) + 1);
        queue.push(next);
      }
    }
  }
  return [from, distance];
}));
const walkLength = (order) => order.slice(1).reduce((sum, id, i) => sum + hops.get(order[i]).get(id), 0);
let par = Infinity;
for (const start of ids) {
  const order = [start];
  const left = new Set(ids.filter((id) => id !== start));
  while (left.size) {
    const at = order.at(-1);
    const next = [...left].sort((x, y) => hops.get(at).get(x) - hops.get(at).get(y) || x - y)[0];
    order.push(next);
    left.delete(next);
  }
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const flipped = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (walkLength(flipped) < walkLength(order)) {
          order.splice(0, order.length, ...flipped);
          improved = true;
        }
      }
    }
  }
  par = Math.min(par, walkLength(order));
}

const depth = seeded(7);
const round = (n) => Number(n.toFixed(3));
const coloured = themes.map((t, i) => ({ id: t.id, label: t.label, color: COLORS[i % COLORS.length] }));
const graph = {
  par,
  themes: coloured.map((t) => {
    const at = projects.filter((p) => p.primary === t.id).map((p) => pos.get(p.id));
    return at.length
      ? { ...t, x: round(at.reduce((s, p) => s + p.x, 0) / at.length - centre.x), y: round(at.reduce((s, p) => s + p.y, 0) / at.length - centre.y) }
      : { ...t, x: null, y: null };
  }),
  nodes: projects
    .map((p) => ({
      id: p.id,
      name: p.short_name,
      primary: p.primary,
      themes: p.themes,
      x: round(pos.get(p.id).x - centre.x),
      y: round(pos.get(p.id).y - centre.y),
      z: round((depth() - 0.5) * 2.4),
      arrows: arrowsFor(p.id),
    }))
    .sort((a, b) => a.id - b.id),
  edges: edges.map((e) => ({ a: e.a, b: e.b, reason: e.reason, theme: e.theme })).sort((x, y) => x.a - y.a || x.b - y.b),
};

writeFileSync(new URL("../src/graph.json", import.meta.url), JSON.stringify(graph, null, 1) + "\n");
const degrees = ids.map((id) => neighbours.get(id).length);
console.log(`${graph.nodes.length} projects, ${graph.edges.length} links, degree ${Math.min(...degrees)} to ${Math.max(...degrees)}, par ${par} hops`);
console.log(`links with no shared theme: ${edges.filter((e) => e.weight <= 0).length}`);
