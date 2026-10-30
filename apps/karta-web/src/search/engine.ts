import MiniSearch, { type SearchResult } from "minisearch";
import { fold, processTerm, tokenize } from "./normalize";
import { parseIntent, type Intent } from "./intent";

// Čisti pretraživač — bez DOM-a i Reacta, pa radi i u Web Workeru i u Nodeu
// (scripts/search-smoke.mjs ga vrti nad pravim indeksom). Tok upita:
//
//   upit → tokeni → mjesto („u Splitu") → rječnik (intent.ts) → ostatak u full-text
//        → A: običan full-text nad svim dokumentima
//        → B: full-text (ili sve) unutar filtra mjesto ∩ slojevi ∩ kategorija ∩ status
//        → spoj: imena koja pokrivaju cijeli upit, pa B, pa ostatak A
//
// Format indeksa i kako nastaje: scripts/build-search-index.mjs.

export interface RawDoc {
  l: number;
  f: number | string;
  n: string;
  a?: string;
  k?: string;
  t?: string;
  c?: string;
  w?: number;
  d?: 1;
  p?: [number, number];
  b?: [number, number, number, number];
  j?: number;
  s?: number;
  z?: number;
}

export interface RawIndex {
  v: number;
  built: string;
  zup: string[];
  layers: string[];
  lk: string[];
  lw: number[];
  counts: Record<string, number>;
  docs: RawDoc[];
}

export interface Doc {
  i: number;
  layer: string;
  fid: number | string;
  name: string;
  alt: string;
  kat: string;
  text: string;
  ctx: string;
  w: number;
  dead: boolean;
  p?: [number, number];
  b?: [number, number, number, number];
  j?: number;
  s?: number;
  z?: number;
  /** Foldani `kat` — za filtre iz rječnika. */
  katF: string;
}

export type PlaceKind = "zupanija" | "jls" | "naselje" | "kvart";

export interface Place {
  kind: PlaceKind;
  name: string;
  /** Feature id (jls, naselje) ili indeks županije. */
  id: number;
  bbox?: [number, number, number, number];
  /** Težina dokumenta; za naselje raste s brojem stanovnika. */
  w: number;
}

/** Ono što ide u UI — bez dugog teksta. */
export interface Hit {
  i: number;
  layer: string;
  fid: number | string;
  name: string;
  ctx: string;
  dead: boolean;
  p?: [number, number];
  b?: [number, number, number, number];
  j?: number;
}

export interface Interpretation {
  labels: string[];
  place: { kind: PlaceKind; name: string } | null;
  /** Upit je samo filtar (npr. „AI firme u Splitu") — nema full-texta. */
  filterOnly: boolean;
}

export interface SearchResponse {
  hits: Hit[];
  total: number;
  interp: Interpretation | null;
  /** Obuhvat svih pogodaka — za „Prikaži sve na karti". */
  bounds: [number, number, number, number] | null;
  /** Slojevi među pogocima, s brojem. */
  layers: Record<string, number>;
  /** Točke svih pogodaka (do 3000) za sloj isticanja. */
  points: { p: [number, number]; layer: string; fid: number | string }[];
  ms: number;
}

export interface QueryOpts {
  limit?: number;
  /** Središte karte; blizina diže rang kad je zoom ≥ 8. */
  center?: [number, number];
  zoom?: number;
}

export class SearchEngine {
  docs: Doc[];
  mini: MiniSearch<Doc>;
  places = new Map<string, Place[]>();
  zup: string[];

