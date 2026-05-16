import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:maplibre/maplibre.dart';

import '../data/jls_dataset.dart';
import '../data/naselja_dataset.dart';
import '../state/map_state.dart';
import '../theme.dart';
import '../util/bounds.dart';

const _kStyleUrl = 'https://tiles.openfreemap.org/styles/positron';

const _kJlsSource = 'jls';
const _kZupSource = 'zup';
const _kDrzSource = 'drz';
const _kNasSource = 'naselja';

const _kJlsFillId = 'jls-fill';
const _kJlsLineId = 'jls-line';
const _kJlsFillSelId = 'jls-fill-selected';
const _kJlsLineSelId = 'jls-line-selected';
const _kJlsLineHoverId = 'jls-line-hover';
const _kJlsLabelId = 'jls-label';

const _kNasFillId = 'naselja-fill';
const _kNasLineId = 'naselja-line';
const _kNasFillSelId = 'naselja-fill-selected';
const _kNasLineSelId = 'naselja-line-selected';
const _kNasLineHoverId = 'naselja-line-hover';
const _kNasLabelId = 'naselja-label';

const _kZupLineId = 'zup-line';
const _kDrzLineId = 'drz-line';

class MapView extends StatefulWidget {
  const MapView({
    super.key,
    required this.dataset,
    required this.state,
    this.zoomSink,
  });

  final JlsDataset dataset;
  final MapStateController state;

  /// Optional sink for the live camera zoom — written on every camera move.
  final ValueNotifier<double?>? zoomSink;

  @override
  State<MapView> createState() => MapViewState();
}

class MapViewState extends State<MapView> {
  MapController? _controller;
  StyleController? _style;
  bool _layersReady = false;

  // Snapshot of state we last synced to MapLibre (per layer family).
  ColorMode _appliedColorMode = ColorMode.zupanija;
  String? _appliedZupanija;
  bool _appliedZupBorders = true;
  bool _appliedJlsBorders = true;
  bool _appliedFocusMode = false;
  String? _appliedFocusJlsMb; // matični broj of focused JLS, if any

  SelectionKind _appliedSelKind = SelectionKind.none;
  int? _appliedSelId;

  SelectionKind _appliedHoverKind = SelectionKind.none;
  int? _appliedHoverId;

  bool _appliedShowNaselja = false;
  bool _naseljaSourceAdded = false;

  // Cursor tracking for the hover tooltip (logical pixels, local to map).
  final ValueNotifier<Offset?> _hoverPos = ValueNotifier<Offset?>(null);

  // Single-flight coalescer for hover layer rebuilds.
  bool _hoverDirty = false;
  bool _hoverRebuilding = false;

  // Same pattern for naselja layers — they may flip mid-load.
  bool _naseljaDirty = false;
  bool _naseljaRebuilding = false;

  @override
  void initState() {
    super.initState();
    widget.state.addListener(_onStateChange);
  }

  @override
  void dispose() {
    widget.state.removeListener(_onStateChange);
    _hoverPos.dispose();
    super.dispose();
  }

  /// Resolve the matični broj of the currently focused JLS (only when focus
  /// mode is on AND a JLS is selected directly). Returns null otherwise so
  /// the rebuilders fall back to the unfiltered layout.
  String? _focusedJlsMb() {
    final st = widget.state;
    if (!st.focusMode) return null;
    final jls = st.selectedJls;
    return jls?.maticniBroj;
  }

  void _onStateChange() {
    if (!_layersReady) return;
    final s = widget.state;
    final colorChanged = s.colorMode != _appliedColorMode;
    final zupChanged = s.activeZupanija != _appliedZupanija;
    final selKindChanged = s.selectionKind != _appliedSelKind;
    final selIdChanged = s.selectedId != _appliedSelId;
    final hoverIdChanged = s.hoveredId != _appliedHoverId;
    final hoverKindChanged = _currentHoverKind() != _appliedHoverKind;
    final zupBordersChanged = s.showZupanijeBorders != _appliedZupBorders;
    final jlsBordersChanged = s.showJlsBorders != _appliedJlsBorders;
    final naseljaToggleChanged = s.showNaselja != _appliedShowNaselja;
    final naseljaArrived = s.naseljaLoaded && !_naseljaSourceAdded;
    final focusMb = _focusedJlsMb();
    final focusChanged =
        s.focusMode != _appliedFocusMode || focusMb != _appliedFocusJlsMb;

    final baseNeedsRebuild =
        colorChanged || zupChanged || jlsBordersChanged || focusChanged;

    if (baseNeedsRebuild) {
      unawaited(_rebuildJlsBaseLayers());
    }
    if (selKindChanged || selIdChanged) {
      unawaited(_rebuildSelectionLayers());
      unawaited(_flyToSelection());
    }
    if (hoverIdChanged || hoverKindChanged) {
      _scheduleHoverRebuild();
    }
    if (zupBordersChanged) {
      unawaited(_rebuildOverlayBorders());
    }
    if (naseljaToggleChanged || naseljaArrived || focusChanged) {
      _scheduleNaseljaRebuild();
    }
  }

