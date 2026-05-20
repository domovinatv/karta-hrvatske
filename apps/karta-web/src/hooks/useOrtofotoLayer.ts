import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useMapState } from "@/lib/MapState";

// Esri World Imagery raster. Inserted below hr-fill so our vector layers
// (JLS / naselja / clubs) draw on top. When on, polygon fill-opacity drops
// (handled inside the JLS / naselja layer hooks via the ORTO preset).
//
// Alternative HR-authoritative source kept as a comment for future swap:
// https://geoportal.dgu.hr/services/inspire/orthophoto_2019-2020/wms — WMS
// is bbox-based so slower for interactive panning.
const ORTO_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function useOrtofotoLayer({
  map,
  loaded,
  styleRev,
}: {
  map: MapLibreMap | null;
  loaded: boolean;
  styleRev: number;
}) {
  const { showOrto } = useMapState();

  useEffect(() => {
    if (!map || !loaded || !showOrto) return;
    if (map.getSource("hr-orto")) {
      map.setLayoutProperty("hr-orto", "visibility", "visible");
      return;
    }
    map.addSource("hr-orto", {
      type: "raster",
      tiles: [ORTO_TILES],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
    });
    const before = map.getLayer("hr-fill") ? "hr-fill" : undefined;
    map.addLayer(
      {
        id: "hr-orto",
        type: "raster",
        source: "hr-orto",
        paint: { "raster-opacity": 1.0 },
      },
      before,
    );
  }, [map, loaded, styleRev, showOrto]);

  // Hide when toggled off (source stays in memory so future toggles are instant).
  useEffect(() => {
    if (!map?.getLayer("hr-orto")) return;
    map.setLayoutProperty("hr-orto", "visibility", showOrto ? "visible" : "none");
  }, [map, showOrto, styleRev]);
}
