import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import '../theme.dart';

class ZoomBadge extends StatelessWidget {
  const ZoomBadge({super.key, required this.zoom});
  final ValueListenable<double?> zoom;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<double?>(
      valueListenable: zoom,
      builder: (context, z, _) {
        return PointerInterceptor(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.bg.withValues(alpha: 0.92),
              border: Border.all(color: AppColors.line),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Z',
                  style: TextStyle(
                    fontFamily: kFontMono,
                    fontSize: 9,
                    color: AppColors.muted,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  z == null ? '—' : z.toStringAsFixed(2),
                  style: const TextStyle(
                    fontFamily: kFontMono,
                    fontSize: 11.5,
                    color: AppColors.text,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
