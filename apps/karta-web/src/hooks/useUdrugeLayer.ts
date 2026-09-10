import { useMapState } from "@/lib/MapState";
import { usePointLayer } from "./usePointLayer";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { UdrugaProperties } from "@/lib/types";
import { svgArrowUpRight } from "@/lib/svgIcons";

// Katoličke udruge — civilne udruge, bratovštine, molitvene zajednice,
// zborovi, pokreti. Podatke generira sestrinski repo ../../udruge.domovina.ai
// (`make export` → `make sync-karta` upiše public/data/udruge.geojson).
//
// Treći sloj grupe „vjera", uz Crkve (građevine) i Župe (crkvene pravne
// osobe): udruga je pravna osoba koja NIJE ni jedno ni drugo — upisana je u
// Registar udruga, a ne u crkvenu evidenciju (osim 22 vjernička društva).
//
// Ono što je drukčije od ostalih slojeva: katoličnost je PROSUDBA (nijedan
// registar nema polje „vjera"), pa popup ispisuje pouzdanost. Sloj crta samo
// pouzdanost visoka + srednja; kandidati niske pouzdanosti nisu u exportu.

const BOJE: Record<string, string> = {
  molitvena: "#4a5da8",
  karitativna: "#b4442a",
  bratovstina: "#8a5a1f",
  glazba: "#5c6bb5",
  pokret: "#7c3aed",
  mladi: "#2f7d72",
  hodocasnicka: "#a8791f",
  kultura: "#8a4b73",
  obitelj: "#c2410c",
  zupna: "#4f7a6a",
  sport: "#0e7490",
  strukovna: "#6b7280",
  obrazovanje: "#0891b2",
  mediji: "#9333ea",
  ministranti: "#7b8ac4",
  ostalo: "#8d8d94",
};

const LABEL: Record<string, string> = {
  molitvena: "Molitvena zajednica",
  karitativna: "Karitativna / humanitarna",
  bratovstina: "Bratovština",
  glazba: "Zbor / crkvena glazba",
  pokret: "Pokret / laička zajednica",
  mladi: "Mladi i studenti",
  hodocasnicka: "Hodočasnička",
  kultura: "Kultura i baština",
  obitelj: "Obitelj i život",
  zupna: "Župna udruga",
  sport: "Sport i rekreacija",
  strukovna: "Strukovna udruga",
  obrazovanje: "Obrazovanje i kateheza",
  mediji: "Mediji i nakladništvo",
  ministranti: "Ministranti",
  ostalo: "Katolička udruga",
};

const COLOR_EXPR = [
  "match",
  ["get", "category"],
  ...Object.entries(BOJE).flatMap(([k, c]) => [k, c]),
  "#8d8d94",
];

const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  5, 2.5,
  8, 4,
  12, 7,
  15, 11,
];

// Ugašena udruga (BRISAN / PRESTANAK DJELOVANJA) blijedi, ne nestaje: export
// ih zadržava kao povijest, karta ih ne smije prikazati kao žive.
const OPACITY_EXPR = ["case", ["==", ["get", "active"], 1], 0.92, 0.35];

// Prsten: udruga koja je u katalogu sa SREDNJOM pouzdanosti — prosudba je
// slabija i korisnik to mora vidjeti bez otvaranja popupa.
const SREDNJA_FILTER = ["==", ["get", "catholic_confidence"], "srednja"];

export function useUdrugeLayer(args: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showUdruge } = useMapState();
  usePointLayer<UdrugaProperties>({
    ...args,
    spec: {
      id: "udruge",
      file: "udruge.geojson",
      visible: showUdruge,
      colorExpr: COLOR_EXPR,
      radiusExpr: RADIUS_EXPR,
      opacityExpr: OPACITY_EXPR,
      ringFilter: SREDNJA_FILTER,
      popupHtml,
      jsonFields: ["source"],
    },
  });
}

const GEO_LABEL: Record<string, string> = {
  "dgu-adresa": "adresna točka (DGU)",
  "dgu-ulica-fuzzy": "adresna točka, ulica približno (DGU)",
  "naselje-teziste": "težište naselja (~razina mjesta)",
};

function popupHtml(p: UdrugaProperties): string {
  const color = BOJE[p.category] ?? "#8d8d94";
  const title = p.display_name || p.name;
  const kind = LABEL[p.category] ?? "Katolička udruga";

  const ugasena =
    p.active === 0
      ? `<div class="club-row" style="border-top:0;color:#ef4444">
           <span class="k">Status</span><span class="v">${esc(p.status ?? "ugašena")}</span>
         </div>`
      : "";

  const rows = [
    ugasena,
    row("Sjedište", [p.address, p.postal_code, p.city].filter(Boolean).join(", ")),
    row("Županija", p.county),
    row("Biskupija", p.diocese ? `${p.diocese} (izvedeno)` : null),
    row("OIB", p.oib),
    row(p.president_role ? esc(p.president_role) : "Zastupa", p.president),
    row("Pouzdanost", p.catholic_confidence),
    row("Točnost lokacije", p.geo_source ? GEO_LABEL[p.geo_source] : null),
  ].join("");

  const links = [
    link(`https://udruge.domovina.ai/udruga/${encodeURIComponent(p.slug)}`, "Stranica u katalogu"),
    p.website ? link(p.website, "Web") : "",
    p.email ? link(`mailto:${p.email}`, p.email) : "",
    p.phone_e164 ? link(`tel:${p.phone_e164}`, p.phone_e164) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(title)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(kind)}${p.city ? ` · ${esc(p.city)}` : ""}
          </div>
        </div>
      </div>
      ${rows}
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
