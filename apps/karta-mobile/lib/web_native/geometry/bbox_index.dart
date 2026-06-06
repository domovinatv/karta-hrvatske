class Bbox {
  const Bbox(this.minLng, this.minLat, this.maxLng, this.maxLat);
  final double minLng, minLat, maxLng, maxLat;

  bool contains(double lng, double lat) =>
      lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;

  bool intersects(Bbox other) => !(other.maxLng < minLng ||
      other.minLng > maxLng ||
      other.maxLat < minLat ||
      other.minLat > maxLat);
}

/// Uniform grid bbox prefilter.
///
/// Assumption: no feature bbox crosses the anti-meridian (Croatia dataset).
/// Wrap-around would require splitting bboxes on insert; not implemented.
class BboxIndex<T> {
  BboxIndex({required this.cellSizeDeg});
  final double cellSizeDeg;

  // Sparse 2D grid: cellX -> cellY -> set of ids.
  final Map<int, Map<int, Set<T>>> _cells = <int, Map<int, Set<T>>>{};

  int _cell(double v) => (v / cellSizeDeg).floor();

  void insert(T id, Bbox bbox) {
    final int x0 = _cell(bbox.minLng);
    final int x1 = _cell(bbox.maxLng);
    final int y0 = _cell(bbox.minLat);
    final int y1 = _cell(bbox.maxLat);
    for (int cx = x0; cx <= x1; cx++) {
      final Map<int, Set<T>> col =
          _cells.putIfAbsent(cx, () => <int, Set<T>>{});
      for (int cy = y0; cy <= y1; cy++) {
        col.putIfAbsent(cy, () => <T>{}).add(id);
      }
    }
  }

  /// All ids whose bbox cell-bucket contains the point. Not a precise test —
  /// caller must verify with the real geometry.
  Iterable<T> queryPoint(double lng, double lat) {
    final int cx = _cell(lng);
    final int cy = _cell(lat);
    final Set<T>? bucket = _cells[cx]?[cy];
    if (bucket == null) return const Iterable.empty();
    // Defensive copy so callers iterating + mutating the index don't crash.
    return Set<T>.of(bucket);
  }

  /// All ids whose bbox-bucket intersects the viewport bbox.
  Iterable<T> queryBbox(Bbox viewport) {
    final int x0 = _cell(viewport.minLng);
    final int x1 = _cell(viewport.maxLng);
    final int y0 = _cell(viewport.minLat);
    final int y1 = _cell(viewport.maxLat);
    final Set<T> out = <T>{};
    for (int cx = x0; cx <= x1; cx++) {
      final Map<int, Set<T>>? col = _cells[cx];
      if (col == null) continue;
      for (int cy = y0; cy <= y1; cy++) {
        final Set<T>? bucket = col[cy];
        if (bucket != null) out.addAll(bucket);
      }
    }
    return out;
  }

  void clear() => _cells.clear();
}
