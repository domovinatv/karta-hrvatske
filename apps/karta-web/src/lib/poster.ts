// Poster generator ("anatomija grada") — čisti SVG render iz
// kvartovi-kolokvijalni.geojson, bez MapLibrea. Print-ready: SVG download +
// PNG rasterizacija @300 DPI s embedanim fontovima.

import posterSubjects from "./poster-subjects.json";

// Geometrija živi u poster-geom.ts (bez runtime importa, vrti se i u nodeu);
// ovdje se samo prosljeđuje da potrošači imaju jedan ulaz.
export { projectSubject } from "./poster-geom";
export type { ProjectedKvart, ProjectedSubject, Ring } from "./poster-geom";

/** Iz kojeg se sloja crta — mapira se na file u /data/. */
export const POSTER_SOURCES: Record<string, string> = {
  kvartovi: "/data/kvartovi-kolokvijalni.geojson",
  turopolje: "/data/turopolje-naselja.geojson",
};

export interface PosterSubject {
  /**
   * Identitet subjekta I segment javnog URL-a (/poster/<slug>). NE mijenjati —
   * sherani linkovi (WhatsApp) ovise o njemu.
   */
  slug: string;
  /** Ime u naslovu plakata. */
  label: string;
  /** Genitiv za OG opis ("8 naselja Velike Gorice"). */
  labelGenitive: string;
  /** Ime u dropdownu — razlikuje varijante istog grada. */
  menuLabel: string;
  subtitle: string;
  /** Ključ u POSTER_SOURCES. */
  source: string;
  /** JLS-ovi koji ulaze u plakat; više njih = objedinjeni plakat (Turopolje). */
  jlsMb: string[];
  /** Sklonidba jedinice: [1, 2-4, 5+] — "1 kvart, 2 kvarta, 5 kvartova". */
  unit: [string, string, string] | string[];
  /**
   * Dodatni uvjet na jedinicu — ime boolean propertyja koji mora biti true.
   * Tako se iz istog sloja izdvaja podskup koji ne prati granice JLS-a
   * (Plemenita opčina turopoljska).
   */
  unitFilter?: string;
  /** Koje obrise crtati preko jedinica: granice JLS-a i/ili obuhvat regije. */
  outlines?: ("jls" | "regija")[];
  /**
   * Izvor poligona — po subjektu, jer se razlikuje: ZG kvartovi su derivirani
   * iz mjesnih odbora (data.zagreb.hr), VG četvrti iz OSM-a, naselja iz DGU
   * RPJ-a. Ide u footer plakata pa mora pratiti subjekt, ne biti hardkodiran.
   */
  attribution: string;
  /** Isti izvor, duži oblik za tekst u kontrolama. */
  sources: string;
  /** Placeholder za "tvoje točke" — koordinate unutar tog područja. */
  samplePoints: string;
}

/**
 * Registar živi u JSON-u jer ga uz app čitaju i build skripte (lookup za OG
 * injection u workeru, sitemap). Jedan izvor istine — novi plakat se dodaje
 * SAMO ovdje (+ sloj u POSTER_SOURCES ako dolazi iz novog filea).
 */
// JSON import daje široke tipove (string[] umjesto unije), zato cast.
export const POSTER_SUBJECTS = posterSubjects as PosterSubject[];

export const DEFAULT_SUBJECT_SLUG = POSTER_SUBJECTS[0].slug;

/** Subjekt po URL slugu; nepoznat slug → null (ruta tada redirecta na default). */
export function subjectBySlug(slug: string | undefined): PosterSubject | null {
  return POSTER_SUBJECTS.find((s) => s.slug === slug) ?? null;
}

/** Hrvatska sklonidba uz broj: 1 kvart, 2-4 kvarta, 5+ kvartova (11-14 iznimka). */
export function pluralUnit(n: number, forms: string[]): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return forms[0];
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return forms[1];
  return forms[2];
}

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
  /** Boja imena kvarta na SVIJETLOM fillu (tamni tekst). */
  labelDark: string;
  /** Boja imena kvarta na TAMNOM fillu (svijetli tekst — inverz). */
  labelLight: string;
}

/** Percepcijska svjetlina 0-1 iz #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Kontrastna boja imena za dani fill: tamni tekst na svijetlom i obrnuto. */
export function labelColorFor(fill: string, palette: PosterPalette): string {
  return luminance(fill) > 0.45 ? palette.labelDark : palette.labelLight;
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
    labelDark: "#1d2d3a",
    labelLight: "#f4f1ea",
  },
  {
    key: "domovina",
    label: "Domovina (navy/red)",
    fills: ["#002F6C", "#c8102e", "#5a7fb0", "#e8b3ac", "#28457e", "#a34252"],
    bg: "#f7f5f0",
    stroke: "#f7f5f0",
    text: "#001a40",
    title: "#002F6C",
    labelDark: "#001a40",
    labelLight: "#f7f5f0",
  },
  {
    key: "pastel",
    label: "Pastel",
    fills: ["#a8c8b8", "#e8b8a8", "#e5d5a0", "#a0b8d8", "#d0b8d0", "#c8d8a0"],
    bg: "#fdfcf8",
    stroke: "#ffffff",
    text: "#4a4a48",
    title: "#3a3a38",
    labelDark: "#3a3a38",
    labelLight: "#ffffff",
  },
  {
    key: "noir",
    label: "Noir",
    fills: ["#1a1a1e", "#2c2c34", "#3e3e48", "#26262e", "#34343e", "#202028"],
    bg: "#0c0c10",
    stroke: "#8a8a96",
    text: "#e8e8ee",
    title: "#ffffff",
    labelDark: "#0c0c10",
    labelLight: "#e8e8ee",
  },
  {
    key: "terra",
    label: "Terra",
    fills: ["#b0654a", "#d99e6a", "#8a7550", "#5f4b38", "#c8b090", "#96654a"],
    bg: "#efe6d8",
    stroke: "#efe6d8",
    text: "#3e2d20",
    title: "#5f4b38",
    labelDark: "#33231a",
    labelLight: "#f5ead9",
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
