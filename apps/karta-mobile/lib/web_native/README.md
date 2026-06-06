# `lib/web_native/` — DEPRECATED experiment

**Status:** dead code, kept for historical reference. Do not extend.

**Date:** 2026-05-15 (single-day experiment).

## What this is

A pure-Flutter web map renderer at the `/native` route:

- `raster_basemap.dart` — `flutter_map 8.x` `FlutterMap` + CARTO Positron raster tiles.
- `geojson_layer.dart` — `CustomPainter` drawing 556 JLS polygons + županije + state border over the basemap.
- `geo_features.dart` — isolate-parsed `GeoLayer` from the existing GeoJSON dataset.
- `projection.dart`, `geometry/point_in_polygon.dart`, `geometry/bbox_index.dart` — pure-Dart Web Mercator + hit-test prefilter (well-tested in `test/web_native/math_test.dart`).

The route is wired in `lib/main.dart` (`/` → MapLibre, `/native` → this experiment).

## Why it was built

Hypothesis: on web, the `maplibre` package incurs JS↔Dart bridge overhead for every map event (the MapLibre GL JS canvas lives in DOM as a platform view). A pure-Flutter renderer that draws polygons inside Skia/Skwasm with no DOM hole could be faster.

This was true in theory and partially true in practice — pan/zoom of just the basemap (Phase 1) felt fluid. But once we layered 556 polygons on top (Phase 2), the experiment was decisively beaten by the pure HTML reference (`hrvatska_full.html`) in side-by-side comparison, even in `--wasm --release` builds.

## Why it is dead

1. **Doesn't beat the HTML reference.** The whole point was to be faster than MapLibre GL JS for web. It is not.
2. **Architectural ceiling.** Even with our own `WebMercator` and inline math, 100k+ vertex re-projection per frame in Dart can't match what `maplibre-gl-js` does with shader-side transforms on GPU. We'd need to write GL shaders ourselves (Skwasm doesn't expose them cleanly), which means rebuilding what `maplibre-gl-js` already does — for less.
3. **Final decision (project owner, 2026-05-15):** ship strategy is **iOS+Android = Flutter `maplibre` (native)**, **web = standalone HTML reference** (`hrvatska_full.html` in `draft_karta_rh` repo). Flutter web is not used as the production web target.

## What was learned (worth keeping)

- Pure-Flutter web rendering is **fluid for UI** (panels, sidebars, animations) under Skwasm — confirmed.
- It is **not fluid for vector map rendering** at this scale without writing custom GL.
- `flutter_map` 8.x: API is solid, raster tile fetching works on web, custom layers via `MapCamera.of(context)` + `CustomPainter` integrate cleanly.
- `flutter_map`'s `camera.latLngToScreenOffset(LatLng)` is a per-vertex method call with allocation overhead — fine for hundreds of points, costly for 100k+.
- Skia `Path.moveTo`/`lineTo` per frame for 556 polygons is *not* the bottleneck — projection is.
- CARTO Positron `@2x` raster tiles work via `flutter_map` with `tileDimension: 512` + `zoomOffset: -1`.
- Math utilities (projection, PIP, bbox index) and the basemap widget are reusable if anyone ever revisits this path.

## What was NOT built

Phases 3, 4, 5 from the original plan were skipped after the Phase 2 perf verdict:

- Phase 3: interactions (hover, click, selection, focus mode, color modes)
- Phase 4: labels + naselja layer
- Phase 5: polish + benchmark

## Why keep this in the repo

- Documentation of the experiment outcome, so the next person who has the same idea doesn't waste a day.
- Reusable math (`projection.dart`, `point_in_polygon.dart`, `bbox_index.dart`) with passing tests.
- Working `flutter_map` integration reference if a future feature genuinely needs flutter_map (e.g. simple raster preview elsewhere in the app).
- The `/native` route still loads and renders — useful for showing the perf gap to anyone questioning the architecture decision.

## Do not extend

If you find yourself about to add a feature here: stop. The right place is either:
- **Mobile feature** → `lib/widgets/map_view.dart` (the `maplibre`-backed `MapView`).
- **Web feature** → the standalone HTML app in the upstream `draft_karta_rh` repo, not Flutter.
