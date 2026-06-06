/// Test whether [point] (lng, lat) is inside the [ring] (a closed sequence
/// of [lng, lat] pairs as a flat `List<double>` — index i is lng, i+1 is lat,
/// pairs stride by 2). Odd-even rule; ring may be CW or CCW.
///
/// Flat `List<double>` (not `List<LngLat>`) is intentional: hover-frame hot
/// path, so we avoid per-vertex object allocation.
bool pointInRing(double lng, double lat, List<double> ring) {
  final int n = ring.length;
  if (n < 6) return false; // need at least 3 vertices

  bool inside = false;
  // Standard ray-cast: iterate edges (j -> i), j = i-1 with wrap.
  // Using `(yi > y) != (yj > y)` handles shared-y degeneracy consistently.
  double xj = ring[n - 2];
  double yj = ring[n - 1];
  for (int i = 0; i < n; i += 2) {
    final double xi = ring[i];
    final double yi = ring[i + 1];
    final bool intersect = ((yi > lat) != (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
    xj = xi;
    yj = yi;
  }
  return inside;
}

/// Test against a polygon with an outer ring and zero or more hole rings.
/// Inside outer ring AND not inside any hole.
bool pointInPolygon(double lng, double lat, List<List<double>> rings) {
  if (rings.isEmpty) return false;
  if (!pointInRing(lng, lat, rings[0])) return false;
  for (int i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i])) return false;
  }
  return true;
}

/// Test against a multipolygon (each entry is a polygon = list of rings).
bool pointInMultiPolygon(
    double lng, double lat, List<List<List<double>>> polys) {
  for (int i = 0; i < polys.length; i++) {
    if (pointInPolygon(lng, lat, polys[i])) return true;
  }
  return false;
}
