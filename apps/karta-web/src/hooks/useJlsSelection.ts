import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import type { JlsCollection, JlsFeature, NaseljaCollection } from "@/lib/types";

interface Options {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  jls: JlsCollection | null;
  /** Re-run trigger: naselja layeri se dodaju tek kad 22 MB fetch završi, pa
   *  focus filter mora ponovno proći kad se pojave (deep-link race). */
  naselja?: NaseljaCollection | null;
}

// Mirrors `selectedJls` / `activeZup` / `focusMode` state into MapLibre
// feature-state on every change. The hook itself doesn't drive selection —
// it only paints. Selection is driven by useJlsInteractions and click
// handlers on other layers (clubs, naselja). Separating "select" from
// "paint" keeps state changes pure.
export function useJlsSelection({ map, loaded, styleRev, jls, naselja }: Options) {
  const { selectedJls, activeZup, focusMode } = useMapState();
  const prevSelected = useRef<number | null>(null);

  // Selected outline (white) + filter-layer focus
  useEffect(() => {
    if (!map || !loaded || !jls) return;
    if (!map.getSource("hr")) return;

    if (prevSelected.current !== null && prevSelected.current !== selectedJls) {
      map.setFeatureState({ source: "hr", id: prevSelected.current }, { selected: false });
    }
    if (selectedJls !== null) {
      map.setFeatureState({ source: "hr", id: selectedJls }, { selected: true });
    }
    prevSelected.current = selectedJls;
  }, [map, loaded, styleRev, jls, selectedJls]);

  // Županija dimming filter
  useEffect(() => {
    if (!map || !loaded || !jls) return;
    if (!map.getSource("hr")) return;

    for (const f of jls.features as JlsFeature[]) {
      const dimmed = activeZup !== null && f.properties.zupanija !== activeZup;
      map.setFeatureState({ source: "hr", id: f.id }, { dimmed });
    }
  }, [map, loaded, styleRev, jls, activeZup]);

  // Focus mode: hide every non-selected JLS visually + filter line/label
  // layers. The fill layer stays interactive so users can click neighbours
  // to switch focus (same trick as the legacy template).
  useEffect(() => {
    if (!map || !loaded || !jls) return;
    if (!map.getSource("hr")) return;

    const filterLayers = ["hr-line", "hr-label", "hr-nas-fill", "hr-nas-line", "hr-nas-label"];
    if (!focusMode || selectedJls === null) {
      for (const f of jls.features as JlsFeature[]) {
        map.setFeatureState({ source: "hr", id: f.id }, { focus_hidden: false });
      }
      for (const id of filterLayers) if (map.getLayer(id)) map.setFilter(id, null);
      return;
    }
    const sel = (jls.features as JlsFeature[]).find((f) => f.id === selectedJls);
    if (!sel) return;
    const mb = sel.properties.maticni_broj;
    for (const f of jls.features as JlsFeature[]) {
      map.setFeatureState(
        { source: "hr", id: f.id },
        { focus_hidden: f.id !== selectedJls },
      );
    }
    const jlsFilter = ["==", ["get", "maticni_broj"], mb] as never;
    const nasFilter = ["==", ["get", "jls_maticni_broj"], mb] as never;
    if (map.getLayer("hr-line")) map.setFilter("hr-line", jlsFilter);
    if (map.getLayer("hr-label")) map.setFilter("hr-label", jlsFilter);
    if (map.getLayer("hr-nas-fill")) map.setFilter("hr-nas-fill", nasFilter);
    if (map.getLayer("hr-nas-line")) map.setFilter("hr-nas-line", nasFilter);
    if (map.getLayer("hr-nas-label")) map.setFilter("hr-nas-label", nasFilter);
  }, [map, loaded, styleRev, jls, focusMode, selectedJls, naselja]);
}
