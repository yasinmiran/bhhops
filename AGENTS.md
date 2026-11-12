# 31 Hops

A game for BioHackathon Europe 2026: the 31 projects as a 3D graph, played with
the arrow keys, with a server that scores each tour. `README.md` has the rules,
how to run it and how to deploy it. This file is for whoever changes the code
or the content next.

## Layout

- `src/`: the client. React 19, three.js through react-three-fiber, Motion.
  `game.ts` holds the game state and the graph, `Graph3D.tsx` draws it,
  `App.tsx` has the start note and the keys, `tricks.ts` and `Critters.tsx` are
  the things that make it harder.
- `server/`: Express 5 and the built-in SQLite, run as TypeScript by Node
  22.18 or newer. It validates every tour against `src/graph.json`.
- `scripts/`: the content, as JSON written by hand or by a model, and the two
  builders that turn it into what the client reads.
- `Dockerfile`, `deploy/Caddyfile`, `compose.prod.yml`: the production stack, run under podman. `compose.yaml` is the same stack for a laptop with Docker.

## Fixing a project's content

A team member says something about their project is wrong. Find what they mean
in this table, edit the source file, then run the builder. `src/posters.json`
and `src/graph.json` are generated: never edit them by hand, the next build
overwrites them.

Entries are found by project number. In `readings.json` that is
`poster.project_number`; everywhere else it is `id`.

| What is wrong | File | Field | Then run |
|---|---|---|---|
| Official title, or the "Led by" names | `scripts/projects.json` | `title`, `leads` | `npm run content` |
| The "In short" sentence | `scripts/readings.json` | `poster.one_liner` | `npm run content` |
| A bullet under "On the poster" | `scripts/readings.json` | `poster.highlights` | `npm run content` |
| The links listed on the sheet | `scripts/readings.json` | `poster.links` | `npm run content` |
| The description of the poster image (its alt text) | `scripts/readings.json` | `poster.visual_motif` | `npm run content` |
| The problem / This week / Why it matters | `scripts/explainers.json` | `problem`, `this_week`, `why_it_matters` | `npm run content` |
| Done / Still to do | `scripts/explainers.json` | `done`, `next` | `npm run content` |
| "Words you may not know" | `scripts/explainers.json` | `glossary` | `npm run content` |
| The short name on the sticky note | `scripts/themes.json` | `projects[].short_name` | `npm run graph` |
| The coloured theme chips, or the note's colour | `scripts/themes.json` | `projects[].themes`, `projects[].primary` | `npm run graph` |
| Why two projects are joined, or that they are joined at all | `scripts/themes.json` | `links[]`, and the two projects' `themes` | `npm run graph` |
| The poster photo is cropped badly | `scripts/readings.json` | `poster.poster_box` (fractions of the photo) | `node scripts/build-data.mjs <photos dir>` |

`npm run content` rebuilds the text in `src/posters.json` and does not need the
photos. `npm run graph` rebuilds `src/graph.json` and takes about half a
minute, because it searches for the exact par from every start.

After either, check the diff touches only what was meant:

```sh
git diff --stat src/posters.json src/graph.json
npm run check && npm test
```

### Changing the graph while people are playing

A new short name changes one string in `src/graph.json` and nothing else;
confirm that in the diff. A change to `themes`, `primary` or `links` can move
notes, change which projects are joined and which arrow leads where, and change
par. Tours already on the leaderboard were scored on the old graph, and a tour
in progress may stop validating. During the event, fix text freely and leave
themes and links alone unless the team insists; if they do, say so on the
leaderboard or clear it.

The hidden threads, loose ends and phantom notes in `src/tricks.ts` are
derived from the graph, so they move with it. Nothing there needs editing by
hand.

### What not to "fix"

- The readings and explainers were written from the poster photos and the
  official abstracts. If a team's correction contradicts their own poster, take
  the team's word: they know the project.
- First names appear on the poster photos because the teams wrote them there.
  If someone asks for theirs to be removed, the photo has to be re-cropped or
  replaced in `public/posters/`; the text files do not hold contributor names
  outside `projects.json` `leads`, which is the official public list.

## Conventions

- Conventional Commits. Small commits, pushed.
- No long dashes in prose, comments or commit messages.
- Comments say why, not what. Names carry the rest.
- `npm run check` (types) and `npm test` (server) pass before a push.
- Never commit `.env`, a database file or cloud credentials. `.gitignore`
  covers the usual names; keep it that way.

## Shipping a fix

Commit and push, then redeploy as the README describes. The database is on a
volume and survives a redeploy, so names and scores are kept.
