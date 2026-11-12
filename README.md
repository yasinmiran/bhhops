# 31 Hops

The 31 projects of BioHackathon Europe 2026 as a graph you can play. Each
project is a sticky note, and a thread joins two projects that work on the same
kind of thing. You move a star along the threads with the arrow keys and try to
visit all 31 in as few hops as possible. Reaching a project pins up its poster;
reading it is optional.

Controls: arrow keys, or swipe, or the on-screen arrow pad. Enter opens the
poster of the project you are on. "Whole graph" pulls the camera back.

Built with three.js through react-three-fiber, and Motion for the interface.
Progress and your best score are kept in the browser; there is no server. A
device without WebGL 2, or one that fails to download the 3D part, gets the
projects as a plain list instead.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, works from any path
```

## Where the content comes from

| Path | What |
|---|---|
| `scripts/projects.json` | Official titles and leads from `elixir-europe/biohackathon-projects-2026` |
| `scripts/readings.json` | One reading per poster photo: transcription, summary, highlights |
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
one per arrow key, and at least two, so there are no dead ends. Par is the
length of a good tour found by search, not a proven minimum.

To rebuild the images, convert the photos to upright JPEGs first (the originals
are HEIC, which `sharp` cannot read):

```sh
node scripts/build-data.mjs <folder of JPEGs named like the originals>
node scripts/build-graph.mjs
```
