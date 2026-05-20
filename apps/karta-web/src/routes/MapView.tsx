import { useCallback, useMemo, useRef } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { ClubModal } from "@/components/ClubModal";
import { ControlsPanel } from "@/components/ControlsPanel";
import { DetailPanel } from "@/components/DetailPanel";
import { LayersFab } from "@/components/LayersFab";
import { MapHeader } from "@/components/MapHeader";
import { RouteHelmet } from "@/components/RouteHelmet";
import { SearchBox } from "@/components/SearchBox";
import { ZupList } from "@/components/ZupList";
import { useClubsLayer } from "@/hooks/useClubsLayer";
import { useGeojsonData } from "@/hooks/useGeojsonData";
import { useJlsInteractions } from "@/hooks/useJlsInteractions";
import { useJlsLayer } from "@/hooks/useJlsLayer";
import { useJlsSelection } from "@/hooks/useJlsSelection";
import { useMapLibre } from "@/hooks/useMapLibre";
import { useNaseljaLayer } from "@/hooks/useNaseljaLayer";
import { useOrtofotoLayer } from "@/hooks/useOrtofotoLayer";
import { usePitchesLayer } from "@/hooks/usePitchesLayer";
import { useStadiumsLayer } from "@/hooks/useStadiumsLayer";
import { useAirportsLayer } from "@/hooks/useAirportsLayer";
import { useUrlSync } from "@/hooks/useUrlSync";
import { useMapState } from "@/lib/MapState";
import type { JlsCollection, JlsFeature } from "@/lib/types";

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { mapRef, loaded, styleRev } = useMapLibre({ container: containerRef });
  const { jls, zupanije, drzava, error } = useGeojsonData();
  const { setSelectedJls, setFocusMode, setShowNaselja, setShowClubs } = useMapState();

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
  useJlsSelection({ map: mapRef.current, loaded, styleRev, jls: jls as JlsCollection | null });
  const { naselja, loading: naseljaLoading } = useNaseljaLayer({
    map: mapRef.current,
    loaded,
    styleRev,
  });
  useOrtofotoLayer({ map: mapRef.current, loaded, styleRev });
  usePitchesLayer({ map: mapRef.current, loaded, styleRev });
  useStadiumsLayer({ map: mapRef.current, loaded, styleRev });
  useAirportsLayer({ map: mapRef.current, loaded, styleRev });
  const { clubs } = useClubsLayer({
    map: mapRef.current,
    loaded,
    styleRev,
    jls: jls as JlsCollection | null,
    silentSelectJls,
  });
  const ensureClubsOn = useCallback(() => setShowClubs(true), [setShowClubs]);
  useUrlSync({ map: mapRef.current, jls: jls as JlsCollection | null, clubs, ensureClubsOn });

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
          <ControlsPanel variant="desktop" />
          <LayersFab />
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
