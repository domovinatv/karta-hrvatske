import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

@immutable
class JlsFeature {
  const JlsFeature({
    required this.id,
    required this.name,
    required this.nameFull,
    required this.type,
    required this.zupanija,
    required this.zupanijaFull,
    required this.areaKm2,
    required this.areaM2,
    required this.color,
    this.roa,
    this.maticniBroj,
    this.inspireId,
    this.source,
  });

  final int id;
  final String name;
  final String nameFull; // e.g. "Općina Andrijaševci"
  final String type; // Grad / Općina / Otok
  final String zupanija; // short, e.g. "Vukovarsko-srijemska"
  final String zupanijaFull; // e.g. "Vukovarsko-srijemska županija"
  final double areaKm2;
  final double areaM2;
  final Color color;
  final String? roa; // sjedište
  final String? maticniBroj;
  final String? inspireId;
  final String? source;
}

@immutable
class ZupanijaSummary {
  const ZupanijaSummary({
    required this.name,
    required this.count,
    required this.areaKm2,
    required this.color,
  });

  final String name;
  final int count;
  final double areaKm2;
  final Color color;
}

@immutable
class JlsDataset {
  const JlsDataset({
    required this.jlsRaw,
    required this.zupanijeRaw,
    required this.drzavaRaw,
    required this.features,
    required this.zupanije,
    required this.totalAreaKm2,
    required this.gradCount,
    required this.opcinaCount,
  });

  final String jlsRaw;
  final String zupanijeRaw;
  final String drzavaRaw;
  final List<JlsFeature> features;
  final List<ZupanijaSummary> zupanije; // sorted by name
  final double totalAreaKm2;
  final int gradCount;
  final int opcinaCount;
}

Future<JlsDataset> loadHrDataset() async {
  final jls = await rootBundle.loadString('assets/data/jls.geojson');
  final zup = await rootBundle.loadString('assets/data/zupanije.geojson');
  final drz = await rootBundle.loadString('assets/data/drzava.geojson');
  return compute(_parse, _RawBundle(jls, zup, drz));
}

class _RawBundle {
  const _RawBundle(this.jls, this.zup, this.drz);
  final String jls;
  final String zup;
  final String drz;
}

JlsDataset _parse(_RawBundle raw) {
  final decoded = jsonDecode(raw.jls) as Map<String, dynamic>;
  final featuresJson = decoded['features'] as List;

  final features = <JlsFeature>[];
  final zupCounts = <String, int>{};
  final zupAreas = <String, double>{};
  final zupColors = <String, Color>{};
  var grad = 0;
  var opcina = 0;
  var totalKm2 = 0.0;

  for (final f in featuresJson) {
    final m = f as Map<String, dynamic>;
    final p = m['properties'] as Map<String, dynamic>;
    final isJls = p['is_jls'] as bool? ?? true;
    if (!isJls) continue;
    final color = _hexToColor(p['color'] as String);
    final zup = p['zupanija'] as String;
    final type = p['type'] as String;
    final km2 = (p['area_km2'] as num).toDouble();

    features.add(JlsFeature(
      id: (m['id'] as num).toInt(),
      name: p['name'] as String,
      nameFull: (p['name_full'] ?? p['name']) as String,
      type: type,
      zupanija: zup,
      zupanijaFull: (p['zupanija_full'] ?? zup) as String,
      areaKm2: km2,
      areaM2: (p['area_m2'] as num).toDouble(),
      color: color,
      roa: p['roa'] as String?,
      maticniBroj: p['maticni_broj'] as String?,
      inspireId: p['inspire_id'] as String?,
      source: p['source'] as String?,
    ));
    zupCounts[zup] = (zupCounts[zup] ?? 0) + 1;
    zupAreas[zup] = (zupAreas[zup] ?? 0) + km2;
    zupColors[zup] ??= color;
    totalKm2 += km2;
    if (type == 'Grad') grad++;
    if (type == 'Općina') opcina++;
  }

  final zupanije = zupCounts.keys
      .map((z) => ZupanijaSummary(
            name: z,
            count: zupCounts[z]!,
            areaKm2: zupAreas[z]!,
            color: zupColors[z]!,
          ))
      .toList()
    ..sort((a, b) => a.name.compareTo(b.name));

  return JlsDataset(
    jlsRaw: raw.jls,
    zupanijeRaw: raw.zup,
    drzavaRaw: raw.drz,
    features: features,
    zupanije: zupanije,
    totalAreaKm2: totalKm2,
    gradCount: grad,
    opcinaCount: opcina,
  );
}

Color _hexToColor(String hex) {
  var s = hex.replaceFirst('#', '');
  if (s.length == 6) s = 'FF$s';
  return Color(int.parse(s, radix: 16));
}
