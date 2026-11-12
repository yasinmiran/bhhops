# Poster Hunt

All 31 project posters of BioHackathon Europe 2026, as a game. Every poster
hangs behind frosted glass until you answer a question that only the poster can
tell you. A right answer clears the window, a first-try answer earns a gold
star, and a cleared poster shows a short summary of what the team did.

The posters hang in a round glass pavilion you turn by dragging (three.js via
react-three-fiber, with Motion for the interface). "Show as a list" gives the
same game as a flat page, which is also what loads when WebGL is missing or the
device asks for reduced motion. Progress is kept in the browser; there is no
server.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/, works from any path
```

## Where the content comes from

| Path | What |
|---|---|
| `scripts/readings.json` | One reading per poster photo: transcription, summary, three questions, and a second reader's answers |
| `scripts/projects.json` | Official titles and leads from `elixir-europe/biohackathon-projects-2026` |
| `scripts/build-data.mjs` | Crops the photos to the sheets and writes `public/posters/` and `src/posters.json` |
| `src/posters.json`, `public/posters/` | Generated; committed so the site builds without the photos |

The readings were made by a model looking at each photo. A question is only
used if a second reader, shown the photo and the options but not the answer,
picked the same option. One question that passed but was still arguable is
withdrawn by hand in `build-data.mjs`. Summaries were not checked the same way
and may contain misreadings of the handwriting.

To rebuild after changing the readings, convert the photos to upright JPEGs
(the originals are HEIC, which `sharp` cannot read) and run:

```sh
node scripts/build-data.mjs <folder of JPEGs named like the originals>
```
