import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMapState } from "@/lib/MapState";
import { HR_BOUNDS, STYLE_DARK, STYLE_LIGHT } from "@/lib/style";

interface UseMapLibreOptions {
  container: React.RefObject<HTMLDivElement>;
}

// Initializes a MapLibre instance and tracks style version. Theme changes
// trigger setStyle({ diff: false }) which wipes sources/layers — styleRev
// bumps on every fresh style.load so layer hooks can re-add their work.
export function useMapLibre({ container }: UseMapLibreOptions) {
  const { theme } = useMapState();
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [styleRev, setStyleRev] = useState(0);

  // First-mount: spin up MapLibre.
  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: container.current,
      style: theme === "dark" ? STYLE_DARK : STYLE_LIGHT,
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

    const handleStyleLoad = () => {
      setLoaded(true);
      setStyleRev((r) => r + 1);
    };
    map.on("style.load", handleStyleLoad);

    map.on("load", () => {
      map.fitBounds(HR_BOUNDS, { padding: 25, duration: 0 });
    });

    mapRef.current = map;
    // Expose for e2e tests / debugging; harmless in production.
    if (typeof window !== "undefined") {
      (window as unknown as { _gisMap?: maplibregl.Map })._gisMap = map;
    }

    return () => {
      map.off("style.load", handleStyleLoad);
      map.remove();
      mapRef.current = null;
      setLoaded(false);
      if (typeof window !== "undefined") {
        delete (window as unknown as { _gisMap?: maplibregl.Map })._gisMap;
      }
    };
    // theme captured at init; subsequent changes handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  // Theme change → setStyle. The style.load event we already subscribe to
  // handles re-flagging loaded + bumping styleRev so layer hooks rerun.
  useEffect(() => {
    if (!mapRef.current) return;
    const desired = theme === "dark" ? STYLE_DARK : STYLE_LIGHT;
    setLoaded(false);
    mapRef.current.setStyle(desired, { diff: false });
  }, [theme]);

  return { mapRef, loaded, styleRev };
}
