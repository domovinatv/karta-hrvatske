import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { OouCollection, OouProperties } from "@/lib/types";
import { svgArrowUpRight } from "@/lib/svgIcons";

// Odgojno-obrazovne ustanove — škole, vrtići i ustanove kao pravne osobe.
// Podatke generira sestrinski repo ../../oou.domovina.ai (`make all` →
// `make sync-karta` upiše public/data/{skole,vrtici,ustanove}.geojson).
// Izvori: MZO popisi s data.gov.hr + OpenStreetMap + CARNET adresar
// (područne škole) + DGU INSPIRE adrese (geokodiranje).
//
// TRI hooka, JEDAN fajl. Odstupanje od „jedan hook po fajlu" iz ostatka
// repoa je namjerno: slojevi se razlikuju samo u boji, filtru i popupu, a
// dijele ~200 redaka logike (in-flight guard, feature-state hover, popup
// lifecycle, styleRev ponovna izgradnja). Tri kopije toga su tri mjesta na
// kojima isti bug treba popraviti.
//
// Isti in-flight + idempotency obrasci kao useCrkveLayer/useClubsLayer —
// učitavanje živi u refu, ne u stateu.

const KIND_COLORS: Record<string, string> = {
  "osnovna-skola": "#2563eb",
  "srednja-skola": "#7c3aed",
  "glazbena-skola": "#db2777",
  "posebna-ustanova": "#ea580c",
  "ucenicki-dom": "#0891b2",
  "skola-nepoznata-razina": "#64748b",
  vrtic: "#16a34a",
  "predskolski-program": "#94a3b8",
};

const KIND_LABEL: Record<string, string> = {
  "osnovna-skola": "Osnovna škola",
  "srednja-skola": "Srednja škola",
  "glazbena-skola": "Glazbena / umjetnička škola",
  "posebna-ustanova": "Centar za odgoj i obrazovanje",
  "ucenicki-dom": "Učenički dom",
  "skola-nepoznata-razina": "Škola",
  vrtic: "Dječji vrtić",
  "predskolski-program": "Program predškole",
};

const FACILITY_LABEL: Record<string, string> = {
  maticna: "matična zgrada",
  podrucna: "područna škola",
  objekt: "objekt vrtića",
  dom: "dom",
};

const PROGRAM_LABEL: Record<string, string> = {
  gimnazija: "gimnazija",
  strukovna: "strukovni programi",
  umjetnicka: "umjetnički programi",
  mjesovita: "gimnazija i strukovni programi",
};

// Kako je koordinata dobivena. Prikazuje se u popupu jer razlika između
// „tlocrt zgrade iz OSM-a" i „težište naselja" iznosi i par kilometara, a na
// karti obje točke izgledaju jednako uvjerljivo.
const GEO_LABEL: Record<string, string> = {
  osm: "tlocrt zgrade (OpenStreetMap)",
  facility: "tlocrt zgrade (OpenStreetMap)",
  "dgu-adresa": "adresna točka (DGU, Registar prostornih jedinica)",
  "dgu-ulica-fuzzy": "adresna točka, ulica spojena približno (DGU)",
  naselje: "težište naselja — točnost razine mjesta, ne adrese",
};

// MapLibre `match` izraz: [key, val1, out1, …, fallback]
const COLOR_EXPR = [
  "match",
  ["get", "kind"],
  ...Object.entries(KIND_COLORS).flatMap(([k, c]) => [k, c]),
  "#64748b",
];

// Matične zgrade su veće i vidljive ranije od područnih: na maloj razini
// zumiranja korisnik traži „gdje je škola u ovom mjestu", a ne svaki
// područni odjel.
//
// `["case", ["get", …]]` s BROJEM baca „Expected boolean but found number" i
// obori cijeli sloj bez vidljive greške na karti — zato eksplicitne
// usporedbe koje vraćaju boolean.
const isMaticna = ["==", ["get", "facility_kind"], "maticna"];

const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  7, ["case", isMaticna, 3, 1.5],
  9, ["case", isMaticna, 4, 2.5],
  12, ["case", isMaticna, 7, 5],
  15, ["case", isMaticna, 11, 8],
];

// Točka koja stoji na težištu naselja umjesto na adresi crta se šuplje —
// vizualno priznanje da lokacija nije precizna. Bez toga karta tvrdi
// preciznost koju podatak nema.
const OPACITY_EXPR = [
  "case",
  ["==", ["get", "geo_source"], "naselje"],
  0.35,
  0.9,
];

interface LayerSpec {
  /** Ključ izvora i prefiks sloja u MapLibreu. */
  id: string;
  file: string;
  /** Polje u MapState koje pali sloj. */
  visible: boolean;
  minzoom: number;
  /** Sloj Ustanove crta prsten oko onih bez ijedne mapirane zgrade. */
  ringOnMissingBuilding?: boolean;
}

