import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import '../data/jls_dataset.dart';
import '../state/map_state.dart';
import '../theme.dart';
import '../widgets/controls_overlay.dart';
import '../widgets/header_bar.dart';
import '../widgets/info_panels.dart';
import '../widgets/legend_panel.dart';
import '../widgets/map_view.dart';
import '../widgets/sidebar_left.dart';
import '../widgets/sidebar_right.dart';
import '../widgets/zoom_badge.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.dataset});

  final JlsDataset dataset;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  late final MapStateController _state;
  final GlobalKey<MapViewState> _mapKey = GlobalKey<MapViewState>();
  final FocusNode _kbFocus = FocusNode(debugLabel: 'map-kb');
  final ValueNotifier<double?> _zoom = ValueNotifier<double?>(null);
  bool _legendExpanded = true;
  bool _fineprintExpanded = false;

  @override
  void initState() {
    super.initState();
    _state = MapStateController(widget.dataset);
    // Web only: keyboard shortcuts. Touch platforms: irrelevant.
    if (kIsWeb) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _kbFocus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _state.dispose();
    _kbFocus.dispose();
    _zoom.dispose();
    super.dispose();
  }

  void _onSelectFeature(JlsFeature f) {
    _state.selectJls(f.id);
  }

  void _onSelectZupanija(String? z) {
    _state.setZupanijaFilter(z);
    if (z != null) {
      _mapKey.currentState?.flyToZupanija(z);
    } else {
      _mapKey.currentState?.resetView();
    }
  }

  void _fit() {
    _state.setZupanijaFilter(null);
    _mapKey.currentState?.resetView();
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    // Don't hijack typing inside text fields (search box, etc).
    final primary = FocusManager.instance.primaryFocus;
    if (primary != null && primary.context?.widget is EditableText) {
      return KeyEventResult.ignored;
    }
    final c = event.logicalKey.keyLabel.toLowerCase();
    switch (c) {
      case 'c':
        _state.toggleColorMode();
        return KeyEventResult.handled;
      case 'b':
        _state.toggleZupanijeBorders();
        return KeyEventResult.handled;
      case 'j':
        _state.toggleJlsBorders();
        return KeyEventResult.handled;
      case 'n':
        _state.toggleNaselja();
        return KeyEventResult.handled;
      case 'z':
        _state.toggleFocusMode();
        return KeyEventResult.handled;
      case 'f':
        _fit();
        return KeyEventResult.handled;
      case 'i':
        setState(() => _legendExpanded = !_legendExpanded);
        return KeyEventResult.handled;
      case 'o':
        setState(() => _fineprintExpanded = !_fineprintExpanded);
        return KeyEventResult.handled;
      case 'escape':
        if (_state.selectionKind != SelectionKind.none) {
          _state.clearSelection();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _kbFocus,
      autofocus: kIsWeb,
      onKeyEvent: _onKey,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, c) {
              final wide = c.maxWidth >= 1100;
              final medium = c.maxWidth >= 760 && !wide;
              final compact = !wide && !medium;
              return Column(
                children: [
                  HeaderBar(compact: compact),
                  Expanded(
                    child: compact
                        ? _CompactLayout(
                            dataset: widget.dataset,
                            state: _state,
                            mapKey: _mapKey,
                            zoomSink: _zoom,
                            onSelectFeature: _onSelectFeature,
                            onSelectZupanija: _onSelectZupanija,
                            onFit: _fit,
                            legendExpanded: _legendExpanded,
                            fineprintExpanded: _fineprintExpanded,
                            onToggleLegend: () => setState(() => _legendExpanded = !_legendExpanded),
                            onToggleFineprint: () => setState(() => _fineprintExpanded = !_fineprintExpanded),
                          )
                        : _WideLayout(
                            showRight: wide,
                            dataset: widget.dataset,
                            state: _state,
                            mapKey: _mapKey,
                            zoomSink: _zoom,
                            onSelectFeature: _onSelectFeature,
                            onSelectZupanija: _onSelectZupanija,
                            onFit: _fit,
                            legendExpanded: _legendExpanded,
                            fineprintExpanded: _fineprintExpanded,
                            onToggleLegend: () => setState(() => _legendExpanded = !_legendExpanded),
                            onToggleFineprint: () => setState(() => _fineprintExpanded = !_fineprintExpanded),
                          ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _WideLayout extends StatelessWidget {
  const _WideLayout({
    required this.showRight,
    required this.dataset,
    required this.state,
    required this.mapKey,
    required this.zoomSink,
    required this.onSelectFeature,
    required this.onSelectZupanija,
    required this.onFit,
    required this.legendExpanded,
    required this.fineprintExpanded,
    required this.onToggleLegend,
    required this.onToggleFineprint,
  });

  final bool showRight;
  final JlsDataset dataset;
  final MapStateController state;
  final GlobalKey<MapViewState> mapKey;
  final ValueNotifier<double?> zoomSink;
  final void Function(JlsFeature) onSelectFeature;
  final void Function(String?) onSelectZupanija;
  final VoidCallback onFit;
  final bool legendExpanded;
  final bool fineprintExpanded;
  final VoidCallback onToggleLegend;
  final VoidCallback onToggleFineprint;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 320,
          child: DecoratedBox(
            decoration: const BoxDecoration(
              border: Border(right: BorderSide(color: AppColors.line)),
            ),
            child: SidebarLeft(
              dataset: dataset,
              state: state,
              onSelectFeature: onSelectFeature,
              onSelectZupanija: onSelectZupanija,
            ),
          ),
        ),
        Expanded(
          child: _MapStack(
            dataset: dataset,
            state: state,
            mapKey: mapKey,
            zoomSink: zoomSink,
            onFit: onFit,
            legendExpanded: legendExpanded,
            fineprintExpanded: fineprintExpanded,
            onToggleLegend: onToggleLegend,
            onToggleFineprint: onToggleFineprint,
          ),
        ),
        if (showRight)
          SizedBox(
            width: 380,
            child: DecoratedBox(
              decoration: const BoxDecoration(
                border: Border(left: BorderSide(color: AppColors.line)),
              ),
              child: SidebarRight(state: state, totalAreaKm2: dataset.totalAreaKm2),
            ),
          ),
      ],
    );
  }
}

class _CompactLayout extends StatefulWidget {
  const _CompactLayout({
    required this.dataset,
    required this.state,
    required this.mapKey,
    required this.zoomSink,
    required this.onSelectFeature,
    required this.onSelectZupanija,
    required this.onFit,
    required this.legendExpanded,
    required this.fineprintExpanded,
    required this.onToggleLegend,
    required this.onToggleFineprint,
  });

  final JlsDataset dataset;
  final MapStateController state;
  final GlobalKey<MapViewState> mapKey;
  final ValueNotifier<double?> zoomSink;
  final void Function(JlsFeature) onSelectFeature;
  final void Function(String?) onSelectZupanija;
  final VoidCallback onFit;
  final bool legendExpanded;
  final bool fineprintExpanded;
  final VoidCallback onToggleLegend;
  final VoidCallback onToggleFineprint;

  @override
  State<_CompactLayout> createState() => _CompactLayoutState();
}

class _CompactLayoutState extends State<_CompactLayout> {
  bool _drawerOpen = false;
  bool _detailsOpen = false;

  @override
  void initState() {
    super.initState();
    widget.state.addListener(_onStateChange);
  }

  @override
  void dispose() {
    widget.state.removeListener(_onStateChange);
    super.dispose();
  }

  void _onStateChange() {
    if (widget.state.selectionKind != SelectionKind.none && !_detailsOpen) {
      setState(() => _detailsOpen = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: _MapStack(
            dataset: widget.dataset,
            state: widget.state,
            mapKey: widget.mapKey,
            zoomSink: widget.zoomSink,
            onFit: widget.onFit,
            legendExpanded: widget.legendExpanded,
            fineprintExpanded: widget.fineprintExpanded,
            onToggleLegend: widget.onToggleLegend,
            onToggleFineprint: widget.onToggleFineprint,
          ),
        ),
        Positioned(
          left: 12,
          top: 12,
          child: PointerInterceptor(
            child: _MiniButton(
              icon: Icons.menu,
              onTap: () => setState(() => _drawerOpen = true),
            ),
          ),
        ),
        if (_drawerOpen)
          Positioned.fill(
            child: PointerInterceptor(
              child: GestureDetector(
                onTap: () => setState(() => _drawerOpen = false),
                child: const ColoredBox(color: Color(0x88000000)),
              ),
            ),
          ),
        AnimatedPositioned(
          duration: const Duration(milliseconds: 220),
          left: _drawerOpen ? 0 : -340,
          top: 0,
          bottom: 0,
          width: 320,
          child: PointerInterceptor(
              child: SidebarLeft(
            dataset: widget.dataset,
            state: widget.state,
            onSelectFeature: (f) {
              widget.onSelectFeature(f);
              setState(() => _drawerOpen = false);
            },
            onSelectZupanija: (z) {
              widget.onSelectZupanija(z);
              setState(() => _drawerOpen = false);
            },
          )),
        ),
        if (_detailsOpen && widget.state.selectionKind != SelectionKind.none)
          Align(
            alignment: Alignment.bottomCenter,
            child: PointerInterceptor(
                child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 320),
              child: Material(
                color: AppColors.bg2,
                elevation: 12,
                shape: const RoundedRectangleBorder(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(10)),
                ),
                child: Stack(
                  children: [
                    SidebarRight(state: widget.state, totalAreaKm2: widget.dataset.totalAreaKm2),
                    Positioned(
                      top: 6,
                      right: 6,
                      child: IconButton(
                        icon: const Icon(Icons.close, color: AppColors.muted),
                        onPressed: () {
                          setState(() => _detailsOpen = false);
                          widget.state.clearSelection();
                        },
                      ),
                    ),
                  ],
                ),
              ),
            )),
          ),
      ],
    );
  }
}

