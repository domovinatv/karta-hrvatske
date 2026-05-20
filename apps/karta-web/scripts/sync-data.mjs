#!/usr/bin/env node
// Phase 0 sync: copies the Python pipeline's outputs/ into public/data/ +
// public/logos/. Run after `python3 scripts/09_build_hr_full_app.py` in
// apps/web/. Run by `npm run sync-data` or directly: node scripts/sync-data.mjs
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KARTA_WEB = resolve(__dirname, "..");
const OUTPUTS = resolve(KARTA_WEB, "../web/outputs");

if (!existsSync(OUTPUTS)) {
  console.error(`Missing ${OUTPUTS}. Run apps/web pipeline first.`);
  process.exit(1);
}

const targetData = join(KARTA_WEB, "public/data");
const targetLogos = join(KARTA_WEB, "public/logos");
mkdirSync(targetData, { recursive: true });

// Rename outputs to predictable public/data filenames consumed by hooks.
const fileMap = [
  ["hr_canonical.geojson", "jls.geojson"],
  ["hr_canonical_zupanije.geojson", "zupanije.geojson"],
  ["hr_canonical_drzava.geojson", "drzava.geojson"],
  ["hrvatska_naselja.geojson", "naselja.geojson"],
  ["hr_football_clubs.geojson", "clubs.geojson"],
];

// hr_canonical.geojson lives in apps/web/data/, not outputs/. Look in both.
const apps_web_data = resolve(KARTA_WEB, "../web/data");

let copied = 0;
for (const [srcName, destName] of fileMap) {
  const candidates = [join(OUTPUTS, srcName), join(apps_web_data, srcName)];
  const src = candidates.find((p) => existsSync(p));
  if (!src) {
    console.warn(`  skip ${srcName} (not found in outputs/ or data/)`);
    continue;
  }
  copyFileSync(src, join(targetData, destName));
  copied++;
  console.log(`  ${srcName} → public/data/${destName}`);
}

// Logos: cp -r outputs/logos public/logos. Skip silently if missing.
const logosSrc = join(OUTPUTS, "logos");
if (existsSync(logosSrc)) {
  cpSync(logosSrc, targetLogos, { recursive: true });
  console.log(`  outputs/logos → public/logos (recursive)`);
}

// version.json — bumped per sync so the SW can detect data refresh.
const version = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
writeFileSync(join(targetData, "version.json"), JSON.stringify({ version }, null, 2));
console.log(`  version.json (${version})`);

console.log(`\nSynced ${copied} geojson + logos. Run \`npm run dev\`.`);