function useOouSource({
  map,
  loaded,
  styleRev,
  spec,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  spec: LayerSpec;
}) {
  const [data, setData] = useState<OouCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const sourceId = `hr-${spec.id}`;
  const circleId = `${sourceId}-circle`;
  const ringId = `${sourceId}-ring`;

  // ── Lazy fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!spec.visible || data || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v(`/data/${spec.file}`))
      .then((r) => r.json())
      .then((fc: OouCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setData(fc);
      })
      .catch((e) => console.error(`${spec.file} fetch failed`, e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [spec.visible, spec.file, data]);

  // ── Izgradnja sloja ───────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !loaded || !data) return;
    if (map.getSource(sourceId)) return;
    map.addSource(sourceId, { type: "geojson", data });

    if (spec.ringOnMissingBuilding) {
      // Dva sloja: bijela podloga pa obojani prsten. Ispod je JLS ispuna
      // proizvoljne boje — jednobojni prsten se u nekoj županiji ili temi
      // uvijek stopi s podlogom. Isti razlog kao u useZupeLayer.
      map.addLayer({
        id: `${ringId}-bg`,
        type: "circle",
        source: sourceId,
        minzoom: spec.minzoom,
        filter: ["==", ["get", "objekt_count"], 0],
        layout: { visibility: spec.visible ? "visible" : "none" },
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": RADIUS_EXPR as never,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3.2,
          "circle-stroke-opacity": 0.9,
        },
      });
      map.addLayer({
        id: ringId,
        type: "circle",
        source: sourceId,
        minzoom: spec.minzoom,
        filter: ["==", ["get", "objekt_count"], 0],
        layout: { visibility: spec.visible ? "visible" : "none" },
        paint: {
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": RADIUS_EXPR as never,
          "circle-stroke-color": "#ef4444",
          "circle-stroke-width": 1.6,
        },
      });
    }

    map.addLayer({
      id: circleId,
      type: "circle",
      source: sourceId,
      minzoom: spec.minzoom,
      layout: { visibility: spec.visible ? "visible" : "none" },
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
        "circle-opacity": OPACITY_EXPR as never,
        "circle-stroke-opacity": 0.9,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, data]);

  // ── Vidljivost ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    for (const id of [circleId, ringId, `${ringId}-bg`]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", spec.visible ? "visible" : "none");
      }
    }
    if (!spec.visible && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, spec.visible, styleRev]);

  // ── Interakcija ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!map?.getLayer(circleId) || !data) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: sourceId, id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: sourceId, id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: sourceId, id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as OouProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ offset: 10, maxWidth: "340px" })
        .setLngLat(coords)
        .setHTML(popupHtml(p))
        .addTo(map);
    };

    map.on("mousemove", circleId, onMove);
    map.on("mouseleave", circleId, onLeave);
    map.on("click", circleId, onClick);
    return () => {
      map.off("mousemove", circleId, onMove);
      map.off("mouseleave", circleId, onLeave);
      map.off("click", circleId, onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleRev, data]);
}

export function useSkoleLayer(args: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showSkole } = useMapState();
  useOouSource({
    ...args,
    spec: { id: "skole", file: "skole.geojson", visible: showSkole, minzoom: 7 },
  });
}

export function useVrticiLayer(args: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showVrtici } = useMapState();
  useOouSource({
    ...args,
    spec: { id: "vrtici", file: "vrtici.geojson", visible: showVrtici, minzoom: 8 },
  });
}

export function useUstanoveLayer(args: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showUstanove } = useMapState();
  useOouSource({
    ...args,
    spec: {
      id: "ustanove",
      file: "ustanove.geojson",
      visible: showUstanove,
      minzoom: 7,
      ringOnMissingBuilding: true,
    },
  });
}

function popupHtml(p: OouProperties): string {
  const kind = KIND_LABEL[p.kind] ?? "Odgojno-obrazovna ustanova";
  const color = KIND_COLORS[p.kind] ?? "#64748b";
  const sub = [
    p.program ? PROGRAM_LABEL[p.program] ?? p.program : null,
    p.facility_kind && p.facility_kind !== "maticna"
      ? FACILITY_LABEL[p.facility_kind] ?? p.facility_kind
      : null,
    p.operator_type && p.operator_type !== "javna" ? p.operator_type : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows = [
    row("Adresa", p.address),
    row("Mjesto", [p.settlement, p.municipality].filter(Boolean).join(", ")),
    row("Županija", p.county),
    // Ustanova se navodi samo kad je to DRUGI naziv od naziva točke — inače
    // popup dvaput piše isto (matična zgrada nosi naziv svoje ustanove).
    p.ustanova && p.ustanova !== p.name ? row("Ustanova", p.ustanova) : "",
    row("Osnivač", p.founder),
    row("Šifra ustanove", p.mzo_code),
    row("Kapacitet", p.capacity),
    p.objekt_count === 0 ? row("Zgrada", "nije mapirana u OpenStreetMapu") : "",
    row("Lokacija", p.geo_source ? GEO_LABEL[p.geo_source] ?? p.geo_source : null),
  ].join("");

  const links = [
    p.website ? link(p.website, "Web") : "",
    p.email ? link(`mailto:${p.email}`, "E-pošta") : "",
    p.phone ? link(`tel:${p.phone}`, p.phone) : "",
    p.osm_id ? link(`https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`, "OSM") : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(p.name)}</div>
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
