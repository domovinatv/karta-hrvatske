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

// JLS matični brojevi za koje kvartovi.geojson ima podatke — sloj se
// auto-uključi kad korisnik fokusira jedan od tih gradova (npr.
// /jls/grad-zagreb). Proširiti kad pipeline pokrije nove gradove.
const KVARTOVI_JLS_MB = new Set(["01333", "05410"]); // Grad Zagreb, Velika Gorica

const FILL_ID = "hr-kvart-fill";
const LINE_ID = "hr-kvart-line";
const LABEL_ID = "hr-kvart-label";
const MO_LINE_ID = "hr-kvart-mo-line";
const MO_LABEL_ID = "hr-kvart-mo-label";
const ALL_IDS = [FILL_ID, LINE_ID, LABEL_ID, MO_LINE_ID, MO_LABEL_ID];

const CETVRT_FILTER = ["==", ["get", "razina"], "cetvrt"];
const MO_FILTER = ["==", ["get", "razina"], "mjesni_odbor"];

const RAZINA_LABEL: Record<string, string> = {
  cetvrt: "Gradska četvrt",
  mjesni_odbor: "Mjesni odbor",
};

interface UseKvartoviLayerReturn {
  kvartovi: KvartCollection | null;
  loading: boolean;
}

// Kvartovi unutar gradova (MVP: Zagreb GČ+MO, Velika Gorica GČ). Lazy-loads
// kvartovi.geojson on first toggle, re-adds after style swaps via styleRev.
// Gradske četvrti render as fill+line+label; mjesni odbori appear as a finer
// line+label grid from zoom ~12.5 (they inherit the parent četvrt colour in
// the data, so no extra fill is needed).
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
  const { showKvartovi, setShowKvartovi, showOrto, theme, focusMode, selectedJls } =
    useMapState();
  const [kvartovi, setKvartovi] = useState<KvartCollection | null>(null);
  // Ref-based loading flag — same bug fix as in useClubsLayer: state-based
  // loading caused effect re-runs to cancel the in-flight fetch.
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const dark = theme === "dark";

  // Auto-enable when the focused JLS has kvartovi data (deep-link
  // /jls/grad-zagreb should show them without hunting for the toggle).
  useEffect(() => {
    if (selectedJls == null || !jls) return;
    const sel = (jls.features as JlsFeature[]).find((f) => f.id === selectedJls);
    if (sel?.properties.maticni_broj && KVARTOVI_JLS_MB.has(sel.properties.maticni_broj)) {
      setShowKvartovi(true);
    }
  }, [selectedJls, jls, setShowKvartovi]);

  // Lazy fetch on first toggle-on.
  useEffect(() => {
    if (!showKvartovi || kvartovi || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    fetch(v("/data/kvartovi.geojson"))
      .then((r) => r.json())
      .then((fc: KvartCollection) => {
        setKvartovi(fc);
      })
      .catch((e: unknown) => {
        console.error("Kvartovi fetch failed", e);
      })
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [showKvartovi, kvartovi]);

  // Add layers when data arrives (or after style swap).
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
        "fill-opacity": showOrto
          ? ([
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.3,
              0.15,
            ] as never)
          : ([
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.65,
              0.4,
            ] as never),
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
      minzoom: 10,
      filter: CETVRT_FILTER as never,
      layout: {
        visibility: vis,
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 13, 15],
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

  // Kvart layers must sit ABOVE naselja: kvartovi (0.9 MB) usually finish
  // loading before naselja (22 MB), so hr-nas-fill would otherwise get added
  // on top and the naselje "Zagreb" monolith would cover every kvart.
  useEffect(() => {
    if (!map || !naselja || !map.getLayer(FILL_ID) || !map.getLayer("hr-nas-fill")) return;
    for (const id of ALL_IDS) {
      if (map.getLayer(id)) map.moveLayer(id); // bez beforeId = na vrh
    }
  }, [map, styleRev, kvartovi, naselja]);

  // Visibility toggle.
  useEffect(() => {
    if (!map) return;
    for (const id of ALL_IDS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showKvartovi ? "visible" : "none");
      }
    }
  }, [map, showKvartovi, styleRev]);

  // Ortofoto opacity preset.
  useEffect(() => {
    if (!map?.getLayer(FILL_ID)) return;
    map.setPaintProperty(
      FILL_ID,
      "fill-opacity",
      (showOrto
        ? ["case", ["boolean", ["feature-state", "hover"], false], 0.3, 0.15]
        : ["case", ["boolean", ["feature-state", "hover"], false], 0.65, 0.4]) as never,
    );
  }, [map, showOrto, styleRev]);

  // Focus mode: when a JLS is focused, show only its kvartovi. The filter is
  // combined with each layer's razina filter here (NOT in useJlsSelection —
  // a plain setFilter there would clobber the razina split).
  useEffect(() => {
    if (!map || !map.getLayer(FILL_ID)) return;
    let mb: string | undefined;
    if (focusMode && selectedJls !== null && jls) {
      mb = (jls.features as JlsFeature[]).find((f) => f.id === selectedJls)?.properties
        .maticni_broj;
    }
    const withFocus = (base: unknown) =>
      mb ? ["all", base, ["==", ["get", "jls_maticni_broj"], mb]] : base;
    for (const [id, base] of [
      [FILL_ID, CETVRT_FILTER],
      [LINE_ID, CETVRT_FILTER],
      [LABEL_ID, CETVRT_FILTER],
      [MO_LINE_ID, MO_FILTER],
      [MO_LABEL_ID, MO_FILTER],
    ] as const) {
      if (map.getLayer(id)) map.setFilter(id, withFocus(base) as never);
    }
  }, [map, styleRev, kvartovi, jls, focusMode, selectedJls]);

  // Hover + click → popup with name / razina / area, fit bounds.
  useEffect(() => {
    if (!map || !map.getLayer(FILL_ID) || !kvartovi) return;
    let hovered: number | null = null;

    const handleMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: "hr-kvart", id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: "hr-kvart", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-kvart", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const p = e.features[0].properties as KvartProperties;
      const feat = kvartovi.features.find((f) => f.id === p.id);
      if (!feat) return;
      if (popupRef.current) popupRef.current.remove();
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
          <div class="club-row"><span class="k">Izvor</span><span class="v">${esc(p.source)}</span></div>
        </div>`;
      popupRef.current = new maplibregl.Popup({ offset: 8, maxWidth: "300px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
      const b = computeBounds(feat.geometry);
      map.fitBounds(b, { padding: 80, maxZoom: 14.5, duration: 700 });
    };

    map.on("mousemove", FILL_ID, handleMove);
    map.on("mouseleave", FILL_ID, handleLeave);
    map.on("click", FILL_ID, handleClick);

    return () => {
      map.off("mousemove", FILL_ID, handleMove);
      map.off("mouseleave", FILL_ID, handleLeave);
      map.off("click", FILL_ID, handleClick);
    };
  }, [map, styleRev, kvartovi]);

  return { kvartovi, loading };
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
