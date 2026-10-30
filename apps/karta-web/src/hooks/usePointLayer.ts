import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { v } from "@/lib/version";
import { svgChevronLeft } from "@/lib/svgIcons";

// Zajednička mehanika točkastog sloja: lazy fetch, idempotentna izgradnja,
// vidljivost, feature-state hover, popup lifecycle, ponovna izgradnja na
// promjenu stila.
//
// Izdvojeno kad je uz sloj Inkubatori došao i Privatni ekosustav. Razlikuju
// se samo u boji, filtru prstena i popupu — ostalih ~90 redaka bilo bi dvije
// kopije istog koda, tj. dva mjesta na kojima isti bug treba popraviti. Isti
// argument koji useOouLayer već iznosi za svoja tri sloja.
//
// Ono što ovaj hook NE radi: minzoom i simbole. Klasteriranje je opcija
// (`cluster`), uključena za CroAI: 565 točaka, od kojih desetci dijele
// zgradu (ZICER, Slavonska avenija 6) i bez klastera stoje jedna ispod druge,
// pa se klikom vidi samo gornja.

/**
 * Izravno otvaranje popupa po id-u, po MapLibre sloju točaka. Pretraga inače
 * „klikne" na iscrtanu točku, ali točka unutar klastera nije iscrtana.
 */
export const pointPopupOpeners = new Map<string, (id: number) => boolean>();

