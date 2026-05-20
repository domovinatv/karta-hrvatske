import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { HR_BOUNDS, STYLE_DARK, STYLE_LIGHT } from "@/lib/style";

interface UseMapLibreOptions {
  container: React.RefObject<HTMLDivElement>;
  initialTheme?: "light" | "dark";
}

// Initialises a MapLibre instance once when the container ref is attached.
// Returns the map ref + loaded flag so callers can register sources/layers
// only after style.load has fired (otherwise addSource throws).
export function useMapLibre({ container, initialTheme = "dark" }: UseMapLibreOptions) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    // Register PMTiles protocol so future PMTiles sources work without
    // reinstall — same pattern as the legacy HTML.
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: container.current,
      style: initialTheme === "dark" ? STYLE_DARK : STYLE_LIGHT,
      center: [16.5, 44.5],
      zoom: 6.5,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.getCanvasContainer().addEventListener("contextmenu", (e) => e.preventDefault());

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
      "bottom-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("load", () => {
      map.fitBounds(HR_BOUNDS, { padding: 25, duration: 0 });
      setLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // initialTheme is captured at first init; theme switches are handled by
    // callers via map.setStyle() after the fact (Phase 2).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  return { mapRef, loaded };
}
