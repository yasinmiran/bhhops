// Turns the poster readings into the site's data and images.
// Usage: node scripts/build-data.mjs <dir of upright full-size photos> [readings.json]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const [photosDir, readingsPath = new URL("./readings.json", import.meta.url).pathname] = process.argv.slice(2);
if (!photosDir) throw new Error("usage: build-data.mjs <photos dir> [readings.json]");

const projects = JSON.parse(readFileSync(new URL("./projects.json", import.meta.url), "utf8"));
const readings = JSON.parse(readFileSync(readingsPath, "utf8"));
const explainers = new Map(JSON.parse(readFileSync(new URL("./explainers.json", import.meta.url), "utf8")).map((e) => [e.id, e]));
const outDir = new URL("../public/posters/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const MARGIN = 0.015;
const clamp = (n) => Math.min(1, Math.max(0, n));

/** Converts a fractional box into a pixel region, padded and kept inside the photo. */
function region(box, width, height, margin = MARGIN) {
  const x0 = clamp(Math.min(box.x0, box.x1) - margin);
  const y0 = clamp(Math.min(box.y0, box.y1) - margin);
  const x1 = clamp(Math.max(box.x0, box.x1) + margin);
  const y1 = clamp(Math.max(box.y0, box.y1) + margin);
  const left = Math.round(x0 * width);
  const top = Math.round(y0 * height);
  return { left, top, width: Math.max(1, Math.round(x1 * width) - left), height: Math.max(1, Math.round(y1 * height) - top) };
}

/** The plain-language account of a project, or nothing if none was written for it. */
function explainerFor(id) {
  const e = explainers.get(id);
  if (!e) {
    report.push(`P${id} HAS NO EXPLAINER`);
    return undefined;
  }
  return { problem: e.problem, thisWeek: e.this_week, whyItMatters: e.why_it_matters, glossary: e.glossary, done: e.done, next: e.next };
}

const report = [];
const posters = [];

for (const { file, poster, check } of readings) {
  const project = projects.find((p) => p.id === poster.project_number);
  if (!project) throw new Error(`${file}: no project ${poster.project_number}`);
  if (posters.some((p) => p.id === project.id)) throw new Error(`${file}: project ${project.id} appears twice`);

  const id = String(project.id).padStart(2, "0");
  const photo = sharp(`${photosDir}/${file}`);
  const { width, height } = await photo.metadata();
  const sheet = region(poster.poster_box, width, height);

  await photo.clone().extract(sheet).resize({ height: 1800, withoutEnlargement: true }).webp({ quality: 76 }).toFile(`${outDir}${id}.webp`);
  await photo.clone().extract(sheet).resize({ width: 640 }).webp({ quality: 72 }).toFile(`${outDir}${id}-thumb.webp`);

  if (check.project_number !== poster.project_number) {
    report.push(`P${project.id} NUMBER MISMATCH in ${file}: reader ${poster.project_number} (${poster.number_evidence}), checker ${check.project_number}`);
  }

  posters.push({
    id: project.id,
    title: project.title,
    leads: project.leads,
    posterTitle: poster.title_on_poster,
    oneLiner: poster.one_liner,
    highlights: poster.highlights,
    motif: poster.visual_motif,
    links: poster.links,
    aspect: Number((sheet.width / sheet.height).toFixed(4)),
    explainer: explainerFor(project.id),
  });
}

posters.sort((a, b) => a.id - b.id);
const missing = projects.filter((p) => !posters.some((x) => x.id === p.id)).map((p) => p.id);
if (missing.length) report.push(`NO POSTER FOR PROJECTS: ${missing.join(", ")}`);

writeFileSync(new URL("../src/posters.json", import.meta.url), JSON.stringify(posters, null, 1) + "\n");
console.log(`${posters.length} posters`);
console.log(report.join("\n"));
