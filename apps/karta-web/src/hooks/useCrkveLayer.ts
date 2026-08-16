import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { CrkvaCollection, CrkvaProperties } from "@/lib/types";
import { svgArrowUpRight } from "@/lib/svgIcons";

// Crkve i sakralni objekti (~6900 u HR). Podatke generira sestrinski repo
// ../../crkve.domovina.ai (`make all` → `make sync-karta` upiše
// public/data/crkve.geojson). Izvori: OSM + data.gov.hr (evidencija župa,
// Registar kulturnih dobara) + Wikidata.
//
// Boja po tipu, ne po konfesiji: tip je ono što se traži na karti ("gdje je
// najbliža kapela"), a konfesija je u popupu. Pilovi/poklonci (~900) su
// vizualno najtiši jer su najbrojniji a najmanje traženi.
//
// Isti in-flight + idempotency obrasci kao useClubsLayer/usePitchesLayer —
// učitavanje živi u refu, ne u stateu (vidi memory lessons-react-layer-hooks).

const KIND_COLORS: Record<string, string> = {
  katedrala: "#b91c1c",
  bazilika: "#dc2626",
  svetiste: "#ea580c",
  samostan: "#7c3aed",
  crkva: "#a855f7",
  kapela: "#c084fc",
  "pravoslavna-crkva": "#0891b2",
  dzamija: "#059669",
  sinagoga: "#2563eb",
  poklonac: "#94a3b8",
  ostalo: "#64748b",
};

// MapLibre `match` izraz: [key, val1, out1, val2, out2, …, fallback]
const COLOR_EXPR = [
  "match",
  ["get", "kind"],
  ...Object.entries(KIND_COLORS).flatMap(([k, c]) => [k, c]),
  "#64748b",
];

// Katedrale/bazilike/svetišta su rijetka i važna — veći radijus i vidljivi
// ranije od kapelica, da se na maloj razini zumiranja vide orijentiri.
//
// `is_parish_church` je u GeoJSON-u broj (0/1), a MapLibre `case` traži
// BOOLEAN — `["case", ["get", …]]` s brojem baca "Expected boolean but found
// number" i obori cijeli sloj bez vidljive greške na karti. Zato eksplicitni
// `["==", …, 1]`.
const MAJOR = ["literal", ["katedrala", "bazilika", "svetiste"]];
const isMajor = ["in", ["get", "kind"], MAJOR];
const isParish = ["==", ["get", "is_parish_church"], 1];

const RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  7, ["case", isMajor, 4, 1.5],
  9, ["case", isParish, 3.5, 2],
  12, ["case", isParish, 6, 4],
  15, ["case", isParish, 10, 7],
];

export function useCrkveLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showCrkve } = useMapState();
  const [crkve, setCrkve] = useState<CrkvaCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!showCrkve || crkve || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/crkve.geojson"))
      .then((r) => r.json())
      .then((fc: CrkvaCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setCrkve(fc);
      })
      .catch((e) => console.error("Crkve fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showCrkve, crkve]);

  useEffect(() => {
    if (!map || !loaded || !crkve) return;
    if (map.getSource("hr-crkve")) return;
    map.addSource("hr-crkve", { type: "geojson", data: crkve });
    map.addLayer({
      id: "hr-crkve-circle",
      type: "circle",
      source: "hr-crkve",
      minzoom: 7,
      layout: { visibility: showCrkve ? "visible" : "none" },
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
        "circle-opacity": 0.9,
        "circle-stroke-opacity": 0.9,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, crkve]);

  useEffect(() => {
    if (!map?.getLayer("hr-crkve-circle")) return;
    map.setLayoutProperty("hr-crkve-circle", "visibility", showCrkve ? "visible" : "none");
    if (!showCrkve && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showCrkve, styleRev]);

  useEffect(() => {
    if (!map?.getLayer("hr-crkve-circle") || !crkve) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr-crkve", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr-crkve", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-crkve", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as CrkvaProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ offset: 10, maxWidth: "320px" })
        .setLngLat(coords)
        .setHTML(popupHtml(p))
        .addTo(map);
    };

    map.on("mousemove", "hr-crkve-circle", onMove);
    map.on("mouseleave", "hr-crkve-circle", onLeave);
    map.on("click", "hr-crkve-circle", onClick);
    return () => {
      map.off("mousemove", "hr-crkve-circle", onMove);
      map.off("mouseleave", "hr-crkve-circle", onLeave);
      map.off("click", "hr-crkve-circle", onClick);
    };
  }, [map, styleRev, crkve]);
}

const KIND_LABEL: Record<string, string> = {
  katedrala: "Katedrala",
  bazilika: "Bazilika",
  svetiste: "Svetište",
  samostan: "Samostan",
  crkva: "Crkva",
  kapela: "Kapela",
  "pravoslavna-crkva": "Pravoslavna crkva",
  dzamija: "Džamija",
  sinagoga: "Sinagoga",
  poklonac: "Poklonac / pil",
  ostalo: "Sakralni objekt",
};

const DENOM_LABEL: Record<string, string> = {
  roman_catholic: "rimokatolička",
  catholic: "katolička",
  greek_catholic: "grkokatolička",
  serbian_orthodox: "srpska pravoslavna",
  orthodox: "pravoslavna",
  evangelical: "evangelička",
  reformed: "reformirana",
  baptist: "baptistička",
  adventist: "adventistička",
  sunni: "sunitska",
  jewish: "židovska",
};

function popupHtml(p: CrkvaProperties): string {
  const kind = KIND_LABEL[p.kind] ?? "Sakralni objekt";
  const color = KIND_COLORS[p.kind] ?? "#64748b";
  const sub = [
    p.is_parish_church ? "župna crkva" : null,
    p.denomination ? DENOM_LABEL[p.denomination] ?? p.denomination.replace(/_/g, " ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows = [
    row("Titular", p.titular),
    row("Mjesto", [p.settlement, p.municipality].filter(Boolean).join(", ")),
    row("Županija", p.county),
    row("Župa", p.parish_name),
    row("Biskupija", p.diocese),
    row("Sagrađena", p.year_built),
    row("Arhitekt", p.architect),
    p.heritage_id
      ? row("Zaštita", `${p.heritage_id}${p.heritage_status ? ` — ${p.heritage_status}` : ""}`)
      : "",
  ].join("");

  const links = [
    p.website ? link(p.website, "Web") : "",
    p.wikipedia_url ? link(p.wikipedia_url, "Wikipedija") : "",
    p.osm_id ? link(`https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`, "OSM") : "",
  ]
    .filter(Boolean)
    .join(" ");

  const img = p.commons_image
    ? `<img src="${esc(p.commons_image)}" alt="" loading="lazy"
         style="width:100%;height:110px;object-fit:cover;border-radius:6px;margin-bottom:6px" />`
    : "";

  return `
    <div class="club-popup">
      ${img}
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
