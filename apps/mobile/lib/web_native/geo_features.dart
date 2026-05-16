import 'dart:convert';
import 'dart:ui' show Color;

import 'package:flutter/foundation.dart';

import '../data/jls_dataset.dart';
import 'geometry/bbox_index.dart';

/// A single polygon ring as a flat `[lng, lat, lng, lat, ...]` Float32 array.
/// Stride 2; the ring is treated as closed (first == last not required).
typedef GeoRing = Float32List;

/// A polygon = one outer ring plus zero or more hole rings.
typedef GeoRings = List<GeoRing>;

/// Geometry of one feature. MultiPolygon flattens to a list of [GeoRings];
/// Polygon becomes a single-element list.
@immutable
class GeoPolygon {
  const GeoPolygon({
    required this.id,
    required this.parts,
    required this.bbox,
    required this.color,
    required this.maticniBroj,
    required this.zupanija,
    required this.type,
  });

  final int id;
  final List<GeoRings> parts;
  final Bbox bbox;
  final Color color;
  final String? maticniBroj;
  final String? zupanija;
  final String? type;
}

@immutable
class GeoLineFeature {
  const GeoLineFeature({required this.parts, required this.bbox});
  final List<GeoRings> parts;
  final Bbox bbox;
}

@immutable
class GeoLayer {
  const GeoLayer({
    required this.jls,
    required this.zupanije,
    required this.drzava,
    required this.jlsIndex,
  });

  final List<GeoPolygon> jls;
  final List<GeoLineFeature> zupanije;
  final GeoLineFeature drzava;
  final BboxIndex<int> jlsIndex;
}

/// One-time geometry parse off the UI isolate. Reuses the raw GeoJSON strings
/// already held on [JlsDataset] — no extra asset load.
Future<GeoLayer> loadGeoLayer(JlsDataset ds) {
  return compute(_parseGeoLayer, _GeoLayerInput(ds.jlsRaw, ds.zupanijeRaw, ds.drzavaRaw));
}

class _GeoLayerInput {
  const _GeoLayerInput(this.jls, this.zup, this.drz);
  final String jls;
  final String zup;
  final String drz;
}

GeoLayer _parseGeoLayer(_GeoLayerInput input) {
  final jlsList = <GeoPolygon>[];
  final jlsIndex = BboxIndex<int>(cellSizeDeg: 0.1);

  final jlsDecoded = jsonDecode(input.jls) as Map<String, dynamic>;
  for (final raw in (jlsDecoded['features'] as List)) {
    final f = raw as Map<String, dynamic>;
    final p = f['properties'] as Map<String, dynamic>;
    if ((p['is_jls'] as bool? ?? true) == false) continue;
    final geom = f['geometry'] as Map<String, dynamic>;
    final parts = _coordsToParts(geom);
    if (parts.isEmpty) continue;
    final bbox = _bboxFromParts(parts);
    final id = (f['id'] as num).toInt();
    final color = _hexToColor(p['color'] as String);
    final poly = GeoPolygon(
      id: id,
      parts: parts,
      bbox: bbox,
      color: color,
      maticniBroj: p['maticni_broj'] as String?,
      zupanija: p['zupanija'] as String?,
      type: p['type'] as String?,
    );
    jlsList.add(poly);
    jlsIndex.insert(id, bbox);
  }

  final zupList = <GeoLineFeature>[];
  final zupDecoded = jsonDecode(input.zup) as Map<String, dynamic>;
  for (final raw in (zupDecoded['features'] as List)) {
    final geom = (raw as Map<String, dynamic>)['geometry'] as Map<String, dynamic>;
    final parts = _coordsToParts(geom);
    if (parts.isEmpty) continue;
    zupList.add(GeoLineFeature(parts: parts, bbox: _bboxFromParts(parts)));
  }

  final drzDecoded = jsonDecode(input.drz) as Map<String, dynamic>;
  final drzFeatures = drzDecoded['features'] as List;
  final allDrzParts = <GeoRings>[];
  for (final raw in drzFeatures) {
    final geom = (raw as Map<String, dynamic>)['geometry'] as Map<String, dynamic>;
    allDrzParts.addAll(_coordsToParts(geom));
  }
  final drz = GeoLineFeature(parts: allDrzParts, bbox: _bboxFromParts(allDrzParts));

  return GeoLayer(jls: jlsList, zupanije: zupList, drzava: drz, jlsIndex: jlsIndex);
}

/// Normalize Polygon and MultiPolygon to `List<GeoRings>` where each entry is
/// one polygon (outer + holes). Other geometry types return empty.
List<GeoRings> _coordsToParts(Map<String, dynamic> geom) {
  final type = geom['type'] as String;
  final coords = geom['coordinates'] as List;
  if (type == 'Polygon') {
    return [_ringsFromJson(coords)];
  }
  if (type == 'MultiPolygon') {
    return [
      for (final poly in coords) _ringsFromJson(poly as List),
    ];
  }
  return const [];
}

GeoRings _ringsFromJson(List ringsJson) {
  return [
    for (final ring in ringsJson) _ringFromJson(ring as List),
  ];
}

GeoRing _ringFromJson(List ring) {
  final out = Float32List(ring.length * 2);
  for (var i = 0; i < ring.length; i++) {
    final p = ring[i] as List;
    out[i * 2] = (p[0] as num).toDouble();
    out[i * 2 + 1] = (p[1] as num).toDouble();
  }
  return out;
}

Bbox _bboxFromParts(List<GeoRings> parts) {
  var minLng = double.infinity, minLat = double.infinity;
  var maxLng = double.negativeInfinity, maxLat = double.negativeInfinity;
  for (final poly in parts) {
    for (final ring in poly) {
      for (var i = 0; i < ring.length; i += 2) {
        final x = ring[i], y = ring[i + 1];
        if (x < minLng) minLng = x;
        if (x > maxLng) maxLng = x;
        if (y < minLat) minLat = y;
        if (y > maxLat) maxLat = y;
      }
    }
  }
  return Bbox(minLng, minLat, maxLng, maxLat);
}

Color _hexToColor(String hex) {
  var s = hex.replaceFirst('#', '');
  if (s.length == 6) s = 'FF$s';
  return Color(int.parse(s, radix: 16));
}
