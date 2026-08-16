import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { ZupaCollection, ZupaProperties } from "@/lib/types";

// Župe i ostale vjerske PRAVNE OSOBE (~2900 u HR) — sestrinski sloj uz
// useCrkveLayer, ali drugi skup: ⛪ Crkve su građevine, 🏛 Župe su pravni
// subjekti iz državne evidencije (OIB, evidencijski broj, sjedište).
// Podatke generira ../../crkve.domovina.ai (`make export` → `make sync-karta`
// upiše public/data/zupe.geojson).
//
// PAŽNJA: `Zup*` drugdje u ovom repou znači ŽUPANIJA (showZupBorders,
// activeZup, ZupList). Ovdje `Zupe` = župe.
//
// Zašto sloj uopće postoji, kad su župne crkve već u sloju Crkve: 489 od 1563
// župe NEMA spojenu župnu crkvu (422 nemaju spojenu nijednu građevinu). Te
// župe su nevidljive u sloju Crkve jer za njih građevine u katalogu nema —
// a upravo su one ono što na karti treba vidjeti. Zato ih sloj crta prstenom.
//
// Isti in-flight + idempotency obrasci kao useCrkveLayer/useClubsLayer —
// učitavanje živi u refu, ne u stateu.

const KIND_COLORS: Record<string, string> = {
  biskupija: "#b45309",
  provincija: "#a16207",
  zupa: "#f59e0b",
  samostan: "#7c3aed",
  svetiste: "#ea580c",
  eparhija: "#0e7490",
  parohija: "#0891b2",
  "crkvena-opcina": "#14b8a6",
  dzemat: "#059669",
  caritas: "#e11d48",
  ostalo: "#64748b",
};

const COLOR_EXPR = [
  "match",
  ["get", "kind"],
  ...Object.entries(KIND_COLORS).flatMap(([k, c]) => [k, c]),
  "#64748b",
];

// (Nad)biskupije, eparhije i provincije su desetak zapisa i nadređene su
// svemu ostalom — vide se ranije i veće, kao orijentiri. Župa je osnovna
// jedinica i dobiva vidljivost tek od zoom 8.
const MAJOR = ["literal", ["biskupija", "eparhija", "provincija"]];
const isMajor = ["in", ["get", "kind"], MAJOR];

const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  6, ["case", isMajor, 5, 0],
  8, ["case", isMajor, 6, 2.5],
  12, ["case", isMajor, 9, 5],
  15, ["case", isMajor, 12, 8],
];

// Župa bez spojene župne crkve — rupa u katalogu, ne svojstvo župe. Crta se
// kao prsten ISPOD točke (sloj dodan prvi), pa točka sjedne u njega.
//
// `church_slug` izostaje kad matcher nije našao župnu crkvu; `["!", ["has",
// …]]` je jedini pouzdan test jer export izostavlja prazna polja.
const GAP_FILTER = [
  "all",
  ["==", ["get", "kind"], "zupa"],
  ["!", ["has", "church_slug"]],
];

const GAP_RADIUS = [
  "interpolate",
  ["linear"],
  ["zoom"],
  7, 5,
  12, 11,
  15, 17,
];

// Prsten ide u DVA sloja: bijela podloga pa ružičasti prsten na njoj. Ispod
// prstena je ispuna JLS-a, a ona je proizvoljne boje (21 županija × dvije
// teme) — svaka pojedinačna boja prstena negdje se stopi s podlogom. Izmjereno
// na Gradu Zagrebu: sam #f43f5e nestaje na svijetloj temi (ružičasta ispuna) i
// gubi se na tamnoj (bordo ispuna). Bijela podloga je isti trik kojim se drže
// same točke (`circle-stroke-color: #ffffff`).

