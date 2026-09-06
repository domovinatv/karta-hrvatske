import { useMapState } from "@/lib/MapState";
import { usePointLayer } from "./usePointLayer";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { EkosustavProperties } from "@/lib/types";
import { svgArrowUpRight } from "@/lib/svgIcons";

// Privatni startup ekosustav — VC fondovi, privatni inkubatori, coworkinzi i
// udruge koje drže tehnološku zajednicu. Gradi ga
// `apps/data-pipeline/scripts/33_fetch_ppi_privatni.py`.
//
// Namjerno ODVOJEN sloj od Inkubatora, a ne dodatne točke u njemu: taj je
// popis državni upis, a ovaj ljudska prosudba. Spojiti ih značilo bi tvrditi
// jednaku pouzdanost za oboje. Paleta je topla nasuprot hladnoj paleti
// Inkubatora, pa se i s oba upaljena sloja vidi što je što.

const BOJE: Record<string, string> = {
  fond: "#f59e0b",
  inkubator: "#e11d48",
  zajednica: "#14b8a6",
  hub: "#8b5cf6",
  korporativni: "#64748b",
};

const COLOR_EXPR = [
  "match",
  ["get", "kategorija"],
  ...Object.entries(BOJE).flatMap(([k, c]) => [k, c]),
  "#64748b",
];

const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4, 3,
  6, 4.5,
  9, 6.5,
  12, 9,
  15, 13,
];

// Kao i kod Inkubatora: prsten samo kad se ZNA da subjekt ne posluje.
// `fina_aktivan` je null kad ga u info.BIZ-u nema.
const MRTAV_FILTER = ["==", ["get", "fina_aktivan"], false];

export function useEkosustavLayer(args: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showEkosustav } = useMapState();
  usePointLayer<EkosustavProperties>({
    ...args,
    spec: {
      id: "ekosustav",
      file: "ekosustav.geojson",
      visible: showEkosustav,
      colorExpr: COLOR_EXPR,
      radiusExpr: RADIUS_EXPR,
      ringFilter: MRTAV_FILTER,
      popupHtml,
    },
  });
}

function popupHtml(p: EkosustavProperties): string {
  const color = BOJE[p.kategorija] ?? "#64748b";

  const mrtav =
    p.fina_aktivan === false
      ? `<div class="club-row" style="border-top:0;color:#ef4444">
           <span class="k">Status</span>
           <span class="v">${esc(p.fina_status ?? "ne posluje")} (FINA)</span>
         </div>`
      : "";

  const rows = [
    mrtav,
    p.naziv && p.naziv !== p.brand ? row("Pravni naziv", p.naziv) : "",
    row("Adresa", p.adresa),
    row("OIB", p.oib),
    row("Pravni oblik", p.pravni_oblik),
    row("Djelatnost", p.nkd),
    row("Veličina", p.fina_velicina),
    row("Zaposlenih", p.fina_zaposleni),
  ].join("");

  // Napomena nosi razlog zašto je subjekt na popisu — kod kuriranog skupa to
  // je jedino što stoji umjesto registarskog autoriteta, pa se prikazuje.
  const napomena = p.napomena
    ? `<div class="club-row" style="display:block">
         <span class="v" style="opacity:.75;font-size:11px;line-height:1.45">
           ${esc(p.napomena)}
         </span>
       </div>`
    : "";

  const links = [
    p.website ? link(p.website, "Web") : "",
    p.fina_url ? link(p.fina_url, "FINA") : "",
    link(
      `https://sudreg.pravosudje.hr/registar/f?p=150:28:::NO:28:P28_SBT_MBS:${p.oib}`,
      "Sudski registar",
    ),
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(p.brand)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(p.kategorija_naziv)} · kurirano
          </div>
        </div>
      </div>
      ${rows}
      ${napomena}
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
