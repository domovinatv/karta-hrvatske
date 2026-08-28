/**
 * Deterministički smještaj natpisa unutar poligona.
 *
 * Problem: ime naselja mora stati U SVOJ poligon, čitljivo i bez prelijevanja
 * u susjedno. Poligoni su svakojaki — Donja Lomnica je 3,8 × 10,6 km s uskim
 * strukom u sredini, Barbarići Kravarski su dijagonalna prečka. Sidrenje na
 * centroid + mjerenje širine na toj jednoj visini (prva verzija) pada na oba:
 * centroid Donje Lomnice je baš u struku pa font padne ispod praga i natpis
 * nestane, a dijagonalni oblik "prođe" po širini retka i izađe van.
 *
 * Rješenje je stari kartografski postupak, bez heuristike:
 *
 *   1. poligon se rasterizira u binarnu masku (scanline, even-odd, pa erozija
 *      za 1 ćeliju — tako maska nikad ne prelazi rub);
 *   2. u maski se nabrajaju SVI maksimalni upisani pravokutnici (klasični
 *      "largest rectangle in histogram" sa stogom, O(rows × cols));
 *   3. za svaki pravokutnik i svaki kandidat loma imena u retke izračuna se
 *      font-size koji točno stane (min od ograničenja po visini i širini);
 *   4. sve se to ponovi za nekoliko kutova rotacije — poligon se zarotira,
 *      pravokutnik je i dalje osno poravnat, natpis se na kraju vrati u
 *      izvorni okvir.
 *
 * Najveći dobiveni font pobjeđuje. Ista geometrija uvijek daje isti rezultat,
 * naselje po naselje, neovisno o susjedima.
 */

export type Pt = [number, number];
export type Ring = Pt[];

export interface LabelFit {
  /** Ime razlomljeno u retke. */
  lines: string[];
  /** font-size u SVG jedinicama. */
  size: number;
  /** Rotacija u stupnjevima (SVG smjer: pozitivno = u smjeru kazaljke). */
  angle: number;
  /** Središte upisanog pravokutnika — oko njega ide i rotacija. */
  x: number;
  y: number;
  /**
   * Pismovna linija prvog retka u odnosu na (x, y), u em-ovima — množi se s
   * font-sizeom. Sljedeći redak je za lineHeight niže.
   */
  dyEm: number;
  /** Upisani pravokutnik u koji je natpis stao — za debug/audit. */
  boxW: number;
  boxH: number;
}

/**
 * Otisak jednog retka pri font-size 1, u odnosu na PISMOVNU LINIJU: širina,
 * koliko slova sežu iznad linije i koliko ispod. Nije simetrično — "Donja" ima
 * rep od j, "Kuče" nema.
 *
 * Namjerno se ne oslanja na SVG dominant-baseline: taj pomak browser računa
 * ovisno o kontekstu iscrtavanja (CSS skaliranje plakata ga mijenja), pa je
 * natpis znao sjesti ~0.2 em previsoko. Retci se zato sidre na samu pismovnu
 * liniju, koju ovaj modul postavlja sam.
 */
export interface LineInk {
  w: number;
  asc: number;
  desc: number;
}

