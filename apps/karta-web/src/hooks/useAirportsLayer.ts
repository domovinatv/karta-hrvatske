import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type {
  AirportCollection,
  AirportProperties,
  ApproachCollection,
  RunwayCollection,
} from "@/lib/types";

// Combined HR airports + runway lines + approach corridors.
//
// Visualization choices:
// - Airport: navy plane glyph at centroid + ICAO label
// - Runway: thick neutral line tracing the actual asphalt
// - Approach corridor: gradient line (yellow at ground → blue at altitude)
//   computed from the runway endpoints. Aircraft approach from far end
//   descending; the gradient is the visual altitude profile (3° glide,
//   15 km long, ~785 m AGL at the far end).
//
// Same lazy-fetch + idempotent layer-add patterns as the other OSM layers
// (see lessons-react-layer-hooks).
export function useAirportsLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showAirports } = useMapState();
  const [airports, setAirports] = useState<AirportCollection | null>(null);
  const [runways, setRunways] = useState<RunwayCollection | null>(null);
  const [approaches, setApproaches] = useState<ApproachCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!showAirports || airports || loadingRef.current) return;
    loadingRef.current = true;
    Promise.all([
      fetch(v("/data/airports.geojson")).then((r) => r.json()),
      fetch(v("/data/runways.geojson")).then((r) => r.json()),
      fetch(v("/data/approaches.geojson")).then((r) => r.json()),
    ])
      .then(([ap, rw, app]: [AirportCollection, RunwayCollection, ApproachCollection]) => {
        setAirports(ap);
        setRunways(rw);
        setApproaches(app);
      })
      .catch((e) => console.error("Airports fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showAirports, airports]);

  useEffect(() => {
    if (!map || !loaded || !airports || !runways || !approaches) return;
    if (map.getSource("hr-airports")) return;

    map.addSource("hr-airports", { type: "geojson", data: airports });
    map.addSource("hr-runways", { type: "geojson", data: runways });
    // line-gradient requires lineMetrics: true on the source so MapLibre
    // computes the 0-1 progress along each LineString for the gradient
    // expression to interpolate against.
    map.addSource("hr-approaches", {
      type: "geojson",
      data: approaches,
      lineMetrics: true,
    });

    // Approach corridors render UNDER runways + airport markers. Width
    // tapers from runway end (visible) to far point (thin).
    map.addLayer({
      id: "hr-approaches-line",
      type: "line",
      source: "hr-approaches",
      layout: { visibility: showAirports ? "visible" : "none" },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0, 5,
          1, 1.2,
        ] as never,
        // Altitude gradient: 0 (ground) yellow → 1 (~785 m AGL) deep blue.
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0, "#fde047",   // ground, warm yellow
          0.25, "#fb923c", // ~200 m
          0.5, "#dc2626",  // ~390 m
          0.75, "#7c3aed", // ~590 m
          1, "#1e40af",   // ~785 m, deep blue
        ] as never,
        "line-opacity": 0.85,
      },
    });

    map.addLayer({
      id: "hr-runways-line",
      type: "line",
      source: "hr-runways",
      layout: { visibility: showAirports ? "visible" : "none" },
      paint: {
        "line-color": "#1f2937",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, 1,
          10, 3,
          14, 6,
        ] as never,
        "line-opacity": 0.85,
      },
    });

    map.addLayer({
      id: "hr-airports-circle",
      type: "circle",
      source: "hr-airports",
      layout: { visibility: showAirports ? "visible" : "none" },
      paint: {
        "circle-color": "#002F6C",
        // MapLibre allows only one zoom-interpolate per paint property,
        // so we drive the radius purely by zoom and let icao-less airports
        // share the same scale — visually fine; ICAO airports stand out
        // anyway because they have a label rendered next to them.
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, 3,
          10, 6,
          14, 10,
        ] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9,
      },
    });

    map.addLayer({
      id: "hr-airports-label",
      type: "symbol",
      source: "hr-airports",
      minzoom: 7,
      layout: {
        visibility: showAirports ? "visible" : "none",
        "text-field": [
          "coalesce",
          ["get", "icao"],
          ["get", "name"],
        ] as never,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10, 12, 14] as never,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#001a40",
        "text-halo-color": "rgba(255,255,255,0.95)",
        "text-halo-width": 2,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, airports, runways, approaches]);

  useEffect(() => {
    if (!map) return;
    const vis = showAirports ? "visible" : "none";
    for (const id of [
      "hr-approaches-line",
      "hr-runways-line",
      "hr-airports-circle",
      "hr-airports-label",
    ]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
    }
    if (!showAirports && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showAirports, styleRev]);

  // Airport popup — basic name/ICAO/IATA + runway count.
  useEffect(() => {
    if (!map?.getLayer("hr-airports-circle") || !airports || !runways) return;
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as AirportProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      const codeLine =
        [p.icao, p.iata].filter(Boolean).join(" / ") || "OSM aerodrome";
      const html = `
        <div class="club-popup">
          <div class="club-head">
            <div class="club-title">
              <div class="club-name">${esc(p.name || codeLine)}</div>
              <div class="club-league" style="border-left:3px solid #002F6C;padding-left:6px;">${esc(codeLine)}</div>
            </div>
          </div>
          ${p.aerodrome_type ? `<div class="club-row"><span class="k">Tip</span><span class="v">${esc(p.aerodrome_type)}</span></div>` : ""}
          <div class="club-row"><span class="k">OSM</span><span class="v"><a href="https://www.openstreetmap.org/${esc(p.osm_type)}/${p.osm_id}" target="_blank" rel="noopener">vidi u OSM-u →</a></span></div>
        </div>`;
      popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: "300px" })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    };
    map.on("click", "hr-airports-circle", onClick);
    return () => {
      map.off("click", "hr-airports-circle", onClick);
    };
  }, [map, styleRev, airports, runways]);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
