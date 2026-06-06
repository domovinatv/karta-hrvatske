import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

@immutable
class NaseljeFeature {
  const NaseljeFeature({
    required this.id,
    required this.name,
    required this.jlsName,
    required this.jlsType,
    required this.zupanija,
    required this.areaKm2,
    required this.areaM2,
    required this.color,
    required this.nasColor,
    this.skraceniNaziv,
    this.dguId,
    this.maticniBroj,
    this.inspireId,
    this.stanovnistvo,
    this.source,
  });

  final int id;
  final String name;
  final String jlsName;
  final String jlsType;
  final String zupanija;
  final double areaKm2;
  final double areaM2;
  final Color color; // matches parent JLS color
  final Color nasColor; // per-naselje palette
  final String? skraceniNaziv;
  final int? dguId;
  final String? maticniBroj;
  final String? inspireId;
  final int? stanovnistvo;
  final String? source;
}

@immutable
class NaseljaDataset {
  const NaseljaDataset({required this.rawGeoJson, required this.features});
  final String rawGeoJson;
  final List<NaseljeFeature> features;
}

/// Lazy load: parses ~21 MB on a background isolate, ~hundreds of ms on
/// modern hardware. Caller guards with a `loading` flag.
Future<NaseljaDataset> loadNaseljaDataset() async {
  final raw = await rootBundle.loadString('assets/data/naselja.geojson');
  return compute(_parse, raw);
}

NaseljaDataset _parse(String raw) {
  final decoded = jsonDecode(raw) as Map<String, dynamic>;
  final featuresJson = decoded['features'] as List;
  final out = <NaseljeFeature>[];
  for (final f in featuresJson) {
    final m = f as Map<String, dynamic>;
    final p = m['properties'] as Map<String, dynamic>;
    out.add(NaseljeFeature(
      id: (m['id'] as num).toInt(),
      name: p['name'] as String,
      jlsName: (p['jls_name'] ?? '') as String,
      jlsType: (p['jls_type'] ?? '') as String,
      zupanija: (p['zupanija'] ?? '') as String,
      areaKm2: ((p['area_km2'] ?? 0) as num).toDouble(),
      areaM2: ((p['area_m2'] ?? 0) as num).toDouble(),
      color: _hexToColor((p['color'] ?? '#888888') as String),
      nasColor: _hexToColor((p['nas_color'] ?? p['color'] ?? '#888888') as String),
      skraceniNaziv: p['skraceni_naziv'] as String?,
      dguId: (p['dgu_id'] as num?)?.toInt(),
      maticniBroj: p['maticni_broj'] as String?,
      inspireId: p['inspire_id'] as String?,
      stanovnistvo: (p['stanovnistvo'] as num?)?.toInt(),
      source: p['source'] as String?,
    ));
  }
  return NaseljaDataset(rawGeoJson: raw, features: out);
}

Color _hexToColor(String hex) {
  var s = hex.replaceFirst('#', '');
  if (s.length == 6) s = 'FF$s';
  return Color(int.parse(s, radix: 16));
}
