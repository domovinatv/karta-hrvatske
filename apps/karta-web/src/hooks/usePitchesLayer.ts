import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useNavigate } from "react-router-dom";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import type { PitchCollection, PitchProperties } from "@/lib/types";

// Football pitches (OSM `leisure=pitch` + `sport=soccer`). ~7000 features
// over HR. Rendered as small green diamonds (Tier 9 visual — distinct from
// clubs which are coloured by league tier). Popup shows pitch name + a
// "Otvori klub →" link when matched to a club via osm_pitch_id.
//
// Same in-flight + idempotency patterns as useClubsLayer; see memory
// lessons-react-layer-hooks for why loading lives in a ref, not state.
export function usePitchesLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showPitches } = useMapState();
  const navigate = useNavigate();
  const [pitches, setPitches] = useState<PitchCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!showPitches || pitches || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v("/data/pitches.geojson"))
      .then((r) => r.json())
      .then((fc: PitchCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setPitches(fc);
      })
      .catch((e) => console.error("Pitches fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showPitches, pitches]);

  useEffect(() => {
    if (!map || !loaded || !pitches) return;
    if (map.getSource("hr-pitches")) return;
    map.addSource("hr-pitches", { type: "geojson", data: pitches });
    map.addLayer({
      id: "hr-pitches-circle",
      type: "circle",
      source: "hr-pitches",
      minzoom: 9,
      layout: { visibility: showPitches ? "visible" : "none" },
      paint: {
        "circle-color": "#16a34a",
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9, 2,
          12, 4,
          15, 7,
        ] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.0,
          1.0,
        ],
        "circle-opacity": 0.85,
        "circle-stroke-opacity": 0.95,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, pitches]);

  useEffect(() => {
    if (!map?.getLayer("hr-pitches-circle")) return;
    map.setLayoutProperty(
      "hr-pitches-circle",
      "visibility",
      showPitches ? "visible" : "none",
    );
    if (!showPitches && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showPitches, styleRev]);

  useEffect(() => {
    if (!map?.getLayer("hr-pitches-circle") || !pitches) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr-pitches", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr-pitches", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-pitches", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as PitchProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      const name = p.name || "Nogometno igralište";
      const surface = p.surface ? `<div class="club-row"><span class="k">Podloga</span><span class="v">${esc(p.surface)}</span></div>` : "";
      const clubLink = p.linked_club_slug
        ? `<button class="club-details-btn" data-go="/klub/${esc(p.linked_club_slug)}">${esc(p.linked_club_name || "Klub")} →</button>`
        : "";
      const html = `
        <div class="club-popup">
          <div class="club-head">
            <div class="club-title">
              <div class="club-name">${esc(name)}</div>
              <div class="club-league" style="border-left:3px solid #16a34a;padding-left:6px;">OSM nogometno igralište</div>
            </div>
          </div>
          ${surface}
          ${clubLink}
        </div>`;
      const popup = new maplibregl.Popup({ offset: 10, maxWidth: "300px" })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
      popupRef.current = popup;
      const btn = popup.getElement()?.querySelector("[data-go]") as HTMLButtonElement | null;
      btn?.addEventListener("click", () => {
        const to = btn.getAttribute("data-go");
        if (to) navigate(to);
      });
    };

    map.on("mousemove", "hr-pitches-circle", onMove);
    map.on("mouseleave", "hr-pitches-circle", onLeave);
    map.on("click", "hr-pitches-circle", onClick);
    return () => {
      map.off("mousemove", "hr-pitches-circle", onMove);
      map.off("mouseleave", "hr-pitches-circle", onLeave);
      map.off("click", "hr-pitches-circle", onClick);
    };
  }, [map, styleRev, pitches, navigate]);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