  constructor(raw: RawIndex) {
    this.zup = raw.zup;
    this.docs = raw.docs.map((d, i) => {
      const kat = d.k ?? raw.lk[d.l] ?? "";
      return {
        i,
        layer: raw.layers[d.l],
        fid: d.f,
        name: d.n,
        alt: d.a ?? "",
        kat,
        text: d.t ?? "",
        ctx: d.c ?? "",
        w: d.w ?? raw.lw[d.l] ?? 1,
        dead: d.d === 1,
        p: d.p,
        b: d.b,
        j: d.j,
        s: d.s,
        z: d.z,
        katF: fold(kat),
      };
    });

    this.mini = new MiniSearch<Doc>({
      idField: "i",
      fields: ["name", "alt", "kat", "ctx", "text"],
      tokenize,
      processTerm: (t) => processTerm(t) ?? null,
      searchOptions: {
        boost: { name: 5, alt: 2, kat: 1.5, ctx: 1, text: 0.4 },
        prefix: (term, i, terms) => i === terms.length - 1 || term.length >= 4,
        fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
        combineWith: "AND",
      },
    });
    this.mini.addAll(this.docs);
    this.buildPlaces();
  }

  // ── Mjesta ────────────────────────────────────────────────────────────────
  // Ključ = processTerm tokeni imena spojeni razmakom („grad zagreb",
  // „zagreb", „slavonsk brod"). Isti ključ može imati više mjesta (Novo Selo).
  private buildPlaces() {
    const add = (name: string, pl: Place) => {
      const key = keyOf(name);
      if (!key) return;
      const arr = this.places.get(key) ?? [];
      arr.push(pl);
      this.places.set(key, arr);
    };
    for (const d of this.docs) {
      if (d.layer === "granice-zupanija") {
        const pl: Place = { kind: "zupanija", name: d.name, id: d.z!, bbox: d.b, w: d.w };
        add(d.name, pl);
        add(d.alt, pl);
        add(`${d.alt} županija`, pl);
      } else if (d.layer === "granice-jls") {
        const pl: Place = { kind: "jls", name: d.name, id: d.j!, bbox: d.b, w: d.w };
        add(d.name, pl);
        add(d.name.replace(/^Grad /, ""), pl);
      } else if (d.layer === "naselja") {
        // Pragom se izbjegava da „Luka", „Draga" ili „Most" postanu filtar;
        // s prijedlogom („u Lugu") vrijede sva naselja (vidi resolvePlace).
        add(d.name, { kind: "naselje", name: d.name, id: d.s!, bbox: d.b, w: d.w });
      } else if (d.layer === "kvartovi" || d.layer === "cetvrti") {
        add(d.name, { kind: "kvart", name: d.name, id: d.i, bbox: d.b, w: d.w });
      }
    }
    // Kvart je zadnji: filtar po bboxu kvarta je grub (Sesvete bi pokupile
    // Dugo Selo), a isto ime gotovo uvijek postoji i kao naselje.
    const rank: Record<PlaceKind, number> = { jls: 0, zupanija: 1, naselje: 2, kvart: 3 };
    for (const arr of this.places.values())
      arr.sort((a, b) => rank[a.kind] - rank[b.kind] || b.w - a.w);
  }

