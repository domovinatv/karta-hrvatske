import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BottomSheet } from "@/components/BottomSheet";
import { ClubModal } from "@/components/ClubModal";
import { DetailPanel } from "@/components/DetailPanel";
import { LayersFab } from "@/components/LayersFab";
import { LayersPanel } from "@/components/LayersPanel";
import { MapHeader } from "@/components/MapHeader";
import { RouteHelmet } from "@/components/RouteHelmet";
import { SearchBox } from "@/components/SearchBox";
import { ZupList } from "@/components/ZupList";
import { useClubsLayer } from "@/hooks/useClubsLayer";
import { useCrkveLayer } from "@/hooks/useCrkveLayer";
import { useGeojsonData } from "@/hooks/useGeojsonData";
import { useJlsInteractions } from "@/hooks/useJlsInteractions";
import { useJlsLayer } from "@/hooks/useJlsLayer";
import { useJlsSelection } from "@/hooks/useJlsSelection";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMapLibre } from "@/hooks/useMapLibre";
import { useKvartoviLayer } from "@/hooks/useKvartoviLayer";
import { useNaseljaLayer } from "@/hooks/useNaseljaLayer";
import { useOrtofotoLayer } from "@/hooks/useOrtofotoLayer";
import { usePinkaLayer } from "@/hooks/usePinkaLayer";
import { usePitchesLayer } from "@/hooks/usePitchesLayer";
import { useStadiumsLayer } from "@/hooks/useStadiumsLayer";
import { useAirportsLayer } from "@/hooks/useAirportsLayer";
import { useUrlSync } from "@/hooks/useUrlSync";
import { useZupeLayer } from "@/hooks/useZupeLayer";
import { useBiskupijeLayer } from "@/hooks/useBiskupijeLayer";
import { useSkoleLayer, useUstanoveLayer, useVrticiLayer } from "@/hooks/useOouLayer";
import { useMapState } from "@/lib/MapState";
import { HR_BOUNDS } from "@/lib/style";
import type { JlsCollection, JlsFeature } from "@/lib/types";

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { mapRef, loaded, styleRev } = useMapLibre({ container: containerRef });
  const { jls, zupanije, drzava, error } = useGeojsonData();
  const [layersOpen, setLayersOpen] = useState(false);
  const {
    reset,
    setSelectedJls,
    setFocusMode,
    setShowNaselja,
    setShowClubs,
    setShowPinka,
  } = useMapState();

  // "Fit Hrvatska" je dosad zvao samo reset() — HR_BOUNDS se koristio isključivo
  // pri inicijalizaciji karte, pa se kamera nikad nije vraćala. Sad i zaista fita.
  const handleFitHome = useCallback(() => {
    reset();
    setLayersOpen(false);
    mapRef.current?.fitBounds(HR_BOUNDS, { padding: 25, duration: 800 });
  }, [reset, mapRef]);

  // Deep-link /kampanje[?c={slug}] — uključi pinka sloj; ?c fokusira kampanju.
  const routerLocation = useLocation();
  const isPinkaRoute = routerLocation.pathname === "/kampanje";
  const pinkaFocusSlug = isPinkaRoute
    ? new URLSearchParams(routerLocation.search).get("c")
    : null;
  useEffect(() => {
    if (isPinkaRoute) setShowPinka(true);
  }, [isPinkaRoute, setShowPinka]);

  const totalArea = useMemo(() => {
    if (!jls) return 1;
    return (jls.features as JlsFeature[]).reduce((acc, f) => acc + (f.properties.area_m2 ?? 0), 0);
  }, [jls]);

  const silentSelectJls = useCallback(
    (id: number) => {
      setSelectedJls(id);
      setFocusMode(true);
      setShowNaselja(true);
    },
    [setSelectedJls, setFocusMode, setShowNaselja],
  );

  useJlsLayer({ map: mapRef.current, loaded, styleRev, jls, zupanije, drzava });
  useJlsInteractions({ map: mapRef.current, loaded, styleRev, jls: jls as JlsCollection | null });
  const { naselja, loading: naseljaLoading } = useNaseljaLayer({
    map: mapRef.current,
    loaded,
    styleRev,
  });
  useJlsSelection({
    map: mapRef.current,
    loaded,
    styleRev,
    jls: jls as JlsCollection | null,
    naselja,
  });
  useKvartoviLayer({
    map: mapRef.current,
    loaded,
    styleRev,
    jls: jls as JlsCollection | null,
    naselja,
  });
  useOrtofotoLayer({ map: mapRef.current, loaded, styleRev });
  useCrkveLayer({ map: mapRef.current, loaded, styleRev });
  useZupeLayer({ map: mapRef.current, loaded, styleRev });
  useBiskupijeLayer({ map: mapRef.current, loaded, styleRev });
  useSkoleLayer({ map: mapRef.current, loaded, styleRev });
  useVrticiLayer({ map: mapRef.current, loaded, styleRev });
  useUstanoveLayer({ map: mapRef.current, loaded, styleRev });
  usePitchesLayer({ map: mapRef.current, loaded, styleRev });
  useStadiumsLayer({ map: mapRef.current, loaded, styleRev });
  useAirportsLayer({ map: mapRef.current, loaded, styleRev });
  usePinkaLayer({ map: mapRef.current, loaded, styleRev, focusSlug: pinkaFocusSlug });
  const { clubs } = useClubsLayer({
    map: mapRef.current,
    loaded,
    styleRev,
    jls: jls as JlsCollection | null,
    silentSelectJls,
  });
  const ensureClubsOn = useCallback(() => setShowClubs(true), [setShowClubs]);
  useUrlSync({ map: mapRef.current, jls: jls as JlsCollection | null, clubs, ensureClubsOn });
  useKeyboardShortcuts({ onFitHome: handleFitHome });

  // Točni brojevi iz stvarno učitanih kolekcija — bolji od statičnih u registru,
  // koji zastare čim se pipeline osvježi.
  const layerCounts = useMemo(
    () => ({
      klubovi: clubs?.features.length,
      naselja: naselja?.features.length,
    }),
    [clubs, naselja],
  );

  // Search & sheet need a way to lazy-load naselja before user toggles the
  // layer button. setShowNaselja(true) triggers the fetch via useNaseljaLayer's
  // own effect, so we expose a tiny wrapper.
  const kickNaseljaLoad = useCallback(() => setShowNaselja(true), [setShowNaselja]);

  return (
    <>
      <RouteHelmet jls={jls as JlsCollection | null} clubs={clubs} />
      <MapHeader />
      <main className="grid flex-1 overflow-hidden md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr_380px]">
        {/* Desktop left sidebar: search + zup list */}
        <aside
          className="hidden overflow-y-auto border-r md:block"
          style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
        >
          <h2
            className="m-0 flex items-baseline justify-between border-b px-5 py-4 font-display text-[13px] font-semibold uppercase tracking-wider text-muted"
            style={{ borderColor: "var(--line)" }}
          >
            Hrvatska
            <span className="font-mono text-[10px] normal-case text-[var(--accent-2)]">
              556 JLS
            </span>
          </h2>
          <SearchBox
            map={mapRef.current}
            jls={jls as JlsCollection | null}
            naselja={naselja}
            naseljaLoading={naseljaLoading}
            onKickNaseljaLoad={kickNaseljaLoad}
          />
          <h2
            className="m-0 flex items-baseline justify-between border-b px-5 py-4 font-display text-[13px] font-semibold uppercase tracking-wider text-muted"
            style={{ borderColor: "var(--line)" }}
          >
            Po županijama
            <span className="font-mono text-[10px] normal-case text-[var(--accent-2)]">
              klik = filter
            </span>
          </h2>
          <ZupList map={mapRef.current} jls={jls as JlsCollection | null} />
        </aside>

        {/* Map (center) */}
        <div className="relative">
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ background: "var(--map-bg)" }}
          />
          <LayersPanel variant="desktop" counts={layerCounts} onFitHome={handleFitHome} />
          <LayersFab
            open={layersOpen}
            onOpenChange={setLayersOpen}
            counts={layerCounts}
            onFitHome={handleFitHome}
          />
          {error && (
            <div
              className="absolute inset-0 flex items-center justify-center px-6 text-center"
              style={{ background: "var(--bg)" }}
            >
              <div>
                <h2 className="font-display text-xl text-ink">Greška pri učitavanju podataka</h2>
                <p className="mt-2 text-sm text-muted">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Desktop right sidebar: detail */}
        <aside
          className="hidden overflow-y-auto border-l lg:block"
          style={{ background: "var(--bg-2)", borderColor: "var(--line)" }}
        >
          <h2
            className="m-0 flex items-baseline justify-between border-b px-5 py-4 font-display text-[13px] font-semibold uppercase tracking-wider text-muted"
            style={{ borderColor: "var(--line)" }}
          >
            Detalji
            <span className="font-mono text-[10px] normal-case text-[var(--accent-2)]">
              click ili search
            </span>
          </h2>
          <DetailPanel jls={jls as JlsCollection | null} naselja={naselja} totalArea={totalArea} />
        </aside>
      </main>

      <BottomSheet
        map={mapRef.current}
        jls={jls as JlsCollection | null}
        naselja={naselja}
        naseljaLoading={naseljaLoading}
        onKickNaseljaLoad={kickNaseljaLoad}
        totalArea={totalArea}
      />
      <ClubModal />
    </>
  );
}
