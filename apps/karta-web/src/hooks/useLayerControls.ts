import { useCallback, useMemo } from "react";
import { useMapState } from "@/lib/MapState";
import { DATA_LAYER_KEYS, type LayerStateKey } from "@/lib/layers";

/**
 * Razriješi `stateKey` iz registra slojeva u živi { value, set } par.
 *
 * Ovo je jedina spojnica između registra (`lib/layers.ts`) i MapState-a.
 * MapState namjerno zadržava svoj imenovani API (showCrkve/setShowCrkve) jer
 * ga čita 12 use*Layer hookova — generički `layers[id]` zapis bi značio
 * prepisivanje svih njih bez ikakve dobiti.
 *
 * showZupBorders / showJlsBorders imaju samo toggle bez settera, pa se ovdje
 * normaliziraju u set(boolean).
 */
export function useLayerControls() {
  const s = useMapState();

  const map = useMemo<Record<LayerStateKey, { value: boolean; set: (on: boolean) => void }>>(
    () => ({
      showZupBorders: {
        value: s.showZupBorders,
        set: (on) => on !== s.showZupBorders && s.toggleZupBorders(),
      },
      showJlsBorders: {
        value: s.showJlsBorders,
        set: (on) => on !== s.showJlsBorders && s.toggleJlsBorders(),
      },
      showNaselja: { value: s.showNaselja, set: s.setShowNaselja },
      showKolokvijalni: { value: s.showKolokvijalni, set: s.setShowKolokvijalni },
      showKvartovi: { value: s.showKvartovi, set: s.setShowKvartovi },
      showClubs: { value: s.showClubs, set: s.setShowClubs },
      showPitches: { value: s.showPitches, set: s.setShowPitches },
      showStadiums: { value: s.showStadiums, set: s.setShowStadiums },
      showInkubatori: { value: s.showInkubatori, set: s.setShowInkubatori },
      showCrkve: { value: s.showCrkve, set: s.setShowCrkve },
      showZupe: { value: s.showZupe, set: s.setShowZupe },
      showBiskupije: { value: s.showBiskupije, set: s.setShowBiskupije },
      showSkole: { value: s.showSkole, set: s.setShowSkole },
      showVrtici: { value: s.showVrtici, set: s.setShowVrtici },
      showUstanove: { value: s.showUstanove, set: s.setShowUstanove },
      showAirports: { value: s.showAirports, set: s.setShowAirports },
      showPinka: { value: s.showPinka, set: s.setShowPinka },
      showOrto: { value: s.showOrto, set: s.setShowOrto },
      focusMode: { value: s.focusMode, set: s.setFocusMode },
    }),
    [s],
  );

  const toggle = useCallback(
    (key: LayerStateKey) => {
      const e = map[key];
      e.set(!e.value);
    },
    [map],
  );

  /** Broj upaljenih PODATKOVNIH slojeva (bez teme/boje/ortofota/fokusa). */
  const activeCount = useMemo(
    () => DATA_LAYER_KEYS.reduce((n, k) => n + (map[k].value ? 1 : 0), 0),
    [map],
  );

  /** Ugasi sve podatkovne slojeve; prikaz (tema, boja, ortofoto) ostaje. */
  const clearDataLayers = useCallback(() => {
    for (const k of DATA_LAYER_KEYS) map[k].set(false);
  }, [map]);

  return { map, toggle, activeCount, clearDataLayers };
}
