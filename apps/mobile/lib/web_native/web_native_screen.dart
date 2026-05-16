import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../data/jls_dataset.dart';
import '../theme.dart';
import '../widgets/zoom_badge.dart';
import 'geo_features.dart';
import 'geojson_layer.dart';
import 'raster_basemap.dart';

/// **DEPRECATED — kept as dead code.** Pure-Flutter web map renderer
/// experiment (2026-05-15). Lost to the standalone HTML reference
/// `hrvatska_full.html` in side-by-side perf. Not a production path.
/// See `lib/web_native/README.md` for the full post-mortem.
@Deprecated('Experiment closed 2026-05-15. Web ships as standalone HTML, not Flutter. See lib/web_native/README.md')
class WebNativeScreen extends StatefulWidget {
  const WebNativeScreen({super.key, required this.dataset});
  final JlsDataset dataset;

  @override
  State<WebNativeScreen> createState() => _WebNativeScreenState();
}

class _WebNativeScreenState extends State<WebNativeScreen> {
  final ValueNotifier<double?> _zoom = ValueNotifier<double?>(null);
  late final Future<GeoLayer> _geoFuture = loadGeoLayer(widget.dataset);

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  void _onCameraChanged(LatLng center, double zoom) {
    _zoom.value = zoom;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: FutureBuilder<GeoLayer>(
          future: _geoFuture,
          builder: (context, snap) {
            return Stack(
              children: [
                Positioned.fill(
                  child: RasterBasemap(
                    onCameraChanged: _onCameraChanged,
                    overlays: [
                      if (snap.hasData) GeoJsonLayer(layer: snap.data!),
                    ],
                  ),
                ),
                const Positioned(top: 12, left: 12, child: _HeaderChip()),
                const Positioned(top: 12, right: 12, child: _RouteSwitcher(active: 'native')),
                const Positioned(top: 56, left: 12, right: 12, child: _DeprecationBanner()),
                Positioned(left: 14, bottom: 14, child: ZoomBadge(zoom: _zoom)),
                if (!snap.hasData && !snap.hasError)
                  const Positioned(top: 60, left: 12, child: _LoadingChip()),
                if (snap.hasError)
                  Positioned(top: 60, left: 12, child: _ErrorChip(error: snap.error!)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _DeprecationBanner extends StatelessWidget {
  const _DeprecationBanner();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          decoration: BoxDecoration(
            color: AppColors.bg.withValues(alpha: 0.94),
            border: Border.all(color: AppColors.accent),
            borderRadius: BorderRadius.circular(6),
          ),
          child: const Text(
            'DEPRECATED · pure-Flutter web renderer experiment (2026-05-15). '
            'Lost to standalone HTML reference in side-by-side perf. Production web ships as plain HTML; this route is kept only to reproduce the perf gap. '
            'See lib/web_native/README.md.',
            style: TextStyle(
              fontFamily: kFontMono,
              fontSize: 10.5,
              color: AppColors.accent,
              height: 1.4,
            ),
          ),
        ),
      ),
    );
  }
}

class _HeaderChip extends StatelessWidget {
  const _HeaderChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: AppColors.bg.withValues(alpha: 0.92),
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Text(
        'DOMOVINA · NATIVE (BETA)',
        style: TextStyle(
          fontFamily: kFontMono,
          fontSize: 11,
          color: AppColors.muted,
          letterSpacing: 1.4,
        ),
      ),
    );
  }
}

class _LoadingChip extends StatelessWidget {
  const _LoadingChip();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.bg.withValues(alpha: 0.92),
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Text(
        'UČITAVANJE GEOMETRIJE…',
        style: TextStyle(
          fontFamily: kFontMono,
          fontSize: 10,
          color: AppColors.muted,
          letterSpacing: 1.4,
        ),
      ),
    );
  }
}

class _ErrorChip extends StatelessWidget {
  const _ErrorChip({required this.error});
  final Object error;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.bg.withValues(alpha: 0.92),
        border: Border.all(color: AppColors.accent),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        'GREŠKA: $error',
        style: const TextStyle(
          fontFamily: kFontMono,
          fontSize: 10,
          color: AppColors.accent,
        ),
      ),
    );
  }
}

class _RouteSwitcher extends StatelessWidget {
  const _RouteSwitcher({required this.active});
  final String active;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bg.withValues(alpha: 0.92),
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SwitchTab(label: 'MAPLIBRE', isActive: active == 'maplibre', route: '/'),
          Container(width: 1, height: 24, color: AppColors.line),
          _SwitchTab(label: 'NATIVE', isActive: active == 'native', route: '/native'),
        ],
      ),
    );
  }
}

class _SwitchTab extends StatelessWidget {
  const _SwitchTab({required this.label, required this.isActive, required this.route});
  final String label;
  final bool isActive;
  final String route;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isActive ? null : () => Navigator.of(context).pushReplacementNamed(route),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        color: isActive ? AppColors.bg3 : Colors.transparent,
        child: Text(
          label,
          style: TextStyle(
            fontFamily: kFontMono,
            fontSize: 10.5,
            color: isActive ? AppColors.accent : AppColors.muted,
            letterSpacing: 1.2,
          ),
        ),
      ),
    );
  }
}
