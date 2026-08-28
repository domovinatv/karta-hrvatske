/**
 * Projekcija poligona plakata u SVG koordinate.
 *
 * Odvojeno od poster.ts (registar subjekata) jer ovaj modul nema nijedan
 * runtime import — pa ga uz preglednik može vrtjeti i `node` izravno
 * (scripts/audit-poster-labels.mjs), bez bundlera.
 */

import type { PosterCollection, PosterFeature } from "./types";

/** Dio subjekta koji određuje ŠTO se crta; puni tip je PosterSubject. */
export interface SubjectGeometrySpec {
  jlsMb: string[];
  unitFilter?: string;
  outlines?: ("jls" | "regija")[];
}

/** Piksela po centimetru u SVG koordinatnom sustavu plakata. */
export const PX_PER_CM = 10;

/** Razmak redaka natpisa, u jedinicama font-sizea. */
export const LINE_H = 1.15;

/**
 * Ispod ovoga se natpis ne crta. Prag je namjerno nizak — plakat je vektor i
 * na 300 DPI printu je i 1 mm čitljiv izbliza — ali 0.5 mm više nije slovo
 * nego mrlja. Jedini kandidati za odbacivanje su najsitniji zagrebački
 * mjesni odbori s dugim imenima.
 */
export const MIN_LABEL = 0.8;

/**
 * Geometrija papira. Ista računica treba renderu, predračunu natpisa i audit
 * skripti (natpisi ovise o projekciji, projekcija o formatu I o tome ima li
 * plakat naslov), pa je na jednom mjestu.
 */
export function posterFrame(format: { wCm: number; hCm: number }, hasTitle: boolean) {
  const W = format.wCm * PX_PER_CM;
  const H = format.hCm * PX_PER_CM;
  const margin = W * 0.06;
  const titleBlockH = hasTitle ? H * 0.13 : H * 0.03;
  const mapY = hasTitle ? titleBlockH : margin;
  return {
    W,
    H,
    margin,
    titleBlockH,
    mapX: margin,
    mapY,
    mapW: W - margin * 2,
    mapH: H - mapY - margin * 1.4,
  };
}

/** Estetska gornja granica: veliko naselje ne smije dobiti divovski natpis. */
export function labelCap(areaPx: number): number {
  return Math.max(4.5, Math.min(16, Math.sqrt(areaPx) * 0.15));
}

// ---------------------------------------------------------------------------
// Geometrija → SVG

export type Ring = [number, number][];

export interface ProjectedKvart {
  name: string;
  paletteIdx: number;
  /** SVG path (sve komponente multipoligona). */
  d: string;
  /** Centroid najveće komponente (za labelu), u SVG koordinatama. */
  cx: number;
  cy: number;
  /** Približna površina najveće komponente u SVG px² (za skaliranje fonta). */
  areaPx: number;
  /** Bbox najveće komponente — okvir unutar kojeg labela MORA stati. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /**
   * Prstenovi najveće komponente (SVG px): vanjski + rupe. Natpis se fita u
   * njih (label-fit.ts), pa rupe moraju biti unutra — inače ime sjedne u
   * enklavu koja nije dio naselja.
   */
  rings: Ring[];
}

/** Razine koje se BOJE; ostale ("jls", "regija") su samo obrisi. */
const UNIT_RAZINE = ["kvart", "cetvrt", "naselje"];

export interface ProjectedSubject {
  /** Jedinice koje se boje: kvartovi, gradske četvrti ili naselja. */
  units: ProjectedKvart[];
  /** Obrisi preko jedinica: granice JLS-a i vanjski obuhvat regije. */
  outlines: { name: string; d: string; razina: "jls" | "regija" }[];
  /** Projekcija točke (lat/lng → SVG px) za custom točke. */
  project: (lng: number, lat: number) => [number, number];
  width: number;
  height: number;
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function ringCentroid(ring: Ring): [number, number] {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += f;
    cx += (ring[i][0] + ring[i + 1][0]) * f;
    cy += (ring[i][1] + ring[i + 1][1]) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) return ring[0];
  return [cx / (6 * a), cy / (6 * a)];
}

