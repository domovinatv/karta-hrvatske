import 'package:flutter/material.dart';

import '../data/jls_dataset.dart';
import '../data/naselja_dataset.dart';
import '../state/map_state.dart';
import '../theme.dart';

class SidebarRight extends StatelessWidget {
  const SidebarRight({super.key, required this.state, required this.totalAreaKm2});

  final MapStateController state;
  final double totalAreaKm2;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final jls = state.selectedJls;
        final nas = state.selectedNaselje;
        return Container(
          color: AppColors.bg2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.line)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Expanded(
                      child: Text(
                        'Detalji',
                        style: TextStyle(
                          fontFamily: kFontDisplay,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.muted,
                          letterSpacing: 0.12 * 13,
                        ),
                      ),
                    ),
                    Text(
                      switch (state.selectionKind) {
                        SelectionKind.jls => 'JLS',
                        SelectionKind.naselje => 'naselje',
                        SelectionKind.none => 'klik na poligon',
                      },
                      style: const TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 10,
                        color: AppColors.accent2,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
                  child: nas != null
                      ? _NaseljeDetail(feature: nas)
                      : (jls != null
                          ? _JlsDetail(feature: jls, totalAreaKm2: totalAreaKm2)
                          : const _Empty()),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.only(top: 60),
        child: Center(
          child: Text(
            'Klikni poligon na karti\nili red u listi lijevo',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: kFontMono,
              color: AppColors.muted,
              fontSize: 12,
              height: 1.6,
            ),
          ),
        ),
      );
}

class _JlsDetail extends StatelessWidget {
  const _JlsDetail({required this.feature, required this.totalAreaKm2});
  final JlsFeature feature;
  final double totalAreaKm2;

  @override
  Widget build(BuildContext context) {
    final share = feature.areaKm2 / totalAreaKm2 * 100;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading(name: feature.name, subtitle: feature.nameFull, swatch: feature.color),
        const SizedBox(height: 18),
        _Row(k: 'Tip', v: feature.type),
        _Row(k: 'Županija', v: feature.zupanija),
        if (feature.roa != null && feature.roa!.isNotEmpty)
          _Row(k: 'Sjedište', v: feature.roa!),
        if (feature.maticniBroj != null && feature.maticniBroj!.isNotEmpty)
          _Row(k: 'Matični broj', v: feature.maticniBroj!),
        _Row(k: 'Površina', v: '${feature.areaKm2.toStringAsFixed(2)} km²'),
        _Row(k: 'U m²', v: _formatHr(feature.areaM2.round())),
        _Row(k: 'Udio HR', v: '${share.toStringAsFixed(3)} %'),
        if (feature.inspireId != null && feature.inspireId!.isNotEmpty)
          _Row(k: 'INSPIRE ID', v: feature.inspireId!, mono: true),
        if (feature.source != null && feature.source!.isNotEmpty)
          _Row(k: 'Izvor', v: feature.source!, dim: true),
      ],
    );
  }
}

class _NaseljeDetail extends StatelessWidget {
  const _NaseljeDetail({required this.feature});
  final NaseljeFeature feature;

  @override
  Widget build(BuildContext context) {
    final parent = '${feature.jlsType} ${feature.jlsName}'.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Heading(
          name: feature.name,
          subtitle: 'Naselje${parent.isEmpty ? '' : ' · $parent'}',
          swatch: feature.color,
        ),
        const SizedBox(height: 18),
        if (feature.stanovnistvo != null)
          _Row(k: 'Stanovništvo', v: _formatHr(feature.stanovnistvo!)),
        _Row(k: 'JLS', v: parent.isEmpty ? '—' : parent),
        _Row(k: 'Županija', v: feature.zupanija),
        _Row(k: 'Površina', v: '${feature.areaKm2.toStringAsFixed(2)} km²'),
        _Row(k: 'U m²', v: _formatHr(feature.areaM2.round())),
        if (feature.maticniBroj != null && feature.maticniBroj!.isNotEmpty)
          _Row(k: 'Matični broj', v: feature.maticniBroj!),
        if (feature.inspireId != null && feature.inspireId!.isNotEmpty)
          _Row(k: 'INSPIRE ID', v: feature.inspireId!, mono: true),
        if (feature.source != null && feature.source!.isNotEmpty)
          _Row(k: 'Izvor', v: feature.source!, dim: true),
      ],
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading({required this.name, required this.subtitle, required this.swatch});
  final String name;
  final String subtitle;
  final Color swatch;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.only(left: 12),
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: swatch, width: 3)),
          ),
          child: Text(
            name,
            style: const TextStyle(
              fontFamily: kFontDisplay,
              fontSize: 22,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
              height: 1.1,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 15),
          child: Text(
            subtitle,
            style: const TextStyle(
              fontFamily: kFontMono,
              fontSize: 11,
              color: AppColors.muted,
            ),
          ),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.k, required this.v, this.mono = false, this.dim = false});
  final String k;
  final String v;
  final bool mono;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line, width: 0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(
              k.toUpperCase(),
              style: const TextStyle(
                fontFamily: kFontMono,
                fontSize: 10.5,
                color: AppColors.muted,
                letterSpacing: 0.05 * 11,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              v,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontFamily: kFontMono,
                fontSize: mono ? 9.5 : 12,
                color: dim ? AppColors.muted : AppColors.text,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

String _formatHr(int v) {
  final s = v.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
    buf.write(s[i]);
  }
  return buf.toString();
}