  Future<void> _onStyleLoaded(StyleController style) async {
    _style = style;
    final ds = widget.dataset;
    await style.addSource(GeoJsonSource(id: _kJlsSource, data: ds.jlsRaw));
    await style.addSource(GeoJsonSource(id: _kZupSource, data: ds.zupanijeRaw));
    await style.addSource(GeoJsonSource(id: _kDrzSource, data: ds.drzavaRaw));
    await _rebuildJlsBaseLayers();
    await _rebuildSelectionLayers();
    await _rebuildOverlayBorders();
    _layersReady = true;
    _scheduleHoverRebuild();
    _scheduleNaseljaRebuild();
    await _controller?.fitBounds(
      bounds: hrBounds,
      padding: const EdgeInsets.all(24),
      nativeDuration: Duration.zero,
      webMaxDuration: Duration.zero,
    );
  }

  // ─── JLS base layers ─────────────────────────────────────────────────────
  Future<void> _rebuildJlsBaseLayers() async {
    final s = _style;
    if (s == null) return;
    final st = widget.state;
    _appliedColorMode = st.colorMode;
    _appliedZupanija = st.activeZupanija;
    _appliedJlsBorders = st.showJlsBorders;
    _appliedFocusMode = st.focusMode;
    _appliedFocusJlsMb = _focusedJlsMb();

    for (final id in const [_kJlsLabelId, _kJlsLineId, _kJlsFillId]) {
      try {
        await s.removeLayer(id);
      } catch (_) {}
    }

    final colorExpr = _colorExpression();
    final fillOpacity = _fillOpacityExpression();
    final lineOpacity = _lineOpacityExpression();
    final focusMb = _appliedFocusJlsMb;
    final focusFilter = focusMb == null
        ? null
        : <Object>['==', <Object>['get', 'maticni_broj'], focusMb];

    await s.addLayer(FillStyleLayer(
      id: _kJlsFillId,
      sourceId: _kJlsSource,
      paint: <String, Object>{
        'fill-color': colorExpr,
        // Keep the layer queryable when focus is on (clicks switch focus)
        // but visually drop everything except the focused JLS to 0 opacity.
        'fill-opacity': focusMb == null
            ? fillOpacity
            : <Object>[
                'case',
                <Object>['==', <Object>['get', 'maticni_broj'], focusMb], 0.5,
                0.0,
              ],
        'fill-antialias': true,
      },
    ));
    if (st.showJlsBorders) {
      await s.addLayer(LineStyleLayer(
        id: _kJlsLineId,
        sourceId: _kJlsSource,
        filter: focusFilter,
        paint: <String, Object>{
          'line-color': colorExpr,
          'line-width': 0.6,
          'line-opacity': lineOpacity,
        },
      ));
    }
    await s.addLayer(SymbolStyleLayer(
      id: _kJlsLabelId,
      sourceId: _kJlsSource,
      minZoom: 9,
      filter: focusFilter,
      layout: <String, Object>{
        'text-field': <Object>['get', 'name'],
        'text-font': <Object>['Noto Sans Bold'],
        'text-size': <Object>[
          'interpolate', <Object>['linear'], <Object>['zoom'],
          9, 10,
          13, 14,
          16, 18,
        ],
        'text-allow-overlap': false,
        'text-padding': 4,
      },
      paint: <String, Object>{
        'text-color': '#0a0e14',
        'text-halo-color': 'rgba(255,255,255,0.95)',
        'text-halo-width': 2,
        'text-halo-blur': 0.5,
      },
    ));

    await _rebuildSelectionLayers();
    await _rebuildOverlayBorders();
    _scheduleHoverRebuild();
    _scheduleNaseljaRebuild();
  }

