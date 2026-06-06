import 'dart:math' as math;
import 'dart:ui' show Offset;

/// A geographic coordinate (longitude in degrees, latitude in degrees).
class LngLat {
  const LngLat(this.lng, this.lat);
  final double lng;
  final double lat;
}

class WebMercator {
  const WebMercator._();

  static const double _tileSize = 256.0;

  // Web Mercator's mathematical lat limit; sin(lat) clamp below echoes this
  // so values just past the limit don't blow up to -inf.
  static const double maxLatitude = 85.05112878;

  /// Project a geographic coordinate to **world pixel** coordinates at [zoom].
  /// The origin (0,0) is the top-left of the world map.
  static Offset project(LngLat ll, double zoom) {
    final double worldSize = _tileSize * math.pow(2.0, zoom).toDouble();
    final double lat = ll.lat.clamp(-maxLatitude, maxLatitude);
    final double x = (ll.lng + 180.0) / 360.0 * worldSize;
    final double sinyRaw = math.sin(lat * math.pi / 180.0);
    final double siny = sinyRaw.clamp(-0.9999, 0.9999);
    final double y =
        (0.5 - math.log((1 + siny) / (1 - siny)) / (4 * math.pi)) * worldSize;
    return Offset(x, y);
  }

  /// Inverse projection: world pixel at [zoom] -> LngLat.
  static LngLat unproject(Offset worldPx, double zoom) {
    final double worldSize = _tileSize * math.pow(2.0, zoom).toDouble();
    final double lng = worldPx.dx / worldSize * 360.0 - 180.0;
    final double n = math.pi - 2 * math.pi * worldPx.dy / worldSize;
    final double lat =
        180.0 / math.pi * math.atan(0.5 * (math.exp(n) - math.exp(-n)));
    return LngLat(lng, lat);
  }

  /// Convert world pixel coordinates to screen pixel coordinates relative
  /// to a viewport whose center maps to [viewportCenterWorldPx] (the world
  /// pixel of the camera center) and whose center is at
  /// [viewportCenterScreenPx] on screen.
  static Offset worldToScreen(
    Offset worldPx,
    Offset viewportCenterWorldPx,
    Offset viewportCenterScreenPx,
  ) {
    return worldPx - viewportCenterWorldPx + viewportCenterScreenPx;
  }

  /// Inverse: screen pixel -> world pixel.
  static Offset screenToWorld(
    Offset screenPx,
    Offset viewportCenterWorldPx,
    Offset viewportCenterScreenPx,
  ) {
    return screenPx - viewportCenterScreenPx + viewportCenterWorldPx;
  }
}
