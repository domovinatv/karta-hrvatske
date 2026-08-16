import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { fetchPinkaCampaigns, PINKA_SITE } from "@/lib/pinka";
import type { PinkaCampaignCollection, PinkaCampaignFeature, PinkaCampaignProperties } from "@/lib/types";
import { svgArrowUpRight, svgMapPin } from "@/lib/svgIcons";

// pinka.io brand coral (tailwind coral.DEFAULT u pinka repu)
const PINKA_CORAL = "#E85D5D";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

const fmtEur = (cents: number): string =>
  (cents / 100).toLocaleString("hr", { maximumFractionDigits: 0 });

const supportersLabel = (n: number): string =>
  n % 10 === 1 && n % 100 !== 11 ? "podržavatelj" : "podržavatelja";

function popupHtml(p: PinkaCampaignProperties): string {
  const raised = p.total_raised_cents;
  const pct =
    p.goal_cents && p.goal_cents > 0
      ? Math.min(100, Math.round((raised / p.goal_cents) * 100))
      : null;
  return `
    <div class="pinka-popup">
      <div class="pk-name">${esc(p.title)}</div>
      ${p.location_name ? `<div class="pk-loc">${svgMapPin()} ${esc(p.location_name)}</div>` : ""}
      ${pct !== null ? `<div class="pk-bar"><div style="width:${pct}%"></div></div>` : ""}
      <div class="pk-stats">
        <strong>${fmtEur(raised)} €</strong>${p.goal_cents ? ` od ${fmtEur(p.goal_cents)} € (${pct}%)` : " prikupljeno"}
        · ${p.contributor_count} ${supportersLabel(p.contributor_count)}
      </div>
      <a class="pk-donate-btn" href="${PINKA_SITE}/c/${esc(p.slug)}" target="_blank" rel="noopener">Doniraj na pinka.io ${svgArrowUpRight(12)}</a>
    </div>`;
}

interface Options {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  /** Deep-link (/kampanje?c={slug}) — fly to the campaign and open its popup once. */
  focusSlug?: string | null;
}

// Sloj "Pinka kampanje": javne aktivne pinka.io kampanje s koordinatama,
// dohvaćene live s api.domovina.ai pri prvom uključenju. Klik na marker
// otvara popup s napretkom i linkom na donaciju.
export function usePinkaLayer({ map, loaded, styleRev, focusSlug }: Options) {
  const { showPinka } = useMapState();
  const [campaigns, setCampaigns] = useState<PinkaCampaignCollection | null>(null);
  // ref umjesto state-a — isti razlog kao u useClubsLayer (cleanup bi otkazao
  // inflight fetch na re-render)
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const focusedRef = useRef<string | null>(null);

  // Lazy fetch.
  useEffect(() => {
    if (!showPinka || campaigns || loadingRef.current) return;
    loadingRef.current = true;
    fetchPinkaCampaigns()
      .then(setCampaigns)
      .catch((e: unknown) => {
        console.error("Pinka campaigns fetch failed", e);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showPinka, campaigns]);

  // Add source + layer.
  useEffect(() => {
    if (!map || !loaded || !campaigns) return;
    if (map.getSource("pinka-campaigns")) return;
    map.addSource("pinka-campaigns", { type: "geojson", data: campaigns });
    map.addLayer({
      id: "pinka-campaigns-circle",
      type: "circle",
      source: "pinka-campaigns",
      layout: { visibility: showPinka ? "visible" : "none" },
      paint: {
        "circle-color": PINKA_CORAL,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5, 9, 8, 13, 12] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.4,
          1.4,
        ],
        "circle-opacity": 0.92,
        "circle-stroke-opacity": 0.95,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, campaigns]);

  // Toggle visibility.
  useEffect(() => {
    if (!map?.getLayer("pinka-campaigns-circle")) return;
    map.setLayoutProperty(
      "pinka-campaigns-circle",
      "visibility",
      showPinka ? "visible" : "none",
    );
    if (!showPinka && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showPinka, styleRev]);

  // Hover + click.
  useEffect(() => {
    if (!map?.getLayer("pinka-campaigns-circle") || !campaigns) return;
    let hovered: number | null = null;

    const handleMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const fid = (e.features[0].id ?? e.features[0].properties.num_id) as number | undefined;
      if (fid == null) return;
      if (hovered !== null && hovered !== fid) {
        map.setFeatureState({ source: "pinka-campaigns", id: hovered }, { hover: false });
      }
      hovered = fid;
      map.setFeatureState({ source: "pinka-campaigns", id: fid }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "pinka-campaigns", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new maplibregl.Popup({
        offset: 12,
        maxWidth: "300px",
        className: "club-popup-wrap",
      })
        .setLngLat(coords)
        .setHTML(popupHtml(f.properties as PinkaCampaignProperties))
        .addTo(map);
    };

    map.on("mousemove", "pinka-campaigns-circle", handleMove);
    map.on("mouseleave", "pinka-campaigns-circle", handleLeave);
    map.on("click", "pinka-campaigns-circle", handleClick);

    return () => {
      map.off("mousemove", "pinka-campaigns-circle", handleMove);
      map.off("mouseleave", "pinka-campaigns-circle", handleLeave);
      map.off("click", "pinka-campaigns-circle", handleClick);
    };
  }, [map, styleRev, campaigns]);

  // Deep-link focus: /kampanje?c={slug} → flyTo + popup (jednom po slugu).
  useEffect(() => {
    if (!map || !loaded || !campaigns || !focusSlug) return;
    if (focusedRef.current === focusSlug) return;
    const f = (campaigns.features as PinkaCampaignFeature[]).find(
      (x) => x.properties.slug === focusSlug,
    );
    if (!f) return;
    focusedRef.current = focusSlug;
    const coords = f.geometry.coordinates as [number, number];
    map.flyTo({ center: coords, zoom: 12, duration: 1200 });
    if (popupRef.current) popupRef.current.remove();
    popupRef.current = new maplibregl.Popup({
      offset: 12,
      maxWidth: "300px",
      className: "club-popup-wrap",
    })
      .setLngLat(coords)
      .setHTML(popupHtml(f.properties))
      .addTo(map);
  }, [map, loaded, campaigns, focusSlug]);

  return { campaigns };
}
