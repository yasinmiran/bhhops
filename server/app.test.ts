import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { SPECIALS, landing } from "../src/tricks.ts";
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
  assert.deepEqual(checkPath(tour, 1), { ok: true, complete: true, hops: tour.length - 1 });
  assert.deepEqual(checkPath(tour.slice(0, 5), 1), { ok: true, complete: false, hops: 4 });
  assert.equal(checkPath([...tour, neighboursOf.get(tour.at(-1)!)![0]], 1).ok, false);
  const unlinked = graph.nodes.map((n) => n.id).find((id) => id !== 1 && !neighboursOf.get(1)!.includes(id))!;
  assert.equal(checkPath([1, unlinked], 1).ok, false);
  assert.equal(checkPath([1, 99], 1).ok, false);
  assert.equal(checkPath([], 1).ok, false);
  assert.equal(checkPath("1,2", 1).ok, false);
});

test("names are cleaned, limited and unique whatever the case", async () => {
  const { call } = await setup();
  const first = await call("POST", "/api/players", { name: "  Ana   Banana " });
  assert.equal(first.status, 201);
  assert.equal(first.body.name, "Ana Banana");
  assert.equal((await call("POST", "/api/players", { name: "ana banana" })).status, 409);
  assert.equal((await call("POST", "/api/players", { name: "Zoë O'Neil-D’Arcy" })).status, 201);
  for (const bad of ["a", "x".repeat(21), "<script>", "", 42, " . ", "'quoted", "a\"b"]) {
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
    board.rows.map((row: any) => [row.rank, row.name, row.hops, row.durationMs, row.me]),
    [
      [1, "Cleo", short.length - 1, 40_000, false],
      [2, "Ben", short.length - 1, 90_000, true],
      [3, "Ana", long.length - 1, 20_000, false],
    ],
  );
  assert.equal(board.me.rank, 2);
  assert.equal(board.finishers, 3);
});

test("a wormhole is entered from its own project and leads to one place per tour", async () => {
  const { call, join } = await setup();
  const token = await join("Wanderer");
  const wormhole = SPECIALS.find((special) => special.kind === "wormhole")!;
  const blackHole = SPECIALS.find((special) => special.kind === "blackhole")!;
  const run = (await call("POST", "/api/runs", { start: wormhole.anchor }, token)).body;
  const thrownTo = landing(run.id, 1);
  const elsewhere = graph.nodes.find((n) => n.id !== thrownTo && n.id !== wormhole.anchor)!.id;
  const put = (path: number[]) => call("PUT", `/api/runs/${run.id}`, { path }, token);

  assert.equal((await put([wormhole.anchor, wormhole.id, elsewhere])).status, 422);
  assert.equal((await put([wormhole.anchor, blackHole.id])).status, 422);
  const stranger = graph.nodes.find((n) => n.id !== wormhole.anchor)!.id;
  assert.equal(checkPath([stranger, wormhole.id], run.id).ok, false);
  assert.equal(checkPath([wormhole.id], run.id).ok, false);
  assert.equal(checkPath([wormhole.anchor, wormhole.id], run.id).ok, false);
  // Stepping in is a hop; being thrown out the other side is not.
  assert.deepEqual((await put([wormhole.anchor, wormhole.id, thrownTo])).body, { finished: false, hops: 1 });
  assert.equal((await call("POST", "/api/runs", { start: wormhole.id }, token)).status, 400);
});

test("the leaderboard is served ten places to a page", async () => {
  const { call, join, tick } = await setup();
  const tour = fullTour(1);
  let mine = "";
  for (let i = 1; i <= 12; i++) {
    const token = await join(`Player ${i}`);
    if (i === 12) mine = token;
    const run = (await call("POST", "/api/runs", { start: 1 }, token)).body;
    tick(60_000 + i * 1000);
    await call("PUT", `/api/runs/${run.id}`, { path: tour }, token);
  }

  const first = (await call("GET", "/api/leaderboard", undefined, mine)).body;
  assert.deepEqual([first.page, first.pages, first.rows.length, first.rows[0].rank, first.rows[9].rank], [1, 2, 10, 1, 10]);
  assert.equal(first.me.rank, 12);
  assert.equal(first.rows.some((row: any) => row.me), false);

  const second = (await call("GET", "/api/leaderboard?page=2", undefined, mine)).body;
  assert.deepEqual(
    second.rows.map((row: any) => [row.rank, row.name, row.me]),
    [
      [11, "Player 11", false],
      [12, "Player 12", true],
    ],
  );

  assert.equal((await call("GET", "/api/leaderboard?page=99")).body.page, 2);
  for (const bad of ["0", "-1", "1.5", "two", ""]) {
    assert.equal((await call("GET", `/api/leaderboard?page=${bad}`)).status, 400, bad);
  }
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

test("a tour that was given up does not come back, and a finished one cannot be given up", async () => {
  const { call, join, tick } = await setup();
  const token = await join("Quitter");
  const other = await join("Bystander");
  const first = (await call("POST", "/api/runs", { start: 1 }, token)).body;
  assert.deepEqual((await call("DELETE", `/api/runs/${first.id}`, undefined, other)).body, { removed: 0 });
  assert.deepEqual((await call("DELETE", `/api/runs/${first.id}`, undefined, token)).body, { removed: 1 });
  assert.equal((await call("GET", "/api/me", undefined, token)).body.run, null);

  const second = (await call("POST", "/api/runs", { start: 1 }, token)).body;
  tick(60_000);
  await call("PUT", `/api/runs/${second.id}`, { path: fullTour(1) }, token);
  assert.deepEqual((await call("DELETE", `/api/runs/${second.id}`, undefined, token)).body, { removed: 0 });
  assert.equal((await call("GET", "/api/leaderboard")).body.finishers, 1);
});

test("the operator can empty the leaderboard, and only the operator", async () => {
  const { call, join, tick } = await setup();
  const tour = fullTour(1);
  const token = await join("Early Bird");
  const run = (await call("POST", "/api/runs", { start: 1 }, token)).body;
  tick(60_000);
  await call("PUT", `/api/runs/${run.id}`, { path: tour }, token);
  await join("Latecomer");
  const admin = "a".repeat(32);

  assert.equal((await call("POST", "/api/admin/reset", { confirm: "reset" }, token)).status, 401);
  assert.equal((await call("POST", "/api/admin/reset", { confirm: "reset" })).status, 401);
  assert.equal((await call("POST", "/api/admin/reset", {}, admin)).status, 400);
  assert.equal((await call("GET", "/api/leaderboard")).body.players, 2);

  assert.deepEqual((await call("POST", "/api/admin/reset", { confirm: "reset" }, admin)).body, { players: 2, tours: 1 });
  assert.deepEqual((await call("GET", "/api/leaderboard")).body.rows, []);
  assert.equal((await call("GET", "/api/leaderboard")).body.players, 0);
  // The old player is gone, and the name is free again.
  assert.equal((await call("GET", "/api/me", undefined, token)).status, 401);
  assert.equal((await call("POST", "/api/players", { name: "Early Bird" })).status, 201);
});

test("bad JSON and unknown routes get JSON errors", async () => {
  const { call } = await setup();
  assert.equal((await call("GET", "/api/nope")).status, 404);
  assert.equal((await call("POST", "/api/runs", { start: 1 })).status, 401);
});
