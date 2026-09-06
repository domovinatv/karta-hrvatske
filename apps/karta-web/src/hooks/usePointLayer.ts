import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { v } from "@/lib/version";

// Zajednička mehanika točkastog sloja: lazy fetch, idempotentna izgradnja,
// vidljivost, feature-state hover, popup lifecycle, ponovna izgradnja na
// promjenu stila.
//
// Izdvojeno kad je uz sloj Inkubatori došao i Privatni ekosustav. Razlikuju
// se samo u boji, filtru prstena i popupu — ostalih ~90 redaka bilo bi dvije
// kopije istog koda, tj. dva mjesta na kojima isti bug treba popraviti. Isti
// argument koji useOouLayer već iznosi za svoja tri sloja.
//
// Ono što ovaj hook NE radi: klasteriranje, minzoom i simbole. Oba
// dosadašnja korisnika su mali skupovi (82 i 11 točaka) i vide se na svakoj
// razini zumiranja.

export interface PointLayerSpec<P> {
  /** Ključ izvora i prefiks slojeva: „inkubatori" → `hr-inkubatori-circle`. */
  id: string;
  /** Datoteka u public/data/. */
  file: string;
  /** Polje u MapState koje pali sloj. */
  visible: boolean;
  colorExpr: unknown;
  radiusExpr: unknown;
  opacityExpr?: unknown;
  /**
   * Filtar za crveni prsten oko točke (npr. „ne posluje"). Izostavi ga i
   * sloj nema prsten.
   */
  ringFilter?: unknown;
  popupHtml: (p: P) => string;
  /**
   * Polja koja MapLibre serijalizira u JSON STRING kad feature prođe kroz
   * izraze. Ugniježđena polja i objekti (`vrste`, `emails`) u click handleru
   * stignu kao `'[{"id":7,…}]'`, ne kao polje, i `.map` na njima puca.
   * Parsiranje je jeftinije nego ravnanje sheme.
   */
  jsonFields?: string[];
}

export function usePointLayer<P>({
  map,
  loaded,
  styleRev,
  spec,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  spec: PointLayerSpec<P>;
}) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const src = `hr-${spec.id}`;
  const circle = `${src}-circle`;
  const ring = `${src}-ring`;
  const ringBg = `${src}-ring-bg`;

  // ── Lazy fetch ──────────────────────────────────────────────────────────
  // loadingRef je REF, ne state: state bi se vrtio u petlji kroz deps.
  useEffect(() => {
    if (!spec.visible || data || loadingRef.current) return;
    loadingRef.current = true;
    fetch(v(`/data/${spec.file}`))
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        fc.features.forEach((f) => {
          const id = (f.properties as { id?: number } | null)?.id;
          if (f.id == null && id != null) f.id = id;
        });
        setData(fc);
      })
      .catch((e) => console.error(`${spec.file} fetch failed`, e))
      .finally(() => {
        loadingRef.current = false;
      });
  }, [spec.visible, spec.file, data]);

  // ── Izgradnja ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !loaded || !data) return;
    if (map.getSource(src)) return;
    map.addSource(src, { type: "geojson", data });

    if (spec.ringFilter) {
      // Dva prstena: bijela podloga pa obojani. Ispod je JLS ispuna
      // proizvoljne boje — jednobojni prsten se u nekoj županiji ili temi
      // uvijek stopi s podlogom. Isti razlog kao u useZupeLayer.
      for (const [id, color, width] of [
        [ringBg, "#ffffff", 3.4],
        [ring, "#ef4444", 1.8],
      ] as const) {
        map.addLayer({
          id,
          type: "circle",
          source: src,
          filter: spec.ringFilter as never,
          layout: { visibility: spec.visible ? "visible" : "none" },
          paint: {
            "circle-color": "rgba(0,0,0,0)",
            "circle-radius": spec.radiusExpr as never,
            "circle-stroke-color": color,
            "circle-stroke-width": width,
            "circle-stroke-opacity": 0.9,
          },
        });
      }
    }

    map.addLayer({
      id: circle,
      type: "circle",
      source: src,
      layout: { visibility: spec.visible ? "visible" : "none" },
      paint: {
        "circle-color": spec.colorExpr as never,
        "circle-radius": spec.radiusExpr as never,
        "circle-opacity": (spec.opacityExpr ?? 0.92) as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.4,
          1.1,
        ],
        "circle-stroke-opacity": 0.9,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, data]);

  // ── Vidljivost ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    for (const id of [ringBg, ring, circle]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", spec.visible ? "visible" : "none");
      }
    }
    if (!spec.visible && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, spec.visible, styleRev]);

  // ── Interakcija ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map?.getLayer(circle) || !data) return;
    let hovered: number | null = null;

    const onMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const id = e.features[0].id as number | undefined;
      if (id == null) return;
      if (hovered !== null && hovered !== id) {
        map.setFeatureState({ source: src, id: hovered }, { hover: false });
      }
      hovered = id;
      map.setFeatureState({ source: src, id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: src, id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };
    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      const props = unpack(f.properties as Record<string, unknown>, spec.jsonFields);
      popupRef.current = new maplibregl.Popup({ offset: 12, maxWidth: "340px" })
        .setLngLat(coords)
        .setHTML(spec.popupHtml(props as P))
        .addTo(map);
    };

    map.on("mousemove", circle, onMove);
    map.on("mouseleave", circle, onLeave);
    map.on("click", circle, onClick);
    return () => {
      map.off("mousemove", circle, onMove);
      map.off("mouseleave", circle, onLeave);
      map.off("click", circle, onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleRev, data]);
}

function unpack(raw: Record<string, unknown>, fields?: string[]): Record<string, unknown> {
  if (!fields?.length) return raw;
  const p = { ...raw };
  for (const k of fields) {
    if (typeof p[k] === "string") {
      try {
        p[k] = JSON.parse(p[k] as string);
      } catch {
        p[k] = [];
      }
    }
  }
  return p;
}
