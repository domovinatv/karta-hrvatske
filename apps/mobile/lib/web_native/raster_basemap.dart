// Isolated raster basemap widget for the web-native renderer POC.
//
// Free tiles only (CARTO Positron raster), GPU-rendered via flutter_map.
// North-up only — rotation gesture is disabled. 2D only (no pitch).
//
// This file is self-contained and is NOT referenced from `lib/main.dart`.
// It is reached only through the planned `/native` route, or via the
// scratch entry `_basemap_smoke_main.dart` for local smoke testing.

import 'package:flutter/widgets.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// A minimal, opinionated raster basemap.
///
/// - Tiles: CARTO Positron `@2x` raster (512px), 4 subdomains.
/// - Attribution: "OpenStreetMap contributors" + "CARTO", bottom-right.
/// - Interaction: pan + zoom (mouse wheel, pinch, double-tap). No rotation.
///   No pitch (flutter_map is 2D by default).
/// - The [overlays] are layered above the tile layer but below the
///   attribution control, inside the same `FlutterMap` children list.
class RasterBasemap extends StatefulWidget {
  const RasterBasemap({
    super.key,
    this.initialCenter = const LatLng(44.7, 16.5), // Croatia center
    this.initialZoom = 6.8,
    this.minZoom = 5.5,
    this.maxZoom = 16,
    this.onCameraChanged,
    this.overlays = const [],
  });

  /// Initial map center.
  final LatLng initialCenter;

  /// Initial zoom level.
  final double initialZoom;

  /// Minimum allowed zoom level.
  final double minZoom;

  /// Maximum allowed zoom level.
  final double maxZoom;

  /// Called whenever the camera moves (pan/zoom). Receives the current
  /// center and zoom. Fires for both gesture- and programmatic-driven
  /// moves.
  final void Function(LatLng center, double zoom)? onCameraChanged;

  /// Extra layers rendered above the tile layer and below the attribution
  /// control. Typically used for GeoJSON painters or markers.
  final List<Widget> overlays;

  @override
  State<RasterBasemap> createState() => _RasterBasemapState();
}

class _RasterBasemapState extends State<RasterBasemap> {
  // Single shared controller so external code can later drive the camera.
  late final MapController _controller = MapController();

  // CARTO Positron raster. The `@2x` variant returns 512px tiles, so we
  // tell flutter_map about that with `tileSize: 512` + `zoomOffset: -1`
  // (the tile grid stays the same as for 256px tiles, but each tile is
  // sharper on retina/HiDPI displays).
  static const String _cartoUrlTemplate =
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png';
  static const List<String> _cartoSubdomains = ['a', 'b', 'c', 'd'];

  void _handlePositionChanged(MapCamera camera, bool hasGesture) {
    final cb = widget.onCameraChanged;
    if (cb != null) {
      cb(camera.center, camera.zoom);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: _controller,
      options: MapOptions(
        initialCenter: widget.initialCenter,
        initialZoom: widget.initialZoom,
        minZoom: widget.minZoom,
        maxZoom: widget.maxZoom,
        // North-up, always. Strip the rotate flag from the default set.
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        ),
        onPositionChanged: _handlePositionChanged,
      ),
      children: [
        TileLayer(
          urlTemplate: _cartoUrlTemplate,
          subdomains: _cartoSubdomains,
          userAgentPackageName: 'ai.domovina.map',
          // Retina @2x tiles: 512px image on a 256px grid.
          tileDimension: 512,
          zoomOffset: -1,
          maxNativeZoom: 20,
        ),
        // Caller-supplied overlays (e.g. GeoJSON painters) — above the
        // basemap, below attribution.
        ...widget.overlays,
        const RichAttributionWidget(
          alignment: AttributionAlignment.bottomRight,
          showFlutterMapAttribution: false,
          attributions: [
            TextSourceAttribution('OpenStreetMap contributors'),
            TextSourceAttribution('CARTO'),
          ],
        ),
      ],
    );
  }
}
