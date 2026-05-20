import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { JLS_FILL_OPACITY_DEFAULT } from "@/lib/style";

interface UseJlsLayerOptions {
  map: MapLibreMap | null;
  loaded: boolean;
  jls: GeoJSON.FeatureCollection | null;
  zupanije: GeoJSON.FeatureCollection | null;
  drzava: GeoJSON.FeatureCollection | null;
  dark: boolean;
}

// Adds the JLS fill + line + labels, županije borders and state border
// layers. Same paint properties as the legacy template so the visual is
// pixel-identical until Phase 2 tweaks it.
export function useJlsLayer({
  map,
  loaded,
  jls,
  zupanije,
  drzava,
  dark,
}: UseJlsLayerOptions) {
  useEffect(() => {
    if (!map || !loaded || !jls || !zupanije || !drzava) return;
    if (map.getSource("hr")) return;

    map.addSource("hr", { type: "geojson", data: jls });
    map.addLayer({
      id: "hr-fill",
      type: "fill",
      source: "hr",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": JLS_FILL_OPACITY_DEFAULT,
      },
    });
    map.addLayer({
      id: "hr-line",
      type: "line",
      source: "hr",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "#ffffff",
          ["get", "color"],
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          3,
          ["boolean", ["feature-state", "hover"], false],
          1.8,
          0.6,
        ],
        "line-opacity": 0.85,
      },
    });
    map.addLayer({
      id: "hr-label",
      type: "symbol",
      source: "hr",
      minzoom: 9,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 14, 16, 18],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#0a0e14",
        "text-halo-color": dark ? "rgba(10,14,20,0.95)" : "rgba(255,255,255,0.95)",
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    });

    map.addSource("hr-zup", { type: "geojson", data: zupanije });
    map.addLayer({
      id: "hr-zup-line",
      type: "line",
      source: "hr-zup",
      paint: {
        "line-color": dark ? "#f8fafc" : "#0a0e14",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.2, 10, 2.4, 14, 4],
        "line-opacity": 0.9,
        "line-dasharray": [3, 2],
      },
    });

    map.addSource("hr-drz", { type: "geojson", data: drzava });
    map.addLayer({
      id: "hr-drz-line",
      type: "line",
      source: "hr-drz",
      paint: {
        "line-color": dark ? "#ffd166" : "#7a3b00",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.5, 9, 2.5, 14, 4],
        "line-opacity": 0.95,
      },
    });

    // Hide OSM/OpenFreeMap admin lines — they conflict with our DGU borders.
    const style = map.getStyle();
    if (style?.layers) {
      const adminPattern = /admin|boundary|country|border/i;
      for (const l of style.layers) {
        if (
          adminPattern.test(l.id) ||
          (("source-layer" in l && l["source-layer"] && adminPattern.test(l["source-layer"])) as boolean)
        ) {
          try {
            map.setLayoutProperty(l.id, "visibility", "none");
          } catch {
            /* ignore */
          }
        }
      }
    }
  }, [map, loaded, jls, zupanije, drzava, dark]);
}