export interface FitParams {
  /**
   * Izmjeri redak, u em-ovima, PRI ZADANOJ veličini fonta. Veličina je bitna:
   * Fraunces je varijabilni font s optičkom osi (opsz), pa su mu glifovi na
   * 4 px osjetno širi nego na 40 px. Mjera uzeta na jednoj veličini ne vrijedi
   * za drugu, zato se fit na kraju dotjeruje mjerama na svojoj veličini.
   */
  measure: (line: string, size: number) => LineInk;
  /** Razmak redaka u jedinicama font-sizea. */
  lineHeight?: number;
  /** Gornja granica — bez nje bi ogromna naselja dobila ogroman natpis. */
  maxSize: number;
  /** Kandidati rotacije u stupnjevima. Kartografski: nikad naopako. */
  angles?: number[];
  /** Najviše redaka (lom po riječima). */
  maxLines?: number;
  /** Rezolucija maske — ćelija ≈ dulja stranica bboxa / grid. */
  grid?: number;
  /** Zračnost unutar pravokutnika, udio stranice. */
  pad?: number;
  /**
   * Koliko rotacija "košta": kut od 45° mora dati toliko veći font da bi
   * pobijedio vodoravni. 0 = uvijek najveći font, 1 = praktički samo
   * vodoravno. Plakat s previše nakošenih imena izgleda nemirno, a mjerenje
   * (Turopolje, 115 naselja) pokazuje da se prednost vodoravnom praktički ne
   * plaća: 0 → 5 vodoravnih natpisa i prosjek 5.72 mm, 0.35 → ~90 vodoravnih
   * i prosjek 5.6 mm. Zato je zadana vrijednost jako pomaknuta.
   */
  tiltCost?: number;
}

const DEFAULT_ANGLES = [0, -15, 15, -30, 30, -45, 45];

/** Kandidati loma imena: sve particije riječi na uzastopne skupine. */
export function lineLayouts(text: string, maxLines: number): string[][] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [[text]];
  const out: string[][] = [];
  const walk = (start: number, acc: string[]) => {
    if (acc.length === maxLines) {
      if (start === words.length) out.push([...acc]);
      return;
    }
    if (start === words.length) {
      out.push([...acc]);
      return;
    }
    for (let end = start + 1; end <= words.length; end++) {
      acc.push(words.slice(start, end).join(" "));
      walk(end, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

interface Layout {
  lines: string[];
  /** Širina najšireg retka pri font-size 1. */
  w1: number;
  /** Visina otiska cijelog bloka pri font-size 1. */
  h1: number;
  /**
   * Pismovna linija PRVOG retka u odnosu na središte otiska, u em-ovima. Blok
   * se centrira po tinti, a ne po linijama — inače natpis s repovima (j, p)
   * sjedne previsoko.
   */
  dyEm: number;
}

/** Bbox svih prstenova. */
function bbox(rings: Ring[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return { x0, y0, x1, y1 };
}

/**
 * Binarna maska poligona: ćelija je "unutra" samo ako je CIJELA unutra.
 *
 * Presjeci se računaju na RUBOVIMA retka (gore i dolje) pa se presijecaju —
 * uzimanje presjeka samo na sredini retka propušta kosi rub koji zasiječe
 * ćeliju, a upravo su ta naselja (Mala Kosnica, Lazi Turopoljski) prelijevala
 * natpis. Na kraju još erozija za jednu ćeliju: pokriva tanke izbočine koje
 * uđu u ćeliju a da ne presijeku nijedan njezin vodoravni rub, i usput daje
 * natpisu minimalni odmak od granice.
 */
function rasterize(
  rings: Ring[],
  x0: number,
  y0: number,
  cell: number,
  cols: number,
  rows: number,
) {
  const xs: number[] = [];
  const rowMask = (y: number, into: Uint8Array) => {
    into.fill(0);
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % ring.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      }
    }
    if (xs.length < 2) return;
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const c0 = Math.max(0, Math.ceil((xs[i] - x0) / cell));
      const c1 = Math.min(cols - 1, Math.floor((xs[i + 1] - x0) / cell) - 1);
      for (let c = c0; c <= c1; c++) into[c] = 1;
    }
  };

  const raw = new Uint8Array(cols * rows);
  let above = new Uint8Array(cols);
  let below = new Uint8Array(cols);
  rowMask(y0, above);
  for (let r = 0; r < rows; r++) {
    rowMask(y0 + (r + 1) * cell, below);
    for (let c = 0; c < cols; c++) raw[r * cols + c] = above[c] & below[c];
    const t = above;
    above = below;
    below = t;
  }

  const out = new Uint8Array(cols * rows);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (raw[i] && raw[i - 1] && raw[i + 1] && raw[i - cols] && raw[i + cols]) out[i] = 1;
    }
  }
  return out;
}

