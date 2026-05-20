import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import {
  JLS_FILL_OPACITY_DEFAULT,
  JLS_FILL_OPACITY_ORTO,
  TYPE_COLOR,
} from "@/lib/style";

interface UseJlsLayerOptions {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  jls: GeoJSON.FeatureCollection | null;
  zupanije: GeoJSON.FeatureCollection | null;
  drzava: GeoJSON.FeatureCollection | null;
}

// Adds JLS fill + line + labels, županije borders, državna granica.
// Re-runs whenever styleRev bumps (basemap swap wipes sources). Other
// state-driven mutations (color mode, ortofoto opacity preset, border
// visibility) are handled by separate effects below so theme switches
// don't have to know about every paint property.
export function useJlsLayer({
  map,
  loaded,
  styleRev,
  jls,
  zupanije,
  drzava,
}: UseJlsLayerOptions) {
  const { theme, colorMode, showOrto, showZupBorders, showJlsBorders } = useMapState();
  const dark = theme === "dark";

  // Add sources + layers. Guarded so we don't double-add when state changes
  // unrelated to the basemap (those run in the lower effects).
  useEffect(() => {
    if (!map || !loaded || !jls || !zupanije || !drzava) return;
    if (map.getSource("hr")) return;

    map.addSource("hr", { type: "geojson", data: jls });
    map.addLayer({
      id: "hr-fill",
      type: "fill",
      source: "hr",
      paint: {
        "fill-color":
          colorMode === "type"
            ? ([
                "match",
                ["get", "type"],
                "Grad",
                TYPE_COLOR.Grad,
                "Općina",
                TYPE_COLOR["Općina"],
                "Otok",
                TYPE_COLOR.Otok,
                TYPE_COLOR.Other,
              ] as never)
            : ["get", "color"],
        "fill-opacity": showOrto ? JLS_FILL_OPACITY_ORTO : JLS_FILL_OPACITY_DEFAULT,
      },
    });
    map.addLayer({
      id: "hr-line",
      type: "line",
      source: "hr",
      layout: { visibility: showJlsBorders ? "visible" : "none" },
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
      layout: { visibility: showZupBorders ? "visible" : "none" },
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

    // Hide OSM/OFM admin lines that don't align with DGU.
    const style = map.getStyle();
    if (style?.layers) {
      const adminPattern = /admin|boundary|country|border/i;
      for (const l of style.layers) {
        const layerObj = l as { id: string; "source-layer"?: string };
        if (
          adminPattern.test(layerObj.id) ||
          (layerObj["source-layer"] && adminPattern.test(layerObj["source-layer"]))
        ) {
          try {
            map.setLayoutProperty(layerObj.id, "visibility", "none");
          } catch {
            /* ignore */
          }
        }
      }
    }
    // styleRev triggers re-add after theme/style swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, jls, zupanije, drzava]);

  // Toggle paint props when ortofoto / colorMode change.
  useEffect(() => {
    if (!map?.getLayer("hr-fill")) return;
    map.setPaintProperty(
      "hr-fill",
      "fill-opacity",
      (showOrto ? JLS_FILL_OPACITY_ORTO : JLS_FILL_OPACITY_DEFAULT) as never,
    );
  }, [map, showOrto, styleRev]);

  useEffect(() => {
    if (!map) return;
    if (map.getLayer("hr-fill")) {
      map.setPaintProperty(
        "hr-fill",
        "fill-color",
        (colorMode === "type"
          ? [
              "match",
              ["get", "type"],
              "Grad",
              TYPE_COLOR.Grad,
              "Općina",
              TYPE_COLOR["Općina"],
              "Otok",
              TYPE_COLOR.Otok,
              TYPE_COLOR.Other,
            ]
          : ["get", "color"]) as never,
      );
    }
    if (map.getLayer("hr-line")) {
      map.setPaintProperty(
        "hr-line",
        "line-color",
        (colorMode === "type"
          ? [
              "match",
              ["get", "type"],
              "Grad",
              TYPE_COLOR.Grad,
              "Općina",
              TYPE_COLOR["Općina"],
              "Otok",
              TYPE_COLOR.Otok,
              TYPE_COLOR.Other,
            ]
          : [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#ffffff",
              ["get", "color"],
            ]) as never,
      );
    }
  }, [map, colorMode, styleRev]);

  // Border visibility toggles.
  useEffect(() => {
    if (!map?.getLayer("hr-zup-line")) return;
    map.setLayoutProperty("hr-zup-line", "visibility", showZupBorders ? "visible" : "none");
  }, [map, showZupBorders, styleRev]);

  useEffect(() => {
    if (!map?.getLayer("hr-line")) return;
    map.setLayoutProperty("hr-line", "visibility", showJlsBorders ? "visible" : "none");
  }, [map, showJlsBorders, styleRev]);
}