  /**
   * Traži najdulji n-gram (do 3 tokena) koji je ime mjesta. Bez prijedloga
   * pred njim naselje vrijedi samo ako je veće (težina ≥ 1.4 ≈ 1000+ st.).
   */
  private resolvePlace(tokens: (string | null)[], raw: string[]): { place: Place; used: number[] } | null {
    for (let n = 3; n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const slice = tokens.slice(i, i + n);
        if (slice.some((t) => !t)) continue;
        const cands = this.places.get(slice.join(" "));
        if (!cands) continue;
        const prep = i > 0 && ["u", "na", "kod", "blizu", "iz", "pokraj", "oko"].includes(fold(raw[i - 1]));
        const best = cands.find((c) => c.kind !== "naselje" || prep || c.w >= 1.4);
        if (best) return { place: best, used: Array.from({ length: n }, (_, k) => i + k) };
      }
    }
    return null;
  }

  // ── Upit ──────────────────────────────────────────────────────────────────
  search(q: string, opts: QueryOpts = {}): SearchResponse {
    const t0 = performance.now();
    const limit = opts.limit ?? 40;
    const raw = tokenize(q.trim());
    const tokens = raw.map((t) => processTerm(t));
    const content = tokens.filter(Boolean) as string[];
    if (!content.length || q.trim().length < 2) return empty(t0);

    // Mjesto i rječnik vrijede tek kad u upitu ima još nešto: „Split" sam je
    // običan upit (JLS Split na vrhu), „škole Split" je filtar.
    let place: Place | null = null;
    let intent: Intent | null = null;
    let rest = content;
    if (content.length >= 2) {
      const pr = this.resolvePlace(tokens, raw);
      const remaining = tokens.map((t, i) => (pr?.used.includes(i) ? null : t));
      const it = parseIntent(remaining);
      const leftover = remaining.filter((t, i) => t && !it.used.has(i)) as string[];
      if (pr && (it.rules.length || leftover.length)) place = pr.place;
      if (it.rules.length) intent = it;
      if (place || intent) rest = leftover;
    } else {
      const it = parseIntent(tokens);
      // Jedna riječ iz rječnika („škole", „ai") je popis, ne full-text.
      if (it.rules.length) {
        intent = it;
        rest = [];
      }
    }

    const boostDoc = this.booster(opts);
    const plain = this.mini.search(content.join(" "), { boostDocument: boostDoc });
    const plainHits = plain.length
      ? plain
      : this.mini.search(content.join(" "), { boostDocument: boostDoc, combineWith: "OR" });

    let ordered: number[];
    let filteredTotal: number[] | null = null;

    if (place || intent) {
      const ok = (d: Doc) => this.passes(d, place, intent);
      let filtered: number[];
      if (rest.length) {
        let r = this.mini.search(rest.join(" "), {
          boostDocument: boostDoc,
          filter: (res) => ok(this.docs[res.id as number]),
        });
        if (!r.length)
          r = this.mini.search(rest.join(" "), {
            boostDocument: boostDoc,
            combineWith: "OR",
            filter: (res) => ok(this.docs[res.id as number]),
          });
        filtered = r.map((x) => x.id as number);
      } else {
        filtered = this.docs
          .filter(ok)
          .sort((a, b) => boostDoc(b.i) - boostDoc(a.i) || a.name.localeCompare(b.name, "hr"))
          .map((d) => d.i);
      }
      filteredTotal = filtered;
      // Ime koje pokriva cijeli upit („NK Zagreb" za „nk zagreb") ide ispred
      // filtra. Samo ime, ne pravni naziv: „… d.o.o. za turizam" nije pogodak
      // za „turizam ai".
      const strong = this.rankPlain(
        plainHits.filter((h) => this.nameCoversAll(this.docs[h.id as number], content, false)),
        content,
      );
      ordered = dedupe([...strong.slice(0, 5), ...filtered, ...plainHits.map((h) => h.id as number)]);
    } else {
      ordered = this.rankPlain(plainHits, content);
    }

    const pool = filteredTotal ?? ordered;
    const hits = ordered.slice(0, limit).map((i) => this.hit(this.docs[i]));
    return {
      hits,
      total: pool.length,
      interp:
        place || intent
          ? {
              labels: intent?.rules.map((r) => r.label) ?? [],
              place: place ? { kind: place.kind, name: place.name } : null,
              filterOnly: rest.length === 0,
            }
          : null,
      ...this.summary(pool),
      ms: Math.round(performance.now() - t0),
    };
  }

  private booster(opts: QueryOpts) {
    const c = opts.center && (opts.zoom ?? 0) >= 8 ? opts.center : null;
    return (id: unknown) => {
      const d = this.docs[id as number];
      let b = d.w * (d.dead ? 0.5 : 1);
      if (c && d.p) {
        const km = Math.hypot((d.p[0] - c[0]) * 78, (d.p[1] - c[1]) * 111);
        b *= 1 + 0.5 * Math.exp(-km / 30);
      }
      return b;
    };
  }

  private passes(d: Doc, place: Place | null, intent: Intent | null): boolean {
    if (intent) {
      if (intent.layers && !intent.layers.has(d.layer)) return false;
      for (const group of intent.kat) if (!group.some((re) => re.test(d.katF))) return false;
      if (intent.status === "aktivan" && d.dead) return false;
      if (intent.status === "ugasen" && !d.dead) return false;
    }
    if (place) {
      if (place.kind === "zupanija" && d.z !== place.id) return false;
      if (place.kind === "jls" && d.j !== place.id) return false;
      if (place.kind === "naselje" && d.s !== place.id) return false;
      if (place.kind === "kvart") {
        const pt = d.p ?? (d.b ? [(d.b[0] + d.b[2]) / 2, (d.b[1] + d.b[3]) / 2] : null);
        const bb = place.bbox!;
        if (!pt || pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) return false;
      }
    }
    return true;
  }

  /** Ime (ili alternativno ime) sadrži sve tokene upita — zadnji kao prefiks. */
  private nameCoversAll(d: Doc, q: string[], withAlt = true): boolean {
    const own = new Set(
      [...tokenize(d.name), ...(withAlt ? tokenize(d.alt) : [])]
        .map((t) => processTerm(t))
        .filter(Boolean) as string[],
    );
    return q.every((t, i) =>
      own.has(t) || (i === q.length - 1 && [...own].some((o) => o.startsWith(t))),
    );
  }

  /** Bez filtara: točno ime > ime pokriva upit > ostalo, unutar razreda MiniSearch rang. */
  private rankPlain(res: SearchResult[], q: string[]): number[] {
    const key = q.join(" ");
    // Dvojezična imena („Poreč - Parenzo") i „Grad Zagreb" imaju više
    // točnih oblika; bez toga selo Poreč (72 st.) pobijedi grad.
    const exact = (name: string) =>
      [name, name.replace(/^Grad /, ""), ...name.split(" - ")].some((v) => keyOf(v) === key);
    const cls = (d: Doc) => {
      if (exact(d.name)) return 0;
      if (this.nameCoversAll(d, q)) return 1;
      return 2;
    };
    return res
      .map((r) => ({ id: r.id as number, s: r.score, c: cls(this.docs[r.id as number]) }))
      .sort((a, b) => a.c - b.c || b.s - a.s)
      .map((x) => x.id);
  }

  private hit(d: Doc): Hit {
    return { i: d.i, layer: d.layer, fid: d.fid, name: d.name, ctx: d.ctx, dead: d.dead, p: d.p, b: d.b, j: d.j };
  }

  private summary(ids: number[]) {
    let bb: [number, number, number, number] | null = null;
    const layers: Record<string, number> = {};
    const points: SearchResponse["points"] = [];
    for (const i of ids) {
      const d = this.docs[i];
      layers[d.layer] = (layers[d.layer] ?? 0) + 1;
      const box = d.b ?? (d.p ? [d.p[0], d.p[1], d.p[0], d.p[1]] : null);
      if (box) {
        bb = bb
          ? [Math.min(bb[0], box[0]), Math.min(bb[1], box[1]), Math.max(bb[2], box[2]), Math.max(bb[3], box[3])]
          : [box[0], box[1], box[2], box[3]];
      }
      if (d.p && points.length < 3000) points.push({ p: d.p, layer: d.layer, fid: d.fid });
    }
    return { bounds: bb, layers, points };
  }
}

export function keyOf(name: string): string {
  return tokenize(name)
    .map((t) => processTerm(t))
    .filter(Boolean)
    .join(" ");
}

function dedupe(xs: number[]): number[] {
  return [...new Set(xs)];
}

function empty(t0: number): SearchResponse {
  return { hits: [], total: 0, interp: null, bounds: null, layers: {}, points: [], ms: Math.round(performance.now() - t0) };
}