/**
 * Nabraja maksimalne upisane pravokutnike maske i zove cb(c0, c1, r0, r1).
 * Za svaki redak se drži histogram visina, a stog daje sve maksimalne
 * pravokutnike kojima je taj redak dno — standardni O(cols) postupak.
 */
function eachMaximalRect(
  mask: Uint8Array,
  cols: number,
  rows: number,
  cb: (c0: number, c1: number, r0: number, r1: number) => void,
) {
  const h = new Int32Array(cols);
  const stack = new Int32Array(cols + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) h[c] = mask[r * cols + c] ? h[c] + 1 : 0;
    let sp = 0;
    for (let c = 0; c <= cols; c++) {
      const cur = c === cols ? 0 : h[c];
      while (sp > 0 && h[stack[sp - 1]] >= cur) {
        const top = stack[--sp];
        const height = h[top];
        if (height > 0) {
          const left = sp > 0 ? stack[sp - 1] + 1 : 0;
          cb(left, c - 1, r - height + 1, r);
        }
      }
      if (c < cols) stack[sp++] = c;
    }
  }
}

/**
 * Nađi najveći natpis koji stane u poligon.
 *
 * `rings` je vanjski prsten + rupe, u SVG px (y prema dolje). Vraća null samo
 * ako poligon nema nijednu upisanu ćeliju ni pri udvostručenoj rezoluciji —
 * u praksi se ne događa.
 */