  // ─── Selection layers (JLS or naselje) ───────────────────────────────────
  Future<void> _rebuildSelectionLayers() async {
    final s = _style;
    if (s == null) return;
    _appliedSelKind = widget.state.selectionKind;
    _appliedSelId = widget.state.selectedId;

    for (final id in const [
      _kJlsFillSelId,
      _kJlsLineSelId,
      _kNasFillSelId,
      _kNasLineSelId,
    ]) {
      try {
        await s.removeLayer(id);
      } catch (_) {}
    }

    final id = widget.state.selectedId;
    final kind = widget.state.selectionKind;
    if (id == null || kind == SelectionKind.none) return;

    final filter = <Object>[
      '==',
      <Object>['to-string', <Object>['id']],
      '$id',
    ];

    if (kind == SelectionKind.jls) {
      await s.addLayer(FillStyleLayer(
        id: _kJlsFillSelId,
        sourceId: _kJlsSource,
        filter: filter,
        paint: <String, Object>{
          'fill-color': <Object>['get', 'color'],
          'fill-opacity': 0.75,
        },
      ));
      await s.addLayer(LineStyleLayer(
        id: _kJlsLineSelId,
        sourceId: _kJlsSource,
        filter: filter,
        paint: const <String, Object>{
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-opacity': 1.0,
        },
      ));
    } else {
      // naselja selection — only meaningful when source is available, but the
      // filter just won't match anything if the source is missing.
      if (!_naseljaSourceAdded) return;
      await s.addLayer(FillStyleLayer(
        id: _kNasFillSelId,
        sourceId: _kNasSource,
        filter: filter,
        paint: <String, Object>{
          'fill-color': <Object>[
            'coalesce',
            <Object>['get', 'nas_color'],
            <Object>['get', 'color'],
          ],
          'fill-opacity': 0.85,
        },
      ));
      await s.addLayer(LineStyleLayer(
        id: _kNasLineSelId,
        sourceId: _kNasSource,
        filter: filter,
        paint: const <String, Object>{
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-opacity': 1.0,
        },
      ));
    }
  }

  // ─── Hover layer ─────────────────────────────────────────────────────────
  /// Hover targets the active layer family — naselja when visible, JLS otherwise.
  SelectionKind _currentHoverKind() {
    final s = widget.state;
    if (s.showNaselja && s.naseljaLoaded) return SelectionKind.naselje;
    return SelectionKind.jls;
  }

  void _scheduleHoverRebuild() {
    if (!_layersReady) return;
    _hoverDirty = true;
    if (_hoverRebuilding) return;
    _hoverRebuilding = true;
    () async {
      while (_hoverDirty) {
        _hoverDirty = false;
        await _rebuildHoverLayer();
      }
      _hoverRebuilding = false;
    }();
  }

  Future<void> _rebuildHoverLayer() async {
    final s = _style;
    if (s == null) return;
    final st = widget.state;
    final kind = _currentHoverKind();
    final id = st.hoveredId;
    final desiredId = (id == null || (kind == st.selectionKind && id == st.selectedId)) ? null : id;
    if (kind == _appliedHoverKind && desiredId == _appliedHoverId) return;
    _appliedHoverKind = kind;
    _appliedHoverId = desiredId;

    for (final lid in const [_kJlsLineHoverId, _kNasLineHoverId]) {
      try {
        await s.removeLayer(lid);
      } catch (_) {}
    }
    if (desiredId == null) return;

    final filter = <Object>[
      '==',
      <Object>['to-string', <Object>['id']],
      '$desiredId',
    ];
    final isNaselje = kind == SelectionKind.naselje;
    if (isNaselje && !_naseljaSourceAdded) return;
    try {
      await s.addLayer(LineStyleLayer(
        id: isNaselje ? _kNasLineHoverId : _kJlsLineHoverId,
        sourceId: isNaselje ? _kNasSource : _kJlsSource,
        filter: filter,
        paint: const <String, Object>{
          'line-color': '#00b4d8',
          'line-width': 2.0,
          'line-opacity': 0.95,
        },
      ));
    } catch (_) {
      _appliedHoverId = null;
    }
  }

