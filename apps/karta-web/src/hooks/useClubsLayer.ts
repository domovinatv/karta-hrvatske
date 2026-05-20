import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useMapState } from "@/lib/MapState";
import { computeBounds } from "@/lib/geo";
import type { ClubCollection, ClubFeature, ClubProperties, JlsCollection } from "@/lib/types";

const TIER_COLOR_EXPR = [
  "match",
  ["get", "top_tier"],
  1,
  "#d4322f",
  2,
  "#e8853c",
  3,
  "#e2b94f",
  4,
  "#a8c256",
  5,
  "#5fa8a8",
  6,
  "#5b8aaa",
  7,
  "#7e7eb8",
  8,
  "#8d99ae",
  "#8d99ae",
] as never;

const TIER_TEXT_COLOR: Record<number, string> = {
  1: "#d4322f",
  2: "#e8853c",
  3: "#e2b94f",
  4: "#a8c256",
  5: "#5fa8a8",
  6: "#5b8aaa",
  7: "#7e7eb8",
  8: "#8d99ae",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

interface Options {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
  jls: JlsCollection | null;
  /** Programmatic JLS select used when a club marker is clicked (silent + skipFit). */
  silentSelectJls: (id: number) => void;
}

export function useClubsLayer({ map, loaded, styleRev, jls, silentSelectJls }: Options) {
  const { showClubs, openClubModal } = useMapState();
  const [clubs, setClubs] = useState<ClubCollection | null>(null);
  // `loading` lives in a ref (not state) — keeping it as state caused the
  // effect to re-run on setLoading(true), cancel itself via cleanup, and
  // drop the inflight fetch's result. Ref doesn't trigger re-renders, so
  // the original effect run is the only one alive while the fetch is open.
  const loadingRef = useRef(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Lazy fetch.
  useEffect(() => {
    if (!showClubs || clubs || loadingRef.current) return;
    loadingRef.current = true;
    fetch("/data/clubs.geojson")
      .then((r) => r.json())
      .then((fc: ClubCollection) => {
        fc.features.forEach((f) => {
          if (f.id == null && f.properties.id != null) f.id = f.properties.id;
        });
        setClubs(fc);
      })
      .catch((e: unknown) => {
        console.error("Clubs fetch failed", e);
      })
      .finally(() => {
        loadingRef.current = false;
      });
  }, [showClubs, clubs]);

  // Add layer.
  useEffect(() => {
    if (!map || !loaded || !clubs) return;
    if (map.getSource("hr-clubs")) return;
    map.addSource("hr-clubs", { type: "geojson", data: clubs });
    map.addLayer({
      id: "hr-clubs-circle",
      type: "circle",
      source: "hr-clubs",
      layout: { visibility: showClubs ? "visible" : "none" },
      paint: {
        "circle-color": TIER_COLOR_EXPR,
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          ["interpolate", ["linear"], ["coalesce", ["get", "top_tier"], 8], 1, 5, 8, 2],
          8,
          ["interpolate", ["linear"], ["coalesce", ["get", "top_tier"], 8], 1, 8, 8, 3.5],
          12,
          ["interpolate", ["linear"], ["coalesce", ["get", "top_tier"], 8], 1, 14, 8, 6],
        ] as never,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          2.2,
          1.2,
        ],
        "circle-opacity": 0.92,
        "circle-stroke-opacity": 0.95,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, loaded, styleRev, clubs]);

  // Toggle visibility.
  useEffect(() => {
    if (!map?.getLayer("hr-clubs-circle")) return;
    map.setLayoutProperty("hr-clubs-circle", "visibility", showClubs ? "visible" : "none");
    if (!showClubs && popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, [map, showClubs, styleRev]);

  // Hover + click on circles.
  useEffect(() => {
    if (!map?.getLayer("hr-clubs-circle") || !clubs) return;
    let hovered: number | null = null;

    const handleMove = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const fid = (e.features[0].id ?? e.features[0].properties.id) as number | undefined;
      if (fid == null) return;
      if (hovered !== null && hovered !== fid) {
        map.setFeatureState({ source: "hr-clubs", id: hovered }, { hover: false });
      }
      hovered = fid;
      map.setFeatureState({ source: "hr-clubs", id: fid }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLeave = () => {
      if (hovered !== null) {
        map.setFeatureState({ source: "hr-clubs", id: hovered }, { hover: false });
        hovered = null;
      }
      map.getCanvas().style.cursor = "";
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties as ClubProperties;
      const coords = (f.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

      if (popupRef.current) popupRef.current.remove();

      const links: string[] = [];
      if (p.website) links.push(`<a href="${esc(p.website)}" target="_blank" rel="noopener">web</a>`);
      if (p.email) links.push(`<a href="mailto:${esc(p.email)}">email</a>`);
      if (p.phone) links.push(`<a href="tel:${esc(p.phone)}">tel</a>`);
      if (p.fb_url) links.push(`<a href="${esc(p.fb_url)}" target="_blank" rel="noopener">FB</a>`);
      if (p.ig_url) links.push(`<a href="${esc(p.ig_url)}" target="_blank" rel="noopener">IG</a>`);
      if (p.x_url) links.push(`<a href="${esc(p.x_url)}" target="_blank" rel="noopener">X</a>`);

      const tierColor = p.top_tier ? TIER_TEXT_COLOR[p.top_tier] || "#8d99ae" : "#8d99ae";
      const html = `
        <div class="club-popup">
          <div class="club-head">
            <img class="club-logo" src="/logos/${esc(p.slug)}.png" onerror="this.style.display='none'" alt="">
            <div class="club-title">
              <div class="club-name">${esc(p.canonical_name)}</div>
              ${p.top_league_name ? `<div class="club-league" style="border-left:3px solid ${tierColor};padding-left:6px;">${esc(p.top_league_name)}${p.top_tier ? ` · tier ${p.top_tier}` : ""}</div>` : ""}
            </div>
          </div>
          ${p.city || p.county ? `<div class="club-row"><span class="k">Lokacija</span><span class="v">${esc([p.city, p.county].filter(Boolean).join(", "))}</span></div>` : ""}
          ${p.stadium_name ? `<div class="club-row"><span class="k">Stadion</span><span class="v">${esc(p.stadium_name)}${p.stadium_capacity ? ` (${Number(p.stadium_capacity).toLocaleString("hr")})` : ""}</span></div>` : ""}
          ${p.founded_year ? `<div class="club-row"><span class="k">Osnovan</span><span class="v">${p.founded_year}</span></div>` : ""}
          ${p.president ? `<div class="club-row"><span class="k">Predsjednik</span><span class="v">${esc(p.president)}</span></div>` : ""}
          ${p.address ? `<div class="club-row"><span class="k">Adresa</span><span class="v">${esc(p.address)}</span></div>` : ""}
          ${links.length ? `<div class="club-links">${links.join(" · ")}</div>` : ""}
          <button class="club-details-btn" type="button">Sve detalje →</button>
        </div>`;

      const popup = new maplibregl.Popup({
        offset: 12,
        maxWidth: "320px",
        className: "club-popup-wrap",
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
      popupRef.current = popup;

      // Find the original feature with structured arrays preserved
      // (MapLibre serializes properties to strings on click events).
      const orig = (clubs.features as ClubFeature[]).find(
        (x) => (x.id ?? x.properties.id) === (f.id ?? p.id),
      );
      const origProps = orig ? orig.properties : p;
      const origCoords = orig ? (orig.geometry.coordinates as [number, number]) : coords;

      const popupEl = popup.getElement();
      const btn = popupEl?.querySelector(".club-details-btn") as HTMLButtonElement | null;
      btn?.addEventListener("click", () => {
        openClubModal({ ...origProps, _lat: origCoords[1], _lng: origCoords[0] });
      });

      // Silent JLS highlight (focus + naselja, no detail update, no fit).
      if (jls) {
        const jlsUnder = map.queryRenderedFeatures(e.point, { layers: ["hr-fill"] });
        if (jlsUnder.length) {
          const id = jlsUnder[0].id as number | undefined;
          if (id != null) silentSelectJls(id);
        }
      }
    };

    map.on("mousemove", "hr-clubs-circle", handleMove);
    map.on("mouseleave", "hr-clubs-circle", handleLeave);
    map.on("click", "hr-clubs-circle", handleClick);

    return () => {
      map.off("mousemove", "hr-clubs-circle", handleMove);
      map.off("mouseleave", "hr-clubs-circle", handleLeave);
      map.off("click", "hr-clubs-circle", handleClick);
    };
  }, [map, styleRev, clubs, jls, silentSelectJls, openClubModal]);

  return { clubs };
}

// Helper to keep computeBounds importable from this file (used by Phase 4
// deep-link routes when navigating to /klub/:slug to fit the marker view).
export { computeBounds };
