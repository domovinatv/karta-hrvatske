import { useEffect } from "react";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { computeBounds } from "@/lib/geo";
import type { JlsCollection, JlsFeature } from "@/lib/types";

interface Options {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  jls: JlsCollection | null;
  /** Programmatic select (e.g. from search or route deep link). */
  onSelect?: (feature: JlsFeature, opts?: { silent?: boolean; skipFit?: boolean }) => void;
}

// Wires hover state + click→select on the hr-fill layer. Suppressed when
// Clubs layer is on (clubs-only mode — JLS becomes inert so accidental
// clicks don't switch selection). Cleanup removes listeners so theme/style
// rebuilds don't leave duplicates.
export function useJlsInteractions({ map, loaded, styleRev, jls }: Options) {
  const {
    showClubs,
    setSelectedJls,
    setSelectedNaselje,
    showNaselja,
    setFocusMode,
    setShowNaselja,
  } = useMapState();

  useEffect(() => {
    if (!map || !loaded || !jls) return;
    if (!map.getLayer("hr-fill")) return;

    let hovered: number | null = null;

    const handleMove = (e: MapLayerMouseEvent) => {
      if (showClubs) {
        if (hovered !== null) {
          map.setFeatureState({ source: "hr", id: hovered }, { hover: false });
          hovered = null;
          map.getCanvas().style.cursor = "";
        }
        return;
      }
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (showClubs) return; // Clubs mode: only club clicks register
      if (!e.features?.length) return;
      // Suppress if a naselje is rendered beneath the click point
      if (showNaselja && map.getLayer("hr-nas-fill")) {
        const nasUnder = map.queryRenderedFeatures(e.point, { layers: ["hr-nas-fill"] });
        if (nasUnder.length) return;
      }
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      // Selecting a JLS clears any prior naselje selection (it could be from
      // a different JLS) and auto-enables focus + naselja layer.
      setSelectedNaselje(null);
      setSelectedJls(id);
      setFocusMode(true);
      setShowNaselja(true);

      // fitBounds to the selected feature
      const feat = jls.features.find((f) => (f as JlsFeature).id === id) as JlsFeature | undefined;
      if (feat) {
        const b = computeBounds(feat.geometry);
        map.fitBounds(b, { padding: 50, maxZoom: 12, duration: 800 });
      }
    };

    map.on("mousemove", "hr-fill", handleMove);
    map.on("mouseleave", "hr-fill", handleLeave);
    map.on("click", "hr-fill", handleClick);

    return () => {
      map.off("mousemove", "hr-fill", handleMove);
      map.off("mouseleave", "hr-fill", handleLeave);
      map.off("click", "hr-fill", handleClick);
    };
  }, [
    map,
    loaded,
    styleRev,
    jls,
    showClubs,
    showNaselja,
    setSelectedJls,
    setSelectedNaselje,
    setFocusMode,
    setShowNaselja,
  ]);
}
