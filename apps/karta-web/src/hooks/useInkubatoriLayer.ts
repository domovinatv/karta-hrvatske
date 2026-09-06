import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { InkubatorCollection, InkubatorProperties } from "@/lib/types";
import { svgArrowUpRight } from "@/lib/svgIcons";

// Inkubatori, akceleratori i tehnološki parkovi — uži izbor iz JRPI-ja
// (Jedinstveni registar poduzetničke infrastrukture, Ministarstvo
// gospodarstva). Podatke gradi `apps/data-pipeline/scripts/29_fetch_ppi.py`,
// status po OIB-u dodaje `30_enrich_ppi_fina.py`.
//
// 82 subjekta — najmanji podatkovni sloj na karti, pa nema ni klasteriranja
// ni `minzoom`. Prva verzija je imala `minzoom: 6`, a zadani pogled na
// Hrvatsku stoji na zoomu 5.93: sloj se palio i nije se vidjelo NIŠTA, bez
// ijedne greške u konzoli. Uhvaćeno e2e testom.

const BOJE: Record<number, string> = {
  5: "#0ea5e9",   // Digitalni inovacijski centar (zasad bez ijednog zapisa)
  7: "#0891b2",   // Poduzetnički inkubator
  8: "#7c3aed",   // Inkubator za nove tehnologije
  9: "#db2777",   // Poduzetnički akcelerator
  11: "#ea580c",  // Znanstveno-tehnologijski park
  12: "#16a34a",  // Centar kompetencije
};

// MapLibre `match`: [ulaz, vrijednost1, izlaz1, …, fallback]
const COLOR_EXPR = [
  "match",
  ["get", "vrsta_primarna"],
  ...Object.entries(BOJE).flatMap(([k, c]) => [Number(k), c]),
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

// Točka koja stoji na težištu naselja umjesto na adresi crta se prigušeno —
// vizualno priznanje da lokacija nije precizna. Trenutno je takvih nula (svih
// 82 su geokodirane na kućni broj ili ručno provjerene), ali pravilo ostaje
// jer sljedeće osvježenje registra može donijeti adresu koju DGU ne razriješi.
const OPACITY_EXPR = [
  "case",
  ["==", ["get", "geo_source"], "naselje"],
  0.4,
  0.92,
];

// Subjekt koji prema FINA-i više ne posluje. `fina_aktivan` je null kad ga u
// info.BIZ-u nema — tada NEMA prstena, jer nepoznato nije isto što i mrtvo.
const MRTAV_FILTER = ["==", ["get", "fina_aktivan"], false];

const SRC = "hr-inkubatori";
const CIRCLE = "hr-inkubatori-circle";
const RING = "hr-inkubatori-ring";
const RING_BG = "hr-inkubatori-ring-bg";

export function useInkubatoriLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showInkubatori } = useMapState();
  const [data, setData] = useState<InkubatorCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // ── Lazy fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showInkubatori || data || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/inkubatori.geojson"))
      .then((r) => r.json())
      .then((fc: InkubatorCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setData(fc);
      })
      .catch((e) => console.error("Inkubatori fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showInkubatori, data]);

  // ── Izgradnja sloja ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !loaded || !data) return;
    if (map.getSource(SRC)) return;
    map.addSource(SRC, { type: "geojson", data });

    // Dva prstena: bijela podloga pa crveni. Ispod je JLS ispuna proizvoljne
    // boje — jednobojni prsten se u nekoj županiji ili temi uvijek stopi s
    // podlogom. Isti razlog kao u useZupeLayer / useOouLayer.
    for (const [id, color, width] of [
      [RING_BG, "#ffffff", 3.4],
      [RING, "#ef4444", 1.8],
    ] as const) {
      map.addLayer({
        id,
        type: "circle",
        source: SRC,
        filter: MRTAV_FILTER as never,
        layout: { visibility: showInkubatori ? "visible" : "none" },
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": RADIUS_EXPR as never,
          "circle-stroke-color": color,
          "circle-stroke-width": width,
          "circle-stroke-opacity": 0.9,
        },
      });
    }

    map.addLayer({
      id: CIRCLE,
      type: "circle",
      source: SRC,
      layout: { visibility: showInkubatori ? "visible" : "none" },
      paint: {
        "circle-color": COLOR_EXPR as never,
        "circle-radius": RADIUS_EXPR as never,
        "circle-opacity": OPACITY_EXPR as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.4,
          1.1,
        ],
        "circle-stroke-opacity": 0.9,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, data]);

  // ── Vidljivost ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    for (const id of [RING_BG, RING, CIRCLE]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showInkubatori ? "visible" : "none");
      }
    }
    if (!showInkubatori && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showInkubatori, styleRev]);

  // ── Interakcija ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map?.getLayer(CIRCLE) || !data) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: SRC, id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: SRC, id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: "340px" })
        .setLngLat(coords)
        .setHTML(popupHtml(normalize(f.properties as Record<string, unknown>)))
        .addTo(map);
    };

    map.on("mousemove", CIRCLE, onMove);
    map.on("mouseleave", CIRCLE, onLeave);
    map.on("click", CIRCLE, onClick);
    return () => {
      map.off("mousemove", CIRCLE, onMove);
      map.off("mouseleave", CIRCLE, onLeave);
      map.off("click", CIRCLE, onClick);
    };
  }, [map, styleRev, data]);
}

