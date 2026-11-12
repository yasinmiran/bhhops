import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { checkPath } from "./graph.ts";

const graph = JSON.parse(readFileSync(new URL("../src/graph.json", import.meta.url), "utf8")) as {
  nodes: { id: number; arrows: Record<string, number | null> }[];
};
const neighboursOf = new Map(graph.nodes.map((n) => [n.id, Object.values(n.arrows).filter((id): id is number => id !== null)]));

/** A complete tour found by depth-first walk, backtracking along the same links. */
function fullTour(start: number): number[] {
  const seen = new Set([start]);
  const path = [start];
  const visit = (at: number) => {
    for (const next of neighboursOf.get(at)!) {
      if (seen.has(next) || seen.size === graph.nodes.length) continue;
      seen.add(next);
      path.push(next);
      visit(next);
      if (seen.size < graph.nodes.length) path.push(at);
    }
  };
  visit(start);
  return path;
}

const servers: { close(): void }[] = [];
after(() => servers.forEach((s) => s.close()));

async function setup() {
  let clock = 1_800_000_000_000;
  const db = openDatabase(":memory:", new URL("./migrations", import.meta.url).pathname);
  const server = createApp({ db, adminToken: "a".repeat(32), now: () => clock }).listen(0);
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  const join = async (name: string) => (await call("POST", "/api/players", { name })).body.token as string;
  return { call, join, tick: (ms: number) => (clock += ms) };
}

test("a path must follow links and stop when the tour is complete", () => {
  const tour = fullTour(1);
  assert.deepEqual(checkPath(tour), { ok: true, complete: true });
  assert.deepEqual(checkPath(tour.slice(0, 5)), { ok: true, complete: false });
  assert.equal(checkPath([...tour, neighboursOf.get(tour.at(-1)!)![0]]).ok, false);
  const unlinked = graph.nodes.map((n) => n.id).find((id) => id !== 1 && !neighboursOf.get(1)!.includes(id))!;
  assert.equal(checkPath([1, unlinked]).ok, false);
  assert.equal(checkPath([1, 99]).ok, false);
  assert.equal(checkPath([]).ok, false);
  assert.equal(checkPath("1,2").ok, false);
});

test("names are cleaned, limited and unique whatever the case", async () => {
  const { call } = await setup();
  const first = await call("POST", "/api/players", { name: "  Ana   Banana " });
  assert.equal(first.status, 201);
  assert.equal(first.body.name, "Ana Banana");
  assert.equal((await call("POST", "/api/players", { name: "ana banana" })).status, 409);
  for (const bad of ["a", "x".repeat(21), "<script>", "", 42, " . "]) {
    assert.equal((await call("POST", "/api/players", { name: bad })).status, 400, String(bad));
  }
});

test("a tour is saved hop by hop, restored on another load, and scored when complete", async () => {
  const { call, join, tick } = await setup();
  const token = await join("Yasin");
  const tour = fullTour(24);
  const run = (await call("POST", "/api/runs", { start: 24 }, token)).body;
  assert.deepEqual(run.path, [24]);

  tick(5_000);
  assert.deepEqual((await call("PUT", `/api/runs/${run.id}`, { path: tour.slice(0, 4) }, token)).body, { finished: false, hops: 3 });
  const me = (await call("GET", "/api/me", undefined, token)).body;
  assert.deepEqual(me.run.path, tour.slice(0, 4));
  assert.equal(me.best, null);

  tick(55_000);
  const done = (await call("PUT", `/api/runs/${run.id}`, { path: tour }, token)).body;
  assert.equal(done.finished, true);
  assert.equal(done.hops, tour.length - 1);
  assert.equal(done.durationMs, 60_000);
  assert.equal(done.rank, 1);

  // The same final save again (a lost response) gets the same result, not an error.
  assert.equal((await call("PUT", `/api/runs/${run.id}`, { path: tour }, token)).body.durationMs, 60_000);
  assert.equal((await call("GET", "/api/me", undefined, token)).body.run, null);
});