  // ─── Overlay borders (županije + state) ──────────────────────────────────
  Future<void> _rebuildOverlayBorders() async {
    final s = _style;
    if (s == null) return;
    _appliedZupBorders = widget.state.showZupanijeBorders;

    for (final id in const [_kDrzLineId, _kZupLineId]) {
      try {
        await s.removeLayer(id);
      } catch (_) {}
    }

    if (widget.state.showZupanijeBorders) {
      await s.addLayer(LineStyleLayer(
        id: _kZupLineId,
        sourceId: _kZupSource,
        paint: <String, Object>{
          'line-color': '#0a0e14',
          'line-width': <Object>[
            'interpolate', <Object>['linear'], <Object>['zoom'],
            6, 1.2,
            10, 2.4,
            14, 4,
          ],
          'line-opacity': 0.85,
          'line-dasharray': <Object>[3, 2],
        },
      ));
    }

    await s.addLayer(LineStyleLayer(
      id: _kDrzLineId,
      sourceId: _kDrzSource,
      paint: <String, Object>{
        'line-color': '#7a3b00',
        'line-width': <Object>[
          'interpolate', <Object>['linear'], <Object>['zoom'],
          5, 1.5,
          9, 2.5,
          14, 4,
        ],
        'line-opacity': 0.95,
      },
    ));
  }

  // ─── Naselja layers ──────────────────────────────────────────────────────
  void _scheduleNaseljaRebuild() {
    if (!_layersReady) return;
    _naseljaDirty = true;
    if (_naseljaRebuilding) return;
    _naseljaRebuilding = true;
    () async {
      while (_naseljaDirty) {
        _naseljaDirty = false;
        await _rebuildNaseljaLayers();
      }
      _naseljaRebuilding = false;
    }();
  }

  Future<void> _rebuildNaseljaLayers() async {
    final s = _style;
    if (s == null) return;
    final st = widget.state;
    _appliedShowNaselja = st.showNaselja;

    // Lazily register the source the first time the dataset is available.
    if (!_naseljaSourceAdded && st.naselja != null) {
      try {
        await s.addSource(GeoJsonSource(id: _kNasSource, data: st.naselja!.rawGeoJson));
        _naseljaSourceAdded = true;
      } catch (_) {/* already there */}
    }

    final shouldShow = st.showNaselja && _naseljaSourceAdded;

    for (final id in const [_kNasLabelId, _kNasLineId, _kNasFillId]) {
      try {
        await s.removeLayer(id);
      } catch (_) {}
    }

    if (!shouldShow) {
      // Also drop any lingering naselja-typed selection / hover overlays.
      await _rebuildSelectionLayers();
      _scheduleHoverRebuild();
      return;
    }

    final focusMb = _focusedJlsMb();
    final focusFilter = focusMb == null
        ? null
        : <Object>['==', <Object>['get', 'jls_maticni_broj'], focusMb];

    await s.addLayer(FillStyleLayer(
      id: _kNasFillId,
      sourceId: _kNasSource,
      minZoom: 9,
      filter: focusFilter,
      paint: <String, Object>{
        'fill-color': <Object>[
          'coalesce',
          <Object>['get', 'nas_color'],
          <Object>['get', 'color'],
        ],
        'fill-opacity': 0.45,
        'fill-antialias': true,
      },
    ));
    await s.addLayer(LineStyleLayer(
      id: _kNasLineId,
      sourceId: _kNasSource,
      minZoom: 9,
      filter: focusFilter,
      paint: <String, Object>{
        'line-color': 'rgba(0,0,0,0.65)',
        'line-width': <Object>[
          'interpolate', <Object>['linear'], <Object>['zoom'],
          9, 0.5,
          14, 1.4,
        ],
        'line-opacity': 0.95,
      },
    ));
    await s.addLayer(SymbolStyleLayer(
      id: _kNasLabelId,
      sourceId: _kNasSource,
      minZoom: 11,
      filter: focusFilter,
      layout: <String, Object>{
        'text-field': <Object>['get', 'name'],
        'text-font': <Object>['Noto Sans Regular'],
        'text-size': <Object>[
          'interpolate', <Object>['linear'], <Object>['zoom'],
          11, 9,
          14, 12,
          16, 16,
        ],
        'text-allow-overlap': false,
      },
      paint: <String, Object>{
        'text-color': '#1e293b',
        'text-halo-color': 'rgba(255,255,255,0.95)',
        'text-halo-width': 1.5,
      },
    ));

    // Re-stack selection / hover so they're above the freshly added fill/line.
    await _rebuildSelectionLayers();
    _scheduleHoverRebuild();
  }