/**
 * MapLibre serijalizira ugniježđene vrijednosti u JSON STRING kad feature
 * prođe kroz vector-tile sloj izraza. `vrste`, `emails`, `telefoni` i
 * `kontakt_osobe` tako u handleru stignu kao `'[{"id":7,…}]'`, ne kao polje,
 * i `.map` na njima puca. Parsiranje je jeftinije nego ravnanje sheme.
 */
function normalize(raw: Record<string, unknown>): InkubatorProperties {
  const p = { ...raw } as Record<string, unknown>;
  for (const k of ["vrste", "emails", "telefoni", "kontakt_osobe", "jrpi_unit_ids"]) {
    if (typeof p[k] === "string") {
      try {
        p[k] = JSON.parse(p[k] as string);
      } catch {
        p[k] = [];
      }
    }
  }
  return p as unknown as InkubatorProperties;
}

function popupHtml(p: InkubatorProperties): string {
  const color = BOJE[p.vrsta_primarna] ?? "#64748b";
  const vrste = (p.vrste ?? []).map((v) => v.naziv).join(" · ") || p.vrsta_primarna_naziv;

  // Upozorenje ide na VRH, prije svega ostalog: podatak da inkubator više ne
  // posluje mijenja značenje cijele kartice, pa ga se ne smije zakopati.
  const mrtav =
    p.fina_aktivan === false
      ? `<div class="club-row" style="border-top:0;color:#ef4444">
           <span class="k">Status</span>
           <span class="v">${esc(p.fina_status ?? "ne posluje")} (FINA)</span>
         </div>`
      : "";

  // Pravni naziv se navodi samo kad je DRUGI od brenda — inače popup dvaput
  // piše isto ime.
  const pravni =
    p.naziv && p.naziv !== p.brand ? row("Pravni naziv", p.naziv) : "";

  const rows = [
    mrtav,
    pravni,
    row("Adresa", p.adresa),
    row("Županija", p.zupanija),
    row("Osnivač", p.osnivac),
    row("Osnovan", p.godina_osnivanja),
    row("OIB", p.oib),
    row("Veličina", p.fina_velicina),
    row("Zaposlenih", p.fina_zaposleni),
    row(
      "Prostor za poduzetnike",
      p.povrsina_poduzetnici_m2 ? `${p.povrsina_poduzetnici_m2} m²` : null,
    ),
    row("Kontakt", (p.kontakt_osobe ?? []).slice(0, 2).join(", ")),
    row("Lokacija", GEO_LABEL[p.geo_source ?? ""] ?? null),
  ].join("");

  const links = [
    p.website ? link(p.website, "Web") : "",
    (p.emails ?? [])[0] ? link(`mailto:${(p.emails ?? [])[0]}`, "E-pošta") : "",
    (p.telefoni ?? [])[0] ? link(`tel:${(p.telefoni ?? [])[0]}`, (p.telefoni ?? [])[0]) : "",
    p.fina_url ? link(p.fina_url, "FINA") : "",
    p.oib ? link(`https://sudreg.pravosudje.hr/registar/f?p=150:28:::NO:28:P28_SBT_MBS:${p.oib}`, "Sudski registar") : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(p.brand)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(vrste)}
          </div>
        </div>
      </div>
      ${rows}
      ${links ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${links}</div>` : ""}
    </div>`;
}

const GEO_LABEL: Record<string, string> = {
  "dgu-adresa": "adresna točka (DGU, Registar prostornih jedinica)",
  "dgu-ulica-fuzzy": "adresna točka, ulica spojena približno (DGU)",
  rucno: "ručno provjerena koordinata",
  naselje: "težište naselja — točnost razine mjesta, ne adrese",
};

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
