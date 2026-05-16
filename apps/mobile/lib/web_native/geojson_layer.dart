import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' show LatLng;

import 'geo_features.dart';
import 'geometry/bbox_index.dart';

/// CustomPainter overlay drawing our 4 GeoJSON layers on top of the basemap.
///
/// Reads the flutter_map [MapCamera] from the inherited widget — flutter_map
/// rebuilds children whenever the camera changes, so this layer reprojects
/// every frame during pan/zoom and is correct without any manual listener.
///
/// Strokes are in device pixels (not scaled by zoom), so widths stay
/// consistent across the zoom range.
class GeoJsonLayer extends StatelessWidget {
  const GeoJsonLayer({super.key, required this.layer});

  final GeoLayer layer;

  @override
  Widget build(BuildContext context) {
    final camera = MapCamera.of(context);
    return IgnorePointer(
      child: CustomPaint(
        painter: _GeoPainter(layer: layer, camera: camera),
        size: Size.infinite,
      ),
    );
  }
}

class _GeoPainter extends CustomPainter {
  _GeoPainter({required this.layer, required this.camera});

  final GeoLayer layer;
  final MapCamera camera;

  @override
  void paint(Canvas canvas, Size size) {
    // Project a LngLat to screen pixel using flutter_map's projection,
    // guaranteed to align with the underlying tile layer.
    Offset toScreen(double lng, double lat) =>
        camera.latLngToScreenOffset(LatLng(lat, lng));

    final viewportBbox = _cameraBbox(camera);

    // Reusable paints (immutable values — allocate once per paint() call).
    final jlsFillPaint = Paint()..style = PaintingStyle.fill;
    final jlsStrokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.6
      ..color = Colors.black.withValues(alpha: 0.55)
      ..isAntiAlias = true;
    final zupStrokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..color = const Color(0xFF0a0e14).withValues(alpha: 0.85)
      ..isAntiAlias = true;
    final drzStrokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2
      ..color = const Color(0xFF7a3b00).withValues(alpha: 0.95)
      ..isAntiAlias = true;

    // ── JLS fills + thin borders ──────────────────────────────────────────
    // We bbox-prefilter against the viewport to skip features outside view.
    final candidateIds = layer.jlsIndex.queryBbox(viewportBbox).toSet();
    final byId = {for (final p in layer.jls) p.id: p};

    for (final id in candidateIds) {
      final poly = byId[id];
      if (poly == null) continue;
      final path = _buildPath(poly.parts, toScreen);
      jlsFillPaint.color = poly.color.withValues(alpha: 0.40);
      canvas.drawPath(path, jlsFillPaint);
      canvas.drawPath(path, jlsStrokePaint);
    }

    // ── Županije borders (dashed effect via stroke + reduced alpha) ──────
    for (final f in layer.zupanije) {
      if (!viewportBbox.intersects(f.bbox)) continue;
      final path = _buildPath(f.parts, toScreen);
      canvas.drawPath(path, zupStrokePaint);
    }

    // ── State border ─────────────────────────────────────────────────────
    final drzPath = _buildPath(layer.drzava.parts, toScreen);
    canvas.drawPath(drzPath, drzStrokePaint);
  }

  Path _buildPath(List<List<Float32List>> parts, Offset Function(double, double) toScreen) {
    final path = Path();
    for (final rings in parts) {
      for (final ring in rings) {
        if (ring.length < 4) continue;
        final p0 = toScreen(ring[0], ring[1]);
        path.moveTo(p0.dx, p0.dy);
        for (var i = 2; i < ring.length; i += 2) {
          final p = toScreen(ring[i], ring[i + 1]);
          path.lineTo(p.dx, p.dy);
        }
        path.close();
      }
    }
    return path;
  }

  @override
  bool shouldRepaint(covariant _GeoPainter old) =>
      old.layer != layer || old.camera != camera;
}

Bbox _cameraBbox(MapCamera c) {
  final bounds = c.visibleBounds;
  return Bbox(
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  );
}