test("saved hops cannot be rewritten, and other players' tours cannot be touched", async () => {
  const { call, join } = await setup();
  const mine = await join("Yasin");
  const theirs = await join("Tammy");
  const tour = fullTour(1);
  const run = (await call("POST", "/api/runs", { start: 1 }, mine)).body;
  await call("PUT", `/api/runs/${run.id}`, { path: tour.slice(0, 5) }, mine);
  assert.equal((await call("PUT", `/api/runs/${run.id}`, { path: tour.slice(0, 3) }, mine)).status, 409);
  const other = [1, neighboursOf.get(1)!.find((id) => id !== tour[1])!];
  assert.equal((await call("PUT", `/api/runs/${run.id}`, { path: other }, mine)).status, 409);
  assert.equal((await call("PUT", `/api/runs/${run.id}`, { path: tour.slice(0, 6) }, theirs)).status, 404);
  assert.equal((await call("PUT", `/api/runs/${run.id}`, { path: tour.slice(0, 6) })).status, 401);
});

test("a tour finished faster than keys can be pressed is refused", async () => {
  const { call, join, tick } = await setup();
  const token = await join("Bot");
  const tour = fullTour(1);
  const run = (await call("POST", "/api/runs", { start: 1 }, token)).body;
  tick(500);
  assert.equal((await call("PUT", `/api/runs/${run.id}`, { path: tour }, token)).status, 422);
});

test("the leaderboard ranks by hops, then by time, and keeps each player's best", async () => {
  const { call, join, tick } = await setup();
  const short = fullTour(1);
  const long = [short[0], short[1], short[0], ...short.slice(1)];
  const play = async (token: string, path: number[], ms: number) => {
    const run = (await call("POST", "/api/runs", { start: path[0] }, token)).body;
    tick(ms);
    return (await call("PUT", `/api/runs/${run.id}`, { path }, token)).body;
  };
  const [ana, ben, cleo] = [await join("Ana"), await join("Ben"), await join("Cleo")];
  await play(ana, long, 30_000);
  await play(ben, short, 90_000);
  assert.equal((await play(cleo, short, 40_000)).rank, 1);
  assert.equal((await play(ana, long, 20_000)).best.durationMs, 20_000);

  const board = (await call("GET", "/api/leaderboard", undefined, ben)).body;
  assert.deepEqual(
    board.top.map((row: any) => [row.rank, row.name, row.hops, row.durationMs, row.me]),
    [
      [1, "Cleo", short.length - 1, 40_000, false],
      [2, "Ben", short.length - 1, 90_000, true],
      [3, "Ana", long.length - 1, 20_000, false],
    ],
  );
  assert.equal(board.me.rank, 2);
  assert.equal(board.finishers, 3);
});

test("starting again gives up the unfinished tour but keeps finished ones", async () => {
  const { call, join, tick } = await setup();
  const token = await join("Yasin");
  const tour = fullTour(1);
  const first = (await call("POST", "/api/runs", { start: 1 }, token)).body;
  tick(60_000);
  await call("PUT", `/api/runs/${first.id}`, { path: tour }, token);
  const second = (await call("POST", "/api/runs", { start: 2 }, token)).body;
  const third = (await call("POST", "/api/runs", { start: 3 }, token)).body;
  assert.equal((await call("PUT", `/api/runs/${second.id}`, { path: [2] }, token)).status, 404);
  assert.deepEqual((await call("GET", "/api/me", undefined, token)).body.run.path, [3]);
  assert.equal((await call("GET", "/api/me", undefined, token)).body.best.rank, 1);
  assert.equal(third.path[0], 3);
});

test("an admin can remove a player and their scores; nobody else can", async () => {
  const { call, join, tick } = await setup();
  const token = await join("Rude Name");
  const tour = fullTour(1);
  const run = (await call("POST", "/api/runs", { start: 1 }, token)).body;
  tick(60_000);
  await call("PUT", `/api/runs/${run.id}`, { path: tour }, token);
  assert.equal((await call("POST", "/api/admin/remove-player", { name: "Rude Name" }, token)).status, 401);
  assert.deepEqual((await call("POST", "/api/admin/remove-player", { name: "rude name" }, "a".repeat(32))).body, { removed: 1 });
  assert.equal((await call("GET", "/api/leaderboard")).body.finishers, 0);
  assert.equal((await call("GET", "/api/me", undefined, token)).status, 401);
});

test("bad JSON and unknown routes get JSON errors", async () => {
  const { call } = await setup();
  assert.equal((await call("GET", "/api/nope")).status, 404);
  assert.equal((await call("POST", "/api/runs", { start: 1 })).status, 401);
});
