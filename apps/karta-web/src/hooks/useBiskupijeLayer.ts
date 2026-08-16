import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { BiskupijaCollection, BiskupijaProperties } from "@/lib/types";

// Teritoriji 15 latinskih (nad)biskupija — jedini POLIGONSKI sloj iz
// ../../../crkve.domovina.ai i jedini sloj na ovoj karti koji je DERIVIRAN,
// a ne preslikan iz izvora.
//
// Granice biskupija u Hrvatskoj ne postoje kao javna geometrija: OSM ih ima 3
// od 15, Wikidata nijednu. Ovdje su izračunate iz sjedišta 1526 župa preko
// granica naselja (DGU) i izmjerene o one 3 koje u OSM-u postoje — slaganje
// 96,6–98,6 % naselja, IoU 0,92–0,98. Ta brojka putuje uz svaki feature
// (`osm_agreement`) i piše u popupu; sloj ne smije tvrditi preciznost koju
// nema.
//
// Križevačka eparhija (grkokatolička) NIJE ovdje — preklapa se sa svima i u
// particiji bi otela teritorij susjedima. Vidi src/dioceses.py u tom repou.

const DIOCESE_COLORS: Record<string, string> = {
  "zagrebacka-nadbiskupija": "#ef4444",
  "varazdinska-biskupija": "#f97316",
  "bjelovarsko-krizevacka-biskupija": "#eab308",
  "dakovacko-osjecka-nadbiskupija": "#22c55e",
  "pozeska-biskupija": "#14b8a6",
  "sisacka-biskupija": "#3b82f6",
  "gospicko-senjska-biskupija": "#8b5cf6",
  "rijecka-nadbiskupija": "#ec4899",
  "biskupija-porecka-i-pulska": "#06b6d4",
  "biskupija-krk": "#84cc16",
  "zadarska-nadbiskupija": "#f59e0b",
  "sibenska-biskupija": "#f43f5e",
  "splitsko-makarska-nadbiskupija": "#0ea5e9",
  "hvarska-biskupija": "#10b981",
  "dubrovacka-biskupija-dioecesis-ragusina": "#d946ef",
};

const COLOR_EXPR = [
  "match",
  ["get", "slug"],
  ...Object.entries(DIOCESE_COLORS).flatMap(([k, c]) => [k, c]),
  "#64748b",
];

