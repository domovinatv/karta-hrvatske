import 'dart:convert';

import 'package:maplibre/maplibre.dart';

/// Croatia bounding box used for the initial view + reset.
final hrBounds = LngLatBounds(
  longitudeWest: 13.4,
  longitudeEast: 19.5,
  latitudeSouth: 42.3,
  latitudeNorth: 46.6,
);

/// Walks the (already JSON-decoded) GeoJSON geometry of one feature, calling
/// [cb] for every coordinate pair.
void _walkCoords(Map<String, dynamic> geometry, void Function(double x, double y) cb) {
  final type = geometry['type'] as String;
  final coords = geometry['coordinates'];
  switch (type) {
    case 'Point':
      final c = coords as List;
      cb((c[0] as num).toDouble(), (c[1] as num).toDouble());
      break;
    case 'LineString':
      for (final c in coords as List) {
        cb((c[0] as num).toDouble(), (c[1] as num).toDouble());
      }
      break;
    case 'Polygon':
      for (final ring in coords as List) {
        for (final c in ring as List) {
          cb((c[0] as num).toDouble(), (c[1] as num).toDouble());
        }
      }
      break;
    case 'MultiPolygon':
      for (final poly in coords as List) {
        for (final ring in poly as List) {
          for (final c in ring as List) {
            cb((c[0] as num).toDouble(), (c[1] as num).toDouble());
          }
        }
      }
      break;
  }
}

/// Linear scan over the raw GeoJSON to find the feature with [id] and return
/// its bbox. Used on click — once per selection — so the cost is acceptable.
LngLatBounds? boundsForFeatureId(String rawGeoJson, int id) {
  final json = jsonDecode(rawGeoJson) as Map<String, dynamic>;
  for (final f in json['features'] as List) {
    if ((f as Map<String, dynamic>)['id'] == id) {
      return _boundsOf(f['geometry'] as Map<String, dynamic>);
    }
  }
  return null;
}

/// Bbox of all features whose `properties.zupanija` equals [zupanija].
LngLatBounds? boundsForZupanija(String rawGeoJson, String zupanija) {
  final json = jsonDecode(rawGeoJson) as Map<String, dynamic>;
  var minX = double.infinity, minY = double.infinity;
  var maxX = -double.infinity, maxY = -double.infinity;
  var found = false;
  for (final f in json['features'] as List) {
    final props = (f as Map<String, dynamic>)['properties'] as Map<String, dynamic>;
    if (props['zupanija'] != zupanija) continue;
    found = true;
    _walkCoords(f['geometry'] as Map<String, dynamic>, (x, y) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  }
  if (!found) return null;
  return LngLatBounds(
    longitudeWest: minX,
    longitudeEast: maxX,
    latitudeSouth: minY,
    latitudeNorth: maxY,
  );
}

LngLatBounds _boundsOf(Map<String, dynamic> geometry) {
  var minX = double.infinity, minY = double.infinity;
  var maxX = -double.infinity, maxY = -double.infinity;
  _walkCoords(geometry, (x, y) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  return LngLatBounds(
    longitudeWest: minX,
    longitudeEast: maxX,
    latitudeSouth: minY,
    latitudeNorth: maxY,
  );
}
