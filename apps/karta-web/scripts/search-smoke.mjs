#!/usr/bin/env node
// Vrti src/search/engine.ts nad pravim public/data/search-index.json i ispisuje
// prvih N pogodaka za skup upita. Brza provjera rangiranja bez preglednika:
//   node scripts/search-smoke.mjs ["upit" ...]
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(mkdtempSync(resolve(tmpdir(), "search-smoke-")), "engine.mjs");
await build({ entryPoints: [resolve(root, "src/search/engine.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
const { SearchEngine } = await import(pathToFileURL(out).href);

const raw = JSON.parse(readFileSync(resolve(root, "public/data/search-index.json"), "utf-8"));
let t = performance.now();
const eng = new SearchEngine(raw);
console.log(`indeks: ${raw.docs.length} dok., izgradnja ${Math.round(performance.now() - t)} ms\n`);

const QUERIES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "zagreb", "split", "cakovec", "djakovo", "rijeci",
      "ai firme", "ai firme u zagrebu", "ai zdravstvo", "computer vision", "fintech",
      "investitori", "AI startupi Split", "robotika osijek", "aktivne ai firme varaždin",
      "fil rouge", "infobip", "nk zagreb", "hajduk", "skole u splitu", "vrtići sesvete",
      "župe sisak", "ljekarne trešnjevka", "gimnazija varaždin", "katedrala",
      "porec", "novo selo", "chatbot", "turizam ai",
    ];
for (const q of QUERIES) {
  const r = eng.search(q, { limit: 5 });
  const it = r.interp
    ? ` [${[...r.interp.labels, r.interp.place ? `u: ${r.interp.place.name} (${r.interp.place.kind})` : ""].filter(Boolean).join(", ")}]`
    : "";
  console.log(`▸ ${q} — ${r.total} (${r.ms} ms)${it}`);
  for (const h of r.hits) console.log(`    ${h.layer.padEnd(16)} ${h.name}${h.ctx ? "  · " + h.ctx : ""}${h.dead ? "  (ugašen)" : ""}`);
}