export function fitLabel(rings: Ring[], text: string, p: FitParams): LabelFit | null {
  const lineHeight = p.lineHeight ?? 1.15;
  const angles = p.angles ?? DEFAULT_ANGLES;
  const maxLines = p.maxLines ?? 3;
  // 0.10: pola je stvarna zračnost natpisa od granice, pola rezerva za razliku
  // između mjere (canvas) i iscrtavanja (SVG) na sitnim veličinama, gdje
  // hinting zaokružuje na cijeli piksel.
  const pad = p.pad ?? 0.1;
  const baseGrid = p.grid ?? 128;
  const tiltCost = p.tiltCost ?? 0.35;

  /** Mjere bloka pri zadanoj veličini fonta, u em-ovima. */
  const measureLayout = (lines: string[], size: number): Layout => {
    const ink = lines.map((l) => p.measure(l, size));
    // Otisak bloka: gornji rub najvišeg retka, donji rub najnižeg, mjereno od
    // pismovne linije prvog retka.
    let top = Infinity;
    let bot = -Infinity;
    ink.forEach((m, j) => {
      const y = j * lineHeight;
      top = Math.min(top, y - m.asc);
      bot = Math.max(bot, y + m.desc);
    });
    return {
      lines,
      w1: Math.max(...ink.map((m) => m.w)),
      h1: bot - top,
      dyEm: -(top + bot) / 2,
    };
  };

  // Pretraga ide s mjerama na gornjoj granici veličine; stvarna je manja pa su
  // glifovi relativno širi — dotjerivanje na kraju to skuplja natrag u okvir.
  const layouts: Layout[] = lineLayouts(text, maxLines).map((lines) =>
    measureLayout(lines, p.maxSize),
  );
  // Za odsijecanje: najpovoljnija ograničenja preko svih kandidata.
  const w1min = Math.min(...layouts.map((l) => l.w1));
  const h1min = Math.min(...layouts.map((l) => l.h1));

  const bb = bbox(rings);
  const px = (bb.x0 + bb.x1) / 2;
  const py = (bb.y0 + bb.y1) / 2;
  const diag = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) || 1;

  let best: LabelFit | null = null;
  let bestScore = 0;
  // Pisanje ide kroz funkciju jer TS inače, zbog dodjele iz callbacka, suzi
  // `best` na `never` i kasnije čitanje polja ne prolazi provjeru tipova.
  const keep = (fit: LabelFit) => {
    best = fit;
  };

  for (const grid of [baseGrid, baseGrid * 2]) {
    for (const angle of angles) {
      const a = (-angle * Math.PI) / 180; // poligon u okvir natpisa
      const cos = Math.cos(a), sin = Math.sin(a);
      const rot: Ring[] = rings.map((ring) =>
        ring.map(([x, y]) => {
          const dx = x - px, dy = y - py;
          return [px + dx * cos - dy * sin, py + dx * sin + dy * cos] as Pt;
        }),
      );
      const rb = bbox(rot);
      const w = rb.x1 - rb.x0, hgt = rb.y1 - rb.y0;
      const cell = Math.max(w, hgt) / grid;
      if (!(cell > 0)) continue;
      const cols = Math.max(3, Math.ceil(w / cell) + 2);
      const rows = Math.max(3, Math.ceil(hgt / cell) + 2);
      // +1 ćelija ruba sa svake strane, da erozija ima na čemu raditi.
      const x0 = rb.x0 - cell, y0 = rb.y0 - cell;
      const mask = rasterize(rot, x0, y0, cell, cols, rows);

      // Vodoravno ima prednost; rotira se samo kad stvarno donese veći natpis.
      const anglePenalty = 1 - tiltCost * (Math.abs(angle) / 45);

      eachMaximalRect(mask, cols, rows, (c0, c1, r0, r1) => {
        const boxW = (c1 - c0 + 1) * cell * (1 - pad);
        const boxH = (r1 - r0 + 1) * cell * (1 - pad);
        // Gornja ograda preko svih layouta — odsijeca ogromnu većinu.
        if (Math.min(boxH / h1min, boxW / w1min) * anglePenalty <= bestScore) return;
        const cx = x0 + ((c0 + c1 + 1) / 2) * cell;
        const cy = y0 + ((r0 + r1 + 1) / 2) * cell;
        const off = Math.hypot(cx - px, cy - py) / diag;
        const central = 1 - 0.12 * Math.min(1, off * 2);
        for (const L of layouts) {
          const size = Math.min(p.maxSize, boxH / L.h1, boxW / L.w1);
          const score = size * anglePenalty * central * (1 - 0.03 * (L.lines.length - 1));
          if (score <= bestScore) continue;
          bestScore = score;
          // Natrag u izvorni okvir.
          const dx = cx - px, dy = cy - py;
          keep({
            lines: L.lines,
            size,
            angle,
            dyEm: L.dyEm,
            x: px + dx * cos + dy * sin,
            y: py - dx * sin + dy * cos,
            boxW,
            boxH,
          });
        }
      });
    }
    // Druga rezolucija (bez erozije) samo ako prva nije našla ništa — tanka
    // naselja znaju propasti kroz grubu mrežu.
    if (best) break;
  }

  // Dotjerivanje: mjere na NAĐENOJ veličini. Kako se veličina smanjuje, glifovi
  // se (kod opsz fontova) šire, pa iteracija ide samo prema dolje i brzo
  // konvergira — a natpis zajamčeno ostaje u pravokutniku koji je za njega
  // nađen.
  if (best) {
    const b = best as LabelFit;
    for (let iter = 0; iter < 4; iter++) {
      const L = measureLayout(b.lines, b.size);
      const next = Math.min(p.maxSize, b.boxH / L.h1, b.boxW / L.w1);
      b.dyEm = L.dyEm;
      if (Math.abs(next - b.size) < 0.01) {
        b.size = next;
        break;
      }
      b.size = next;
    }
  }

  // Namjerno BEZ donje granice: vraćena veličina je ona koja stvarno stane.
  // Podizanje na neki minimum značilo bi natpis izvan poligona, a to je jedina
  // stvar koju ovaj modul jamči da se ne događa. Odluku "presitno, ne crtaj"
  // donosi pozivatelj (MIN_LABEL).
  return best as LabelFit | null;
}