class _MiniButton extends StatelessWidget {
  const _MiniButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppColors.bg.withValues(alpha: 0.92),
          border: Border.all(color: AppColors.line),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Icon(icon, color: AppColors.text, size: 18),
      ),
    );
  }
}

class _MapStack extends StatelessWidget {
  const _MapStack({
    required this.dataset,
    required this.state,
    required this.mapKey,
    required this.zoomSink,
    required this.onFit,
    required this.legendExpanded,
    required this.fineprintExpanded,
    required this.onToggleLegend,
    required this.onToggleFineprint,
  });
  final JlsDataset dataset;
  final MapStateController state;
  final GlobalKey<MapViewState> mapKey;
  final ValueNotifier<double?> zoomSink;
  final VoidCallback onFit;
  final bool legendExpanded;
  final bool fineprintExpanded;
  final VoidCallback onToggleLegend;
  final VoidCallback onToggleFineprint;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: MapView(key: mapKey, dataset: dataset, state: state, zoomSink: zoomSink),
        ),
        Align(
          alignment: Alignment.topRight,
          child: ControlsOverlay(
            state: state,
            onToggleColor: state.toggleColorMode,
            onToggleZupBorders: state.toggleZupanijeBorders,
            onToggleJlsBorders: state.toggleJlsBorders,
            onToggleNaselja: state.toggleNaselja,
            onToggleFocus: state.toggleFocusMode,
            onFit: onFit,
          ),
        ),
        Positioned(
          left: 14,
          bottom: 14,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              CollapsibleLegend(
                expanded: legendExpanded,
                onToggle: onToggleLegend,
                child: LegendPanel(state: state),
              ),
              const SizedBox(height: 8),
              ZoomBadge(zoom: zoomSink),
            ],
          ),
        ),
        Positioned(
          right: 14,
          bottom: 14,
          child: CollapsibleFineprint(
            expanded: fineprintExpanded,
            onToggle: onToggleFineprint,
          ),
        ),
      ],
    );
  }
}
