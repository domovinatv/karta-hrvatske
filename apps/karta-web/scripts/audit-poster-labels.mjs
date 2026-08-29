/**
 * Prolazak kroz SVE plakate i SVA naselja — provjera da svaki natpis stane u
 * svoj poligon.
 *
 * Vrti isti engine kao preglednik (src/lib/label-fit.ts + poster-geom.ts, oba
 * bez runtime importa pa ih `node` učitava izravno), naselje po naselje, i
 * ispisuje kut, broj redaka i dobivenu veličinu fonta. Deterministički je:
 * ista geometrija → isti brojevi, pa se regresija vidi u diffu.
 *
 *   node scripts/audit-poster-labels.mjs            # sažetak po plakatu
 *   node scripts/audit-poster-labels.mjs --all      # svako naselje
 *   node scripts/audit-poster-labels.mjs turopolje  # samo taj plakat
 *
 * Širina teksta je ovdje PROCIJENJENA iz tablice (node nema canvas), dok
 * preglednik mjeri stvarnim fontom. Za mjerenje geometrije — koje naselje je
 * tijesno — to je dovoljno; mjerodavan render je preglednik.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fitLabel } from "../src/lib/label-fit.ts";
import {
  LINE_H,
  labelCap,
  posterFrame,
  projectSubject,
} from "../src/lib/poster-geom.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const subjects = JSON.parse(readFileSync(join(root, "src/lib/poster-subjects.json"), "utf8"));
const FORMATS = [
  { key: "kvadrat", wCm: 70, hCm: 70 },
  { key: "portret", wCm: 50, hCm: 70 },
  { key: "pejzaz", wCm: 70, hCm: 50 },
];
const SOURCES = {
  kvartovi: "public/data/kvartovi-kolokvijalni.geojson",
  turopolje: "public/data/turopolje-naselja.geojson",
  sisak: "public/data/sisak-naselja.geojson",
};

// Približne mjere za serif 600 (Fraunces) — node nema canvas. Gruba, ali
// dosljedna: audit uspoređuje naselja međusobno, ne mjeri tipografiju.
const NARROW = new Set([..."ijltfrI1.,;:'!|()[]"]);
const WIDE = new Set([..."mwMW"]);
const DESCENDER = /[gjpqy]/;
const ACCENT = /[ćčšžđĆČŠŽĐ]/;
function measure(line) {
  let w = 0;
  for (const ch of line) {
    if (ch === " ") w += 0.26;
    else if (NARROW.has(ch)) w += 0.32;
    else if (WIDE.has(ch)) w += 0.86;
    else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) w += 0.66;
    else w += 0.55;
  }
  // Mjereno od pismovne linije: verzal ≈ 0.7 em, s kvačicom nešto više, rep
  // (g, j, p, q, y) ≈ 0.2 em ispod.
  return {
    w,
    asc: ACCENT.test(line) ? 0.75 : 0.7,
    desc: DESCENDER.test(line) ? 0.2 : 0.02,
  };
}

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const only = args.filter((a) => !a.startsWith("--"));

const cache = new Map();
function load(key) {
  if (!cache.has(key)) {
    cache.set(key, JSON.parse(readFileSync(join(root, SOURCES[key]), "utf8")));
  }
  return cache.get(key);
}

let worst = [];
let failures = 0;
const t0 = Date.now();

for (const subject of subjects) {
  if (only.length && !only.includes(subject.slug)) continue;
  const fc = load(subject.source);
  for (const format of FORMATS) {
    const { mapW, mapH } = posterFrame(format, true);
    const projected = projectSubject(fc, subject, mapW, mapH);
    const rows = [];
    for (const unit of projected.units) {
      const fit = fitLabel(unit.rings, unit.name, {
        measure,
        lineHeight: LINE_H,
        maxSize: labelCap(unit.areaPx),
      });
      const size = fit ? fit.size : 0;
      rows.push({ name: unit.name, fit, size });
      if (!fit) failures++;
      worst.push({ slug: subject.slug, format: format.key, name: unit.name, size, fit });
    }
    rows.sort((a, b) => a.size - b.size);
    const tight = rows.filter((r) => r.size < 3).length;
    console.log(
      `\n${subject.slug} · ${format.key}  —  ${rows.length} jedinica, ` +
        `najmanji font ${rows[0]?.size.toFixed(2)} mm, tijesnih (<3 mm): ${tight}`,
    );
    const show = showAll ? rows : rows.slice(0, 5);
    for (const r of show) {
      if (!r.fit) {
        console.log(`   ✗ ${r.name.padEnd(26)} NE STANE`);
        continue;
      }
      console.log(
        `   ${r.size.toFixed(2).padStart(6)} mm  ${String(r.fit.angle).padStart(4)}°  ` +
          `${r.fit.lines.length} r.  ${r.name.padEnd(26)} ${r.fit.lines.join(" / ")}`,
      );
    }
  }
}

worst.sort((a, b) => a.size - b.size);
console.log(`\n────────────────────────────────────────────`);
console.log(`Ukupno ${worst.length} natpisa u ${Date.now() - t0} ms, bez smještaja: ${failures}`);
console.log(`Najtjesnijih 10 preko svih plakata:`);
for (const w of worst.slice(0, 10)) {
  console.log(
    `   ${w.size.toFixed(2).padStart(6)} mm  ${w.slug}/${w.format}  ${w.name}` +
      (w.fit ? ` (${w.fit.angle}°, ${w.fit.lines.length} r.)` : " — NE STANE"),
  );
}
process.exit(failures > 0 ? 1 : 0);
