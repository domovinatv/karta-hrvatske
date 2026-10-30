#!/usr/bin/env node
// Gradi public/data/search-index.json — jedan indeks pretrage nad svim
// slojevima karte. Pokreće se nakon sync-data.mjs (treba geojsone u
// public/data/). Arhitektura i dijagrami: docs/2026-10-30-trazilica.md.
//
// Što skripta radi:
//  1. Za svaki sloj iz SOURCES izvuče dokument: ime, alternativna imena,
//     kategoriju, dugi tekst (opis), kontekst za prikaz, točku ili bbox.
//  2. Svakoj točki point-in-polygonom pridruži JLS, naselje i županiju.
//     Slojevi to polje imaju u pet različitih oblika (municipality, jls,
//     mjesto, city, ništa), a filtar „u Sesvetama" mora raditi jednako za sve.
//  3. Ništa ne indeksira: MiniSearch indeks gradi Web Worker u pregledniku
//     (serijalizirani indeks bio bi 3–4× veći od samih dokumenata).
//
// Novi sloj = jedan unos u SOURCES. `layer` MORA biti LayerId iz
// src/lib/layers.ts — klijent preko njega pali sloj i nalazi ikonu.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../public/data");

const load = (f) => {
  const p = join(DATA, f);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8"));
};

const jlsFc = load("jls.geojson");
const zupFc = load("zupanije.geojson");
const nasFc = load("naselja.geojson");
if (!jlsFc || !zupFc || !nasFc) {
  console.error("Nedostaju jls/zupanije/naselja.geojson — prvo sync-data.mjs.");
  process.exit(1);
}

// ── Geometrija ─────────────────────────────────────────────────────────────
const r5 = (x) => Math.round(x * 1e5) / 1e5;

function bboxOf(g) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const walk = (x) => {
    if (typeof x[0] === "number") {
      if (x[0] < a) a = x[0];
      if (x[1] < b) b = x[1];
      if (x[0] > c) c = x[0];
      if (x[1] > d) d = x[1];
    } else x.forEach(walk);
  };
  walk(g.coordinates);
  return [r5(a), r5(b), r5(c), r5(d)];
}

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyContains(g, x, y) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const rings of polys) {
    if (!ringContains(rings[0], x, y)) continue;
    let hole = false;
    for (let k = 1; k < rings.length; k++) if (ringContains(rings[k], x, y)) hole = true;
    if (!hole) return true;
  }
  return false;
}

