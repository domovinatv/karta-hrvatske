import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { StadiumCollection, StadiumProperties } from "@/lib/types";

// Stadiums (OSM `leisure=stadium`). ~450 features. Rendered as larger
// navy markers since stadiums are sparser than pitches and worth visual
// emphasis. Popup shows name + capacity.
export function useStadiumsLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showStadiums } = useMapState();
  const [stadiums, setStadiums] = useState<StadiumCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!showStadiums || stadiums || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/stadiums.geojson"))
      .then((r) => r.json())
      .then((fc: StadiumCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setStadiums(fc);
      })
      .catch((e) => console.error("Stadiums fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showStadiums, stadiums]);

  useEffect(() => {
    if (!map || !loaded || !stadiums) return;
    if (map.getSource("hr-stadiums")) return;
    map.addSource("hr-stadiums", { type: "geojson", data: stadiums });
    map.addLayer({
      id: "hr-stadiums-circle",
      type: "circle",
      source: "hr-stadiums",
      layout: { visibility: showStadiums ? "visible" : "none" },
      paint: {
        "circle-color": "#002F6C",
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6, 3,
          10, 6,
          14, 10,
        ] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.5,
          1.5,
        ],
        "circle-opacity": 0.9,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, stadiums]);

  useEffect(() => {
    if (!map?.getLayer("hr-stadiums-circle")) return;
    map.setLayoutProperty(
      "hr-stadiums-circle",
      "visibility",
      showStadiums ? "visible" : "none",
    );
    if (!showStadiums && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showStadiums, styleRev]);

  useEffect(() => {
    if (!map?.getLayer("hr-stadiums-circle") || !stadiums) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr-stadiums", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr-stadiums", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-stadiums", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as StadiumProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      const capRow = p.capacity
        ? `<div class="club-row"><span class="k">Kapacitet</span><span class="v">${Number(p.capacity).toLocaleString("hr")}</span></div>`
        : "";
      const html = `
        <div class="club-popup">
          <div class="club-head">
            <div class="club-title">
              <div class="club-name">${esc(p.name || "Stadion")}</div>
              <div class="club-league" style="border-left:3px solid #002F6C;padding-left:6px;">OSM stadion</div>
            </div>
          </div>
          ${capRow}
          <div class="club-row" style="border-top:0;">
            <span class="k">OSM</span>
            <span class="v"><a href="https://www.openstreetmap.org/${esc(p.osm_type)}/${p.osm_id}" target="_blank" rel="noopener">vidi u OSM-u →</a></span>
          </div>
        </div>`;
      const popup = new maplibregl.Popup({ offset: 12, maxWidth: "300px" })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
      popupRef.current = popup;
    };

    map.on("mousemove", "hr-stadiums-circle", onMove);
    map.on("mouseleave", "hr-stadiums-circle", onLeave);
    map.on("click", "hr-stadiums-circle", onClick);
    return () => {
      map.off("mousemove", "hr-stadiums-circle", onMove);
      map.off("mouseleave", "hr-stadiums-circle", onLeave);
      map.off("click", "hr-stadiums-circle", onClick);
    };
  }, [map, styleRev, stadiums]);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
