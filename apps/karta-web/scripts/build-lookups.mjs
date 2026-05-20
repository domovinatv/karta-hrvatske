#!/usr/bin/env node
// Generates compact slug→meta lookup JSON files for the CF Worker (Phase 3)
// to inject OG meta tags. Run after sync-data.mjs (needs the geojson files
// in public/data/). Keep these tiny so the worker can fetch + parse fast.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA = resolve(__dirname, "../public/data");

if (!existsSync(join(PUBLIC_DATA, "jls.geojson"))) {
  console.error("Missing public/data/jls.geojson — run sync-data.mjs first.");
  process.exit(1);
}

// Croatian slugify — mirror of src/lib/slug.ts but standalone (Node ESM,
// no TS, no shared module to keep the worker bundle tiny).
const CROATIAN_MAP = { č: "c", ć: "c", ž: "z", š: "s", đ: "d", Č: "c", Ć: "c", Ž: "z", Š: "s", Đ: "d" };
function slugify(s) {
  let out = "";
  for (const ch of s) out += CROATIAN_MAP[ch] ?? ch;
  return out
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── JLS lookup ─────────────────────────────────────────────────────────────
const jls = JSON.parse(readFileSync(join(PUBLIC_DATA, "jls.geojson"), "utf-8"));
const jlsLookup = {};
const jlsCollisions = [];
for (const f of jls.features) {
  const slug = slugify(f.properties.name);
  if (jlsLookup[slug]) {
    jlsCollisions.push({ slug, prev: jlsLookup[slug].name, curr: f.properties.name });
    // Keep the larger one (by area) — UI/crawl experience prefers the
    // canonical "Zagreb" over a same-name village somewhere else.
    if ((f.properties.area_m2 ?? 0) <= jlsLookup[slug].area) continue;
  }
  jlsLookup[slug] = {
    name: f.properties.name,
    type: f.properties.type,
    zupanija: f.properties.zupanija,
    area: f.properties.area_m2,
    title: `${f.properties.type} ${f.properties.name} — DOMOVINA GIS`,
    description: `${f.properties.zupanija} · ${(f.properties.area_km2 ?? 0).toFixed(2)} km² · DGU Registar prostornih jedinica`,
  };
}
writeFileSync(join(PUBLIC_DATA, "lookup-jls.json"), JSON.stringify(jlsLookup));
console.log(`  lookup-jls.json (${Object.keys(jlsLookup).length} entries, ${jlsCollisions.length} slug collisions resolved by area)`);

// ── Županije lookup ────────────────────────────────────────────────────────
const zupanije = JSON.parse(readFileSync(join(PUBLIC_DATA, "zupanije.geojson"), "utf-8"));
const zupLookup = {};
for (const f of zupanije.features) {
  const name =
    f.properties.zupanija ||
    f.properties.name ||
    f.properties.NAME ||
    null;
  if (!name) continue;
  const slug = slugify(name);
  zupLookup[slug] = {
    name,
    title: `${name} — DOMOVINA GIS`,
    description: `Pregled JLS-ova u ${name} županiji.`,
  };
}
writeFileSync(join(PUBLIC_DATA, "lookup-zupanije.json"), JSON.stringify(zupLookup));
console.log(`  lookup-zupanije.json (${Object.keys(zupLookup).length} entries)`);

// ── Klubovi lookup ─────────────────────────────────────────────────────────
const clubsPath = join(PUBLIC_DATA, "clubs.geojson");
if (existsSync(clubsPath)) {
  const clubs = JSON.parse(readFileSync(clubsPath, "utf-8"));
  const clubsLookup = {};
  for (const f of clubs.features) {
    const p = f.properties;
    if (!p.slug) continue;
    const descBits = [
      p.top_league_name,
      p.city,
      p.founded_year ? `osn. ${p.founded_year}` : null,
    ].filter(Boolean);
    clubsLookup[p.slug] = {
      name: p.canonical_name,
      title: `${p.canonical_name} — DOMOVINA GIS`,
      description: descBits.length
        ? descBits.join(" · ")
        : "Hrvatski nogometni klub — DOMOVINA GIS",
      image: `/logos/${p.slug}.png`,
    };
  }
  writeFileSync(join(PUBLIC_DATA, "lookup-clubs.json"), JSON.stringify(clubsLookup));
  console.log(`  lookup-clubs.json (${Object.keys(clubsLookup).length} entries)`);
}

console.log("\nLookups built.");
