# 31 Hops

The 31 projects of BioHackathon Europe 2026 as a graph you can play. Each
project is a sticky note, and a thread joins two projects that work on the same
kind of thing. You move a star along the threads with the arrow keys and try to
visit all 31 in as few hops as possible. Reaching a project pins up its poster;
reading it is optional.

Controls: arrow keys, or swipe, or the on-screen arrow pad. Enter opens the
poster of the project you are on. "Whole graph" pulls the camera back.

Before the first tour a player picks a name. The server starts the clock,
stores every hop, and scores the tour when the last project is reached. The
leaderboard ranks by fewest hops; equal hops are decided by time. A player's
best tour counts.

Built with three.js through react-three-fiber and Motion on the client, and a
small Express server with SQLite behind it. A device without WebGL 2, or one
that fails to download the 3D part, gets the projects as a plain list instead.

## Run

Needs Node 22.18 or newer, which runs the server's TypeScript as is.

```sh
npm install
npm run api        # game server on http://localhost:8787, database in ./hops.db
npm run dev        # client on http://localhost:5173, proxies /api
npm test           # server tests
```

## What the server trusts

Nothing the client says about its score. A tour is saved as the list of
projects walked, and the server checks that every step follows a link in the
same `graph.json` the client plays on, that the saved part of a tour is never
rewritten, and that it ends the moment all 31 have been seen. Hops are counted
from that list and time is measured on the server's clock from start to the
final save. A tour finished faster than 100 ms per hop is refused.

What it cannot stop is someone planning the best route on paper and then
playing it quickly, which is fair play, or a script that plays at human speed.

There are no accounts. A name belongs to the device that claimed it, through a
token kept in that browser; clearing the browser's storage loses the name. To
remove a player and their scores:

```sh
curl -X POST https://<host>/api/admin/remove-player \
  -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"name":"the name"}'
```

## Deploy to NREC (Oslo)

One `m1.small` instance runs two containers: Caddy, which serves the client
and gets the certificate, and the game server with its SQLite file on a Docker
volume.

1. Get the OpenStack CLI and your credentials in place.

   ```sh
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r deploy/requirements.txt
   cp deploy/keystone_rc.example.sh ~/keystone_rc.sh   # fill in, chmod 0600
   source ~/keystone_rc.sh
   ```

2. Create the instance; the script prints its addresses. It makes a keypair
   from `~/.ssh/id_ed25519.pub`, a security group (80 and 443 from anywhere
   over IPv4, 22 from `SSH_CIDR`, which defaults to anywhere because the image
   only accepts keys) and the server on the `dualStack` network. Rerunning it
   is harmless and finishes an interrupted run.

   ```sh
   deploy/provision.sh
   ```

3. Point an A record for the hostname at the IPv4 address. No AAAA record: the
   web ports are published on IPv4 only.

4. Copy `.env.example` to `.env`, set `SITE` and `ADMIN_TOKEN`, then build and
   start the stack on the server. The same command redeploys; the database
   volume is kept.

   ```sh
   deploy/ship.sh <ipv4 address>
   ```

Caddy asks for the certificate once the name resolves and keeps retrying until
it does. A demo project on NREC fits exactly one `m1.small`, has no backups,
and is removed after 90 days.

## Where the content comes from

| Path | What |
|---|---|
| `scripts/projects.json` | Official titles and leads from `elixir-europe/biohackathon-projects-2026` |
| `scripts/readings.json` | One reading per poster photo: transcription, summary, highlights |
| `scripts/explainers.json` | A plain-language account of each project: the problem, this week, why it matters, a small glossary |
| `scripts/themes.json` | 13 themes, each project's themes and short name, and explicit links between projects |
| `scripts/build-data.mjs` | Crops the photos to the sheets; writes `public/posters/` and `src/posters.json` |
| `scripts/build-graph.mjs` | Chooses the links, lays the graph out, assigns arrow keys, computes par; writes `src/graph.json` |

The generated files are committed, so the site builds without the photos.

The readings and themes were made by a model, then checked by a second pass:
every summary against its photo, every theme tag against the project's abstract
and poster. They can still be wrong in places, and a team that disagrees with
its tags can change them in `themes.json` and rerun `build-graph.mjs`.

How the graph is made: two projects are closer the more themes they share
(rarer themes count for more) and closest when a poster or abstract names the
other project or a tool few others use. Every project keeps at most four links,
one per arrow key, and at least two, so there are no dead ends. Par is exact:
for every starting project the builder searches for the shortest tour that
visits everything, which takes about half a minute. It comes out at 32 to 34
hops depending on the start.

To rebuild the images, convert the photos to upright JPEGs first (the originals
are HEIC, which `sharp` cannot read):

```sh
node scripts/build-data.mjs <folder of JPEGs named like the originals>
node scripts/build-graph.mjs
```