// Ispod ovoga su sve točke klastera „na istom mjestu": umjesto zumiranja
// klik otvara popis. Zgrada, ne ulica.
const ISTO_MJESTO_M = 50;
// Klasteriranje traje do z23, iznad svakog zuma karte, pa točke na ISTOJ
// koordinati ostaju jedan krug s brojem do kraja. Susjedne kuće se na
// velikom zumu razdvoje same. MapLibre traži `maxzoom` izvora > clusterMaxZoom;
// inače javlja upozorenje.
const CLUSTER_MAX_ZOOM = 23;
const CLUSTER_RADIUS = 16;

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
  /** Klasteri s brojem i popisom za točke na istom mjestu. */
  cluster?: boolean;
  /** Redak u popisu klastera. Bez njega: polje `name`. */
  listLabel?: (p: P) => { name: string; sub?: string; color?: string };
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
  const clusterCircle = `${src}-cluster`;
  const clusterCount = `${src}-cluster-count`;
  const ownLayers = [ringBg, ring, circle, clusterCircle, clusterCount];

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
    map.addSource(src, {
      type: "geojson",
      data,
      ...(spec.cluster && {
        cluster: true,
        maxzoom: CLUSTER_MAX_ZOOM + 1,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: CLUSTER_RADIUS,
      }),
    });
    // Točke izvan klastera. Bez klasteriranja filtar ne treba.
    const single = spec.cluster ? ["!", ["has", "point_count"]] : null;
    const withSingle = (f: unknown) => (single ? (f ? ["all", single, f] : single) : f);

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
          filter: withSingle(spec.ringFilter) as never,
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
      ...(single && { filter: single as never }),
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

    if (spec.cluster) {
      // Navy kao aktivno stanje u ostatku sučelja. Klaster miješa grupe
      // sloja, pa nijedna boja grupe ne bi bila istinita.
      map.addLayer({
        id: clusterCircle,
        type: "circle",
        source: src,
        filter: ["has", "point_count"],
        layout: { visibility: spec.visible ? "visible" : "none" },
        paint: {
          "circle-color": "#002f6c",
          "circle-opacity": 0.9,
          "circle-radius": ["step", ["get", "point_count"], 10, 5, 13, 20, 16, 100, 20],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.6,
        },
      });
      map.addLayer({
        id: clusterCount,
        type: "symbol",
        source: src,
        filter: ["has", "point_count"],
        layout: {
          visibility: spec.visible ? "visible" : "none",
          "text-field": ["get", "point_count_abbreviated"],
          // Regular postoji u obje Carto podloge. „Noto Sans Bold" na tamnoj
          // vraća 404 i ruši CIJELU pločicu izvora, s klasterima i točkama.
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, data]);

  // ── Vidljivost ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;
    for (const id of ownLayers) {
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
    const showFeature = (f: GeoJSON.Feature, back?: () => void) => {
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      const props = unpack(f.properties as Record<string, unknown>, spec.jsonFields);
      const nazad = back
        ? `<button type="button" class="cluster-back" data-back>${svgChevronLeft()} Natrag na popis</button>`
        : "";
      const popup = new maplibregl.Popup({ offset: 12, maxWidth: "340px" })
        .setLngLat(coords)
        .setHTML(nazad + spec.popupHtml(props as P))
        .addTo(map);
      if (back) {
        popup.getElement().querySelector("[data-back]")?.addEventListener("click", back);
      }
      popupRef.current = popup;
    };

    const onClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      showFeature(e.features[0]);
    };

    // Popis točaka klastera. Redak otvara popup te točke, a popup ima put
    // natrag na popis.
    const showList = (center: [number, number], leaves: GeoJSON.Feature[]) => {
      if (popupRef.current) popupRef.current.remove();
      const sorted = [...leaves].sort((a, b) =>
        label(a).name.localeCompare(label(b).name, "hr"),
      );
      const items = sorted
        .map((f, i) => {
          const l = label(f);
          const dot = l.color
            ? `<span class="cluster-dot" style="background:${esc(l.color)}"></span>`
            : "";
          return `<li><button type="button" data-i="${i}">${dot}<span class="cluster-name">${esc(l.name)}</span>${
            l.sub ? `<span class="cluster-sub">${esc(l.sub)}</span>` : ""
          }</button></li>`;
        })
        .join("");
      const popup = new maplibregl.Popup({ offset: 14, maxWidth: "340px" })
        .setLngLat(center)
        .setHTML(
          `<div class="club-popup cluster-list">
             <div class="club-name">${sorted.length} na istom mjestu</div>
             <ul>${items}</ul>
           </div>`,
        )
        .addTo(map);
      popup.getElement().addEventListener("click", (ev) => {
        const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-i]");
        if (!b) return;
        showFeature(sorted[Number(b.dataset.i)], () => showList(center, leaves));
      });
      popupRef.current = popup;
    };

    const label = (f: GeoJSON.Feature) => {
      const p = unpack(f.properties as Record<string, unknown>, spec.jsonFields);
      return spec.listLabel ? spec.listLabel(p as P) : { name: String(p.name ?? f.id) };
    };

    const onClusterClick = async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const source = map.getSource(src) as maplibregl.GeoJSONSource;
      const clusterId = f.properties!.cluster_id as number;
      const center = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const leaves = await source.getClusterLeaves(clusterId, Infinity, 0);
      const pts = leaves.map((l) => (l.geometry as GeoJSON.Point).coordinates);
      const spread = Math.max(...pts.map(([x, y]) => haversineM(pts[0][1], pts[0][0], y, x)));
      if (spread < ISTO_MJESTO_M) {
        showList(center, leaves);
        return;
      }
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center, zoom: Math.min(zoom, map.getMaxZoom()) });
    };

    const pointer = () => (map.getCanvas().style.cursor = "pointer");
    const unpointer = () => (map.getCanvas().style.cursor = "");

    pointPopupOpeners.set(circle, (id) => {
      const f = data.features.find((x) => x.id === id);
      if (!f) return false;
      showFeature(f);
      return true;
    });

    map.on("mousemove", circle, onMove);
    map.on("mouseleave", circle, onLeave);
    map.on("click", circle, onClick);
    if (spec.cluster) {
      map.on("click", clusterCircle, onClusterClick);
      map.on("mouseenter", clusterCircle, pointer);
      map.on("mouseleave", clusterCircle, unpointer);
    }
    return () => {
      pointPopupOpeners.delete(circle);
      map.off("mousemove", circle, onMove);
      map.off("mouseleave", circle, onLeave);
      map.off("click", circle, onClick);
      map.off("click", clusterCircle, onClusterClick);
      map.off("mouseenter", clusterCircle, pointer);
      map.off("mouseleave", clusterCircle, unpointer);
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

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
