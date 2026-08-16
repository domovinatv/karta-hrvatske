import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { v } from "@/lib/version";
import { computeBounds } from "@/lib/geo";
import type {
  JlsCollection,
  JlsFeature,
  KvartCollection,
  KvartProperties,
  NaseljaCollection,
} from "@/lib/types";

// JLS matični brojevi za koje kvartovi datoteke imaju podatke — kolokvijalni
// sloj se auto-uključi kad korisnik fokusira jedan od tih gradova (npr.
// /jls/grad-zagreb). Proširiti kad pipeline pokrije nove gradove.
const KVARTOVI_JLS_MB = new Set(["01333", "05410"]); // Grad Zagreb, Velika Gorica

// Službena razina: gradske četvrti + mjesni odbori (kvartovi.geojson).
const FILL_ID = "hr-kvart-fill";
const LINE_ID = "hr-kvart-line";
const LABEL_ID = "hr-kvart-label";
const MO_LINE_ID = "hr-kvart-mo-line";
const MO_LABEL_ID = "hr-kvart-mo-label";
const OFF_IDS = [FILL_ID, LINE_ID, LABEL_ID, MO_LINE_ID, MO_LABEL_ID];

// Kolokvijalna razina: derivirani kvartovi (kvartovi-kolokvijalni.geojson).
const K_FILL_ID = "hr-kvart-kolok-fill";
const K_LINE_ID = "hr-kvart-kolok-line";
const K_LABEL_ID = "hr-kvart-kolok-label";
const KOLOK_IDS = [K_FILL_ID, K_LINE_ID, K_LABEL_ID];

const CETVRT_FILTER = ["==", ["get", "razina"], "cetvrt"];
const MO_FILTER = ["==", ["get", "razina"], "mjesni_odbor"];

const RAZINA_LABEL: Record<string, string> = {
  cetvrt: "Gradska četvrt",
  mjesni_odbor: "Mjesni odbor",
  kvart: "Kvart",
};

const OPACITY_DEFAULT = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  0.65,
  0.4,
];
const OPACITY_ORTO = [
  "case",
  ["boolean", ["feature-state", "hover"], false],
  0.3,
  0.15,
];

interface UseKvartoviLayerReturn {
  kvartovi: KvartCollection | null;
  kolokvijalni: KvartCollection | null;
  loading: boolean;
}