/**
 * Projicira jedinice subjekta u SVG koordinate: equirectangular s cos(lat0)
 * korekcijom (na ovoj skali vizualno identično TM projekciji), fit u
 * width×height box.
 *
 * Bbox se računa iz jedinica I obrisa. Kod objedinjenog plakata to je isto
 * (obrisi su unija jedinica), ali kad je subjekt podskup — Plemenita opčina
 * crta 26 naselja preko obuhvata cijele regije — obuhvat je ŠIRI od jedinica
 * pa bi inače izlazio iz okvira papira.
 */
export function projectSubject(
  fc: PosterCollection,
  subject: SubjectGeometrySpec,
  width: number,
  height: number,
): ProjectedSubject {
  const inSubject = (f: PosterFeature) =>
    subject.jlsMb.includes(f.properties.jls_maticni_broj);
  const feats = (fc.features as PosterFeature[]).filter(
    (f) =>
      UNIT_RAZINE.includes(f.properties.razina) &&
      inSubject(f) &&
      (!subject.unitFilter ||
        (f.properties as unknown as Record<string, unknown>)[subject.unitFilter] === true),
  );
  // Obuhvat regije (razina="regija") nije vezan uz jedan JLS pa ne prolazi
  // inSubject — nosi jls_maticni_broj "*".
  const want = subject.outlines ?? [];
  const borderFeats = (fc.features as PosterFeature[]).filter(
    (f) =>
      (want.includes("regija") && f.properties.razina === "regija") ||
      (want.includes("jls") && f.properties.razina === "jls" && inSubject(f)),
  );
  const extent = [...feats, ...borderFeats];

  // Bounding box u "metarskim" koordinatama.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let latSum = 0, latN = 0;
  for (const f of extent) {
    forEachRing(f.geometry, (ring) => {
      for (const pt of ring) {
        latSum += pt[1];
        latN++;
      }
    });
  }
  const lat0 = (latSum / Math.max(latN, 1)) * (Math.PI / 180);
  const kx = Math.cos(lat0) * 111.32; // km po stupnju
  const ky = 110.57;
  const toXY = (lng: number, lat: number): [number, number] => [lng * kx, -lat * ky];

  for (const f of extent) {
    forEachRing(f.geometry, (ring) => {
      for (const [lng, lat] of ring) {
        const [x, y] = toXY(lng, lat);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    });
  }
  const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
  const ox = (width - (maxX - minX) * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  const project = (lng: number, lat: number): [number, number] => {
    const [x, y] = toXY(lng, lat);
    return [(x - minX) * scale + ox, (y - minY) * scale + oy];
  };

  const kvarts: ProjectedKvart[] = feats.map((f) => {
    let d = "";
    let bestArea = 0;
    let cx = 0, cy = 0;
    let bx = 0, by = 0, bw = 0, bh = 0;
    let bestRings: Ring[] = [];
    const polys = f.geometry.type === "Polygon"
      ? [(f.geometry as GeoJSON.Polygon).coordinates]
      : (f.geometry as GeoJSON.MultiPolygon).coordinates;
    for (const poly of polys) {
      const projected = poly.map((r) => r.map(([lng, lat]) => project(lng, lat)) as Ring);
      const outer = projected[0];
      const area = Math.abs(ringArea(outer));
      if (area > bestArea) {
        bestArea = area;
        [cx, cy] = ringCentroid(outer);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of outer) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        bx = x0; by = y0; bw = x1 - x0; bh = y1 - y0;
        bestRings = projected;
      }
      for (const pts of projected) {
        d += `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
      }
    }
    return {
      name: f.properties.name,
      paletteIdx: f.properties.palette_idx ?? 0,
      d,
      cx,
      cy,
      areaPx: bestArea,
      bx,
      by,
      bw,
      bh,
      rings: bestRings,
    };
  });

  const outlines = borderFeats.map((f) => {
    let d = "";
    const polys = f.geometry.type === "Polygon"
      ? [(f.geometry as GeoJSON.Polygon).coordinates]
      : (f.geometry as GeoJSON.MultiPolygon).coordinates;
    for (const poly of polys) {
      for (const ringCoords of poly) {
        const pts = ringCoords.map(([lng, lat]) => project(lng, lat));
        d += `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
      }
    }
    return {
      name: f.properties.name,
      d,
      razina: f.properties.razina as "jls" | "regija",
    };
  });

  return { units: kvarts, outlines, project, width, height };
}

function forEachRing(geom: GeoJSON.Geometry, cb: (ring: Ring) => void) {
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) cb(ring as Ring);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) for (const ring of poly) cb(ring as Ring);
  }
}

