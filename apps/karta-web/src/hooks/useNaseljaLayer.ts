import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import { computeBounds } from "@/lib/geo";
import {
  NAS_FILL_OPACITY_DEFAULT,
  NAS_FILL_OPACITY_ORTO,
} from "@/lib/style";
import type { NaseljaCollection, NaseljeFeature } from "@/lib/types";

interface UseNaseljaLayerReturn {
  naselja: NaseljaCollection | null;
  loading: boolean;
}

// Lazy-loads naselja (22 MB) the first time the layer is enabled, then
// keeps it cached in memory. Re-adds layers after style/theme swaps via
// styleRev. Handles hover/click — click selects the naselje + fits bounds.
export function useNaseljaLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}): UseNaseljaLayerReturn {
  const {
    showNaselja,
    showOrto,
    showClubs,
    theme,
    setSelectedNaselje,
    selectedNaselje,
  } = useMapState();
  const [naselja, setNaselja] = useState<NaseljaCollection | null>(null);
  // Ref-based loading flag — same bug fix as in useClubsLayer: state-based
  // loading caused effect re-runs to cancel the in-flight fetch.
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const dark = theme === "dark";

  // Lazy fetch on first toggle-on.
  useEffect(() => {
    if (!showNaselja || naselja || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    fetch(v("/data/naselja.geojson"))
      .then((r) => r.json())
      .then((fc: NaseljaCollection) => {
        setNaselja(fc);
      })
      .catch((e: unknown) => {
        console.error("Naselja fetch failed", e);
      })
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [showNaselja, naselja]);

  // Add layers when naselja arrive (or after style swap).
  useEffect(() => {
    if (!map || !loaded || !naselja) return;
    if (map.getSource("hr-nas")) return;

    map.addSource("hr-nas", { type: "geojson", data: naselja });
    map.addLayer({
      id: "hr-nas-fill",
      type: "fill",
      source: "hr-nas",
      minzoom: 9,
      layout: { visibility: showNaselja ? "visible" : "none" },
      paint: {
        "fill-color": ["coalesce", ["get", "nas_color"], ["get", "color"]],
        "fill-opacity": showOrto ? NAS_FILL_OPACITY_ORTO : NAS_FILL_OPACITY_DEFAULT,
      },
    });
    map.addLayer({
      id: "hr-nas-line",
      type: "line",
      source: "hr-nas",
      minzoom: 9,
      layout: { visibility: showNaselja ? "visible" : "none" },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "#ffffff",
          dark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          3,
          ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 1.4],
        ],
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: "hr-nas-label",
      type: "symbol",
      source: "hr-nas",
      minzoom: 11,
      layout: {
        visibility: showNaselja ? "visible" : "none",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 12, 16, 16],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": dark ? "#cbd5e1" : "#1e293b",
        "text-halo-color": dark ? "rgba(10,14,20,0.95)" : "rgba(255,255,255,0.95)",
        "text-halo-width": 1.5,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, naselja, dark]);

  // Visibility toggle.
  useEffect(() => {
    if (!map) return;
    for (const id of ["hr-nas-fill", "hr-nas-line", "hr-nas-label"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showNaselja ? "visible" : "none");
      }
    }
  }, [map, showNaselja, styleRev]);

  // Ortofoto opacity preset.
  useEffect(() => {
    if (!map?.getLayer("hr-nas-fill")) return;
    map.setPaintProperty(
      "hr-nas-fill",
      "fill-opacity",
      (showOrto ? NAS_FILL_OPACITY_ORTO : NAS_FILL_OPACITY_DEFAULT) as never,
    );
  }, [map, showOrto, styleRev]);

  // Hover + click. Clubs-only mode disables both.
  useEffect(() => {
    if (!map || !map.getLayer("hr-nas-fill") || !naselja) return;
    let hoveredNas: number | null = null;

    const handleMove = (e: MapLayerMouseEvent) => {
      if (showClubs) {
        if (hoveredNas !== null) {
          map.setFeatureState({ source: "hr-nas", id: hoveredNas }, { hover: false });
          hoveredNas = null;
          map.getCanvas().style.cursor = "";
        }
        return;
      }
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hoveredNas !== null && hoveredNas !== id) {
        map.setFeatureState({ source: "hr-nas", id: hoveredNas }, { hover: false });
      }
      hoveredNas = id;
      map.setFeatureState({ source: "hr-nas", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      if (hoveredNas !== null) {
        map.setFeatureState({ source: "hr-nas", id: hoveredNas }, { hover: false });
        hoveredNas = null;
      }
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (showClubs) return;
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      const feat = (naselja.features as NaseljeFeature[]).find((f) => f.id === id);
      if (!feat) return;
      setSelectedNaselje(id);
      const b = computeBounds(feat.geometry);
      map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 800 });
    };

    map.on("mousemove", "hr-nas-fill", handleMove);
    map.on("mouseleave", "hr-nas-fill", handleLeave);
    map.on("click", "hr-nas-fill", handleClick);

    return () => {
      map.off("mousemove", "hr-nas-fill", handleMove);
      map.off("mouseleave", "hr-nas-fill", handleLeave);
      map.off("click", "hr-nas-fill", handleClick);
    };
  }, [map, styleRev, naselja, showClubs, setSelectedNaselje]);

  // Mirror selectedNaselje -> feature-state.
  useEffect(() => {
    if (!map?.getSource("hr-nas")) return;
    // Clear all selected flags would be O(n). We track prev outside this
    // hook by closing over a ref-like — keep simple by always re-setting.
    // Cheaper: just toggle the current and clear previous via React-managed value.
    return;
  }, [map, styleRev]);

  // The simplest "previous selected" tracker: useEffect with previous value.
  useEffect(() => {
    if (!map) return;
    const src = map.getSource("hr-nas");
    if (!src) return;
    // Clear all is too expensive — instead, track previous via closure.
    // We use a layer-state pattern: set the current as selected; effect
    // cleanup unsets it.
    if (selectedNaselje == null) return;
    map.setFeatureState({ source: "hr-nas", id: selectedNaselje }, { selected: true });
    return () => {
      if (map.getSource("hr-nas")) {
        map.setFeatureState({ source: "hr-nas", id: selectedNaselje }, { selected: false });
      }
    };
  }, [map, styleRev, selectedNaselje]);

  return { naselja, loading };
}