export function useBiskupijeLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showBiskupije, theme } = useMapState();
  const dark = theme === "dark";
  const [areas, setAreas] = useState<BiskupijaCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!showBiskupije || areas || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/biskupije.geojson"))
      .then((r) => r.json())
      .then((fc: BiskupijaCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setAreas(fc);
      })
      .catch((e) => console.error("Biskupije fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showBiskupije, areas]);

  useEffect(() => {
    if (!map || !loaded || !areas) return;
    if (map.getSource("hr-biskupije")) return;
    map.addSource("hr-biskupije", { type: "geojson", data: areas });

    // Ispuna ide IZNAD JLS ispune ali ISPOD njezinih granica i labela
    // (`beforeId: "hr-line"`), pa se teritorij vidi a karta ispod ostane
    // čitljiva. Granica i labela idu navrh — one nose poruku sloja.
    const beforeId = map.getLayer("hr-line") ? "hr-line" : undefined;
    map.addLayer({
      id: "hr-biskupije-fill",
      type: "fill",
      source: "hr-biskupije",
      layout: { visibility: showBiskupije ? "visible" : "none" },
      paint: {
        "fill-color": COLOR_EXPR as never,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.5,
          0.3,
        ] as never,
      },
    }, beforeId);

    map.addLayer({
      id: "hr-biskupije-line",
      type: "line",
      source: "hr-biskupije",
      layout: { visibility: showBiskupije ? "visible" : "none" },
      paint: {
        "line-color": COLOR_EXPR as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.6, 10, 3, 14, 4.5] as never,
        "line-opacity": 0.95,
      },
    });

    map.addLayer({
      id: "hr-biskupije-label",
      type: "symbol",
      source: "hr-biskupije",
      minzoom: 7,
      layout: {
        "text-field": ["get", "name"],
        // Isti razlog kao u useJlsLayer: cartocdn (dark) nema Bold glyphove,
        // pa Bold u tamnoj temi znači sloj bez ijedne labele.
        "text-font": [dark ? "Noto Sans Regular" : "Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 11, 15],
        "text-max-width": 9,
        "text-allow-overlap": false,
        visibility: showBiskupije ? "visible" : "none",
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#0a0e14",
        "text-halo-color": dark ? "rgba(10,14,20,0.95)" : "rgba(255,255,255,0.95)",
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, areas, dark]);

  useEffect(() => {
    if (!map?.getLayer("hr-biskupije-fill")) return;
    for (const id of ["hr-biskupije-fill", "hr-biskupije-line", "hr-biskupije-label"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showBiskupije ? "visible" : "none");
      }
    }
    if (!showBiskupije && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showBiskupije, styleRev]);

  useEffect(() => {
    if (!map?.getLayer("hr-biskupije-fill") || !areas) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr-biskupije", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr-biskupije", id }, { hover: true });
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-biskupije", id: hovered }, { hover: false });
        hovered = null;
      }
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as BiskupijaProperties;
      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({ offset: 10, maxWidth: "320px" })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml(p))
        .addTo(map);
    };

    map.on("mousemove", "hr-biskupije-fill", onMove);
    map.on("mouseleave", "hr-biskupije-fill", onLeave);
    map.on("click", "hr-biskupije-fill", onClick);
    return () => {
      map.off("mousemove", "hr-biskupije-fill", onMove);
      map.off("mouseleave", "hr-biskupije-fill", onLeave);
      map.off("click", "hr-biskupije-fill", onClick);
    };
  }, [map, styleRev, areas]);
}

const num = (n: number) => n.toLocaleString("hr-HR");

function popupHtml(p: BiskupijaProperties): string {
  const color = DIOCESE_COLORS[p.slug] ?? "#64748b";
  const kind = p.kind === "nadbiskupija" ? "Nadbiskupija" : "Biskupija";

  const rows = [
    row("Sjedište", p.seat),
    row("Površina", p.area_km2 ? `${num(Math.round(p.area_km2))} km²` : null),
    row("Stanovnika", p.population ? num(p.population) : null),
    row("Naselja", p.settlement_count ? num(p.settlement_count) : null),
    row("Župa", p.parish_count),
    row("Crkava u katalogu", p.church_count),
  ].join("");

  // Granica je izračunata, ne preslikana — to mora pisati na samom mjestu
  // gdje korisnik čita brojke, a ne samo u dokumentaciji.
  const note = `Granica je <b>derivirana</b> iz sjedišta župa preko granica naselja
    (DGU) — službene granice biskupija nisu javno dostupne kao geometrija.` +
    (p.osm_agreement
      ? ` Slaganje s granicom u OpenStreetMapu: <b>${p.osm_agreement} %</b> naselja.`
      : ` Za ovu biskupiju u OpenStreetMapu nema granice s kojom bi se usporedila.`);

  return `
    <div class="club-popup">
      <div class="club-head">
        <div class="club-title">
          <div class="club-name">${esc(p.name)}</div>
          <div class="club-league" style="border-left:3px solid ${color};padding-left:6px;">
            ${esc(kind)}
          </div>
        </div>
      </div>
      ${rows}
      <div style="margin-top:6px;font-size:10px;line-height:1.4;opacity:.7">${note}</div>
    </div>`;
}

function row(k: string, val?: string | number | null): string {
  if (val === undefined || val === null || val === "") return "";
  return `<div class="club-row"><span class="k">${esc(k)}</span><span class="v">${esc(String(val))}</span></div>`;
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
