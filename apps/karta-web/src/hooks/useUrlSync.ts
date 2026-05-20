import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMapState } from "@/lib/MapState";
import { computeBounds } from "@/lib/geo";
import { slugify } from "@/lib/slug";
import type {
  ClubCollection,
  ClubFeature,
  JlsCollection,
  JlsFeature,
} from "@/lib/types";

interface Options {
  map: MapLibreMap | null;
  jls: JlsCollection | null;
  clubs: ClubCollection | null;
  /** Trigger lazy clubs load when a /klub/:slug route is hit before clubs are in. */
  ensureClubsOn: () => void;
}

// Bi-directional sync between react-router URL and MapState. Two effects:
//
//   URL → state: on path change, look up the entity by slug and dispatch the
//     same selection effects that a click would (selectedJls / activeZup /
//     openClubModal). Guarded by checking the existing state so a navigate()
//     that we just produced doesn't fire a redundant dispatch.
//
//   state → URL: when selection changes from any other source (map click,
//     search), navigate() to the canonical URL. Same guard prevents loops.
//
// The route `/` is treated as "no selection" — clearing state navigates
// back here.
export function useUrlSync({ map, jls, clubs, ensureClubsOn }: Options) {
  const params = useParams<{ slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    selectedJls,
    activeZup,
    clubModal,
    setSelectedJls,
    setSelectedNaselje,
    setActiveZup,
    setFocusMode,
    setShowNaselja,
    openClubModal,
    closeClubModal,
  } = useMapState();
  // Track the URL we set so reverse-sync doesn't re-fire on our own write.
  const lastWrittenUrl = useRef<string | null>(null);

  // URL → state
  useEffect(() => {
    if (!jls) return;
    const path = location.pathname;
    // Index path: clear everything
    if (path === "/" || path === "") {
      if (selectedJls !== null) setSelectedJls(null);
      if (activeZup !== null) setActiveZup(null);
      if (clubModal !== null) closeClubModal();
      return;
    }

    const slug = params.slug;
    if (!slug) return;

    if (path.startsWith("/zupanija/")) {
      const zup = (jls.features as JlsFeature[])
        .map((f) => f.properties.zupanija)
        .find((z) => slugify(z) === slug);
      if (!zup) return;
      if (activeZup !== zup) {
        setActiveZup(zup);
        if (map) {
          const feats = (jls.features as JlsFeature[]).filter(
            (f) => f.properties.zupanija === zup,
          );
          if (feats.length) {
            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity;
            for (const f of feats) {
              const b = computeBounds(f.geometry);
              if (b[0][0] < minX) minX = b[0][0];
              if (b[0][1] < minY) minY = b[0][1];
              if (b[1][0] > maxX) maxX = b[1][0];
              if (b[1][1] > maxY) maxY = b[1][1];
            }
            map.fitBounds(
              [
                [minX, minY],
                [maxX, maxY],
              ],
              { padding: 40, duration: 800 },
            );
          }
        }
      }
      return;
    }

    if (path.startsWith("/jls/")) {
      const f = (jls.features as JlsFeature[]).find(
        (x) => slugify(x.properties.name) === slug,
      );
      if (!f) return;
      if (selectedJls !== f.id) {
        setSelectedNaselje(null);
        setSelectedJls(f.id);
        setFocusMode(true);
        setShowNaselja(true);
        if (map) {
          const b = computeBounds(f.geometry);
          map.fitBounds(b, { padding: 50, maxZoom: 12, duration: 800 });
        }
      }
      return;
    }

    if (path.startsWith("/klub/")) {
      ensureClubsOn();
      if (!clubs) return;
      const f = (clubs.features as ClubFeature[]).find((x) => x.properties.slug === slug);
      if (!f) return;
      if (clubModal?.slug !== slug) {
        const coords = f.geometry.coordinates as [number, number];
        openClubModal({ ...f.properties, _lat: coords[1], _lng: coords[0] });
      }
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, params.slug, jls, clubs, map]);

  // state → URL
  useEffect(() => {
    let desired = "/";
    if (clubModal?.slug) {
      desired = `/klub/${clubModal.slug}`;
    } else if (selectedJls !== null && jls) {
      const f = (jls.features as JlsFeature[]).find((x) => x.id === selectedJls);
      if (f) desired = `/jls/${slugify(f.properties.name)}`;
    } else if (activeZup) {
      desired = `/zupanija/${slugify(activeZup)}`;
    }

    if (desired === location.pathname) return;
    if (lastWrittenUrl.current === desired) return;
    lastWrittenUrl.current = desired;
    navigate(desired, { replace: false });
  }, [selectedJls, activeZup, clubModal, jls, location.pathname, navigate]);
}
