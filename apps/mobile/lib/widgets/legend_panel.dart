import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import '../state/map_state.dart';
import '../theme.dart';

class LegendPanel extends StatelessWidget {
  const LegendPanel({super.key, required this.state});
  final MapStateController state;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final byType = state.colorMode == ColorMode.type;
        return PointerInterceptor(child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          constraints: const BoxConstraints(maxWidth: 280),
          decoration: BoxDecoration(
            color: AppColors.bg.withValues(alpha: 0.92),
            border: Border.all(color: AppColors.line),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                byType ? 'Boja po tipu' : 'Boja po županiji',
                style: const TextStyle(
                  fontFamily: kFontDisplay,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 6),
              if (byType) ...[
                const _LegendRow(color: Color(0xFFD4322F), label: 'Grad'),
                const _LegendRow(color: Color(0xFF588B8B), label: 'Općina'),
                const _LegendRow(color: Color(0xFF06AED5), label: 'Otok'),
              ] else
                const Text(
                  'Svaka županija = jedan ton.\nKlikom u listi filtriraš JLS-ove.',
                  style: TextStyle(
                    fontFamily: kFontMono,
                    fontSize: 11,
                    color: AppColors.muted,
                    height: 1.5,
                  ),
                ),
              const SizedBox(height: 10),
              const Divider(height: 1, color: AppColors.line),
              const SizedBox(height: 8),
              const Text(
                'Granice (DGU)',
                style: TextStyle(
                  fontFamily: kFontDisplay,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.muted,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: 4),
              const _LineRow(color: AppColors.text, dashed: true, label: 'županije'),
              const _LineRow(color: Color(0xFF7A3B00), dashed: false, label: 'državna granica'),
              const SizedBox(height: 4),
              const Text(
                'Izvor: DGU + DZS, topology-preserving simplify.',
                style: TextStyle(
                  fontFamily: kFontMono,
                  fontSize: 10,
                  color: AppColors.muted,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ));
      },
    );
  }
}

class _LegendRow extends StatelessWidget {
  const _LegendRow({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(
              fontFamily: kFontMono,
              fontSize: 11,
              color: AppColors.text,
            ),
          ),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.color, required this.dashed, required this.label});
  final Color color;
  final bool dashed;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          SizedBox(
            width: 18,
            height: 12,
            child: CustomPaint(painter: _LinePainter(color: color, dashed: dashed)),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(
              fontFamily: kFontMono,
              fontSize: 11,
              color: AppColors.text,
            ),
          ),
        ],
      ),
    );
  }
}

class _LinePainter extends CustomPainter {
  _LinePainter({required this.color, required this.dashed});
  final Color color;
  final bool dashed;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke;
    final y = size.height / 2;
    if (!dashed) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      return;
    }
    const dash = 3.0;
    const gap = 2.0;
    var x = 0.0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, y), Offset(x + dash, y), paint);
      x += dash + gap;
    }
  }

  @override
  bool shouldRepaint(covariant _LinePainter old) => old.color != color || old.dashed != dashed;
}
