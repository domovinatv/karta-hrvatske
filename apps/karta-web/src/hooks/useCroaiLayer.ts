import { useMapState } from "@/lib/MapState";
import { usePointLayer } from "./usePointLayer";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CroaiProperties } from "@/lib/types";
import { svgArrowUpRight } from "@/lib/svgIcons";

// Croatian AI Landscape — imenik s map.croai.org, smješten na kartu. Gradi ga
// `apps/data-pipeline/scripts/34_fetch_croai.py`.
//
// Imenik NEMA adresa: točka postoji samo za subjekt kojem je skripta našla
// OIB (impresum vlastitog weba ili jedinstveni slug u info.BIZ-u) i preko
// njega sjedište. Zato je sloj manji od imenika, i blurb to kaže.
//
// To je imenik ekosustava, a NE popis članova udruge CroAI — CroAI sam
// razdvaja upis na mapu od članstva.

const BOJE: Record<string, string> = {
  tvrtke: "#2563eb",
  ekosustav: "#dc2626",
  korisnici: "#525252",
};

const COLOR_EXPR = [
  "match",
  ["get", "grupa"],
  ...Object.entries(BOJE).flatMap(([k, c]) => [k, c]),
  "#525252",
];

const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4, 3,
  6, 4,
  9, 6,
  12, 8.5,
  15, 12,
];

// Prsten samo kad FINA kaže da subjekt ne posluje; null = ne zna se.
const MRTAV_FILTER = ["==", ["get", "fina_aktivan"], false];

export function useCroaiLayer(args: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showCroai } = useMapState();
  usePointLayer<CroaiProperties>({
    ...args,
    spec: {
      id: "croai",
      file: "croai.geojson",
      visible: showCroai,
      colorExpr: COLOR_EXPR,
      radiusExpr: RADIUS_EXPR,
      ringFilter: MRTAV_FILTER,
      popupHtml,
    },
  });
}

function popupHtml(p: CroaiProperties): string {
  const color = BOJE[p.grupa] ?? "#525252";

  const mrtav =
    p.fina_aktivan === false
      ? `<div class="club-row" style="border-top:0;color:#ef4444">
           <span class="k">Status</span>
           <span class="v">${esc(p.fina_status ?? "ne posluje")} (FINA)</span>
         </div>`
      : "";

  const rows = [
    mrtav,
    p.kategorije ? row("Kategorija", p.kategorije) : "",
    p.naziv && p.naziv.toLowerCase() !== p.name.toLowerCase() ? row("Pravni naziv", p.naziv) : "",
    row("Adresa", p.adresa),
    // DGU/Nominatim nisu našli kuću — točka je središte mjesta, ne sjedište.
    p.geo_source === "naselje" ? row("Točnost", "središte mjesta") : "",
    row("Osnovano", p.year),
    row("OIB", p.oib),
    row("Veličina", p.fina_velicina),
    row("Zaposlenih", p.fina_zaposleni),
  ].join("");

  const about = p.about
    ? `<div class="club-row" style="display:block">
         <span class="v" style="opacity:.75;font-size:11px;line-height:1.45">
           ${esc(p.about.length > 280 ? p.about.slice(0, 277) + "…" : p.about)}
         </span>
       </div>`
    : "";

  const links = [
    p.website ? link(p.website, "Web") : "",
    p.fina_url ? link(p.fina_url, "FINA") : "",
    link("https://map.croai.org", "CroAI mapa"),
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(p.name)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(p.grupa_naziv)} · CroAI imenik
          </div>
        </div>
      </div>
      ${rows}
      ${about}
      ${links ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${links}</div>` : ""}
    </div>`;
}

function row(k: string, val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "";
  return `<div class="club-row"><span class="k">${esc(k)}</span><span class="v">${esc(String(val))}</span></div>`;
}

function link(href: string, label: string): string {
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
     style="font-size:11px;text-decoration:underline;opacity:.85">${esc(label)} ${svgArrowUpRight()}</a>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
