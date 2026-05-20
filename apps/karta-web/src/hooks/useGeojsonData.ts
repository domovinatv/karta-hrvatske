import { useEffect, useState } from "react";
import { v } from "@/lib/version";

interface DataState {
  jls: GeoJSON.FeatureCollection | null;
  zupanije: GeoJSON.FeatureCollection | null;
  drzava: GeoJSON.FeatureCollection | null;
  error: string | null;
}

// Pulls the three eager geojson sources (JLS, županije, državna granica)
// from /data/. Naselja and clubs stay lazy and are loaded on toggle. The
// hook resolves all three in parallel — partial results aren't surfaced
// to avoid a half-painted map.
export function useGeojsonData() {
  const [state, setState] = useState<DataState>({
    jls: null,
    zupanije: null,
    drzava: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(v("/data/jls.geojson")).then((r) => r.json()),
      fetch(v("/data/zupanije.geojson")).then((r) => r.json()),
      fetch(v("/data/drzava.geojson")).then((r) => r.json()),
    ])
      .then(([jls, zupanije, drzava]) => {
        if (cancelled) return;
        setState({ jls, zupanije, drzava, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({ ...s, error: String(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