// Dva sloja kvartova unutar gradova:
//  - "kolokvijalni" ("Kvartovi") — derivirani kvartovi (Jarun, Knežija…),
//    flagship sloj, auto-on na deep-link fokusiranog grada s podacima
//  - "službeni" ("Četvrti i MO") — gradske četvrti fill+label od z8.5,
//    mjesni odbori dashed mreža od z12.5
// Oba lazy-loadaju svoj geojson na prvi toggle, re-add nakon style swapa
// preko styleRev, focus mode filtrira po jls_maticni_broj unutar hooka.
export function useKvartoviLayer({
  map,
  loaded,
  styleRev,
  jls,
  naselja,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  jls: JlsCollection | null;
  /** Samo kao signal da su naselja layeri (možda) dodani — vidi moveLayer effect. */
  naselja: NaseljaCollection | null;
}): UseKvartoviLayerReturn {
  const {
    showKvartovi,
    showKolokvijalni,
    setShowKolokvijalni,
    showOrto,
    theme,
    focusMode,
    selectedJls,
  } = useMapState();
  const [kvartovi, setKvartovi] = useState<KvartCollection | null>(null);
  const [kolokvijalni, setKolokvijalni] = useState<KvartCollection | null>(null);
  // Ref-based loading flag — same bug fix as in useClubsLayer: state-based
  // loading caused effect re-runs to cancel the in-flight fetch.
  const loadingRef = useRef(false);
  const loadingKolokRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const dark = theme === "dark";

  // Auto-enable kolokvijalnih kad fokusirani JLS ima podatke (deep-link
  // /jls/grad-zagreb treba pokazati kvartove bez traženja togglea).
  useEffect(() => {
    if (selectedJls == null || !jls) return;
    const sel = (jls.features as JlsFeature[]).find((f) => f.id === selectedJls);
    if (sel?.properties.maticni_broj && KVARTOVI_JLS_MB.has(sel.properties.maticni_broj)) {
      setShowKolokvijalni(true);
    }
  }, [selectedJls, jls, setShowKolokvijalni]);

  // Lazy fetch — službena razina.
  useEffect(() => {
    if (!showKvartovi || kvartovi || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    fetch(v("/data/kvartovi.geojson"))
      .then((r) => r.json())
      .then((fc: KvartCollection) => setKvartovi(fc))
      .catch((e: unknown) => console.error("Kvartovi fetch failed", e))
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [showKvartovi, kvartovi]);

  // Lazy fetch — kolokvijalna razina.
  useEffect(() => {
    if (!showKolokvijalni || kolokvijalni || loadingKolokRef.current) return;
    loadingKolokRef.current = true;
    fetch(v("/data/kvartovi-kolokvijalni.geojson"))
      .then((r) => r.json())
      .then((fc: KvartCollection) => setKolokvijalni(fc))
      .catch((e: unknown) => console.error("Kolokvijalni kvartovi fetch failed", e))
      .finally(() => {
        loadingKolokRef.current = false;
      });
  }, [showKolokvijalni, kolokvijalni]);

  // Add layers — službena razina.
  useEffect(() => {
    if (!map || !loaded || !kvartovi) return;
    if (map.getSource("hr-kvart")) return;

    const vis = showKvartovi ? "visible" : "none";
    map.addSource("hr-kvart", { type: "geojson", data: kvartovi });

    map.addLayer({
      id: FILL_ID,
      type: "fill",
      source: "hr-kvart",
      minzoom: 8.5,
      filter: CETVRT_FILTER as never,
      layout: { visibility: vis },
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": (showOrto ? OPACITY_ORTO : OPACITY_DEFAULT) as never,
      },
    });
    map.addLayer({
      id: LINE_ID,
      type: "line",
      source: "hr-kvart",
      minzoom: 8.5,
      filter: CETVRT_FILTER as never,
      layout: { visibility: vis },
      paint: {
        "line-color": dark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 13, 2.2],
        "line-opacity": 0.95,
      },
    });
    map.addLayer({
      id: MO_LINE_ID,
      type: "line",
      source: "hr-kvart",
      minzoom: 12.5,
      filter: MO_FILTER as never,
      layout: { visibility: vis },
      paint: {
        "line-color": dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 12.5, 0.6, 15, 1.2],
        "line-dasharray": [2, 1.5],
      },
    });
    map.addLayer({
      id: LABEL_ID,
      type: "symbol",
      source: "hr-kvart",
      minzoom: 9.5,
      filter: CETVRT_FILTER as never,
      layout: {
        visibility: vis,
        "text-field": ["get", "name"],
        // cartocdn (dark) nema Bold glyphove (404) — vidi useJlsLayer.
        "text-font": [dark ? "Noto Sans Regular" : "Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9.5, 10, 13, 15],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": dark ? "#f1f5f9" : "#0f172a",
        "text-halo-color": dark ? "rgba(10,14,20,0.95)" : "rgba(255,255,255,0.95)",
        "text-halo-width": 1.8,
      },
    });
    map.addLayer({
      id: MO_LABEL_ID,
      type: "symbol",
      source: "hr-kvart",
      minzoom: 13.5,
      filter: MO_FILTER as never,
      layout: {
        visibility: vis,
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 13.5, 10, 16, 13],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": dark ? "#cbd5e1" : "#334155",
        "text-halo-color": dark ? "rgba(10,14,20,0.9)" : "rgba(255,255,255,0.9)",
        "text-halo-width": 1.4,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, kvartovi, dark]);

  // Add layers — kolokvijalna razina.
  useEffect(() => {
    if (!map || !loaded || !kolokvijalni) return;
    if (map.getSource("hr-kvart-kolok")) return;

    const vis = showKolokvijalni ? "visible" : "none";
    map.addSource("hr-kvart-kolok", { type: "geojson", data: kolokvijalni });

    map.addLayer({
      id: K_FILL_ID,
      type: "fill",
      source: "hr-kvart-kolok",
      minzoom: 8.5,
      layout: { visibility: vis },
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": (showOrto ? OPACITY_ORTO : OPACITY_DEFAULT) as never,
      },
    });
    map.addLayer({
      id: K_LINE_ID,
      type: "line",
      source: "hr-kvart-kolok",
      minzoom: 8.5,
      layout: { visibility: vis },
      paint: {
        "line-color": dark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 13, 1.8],
        "line-opacity": 0.9,
      },
    });
    map.addLayer({
      id: K_LABEL_ID,
      type: "symbol",
      source: "hr-kvart-kolok",
      // Deep-link fitBounds na grad završi na ~z10 — labele moraju biti
      // vidljive čim su poligoni čitljivi, inače karta izgleda "bez imena".
      minzoom: 9,
      layout: {
        visibility: vis,
        "text-field": ["get", "name"],
        // cartocdn (dark) nema Bold glyphove (404) — vidi useJlsLayer.
        "text-font": [dark ? "Noto Sans Regular" : "Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 9, 11, 12.5, 13, 15, 15, 18],
        "text-padding": 1,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#111827",
        "text-halo-color": dark ? "rgba(10,14,20,0.95)" : "rgba(255,255,255,0.95)",
        "text-halo-width": 1.7,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, kolokvijalni, dark]);

  // Kvart layers must sit ABOVE naselja: kvartovi (<1 MB) usually finish
  // loading before naselja (22 MB), so hr-nas-fill would otherwise get added
  // on top and the naselje "Zagreb" monolith would cover every kvart.
  useEffect(() => {
    if (!map || !naselja || !map.getLayer("hr-nas-fill")) return;
    for (const id of [...OFF_IDS, ...KOLOK_IDS]) {
      if (map.getLayer(id)) map.moveLayer(id); // bez beforeId = na vrh
    }
  }, [map, styleRev, kvartovi, kolokvijalni, naselja]);

  // Visibility toggles.
  useEffect(() => {
    if (!map) return;
    for (const id of OFF_IDS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showKvartovi ? "visible" : "none");
      }
    }
  }, [map, showKvartovi, styleRev]);

  useEffect(() => {
    if (!map) return;
    for (const id of KOLOK_IDS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showKolokvijalni ? "visible" : "none");
      }
    }
  }, [map, showKolokvijalni, styleRev]);

  // Ortofoto opacity preset.
  useEffect(() => {
    if (!map) return;
    for (const id of [FILL_ID, K_FILL_ID]) {
      if (map.getLayer(id)) {
        map.setPaintProperty(
          id,
          "fill-opacity",
          (showOrto ? OPACITY_ORTO : OPACITY_DEFAULT) as never,
        );
      }
    }
  }, [map, showOrto, styleRev]);

  // Focus mode: when a JLS is focused, show only its kvartovi. The filter is
  // combined with each layer's razina filter here (NOT in useJlsSelection —
  // a plain setFilter there would clobber the razina split).
  useEffect(() => {
    if (!map) return;
    let mb: string | undefined;
    if (focusMode && selectedJls !== null && jls) {
      mb = (jls.features as JlsFeature[]).find((f) => f.id === selectedJls)?.properties
        .maticni_broj;
    }
    const focusFilter = mb ? ["==", ["get", "jls_maticni_broj"], mb] : null;
    const withFocus = (base: unknown) =>
      focusFilter ? (base ? ["all", base, focusFilter] : focusFilter) : (base ?? null);
    for (const [id, base] of [
      [FILL_ID, CETVRT_FILTER],
      [LINE_ID, CETVRT_FILTER],
      [LABEL_ID, CETVRT_FILTER],
      [MO_LINE_ID, MO_FILTER],
      [MO_LABEL_ID, MO_FILTER],
      [K_FILL_ID, null],
      [K_LINE_ID, null],
      [K_LABEL_ID, null],
    ] as const) {
      if (map.getLayer(id)) map.setFilter(id, withFocus(base) as never);
    }
  }, [map, styleRev, kvartovi, kolokvijalni, jls, focusMode, selectedJls]);

  // Hover + click → popup, fit bounds. Registrira se za oba fill sloja.
  useEffect(() => {
    if (!map) return;
    const bindings: Array<[string, string, KvartCollection]> = [];
    if (map.getLayer(K_FILL_ID) && kolokvijalni) {
      bindings.push([K_FILL_ID, "hr-kvart-kolok", kolokvijalni]);
    }
    if (map.getLayer(FILL_ID) && kvartovi) {
      bindings.push([FILL_ID, "hr-kvart", kvartovi]);
    }
    if (!bindings.length) return;

    const cleanups: Array<() => void> = [];
    for (const [layerId, sourceId, fc] of bindings) {
      let hovered: number | null = null;

      const handleMove = (e: MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        const id = e.features[0].id as number | undefined;
        if (id == null) return;
        if (hovered !== null && hovered !== id) {
          map.setFeatureState({ source: sourceId, id: hovered }, { hover: false });
        }
        hovered = id;
        map.setFeatureState({ source: sourceId, id }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
      };

      const handleLeave = () => {
        if (hovered !== null) {
          map.setFeatureState({ source: sourceId, id: hovered }, { hover: false });
          hovered = null;
        }
        map.getCanvas().style.cursor = "";
      };

      const handleClick = (e: MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        const p = e.features[0].properties as KvartProperties;
        const feat = fc.features.find((f) => f.id === p.id);
        if (!feat) return;
        if (popupRef.current) popupRef.current.remove();
        const moRow =
          p.razina === "kvart" && p.mo_count
            ? `<div class="club-row"><span class="k">Mjesni odbori</span><span class="v">${p.mo_count}</span></div>`
            : "";
        const html = `
          <div class="club-popup">
            <div class="club-head">
              <div class="club-title">
                <div class="club-name">${esc(p.name)}</div>
                <div class="club-league" style="border-left:3px solid ${esc(p.color)};padding-left:6px;">${esc(
                  RAZINA_LABEL[p.razina] ?? p.razina,
                )} · ${esc(p.jls_name)}</div>
              </div>
            </div>
            <div class="club-row"><span class="k">Površina</span><span class="v">${p.area_km2} km²</span></div>
            ${moRow}
            <div class="club-row"><span class="k">Izvor</span><span class="v">${esc(p.source)}</span></div>
          </div>`;
        popupRef.current = new maplibregl.Popup({ offset: 8, maxWidth: "300px" })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
        const b = computeBounds(feat.geometry);
        map.fitBounds(b, { padding: 80, maxZoom: 14.5, duration: 700 });
      };

      map.on("mousemove", layerId, handleMove);
      map.on("mouseleave", layerId, handleLeave);
      map.on("click", layerId, handleClick);
      cleanups.push(() => {
        map.off("mousemove", layerId, handleMove);
        map.off("mouseleave", layerId, handleLeave);
        map.off("click", layerId, handleClick);
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, [map, styleRev, kvartovi, kolokvijalni]);

  return { kvartovi, kolokvijalni, loading };
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