  // ─── Expressions ─────────────────────────────────────────────────────────
  Object _colorExpression() {
    if (widget.state.colorMode == ColorMode.zupanija) {
      return <Object>['get', 'color'];
    }
    return <Object>[
      'match', <Object>['get', 'type'],
      'Grad', '#d4322f',
      'Općina', '#588b8b',
      'Otok', '#06aed5',
      '#8d99ae',
    ];
  }

  Object _fillOpacityExpression() {
    final zup = widget.state.activeZupanija;
    if (zup == null) return 0.4;
    return <Object>[
      'case',
      <Object>['==', <Object>['get', 'zupanija'], zup], 0.7,
      0.06,
    ];
  }

  Object _lineOpacityExpression() {
    final zup = widget.state.activeZupanija;
    if (zup == null) return 0.85;
    return <Object>[
      'case',
      <Object>['==', <Object>['get', 'zupanija'], zup], 0.95,
      0.10,
    ];
  }

  // ─── Click + hover routing ───────────────────────────────────────────────
  void _onMapEvent(MapEvent event) {
    if (event is MapEventMoveCamera) {
      widget.zoomSink?.value = event.camera.zoom;
      return;
    }
    if (event is! MapEventClick) return;
    final ctrl = _controller;
    if (ctrl == null) return;
    final st = widget.state;

    if (st.showNaselja && st.naseljaLoaded) {
      final hits = ctrl.featuresAtPoint(
        event.screenPoint,
        layerIds: const [_kNasFillId],
      );
      if (hits.isEmpty) {
        st.clearSelection();
      } else {
        final id = _parseId(hits.first.id);
        if (id != null) st.selectNaselje(id);
      }
      return;
    }

    final hits = ctrl.featuresAtPoint(
      event.screenPoint,
      layerIds: const [_kJlsFillId],
    );
    if (hits.isEmpty) {
      st.clearSelection();
      return;
    }
    final id = _parseId(hits.first.id);
    if (id != null) st.selectJls(id);
  }

  int? _parseId(Object? raw) {
    if (raw is int) return raw;
    final s = raw?.toString() ?? '';
    return int.tryParse(s);
  }

  void _onPointerHover(PointerHoverEvent event) {
    final ctrl = _controller;
    if (ctrl == null) return;
    _hoverPos.value = event.localPosition;

    final st = widget.state;
    final layerId = (st.showNaselja && st.naseljaLoaded) ? _kNasFillId : _kJlsFillId;
    final hits = ctrl.featuresAtPoint(
      event.localPosition,
      layerIds: [layerId],
    );
    if (hits.isEmpty) {
      st.setHover(null);
      return;
    }
    st.setHover(_parseId(hits.first.id));
  }

  void _onPointerExit(PointerExitEvent event) {
    _hoverPos.value = null;
    widget.state.setHover(null);
  }

  // ─── Camera ──────────────────────────────────────────────────────────────
  Future<void> _flyToSelection() async {
    final ctrl = _controller;
    if (ctrl == null) return;
    final st = widget.state;
    final id = st.selectedId;
    if (id == null) return;
    LngLatBounds? b;
    if (st.selectionKind == SelectionKind.jls) {
      b = boundsForFeatureId(widget.dataset.jlsRaw, id);
    } else if (st.selectionKind == SelectionKind.naselje && st.naselja != null) {
      b = boundsForFeatureId(st.naselja!.rawGeoJson, id);
    }
    if (b == null) return;
    await ctrl.fitBounds(
      bounds: b,
      padding: const EdgeInsets.all(60),
      nativeDuration: const Duration(milliseconds: 800),
      webMaxDuration: const Duration(milliseconds: 800),
      webMaxZoom: 13,
    );
  }

  Future<void> resetView() async {
    final ctrl = _controller;
    if (ctrl == null) return;
    await ctrl.fitBounds(
      bounds: hrBounds,
      padding: const EdgeInsets.all(24),
      nativeDuration: const Duration(milliseconds: 900),
      webMaxDuration: const Duration(milliseconds: 900),
    );
  }

