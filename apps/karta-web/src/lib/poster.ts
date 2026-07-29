// Poster generator ("anatomija grada") — čisti SVG render iz
// kvartovi-kolokvijalni.geojson, bez MapLibrea. Print-ready: SVG download +
// PNG rasterizacija @300 DPI s embedanim fontovima.

import type { KvartCollection, KvartFeature } from "./types";

export interface PosterCity {
  key: string;
  label: string;
  jlsMb: string;
  title: string;
}

export const POSTER_CITIES: PosterCity[] = [
  { key: "zagreb", label: "Zagreb", jlsMb: "01333", title: "ZAGREB" },
  { key: "velika-gorica", label: "Velika Gorica", jlsMb: "05410", title: "VELIKA GORICA" },
];

export interface PosterPalette {
  key: string;
  label: string;
  /** Boje kvartova — palette_idx % length. Susjedi nikad ne dijele idx. */
  fills: string[];
  bg: string;
  stroke: string;
  text: string;
  /** Boja naslova/podnaslova. */
  title: string;
}

export const POSTER_PALETTES: PosterPalette[] = [
  {
    key: "retro",
    label: "Retro (anatomija)",
    fills: ["#7fa48a", "#e8694a", "#e5aa42", "#22384a", "#b6c9a5", "#c9803f"],
    bg: "#f4f1ea",
    stroke: "#f4f1ea",
    text: "#1d2d3a",
    title: "#22384a",
  },
  {
    key: "domovina",
    label: "Domovina (navy/red)",
    fills: ["#002F6C", "#c8102e", "#5a7fb0", "#e8b3ac", "#28457e", "#a34252"],
    bg: "#f7f5f0",
    stroke: "#f7f5f0",
    text: "#001a40",
    title: "#002F6C",
  },
  {
    key: "pastel",
    label: "Pastel",
    fills: ["#a8c8b8", "#e8b8a8", "#e5d5a0", "#a0b8d8", "#d0b8d0", "#c8d8a0"],
    bg: "#fdfcf8",
    stroke: "#ffffff",
    text: "#4a4a48",
    title: "#3a3a38",
  },
  {
    key: "noir",
    label: "Noir",
    fills: ["#1a1a1e", "#2c2c34", "#3e3e48", "#26262e", "#34343e", "#202028"],
    bg: "#0c0c10",
    stroke: "#8a8a96",
    text: "#e8e8ee",
    title: "#ffffff",
  },
  {
    key: "terra",
    label: "Terra",
    fills: ["#b0654a", "#d99e6a", "#8a7550", "#5f4b38", "#c8b090", "#96654a"],
    bg: "#efe6d8",
    stroke: "#efe6d8",
    text: "#3e2d20",
    title: "#5f4b38",
  },
];

export interface PosterFont {
  key: string;
  label: string;
  family: string;
  /** Google Fonts css2 URL za embed u export; null = system font, bez embeda. */
  cssUrl: string | null;
}

export const POSTER_FONTS: PosterFont[] = [
  {
    key: "fraunces",
    label: "Fraunces (serif)",
    family: "Fraunces",
    cssUrl:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&display=swap",
  },
  {
    key: "mono",
    label: "JetBrains Mono",
    family: "JetBrains Mono",
    cssUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap",
  },
  { key: "sans", label: "Sans (system)", family: "Helvetica, Arial, sans-serif", cssUrl: null },
];

export interface PosterFormat {
  key: string;
  label: string;
  /** Fizičke dimenzije u cm (širina × visina). */
  wCm: number;
  hCm: number;
}

export const POSTER_FORMATS: PosterFormat[] = [
  { key: "kvadrat", label: "70 × 70 cm", wCm: 70, hCm: 70 },
  { key: "portret", label: "50 × 70 cm", wCm: 50, hCm: 70 },
  { key: "pejzaz", label: "70 × 50 cm", wCm: 70, hCm: 50 },
];

export interface PosterPoint {
  lat: number;
  lng: number;
  label?: string;
}

/** "45.80, 15.97, Moj ured" po retku → točke; nevaljani retci se preskaču. */
export function parsePoints(text: string): PosterPoint[] {
  const out: PosterPoint[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split(/[,;\t]/).map((s) => s.trim());
    if (parts.length < 2) continue;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < 42 || lat > 47 || lng < 13 || lng > 20) continue;
    out.push({ lat, lng, label: parts.slice(2).join(", ") || undefined });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometrija → SVG

type Ring = [number, number][];

interface ProjectedKvart {
  name: string;
  paletteIdx: number;
  /** SVG path (sve komponente multipoligona). */
  d: string;
  /** Centroid najveće komponente (za labelu), u SVG koordinatama. */
  cx: number;
  cy: number;
  /** Približna površina najveće komponente u SVG px² (za skaliranje fonta). */
  areaPx: number;
}

export interface ProjectedCity {
  kvarts: ProjectedKvart[];
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
 * Projicira kvartove grada u SVG koordinate: equirectangular s cos(lat0)
 * korekcijom (na gradskoj skali vizualno identično TM projekciji), fit u
 * width×height box.
 */
export function projectCity(
  fc: KvartCollection,
  jlsMb: string,
  width: number,
  height: number,
): ProjectedCity {
  const feats = (fc.features as KvartFeature[]).filter(
    (f) => f.properties.jls_maticni_broj === jlsMb,
  );

  // Bounding box u "metarskim" koordinatama.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let latSum = 0, latN = 0;
  for (const f of feats) {
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

  for (const f of feats) {
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
    const polys = f.geometry.type === "Polygon"
      ? [(f.geometry as GeoJSON.Polygon).coordinates]
      : (f.geometry as GeoJSON.MultiPolygon).coordinates;
    for (const poly of polys) {
      const outer = poly[0].map(([lng, lat]) => project(lng, lat)) as Ring;
      const area = Math.abs(ringArea(outer));
      if (area > bestArea) {
        bestArea = area;
        [cx, cy] = ringCentroid(outer);
      }
      for (const ringCoords of poly) {
        const pts = ringCoords.map(([lng, lat]) => project(lng, lat));
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
    };
  });

  return { kvarts, project, width, height };
}

function forEachRing(geom: GeoJSON.Geometry, cb: (ring: Ring) => void) {
  if (geom.type === "Polygon") {
    for (const ring of geom.coordinates) cb(ring as Ring);
  } else if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) for (const ring of poly) cb(ring as Ring);
  }
}

// ---------------------------------------------------------------------------
// Export helpers

/** Skini Google Fonts css i vrati <style> blok s woff2 data-URI @font-face. */
export async function fontFaceCss(font: PosterFont): Promise<string> {
  if (!font.cssUrl) return "";
  const css = await fetch(font.cssUrl).then((r) => r.text());
  const urls = [...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)].map((m) => m[1]);
  let out = css;
  await Promise.all(
    urls.map(async (u) => {
      const buf = await fetch(u).then((r) => r.arrayBuffer());
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      out = out.replace(u, `data:font/woff2;base64,${b64}`);
    }),
  );
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** SVG string → PNG blob @ px dimenzijama (300 DPI za print). */
export async function svgToPng(svgString: string, pxW: number, pxH: number): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG rasterize failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, pxW, pxH);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("toBlob failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
