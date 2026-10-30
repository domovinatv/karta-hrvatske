import { useCallback, useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { CONTROLS, type LayerStateKey, type ToggleLayer } from "@/lib/layers";
import { fitAfterLayout } from "@/lib/fit";
import type { Hit, SearchResponse } from "./engine";

// Što se događa kad korisnik odabere rezultat. Pretraga ne zna ništa o
// pojedinim slojevima osim tablice ispod: koji prekidač upaliti i na koji
// MapLibre sloj „kliknuti" da se otvori isti popup kao kod pravog klika.
//
// Popup se otvara SINTETIČKIM klikom na točku, ne kopijom popupHtml-a:
// svaki sloj već ima svoj popup (klubovi još i modal), i jedini način da
// pretraga i klik pokažu isto jest da pretraga klikne.

const STATE_KEY = new Map(
  CONTROLS.filter((c): c is ToggleLayer => c.kind === "toggle").map((c) => [c.id as string, c.stateKey]),
);

const CIRCLE: Record<string, string> = {
  croai: "hr-croai-circle",
  ekosustav: "hr-ekosustav-circle",
  inkubatori: "hr-inkubatori-circle",
  udruge: "hr-udruge-circle",
  crkve: "hr-crkve-circle",
  zupe: "hr-zupe-circle",
  klubovi: "hr-clubs-circle",
  stadioni: "hr-stadiums-circle",
  "zracne-luke": "hr-airports-circle",
  skole: "hr-skole-circle",
  vrtici: "hr-vrtici-circle",
  ustanove: "hr-ustanove-circle",
  "zg-obrazovanje": "hr-zg-sadrzaji-circle",
  "zg-zdravlje": "hr-zg-sadrzaji-circle",
  "zg-kretanje": "hr-zg-sadrzaji-circle",
  "zg-svakodnevno": "hr-zg-sadrzaji-circle",
  "zg-otpad": "hr-zg-sadrzaji-circle",
  "zg-sigurnost": "hr-zg-sadrzaji-circle",
};

const HITS_SRC = "hr-search-hits";
const HITS_LAYER = "hr-search-hits-halo";

/**
 * Pali sloj, leti na točku i otvara njezin popup kad se iscrta.
 *
 * Više točaka zna stajati na istom mjestu (CroAI firme bez adrese su na
 * središtu naselja), a handler sloja uzme prvu ispod klika. Zato se sloj na
 * trenutak filtrira samo na traženi feature, klikne, i filtar vrati —
 * handler se izvrši sinkrono unutar fire(), pa korisnik filtar ne vidi.
 */
function openPointPopup(map: MapLibreMap, layerId: string, p: [number, number], fid: number | string) {
  const id = typeof fid === "string" ? Number(fid) : fid;
  let tries = 0;
  let done = false;
  const attempt = () => {
    if (done) return;
    tries++;
    if (tries > 60) return; // ~9 s: sloj se nije učitao, ostaje samo marker
    if (!map.getLayer(layerId) || map.isMoving()) {
      setTimeout(attempt, 150);
      return;
    }
    const point = map.project(p);
    const found = map.queryRenderedFeatures(point, { layers: [layerId] });
    if (!found.some((f) => f.id === id)) {
      setTimeout(attempt, 150);
      return;
    }
    done = true;
    const orig = map.getFilter(layerId);
    const only = ["==", ["id"], id];
    map.setFilter(layerId, (orig ? ["all", orig, only] : only) as never);
    map.once("idle", () => {
      map.fire("click", {
        point: map.project(p),
        lngLat: maplibregl.LngLat.convert(p),
        originalEvent: new MouseEvent("click"),
      });
      map.setFilter(layerId, (orig ?? null) as never);
    });
    map.triggerRepaint();
  };
  // moveend nakon flyTo; rezervni start za slučaj da se kamera nije micala.
  map.once("moveend", () => setTimeout(attempt, 50));
  setTimeout(attempt, 1500);
}

export function useSearchActions(map: MapLibreMap | null) {
  const {
    setLayerFlags,
    setSelectedJls,
    setSelectedNaselje,
    setFocusMode,
    setShowNaselja,
    setActiveZup,
  } = useMapState();
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const clearMarker = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
  }, []);

  const layerOn = useCallback(
    (layer: string) => {
      const key = STATE_KEY.get(layer) as LayerStateKey | undefined;
      if (key) setLayerFlags({ [key]: true });
    },
    [setLayerFlags],
  );

  const pick = useCallback(
    (h: Hit) => {
      if (!map) return;
      clearMarker();
      clearHits(map);
      if (h.layer === "granice-zupanija") {
        // Hit nosi puno ime („Splitsko-dalmatinska županija"); stanje karte
        // radi s kratkim, kao polje `zupanija` u jls.geojson.
        setActiveZup(h.name.replace(/ županija$/, ""));
        if (h.b) fitAfterLayout(map, bb(h.b), { padding: 40, duration: 800 });
        return;
      }
      if (h.layer === "granice-jls") {
        setSelectedNaselje(null);
        setSelectedJls(h.fid as number);
        setFocusMode(true);
        setShowNaselja(true);
        if (h.b) fitAfterLayout(map, bb(h.b), { padding: 50, maxZoom: 12, duration: 800 });
        return;
      }
      if (h.layer === "naselja") {
        if (h.j != null) setSelectedJls(h.j);
        setFocusMode(true);
        setShowNaselja(true);
        setSelectedNaselje(h.fid as number);
        if (h.b) fitAfterLayout(map, bb(h.b), { padding: 60, maxZoom: 14, duration: 800 });
        return;
      }
      layerOn(h.layer);
      if (h.b) {
        fitAfterLayout(map, bb(h.b), { padding: 50, maxZoom: 15, duration: 800 });
        return;
      }
      if (!h.p) return;
      const el = document.createElement("div");
      el.className = "search-pin";
      markerRef.current = new maplibregl.Marker({ element: el }).setLngLat(h.p).addTo(map);
      map.flyTo({ center: h.p, zoom: Math.max(map.getZoom(), 15.5), duration: 900 });
      const circle = CIRCLE[h.layer];
      if (circle) openPointPopup(map, circle, h.p, h.fid);
    },
    [map, clearMarker, layerOn, setActiveZup, setSelectedJls, setSelectedNaselje, setFocusMode, setShowNaselja],
  );

  /** „Prikaži sve na karti": upali slojeve pogodaka, istakni ih i stani na obuhvat. */
  const showAll = useCallback(
    (res: SearchResponse) => {
      if (!map || !res.bounds) return;
      clearMarker();
      for (const l of Object.keys(res.layers)) {
        if (l !== "granice-jls" && l !== "granice-zupanija" && l !== "naselja") layerOn(l);
      }
      drawHits(map, res.points.map((x) => x.p));
      const [a, b, c, d] = res.bounds;
      const pad = a === c && b === d ? 0.01 : 0;
      fitAfterLayout(map, [[a - pad, b - pad], [c + pad, d + pad]], { padding: 60, maxZoom: 14, duration: 900 });
    },
    [map, clearMarker, layerOn],
  );

  const clear = useCallback(() => {
    clearMarker();
    if (map) clearHits(map);
  }, [map, clearMarker]);

  useEffect(() => clearMarker, [clearMarker]);

  return { pick, showAll, clear };
}

const bb = (b: [number, number, number, number]): [[number, number], [number, number]] => [
  [b[0], b[1]],
  [b[2], b[3]],
];

function drawHits(map: MapLibreMap, pts: [number, number][]) {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: pts.map((p) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } })),
  };
  const src = map.getSource(HITS_SRC) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(HITS_SRC, { type: "geojson", data });
  if (!map.getLayer(HITS_LAYER)) {
    // Prsten ISPOD točaka sloja: istaknuto je ono što je pretraga našla, a
    // klik i dalje ide na pravu točku.
    const before = Object.values(CIRCLE).find((id) => map.getLayer(id));
    map.addLayer(
      {
        id: HITS_LAYER,
        type: "circle",
        source: HITS_SRC,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 11, 15, 18],
          "circle-color": "rgba(250, 204, 21, 0.28)",
          "circle-stroke-color": "#facc15",
          "circle-stroke-width": 2,
        },
      },
      before,
    );
  }
}

function clearHits(map: MapLibreMap) {
  if (map.getLayer(HITS_LAYER)) map.removeLayer(HITS_LAYER);
  if (map.getSource(HITS_SRC)) map.removeSource(HITS_SRC);
}