  Future<void> flyToZupanija(String name) async {
    final ctrl = _controller;
    if (ctrl == null) return;
    final b = boundsForZupanija(widget.dataset.jlsRaw, name);
    if (b == null) return;
    await ctrl.fitBounds(
      bounds: b,
      padding: const EdgeInsets.all(50),
      nativeDuration: const Duration(milliseconds: 900),
      webMaxDuration: const Duration(milliseconds: 900),
      webMaxZoom: 11,
    );
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.bg,
      child: Stack(
        fit: StackFit.expand,
        children: [
          MouseRegion(
            opaque: false,
            onHover: _onPointerHover,
            onExit: _onPointerExit,
            child: MapLibreMap(
              options: const MapOptions(
                initStyle: _kStyleUrl,
                initCenter: Geographic(lon: 16.5, lat: 44.5),
                initZoom: 6.5,
                minZoom: 5.5,
                maxZoom: 16,
                minPitch: 0,
                maxPitch: 0,
                gestures: MapGestures(
                  rotate: false,
                  pan: true,
                  zoom: true,
                  pitch: false,
                ),
              ),
              onMapCreated: (c) => _controller = c,
              onStyleLoaded: _onStyleLoaded,
              onEvent: _onMapEvent,
              children: const [
                MapScalebar(alignment: Alignment.bottomLeft, padding: EdgeInsets.only(left: 14, bottom: 14)),
                SourceAttribution(),
              ],
            ),
          ),
          _HoverTooltip(state: widget.state, position: _hoverPos),
        ],
      ),
    );
  }
}

class _HoverTooltip extends StatelessWidget {
  const _HoverTooltip({required this.state, required this.position});

  final MapStateController state;
  final ValueNotifier<Offset?> position;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([state, position]),
      builder: (context, _) {
        final p = position.value;
        final naselje = state.hoveredNaselje;
        final jls = state.hoveredJls;
        if (p == null || (naselje == null && jls == null)) {
          return const Positioned(left: 0, top: 0, width: 0, height: 0, child: SizedBox.shrink());
        }

        final maxW = MediaQuery.of(context).size.width;
        final maxH = MediaQuery.of(context).size.height;
        const tooltipW = 240.0;
        const tooltipH = 64.0;
        const offset = Offset(14, 14);
        var left = p.dx + offset.dx;
        var top = p.dy + offset.dy;
        if (left + tooltipW > maxW) left = p.dx - tooltipW - offset.dx;
        if (top + tooltipH > maxH) top = p.dy - tooltipH - offset.dy;
        if (left < 0) left = 0;
        if (top < 0) top = 0;

        return Positioned(
          left: left,
          top: top,
          width: tooltipW,
          child: IgnorePointer(
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              decoration: BoxDecoration(
                color: AppColors.bg.withValues(alpha: 0.94),
                border: Border.all(color: AppColors.line),
                borderRadius: BorderRadius.circular(6),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF000000).withValues(alpha: 0.4),
                    blurRadius: 10,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: naselje != null
                  ? _NaseljeTooltipBody(feature: naselje)
                  : _JlsTooltipBody(feature: jls!),
            ),
          ),
        );
      },
    );
  }
}

class _JlsTooltipBody extends StatelessWidget {
  const _JlsTooltipBody({required this.feature});
  final JlsFeature feature;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Container(
              width: 9,
              height: 9,
              decoration: BoxDecoration(color: feature.color, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                feature.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: kFontDisplay,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                  height: 1.1,
                ),
              ),
            ),
            Text(
              feature.type,
              style: const TextStyle(
                fontFamily: kFontMono,
                fontSize: 9.5,
                color: AppColors.muted,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          feature.zupanija,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontFamily: kFontMono,
            fontSize: 10.5,
            color: AppColors.muted,
          ),
        ),
      ],
    );
  }
}

class _NaseljeTooltipBody extends StatelessWidget {
  const _NaseljeTooltipBody({required this.feature});
  final NaseljeFeature feature;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Container(
              width: 9,
              height: 9,
              decoration: BoxDecoration(color: feature.nasColor, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                feature.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: kFontDisplay,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                  height: 1.1,
                ),
              ),
            ),
            if (feature.stanovnistvo != null)
              Text(
                '${feature.stanovnistvo} st.',
                style: const TextStyle(
                  fontFamily: kFontMono,
                  fontSize: 9.5,
                  color: AppColors.muted,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          '${feature.jlsType} ${feature.jlsName} · ${feature.zupanija}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontFamily: kFontMono,
            fontSize: 10.5,
            color: AppColors.muted,
          ),
        ),
      ],
    );
  }
}