/** Prostorni indeks poligona: mreža 0,1° → popis kandidata, pa PIP. */
function polyIndex(fc) {
  const items = fc.features
    .filter((f) => f.geometry && /Polygon/.test(f.geometry.type))
    .map((f, i) => ({ f, i, bb: bboxOf(f.geometry) }));
  const grid = new Map();
  const key = (gx, gy) => `${gx}:${gy}`;
  for (const it of items) {
    for (let gx = Math.floor(it.bb[0] * 10); gx <= Math.floor(it.bb[2] * 10); gx++)
      for (let gy = Math.floor(it.bb[1] * 10); gy <= Math.floor(it.bb[3] * 10); gy++) {
        const k = key(gx, gy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(it);
      }
  }
  return (x, y) => {
    for (const it of grid.get(key(Math.floor(x * 10), Math.floor(y * 10))) ?? []) {
      if (x < it.bb[0] || x > it.bb[2] || y < it.bb[1] || y > it.bb[3]) continue;
      if (polyContains(it.f.geometry, x, y)) return it;
    }
    return null;
  };
}

const inJls = polyIndex(jlsFc);
const inNas = polyIndex(nasFc);
const zupNames = zupFc.features.map((f) => f.properties.name);
const zupIdx = new Map(zupNames.map((n, i) => [n, i]));
const jlsByMb = new Map(jlsFc.features.map((f) => [f.properties.maticni_broj, f.id]));

// ── Pomoćne ────────────────────────────────────────────────────────────────
const str = (x) => (x == null || x === "" || x === "None" ? "" : String(x).trim());
const join2 = (...xs) => [...new Set(xs.map(str).filter(Boolean))].join(" · ");
const parseList = (x) => {
  if (Array.isArray(x)) return x;
  if (typeof x !== "string" || !x.startsWith("[")) return [];
  try {
    return JSON.parse(x);
  } catch {
    try {
      return JSON.parse(x.replace(/'/g, '"'));
    } catch {
      return [];
    }
  }
};
const domain = (u) => {
  try {
    return new URL(str(u)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const fid = (f, i) => f.id ?? f.properties?.id ?? i;

function pointOf(g) {
  if (!g) return null;
  if (g.type === "Point") return g.coordinates;
  const bb = bboxOf(g);
  return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
}

// ── Izvori ─────────────────────────────────────────────────────────────────
// doc(p, f) vraća { n, a?, k?, t?, c?, w?, d? } ili null (preskoči).
//   n  ime za prikaz (+indeks, najjači boost)
//   a  alternativna imena, kratice, puni pravni naziv, domena weba
//   k  kategorija (vrsta objekta, CroAI kategorije, skupina)
//   t  dugi tekst — samo slojevi koji ga imaju (CroAI `about`)
//   c  kontekst za drugi redak rezultata (mjesto, JLS…)
//   w  težina dokumenta (rang između slojeva)
//   d  1 = ugašen / ne posluje (rang dolje, filtar „aktivne")
// `poly: true` → dokument nosi bbox (fit na klik), inače točku.
const SOURCES = [
  {
    layer: "granice-zupanija",
    file: "zupanije.geojson",
    poly: true,
    doc: (p) => ({ n: p.name_full || p.name, a: p.name, k: "županija", c: `sjedište ${str(p.roa)}`, w: 3 }),
  },
  {
    layer: "granice-jls",
    file: "jls.geojson",
    poly: true,
    doc: (p) => ({
      n: p.name,
      a: p.name_full,
      k: p.type === "Grad" ? "grad" : "općina",
      c: join2(p.type, p.zupanija),
      w: p.type === "Grad" ? 2.6 : 2.2,
    }),
  },
  {
    layer: "naselja",
    file: "naselja.geojson",
    poly: true,
    doc: (p) => {
      const pop = Number(p.stanovnistvo) || 0;
      return {
        n: p.name,
        a: p.name_full !== p.name ? p.name_full : "",
        k: "naselje",
        c: join2(`${str(p.jls_type)} ${str(p.jls_name)}`, pop ? `${pop.toLocaleString("hr")} st.` : ""),
        w: 0.9 + Math.min(1, Math.log10(pop + 1) / 6),
      };
    },
  },
  {
    layer: "kvartovi",
    file: "kvartovi-kolokvijalni.geojson",
    poly: true,
    doc: (p) => ({ n: p.name, k: "kvart", c: p.jls_name, w: 1.4 }),
  },
  {
    layer: "cetvrti",
    file: "kvartovi.geojson",
    poly: true,
    doc: (p) => ({
      n: p.name,
      k: p.razina === "cetvrt" ? "gradska četvrt" : "mjesni odbor",
      c: p.jls_name,
      w: p.razina === "cetvrt" ? 1.3 : 1.0,
    }),
  },
  {
    layer: "biskupije",
    file: "biskupije.geojson",
    poly: true,
    doc: (p) => ({ n: p.name, k: "biskupija", c: `sjedište ${str(p.seat)}`, w: 1.6 }),
  },
  {
    layer: "croai",
    file: "croai.geojson",
    doc: (p) => ({
      n: p.name,
      a: join2(p.naziv, domain(p.website), p.oib),
      k: join2(p.grupa_naziv, p.kategorije, p.fina_velicina),
      t: p.about,
      c: join2(p.mjesto, p.kategorije || p.grupa_naziv),
      // Veće firme prve kad je upit samo filtar („ai firme"); FINA broj
      // zaposlenih je jedina mjera veličine koju imamo za sve.
      w: (p.grupa === "tvrtke" ? 1.5 : 1.35) + Math.min(0.5, Math.log10((Number(p.fina_zaposleni) || 0) + 1) / 6),
      d: p.fina_aktivan === false ? 1 : 0,
    }),
  },
  {
    layer: "ekosustav",
    file: "ekosustav.geojson",
    doc: (p) => ({
      n: p.brand || p.naziv,
      a: join2(p.naziv, domain(p.website), p.oib),
      k: p.kategorija_naziv,
      t: p.napomena,
      c: join2(p.mjesto, p.kategorija_naziv),
      w: 1.5,
      d: p.fina_aktivan === false ? 1 : 0,
    }),
  },
  {
    layer: "inkubatori",
    file: "inkubatori.geojson",
    doc: (p) => ({
      n: p.brand || p.naziv,
      a: join2(p.naziv, p.osnivac, domain(p.website), p.oib),
      k: join2(p.vrsta_primarna_naziv, ...parseList(p.vrste).map((v) => v.naziv)),
      c: join2(p.mjesto, p.vrsta_primarna_naziv),
      w: 1.3,
      d: p.fina_aktivan === false ? 1 : 0,
    }),
  },
  {
    layer: "klubovi",
    file: "clubs.geojson",
    doc: (p) => {
      const tier = Number(p.top_tier) || 9;
      return {
        n: p.canonical_name,
        a: join2(
          p.short_name,
          p.registry_naziv,
          p.stadium_name,
          ...parseList(p.aliases).map((x) => x.alias),
        ),
        k: "nogometni klub",
        c: join2(p.city, p.top_league_name),
        w: 1.0 + Math.max(0, 9 - tier) / 10,
      };
    },
  },
  {
    layer: "crkve",
    file: "crkve.geojson",
    doc: (p) => ({
      n: p.name,
      k: p.kind,
      c: join2(p.settlement, p.municipality !== p.settlement ? p.municipality : ""),
      w: 0.7,
    }),
  },
  {
    layer: "zupe",
    file: "zupe.geojson",
    doc: (p) => ({
      n: p.short_name || p.name,
      a: join2(p.name, p.oib),
      k: p.kind,
      c: join2(p.city, p.diocese),
      w: p.kind === "biskupija" ? 1.4 : 0.9,
      d: p.registry_status && p.registry_status !== "AKTIVAN" ? 1 : 0,
    }),
  },
  {
    layer: "udruge",
    file: "udruge.geojson",
    doc: (p) => ({
      n: p.short_name || p.display_name || p.name,
      a: join2(p.name, p.oib),
      k: p.category_label,
      c: join2(p.city, p.category_label),
      w: 0.8,
      d: String(p.active) === "0" ? 1 : 0,
    }),
  },
  {
    layer: "skole",
    file: "skole.geojson",
    doc: (p) => ({
      n: p.name,
      a: p.ustanova,
      k: join2(p.kind?.replace(/-/g, " "), p.program, p.facility_kind === "podrucna" ? "područna škola" : ""),
      c: join2(p.settlement, p.municipality !== p.settlement ? p.municipality : ""),
      w: 0.95,
    }),
  },
  {
    layer: "vrtici",
    file: "vrtici.geojson",
    doc: (p) => ({
      n: p.name,
      k: "vrtić jaslice",
      c: join2(p.settlement, p.municipality !== p.settlement ? p.municipality : ""),
      w: 0.7,
    }),
  },
  {
    layer: "ustanove",
    file: "ustanove.geojson",
    doc: (p) => ({
      n: p.name,
      a: join2(p.short_name, p.mzo_code),
      k: join2(p.kind?.replace(/-/g, " "), "ustanova"),
      c: join2(p.settlement, p.founder),
      w: 1.0,
    }),
  },
  {
    layer: "stadioni",
    file: "stadiums.geojson",
    doc: (p) => (str(p.name) ? { n: p.name, k: "stadion", w: 0.8 } : null),
  },
  {
    layer: "zracne-luke",
    file: "airports.geojson",
    doc: (p) =>
      str(p.name)
        ? { n: p.name, a: join2(p.iata, p.icao), k: "zračna luka aerodrom", w: p.iata ? 1.6 : 0.8 }
        : null,
  },
  {
    // Šest prekidača nad jednom datotekom: sloj = „zg-" + skupina.
    layer: (p) => `zg-${p.skupina}`,
    file: "zagreb-sadrzaji.geojson",
    doc: (p) => {
      const stajaliste = /stajalište|bicikl|spremnik|WiFi|zdenac/i.test(p.label ?? "");
      return {
        n: str(p.naziv) || p.label,
        k: p.label,
        c: join2(p.label, p.adresa, p.gradska_cetvrt),
        w: stajaliste ? 0.35 : 0.75,
      };
    },
  },
];

// ── Izgradnja ──────────────────────────────────────────────────────────────
// Kompaktni oblik: sloj je indeks u `layers`, a kategorija i težina koje su
// iste za većinu dokumenata sloja žive u zaglavlju (`lk`, `lw`) i u dokumentu
// se pišu samo kad odstupaju. Klijent ih vraća natrag u loadIndex().
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const raw = [];

for (const src of SOURCES) {
  const fc = src.file === "jls.geojson" ? jlsFc : src.file === "naselja.geojson" ? nasFc : src.file === "zupanije.geojson" ? zupFc : load(src.file);
  if (!fc) {
    console.warn(`  preskačem ${src.file} (nema datoteke)`);
    continue;
  }
  fc.features.forEach((f, i) => {
    const p = f.properties ?? {};
    const d = src.doc(p, f);
    if (!d || !str(d.n) || !f.geometry) return;
    const layer = typeof src.layer === "function" ? src.layer(p) : src.layer;
    const out = { l: layer, f: src.file === "zupanije.geojson" ? i : fid(f, i), n: str(d.n) };
    for (const k of ["a", "k", "t", "c"]) if (str(d[k])) out[k] = str(d[k]);
    out.w = Math.round((d.w ?? 1) * 100) / 100;
    if (d.d) out.d = 1;

    const pt = pointOf(f.geometry);
    if (src.poly) out.b = bboxOf(f.geometry).map(r4);
    else out.p = [r4(pt[0]), r4(pt[1])];

    // Lokacija za filtre „u <mjestu>". Županija i JLS imaju svoju, naselje
    // svoj JLS iz atributa — PIP po bbox središtu bi za razvedene JLS-ove
    // (otoci) promašio.
    if (layer === "granice-zupanija") out.z = i;
    else if (layer === "granice-jls") {
      out.j = f.id;
      out.z = zupIdx.get(p.zupanija);
    } else if (layer === "naselja") {
      out.s = f.id;
      out.j = jlsByMb.get(p.jls_maticni_broj);
      out.z = zupIdx.get(p.zupanija);
    } else {
      const j = inJls(pt[0], pt[1]);
      if (j) {
        out.j = j.f.id;
        out.z = zupIdx.get(j.f.properties.zupanija);
      }
      const s = inNas(pt[0], pt[1]);
      if (s) out.s = s.f.id;
    }
    raw.push(out);
  });
}

const mode = (xs) => {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const layers = [...new Set(raw.map((d) => d.l))];
const lk = layers.map((l) => mode(raw.filter((d) => d.l === l).map((d) => d.k ?? "")) ?? "");
const lw = layers.map((l) => mode(raw.filter((d) => d.l === l).map((d) => d.w)) ?? 1);
const counts = Object.fromEntries(layers.map((l) => [l, raw.filter((d) => d.l === l).length]));

const docs = raw.map((d) => {
  const li = layers.indexOf(d.l);
  const o = { ...d, l: li };
  if ((o.k ?? "") === lk[li]) delete o.k;
  if (o.w === lw[li]) delete o.w;
  return o;
});

const index = { v: 1, built: new Date().toISOString(), zup: zupNames, layers, lk, lw, counts, docs };
const json = JSON.stringify(index);
writeFileSync(join(DATA, "search-index.json"), json);
const noLoc = raw.filter((d) => d.j == null).length;
console.log(
  `  search-index.json (${docs.length} dok., ${(json.length / 1024).toFixed(0)} KB, ` +
    `${layers.length} slojeva, ${noLoc} bez JLS-a)`,
);