export function useZupeLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showZupe } = useMapState();
  const [zupe, setZupe] = useState<ZupaCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!showZupe || zupe || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/zupe.geojson"))
      .then((r) => r.json())
      .then((fc: ZupaCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setZupe(fc);
      })
      .catch((e) => console.error("Zupe fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showZupe, zupe]);

  useEffect(() => {
    if (!map || !loaded || !zupe) return;
    if (map.getSource("hr-zupe")) return;
    map.addSource("hr-zupe", { type: "geojson", data: zupe });

    map.addLayer({
      id: "hr-zupe-gap-halo",
      type: "circle",
      source: "hr-zupe",
      minzoom: 7,
      filter: GAP_FILTER as never,
      layout: { visibility: showZupe ? "visible" : "none" },
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": GAP_RADIUS as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 3.6,
        "circle-stroke-opacity": 0.65,
      },
    });

    map.addLayer({
      id: "hr-zupe-gap",
      type: "circle",
      source: "hr-zupe",
      minzoom: 7,
      filter: GAP_FILTER as never,
      layout: { visibility: showZupe ? "visible" : "none" },
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": GAP_RADIUS as never,
        "circle-stroke-color": "#e11d48",
        "circle-stroke-width": 1.8,
        "circle-stroke-opacity": 1,
      },
    });

    map.addLayer({
      id: "hr-zupe-circle",
      type: "circle",
      source: "hr-zupe",
      minzoom: 6,
      layout: { visibility: showZupe ? "visible" : "none" },
      paint: {
        "circle-color": COLOR_EXPR as never,
        "circle-radius": RADIUS_EXPR as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.0,
          0.8,
        ],
        "circle-opacity": 0.92,
        "circle-stroke-opacity": 0.9,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, zupe]);

  useEffect(() => {
    if (!map?.getLayer("hr-zupe-circle")) return;
    for (const id of ["hr-zupe-gap-halo", "hr-zupe-gap", "hr-zupe-circle"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showZupe ? "visible" : "none");
      }
    }
    if (!showZupe && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showZupe, styleRev]);

  useEffect(() => {
    if (!map?.getLayer("hr-zupe-circle") || !zupe) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr-zupe", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr-zupe", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-zupe", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as ZupaProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ offset: 10, maxWidth: "320px" })
        .setLngLat(coords)
        .setHTML(popupHtml(p))
        .addTo(map);
    };

    map.on("mousemove", "hr-zupe-circle", onMove);
    map.on("mouseleave", "hr-zupe-circle", onLeave);
    map.on("click", "hr-zupe-circle", onClick);
    return () => {
      map.off("mousemove", "hr-zupe-circle", onMove);
      map.off("mouseleave", "hr-zupe-circle", onLeave);
      map.off("click", "hr-zupe-circle", onClick);
    };
  }, [map, styleRev, zupe]);
}

const KIND_LABEL: Record<string, string> = {
  zupa: "Župa",
  samostan: "Samostan",
  "crkvena-opcina": "Crkvena općina",
  provincija: "Provincija / red",
  biskupija: "(Nad)biskupija",
  eparhija: "Eparhija",
  parohija: "Parohija",
  dzemat: "Džemat",
  caritas: "Caritas",
  svetiste: "Svetište",
  ostalo: "Vjerska pravna osoba",
};

// Koliko je pouzdana točka na koju je marker stavljen. Bez ovoga korisnik ne
// može razlikovati sjedište pogođeno na metar od težišta cijelog naselja.
const GEOCODE_LABEL: Record<string, string> = {
  church: "koordinate spojene crkve",
  places: "Google Places",
  "naselje-centroid": "težište naselja (~razina mjesta)",
  nominatim: "Nominatim",
};

function popupHtml(p: ZupaProperties): string {
  const kind = KIND_LABEL[p.kind] ?? "Vjerska pravna osoba";
  const color = KIND_COLORS[p.kind] ?? "#64748b";
  const title = p.short_name || p.name;
  const sub = [p.diocese, p.community].filter(Boolean).join(" · ");

  const church = p.church_name
    ? `${esc(p.church_name)}${p.church_verified ? ' <span title="Google Places nezavisno potvrdio ovaj match" style="opacity:.7">✓</span>' : ""}`
    : `<span style="color:#f43f5e">nije spojena</span>`;

  const rows = [
    row("Titular", p.titular),
    row("Sjedište", [p.address, p.city].filter(Boolean).join(", ")),
    row("Županija", p.county),
    row("Služba", p.leader_title),
    row("OIB", p.oib),
    row("Evidencijski br.", p.registry_no),
    rowHtml("Župna crkva", church),
    p.church_count > 0 ? row("Građevina u katalogu", p.church_count) : "",
    row("Točnost lokacije", p.geocode_source ? GEOCODE_LABEL[p.geocode_source] : null),
  ].join("");

  const links = [
    p.website ? link(p.website, "Web") : "",
    p.phone ? link(`tel:${p.phone.replace(/\s/g, "")}`, p.phone) : "",
    p.google_maps_uri ? link(p.google_maps_uri, "Google karta") : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(title)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(kind)}${sub ? ` · ${esc(sub)}` : ""}
          </div>
        </div>
      </div>
      ${rows}
      ${links ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">${links}</div>` : ""}
    </div>`;
}

function row(k: string, val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "";
  return rowHtml(k, esc(String(val)));
}

/** Isto što i row(), ali vrijednost je već escapean HTML. */
function rowHtml(k: string, html: string): string {
  return `<div class="club-row"><span class="k">${esc(k)}</span><span class="v">${html}</span></div>`;
}

function link(href: string, label: string): string {
  return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
     style="font-size:11px;text-decoration:underline;opacity:.85">${esc(label)} ↗</a>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
