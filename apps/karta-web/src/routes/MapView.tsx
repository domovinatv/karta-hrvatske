import { useRef } from "react";
import { Helmet } from "react-helmet-async";
import { MapHeader } from "@/components/MapHeader";
import { useGeojsonData } from "@/hooks/useGeojsonData";
import { useJlsLayer } from "@/hooks/useJlsLayer";
import { useMapLibre } from "@/hooks/useMapLibre";

// Phase 1 scaffold: header + container + map with JLS / županije / državna
// granica layers. Search, naselja, clubs, ortofoto, bottom sheet etc come
// in later phases as standalone hooks / components hung off the same map.
export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialDark = document.documentElement.getAttribute("data-theme") !== "light";
  const { mapRef, loaded } = useMapLibre({
    container: containerRef,
    initialTheme: initialDark ? "dark" : "light",
  });
  const { jls, zupanije, drzava, error } = useGeojsonData();

  useJlsLayer({
    map: mapRef.current,
    loaded,
    jls,
    zupanije,
    drzava,
    dark: initialDark,
  });

  return (
    <>
      <Helmet>
        <title>DOMOVINA Karta — Geografija Hrvatske</title>
      </Helmet>
      <MapHeader />
      <div className="relative flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ background: "var(--map-bg)" }}
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
    </>
  );
}
