import 'package:flutter/material.dart';

import '../theme.dart';

class HeaderBar extends StatelessWidget {
  const HeaderBar({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [AppColors.bg2, AppColors.bg],
        ),
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      padding: EdgeInsets.symmetric(horizontal: compact ? 14 : 24, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _Logo(compact: compact),
          if (!compact) ...[
            const SizedBox(width: 22),
            const _Subtitle(),
          ],
          const Spacer(),
          if (!compact) const _Badges(),
        ],
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo({required this.compact});
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 18.0 : 26.0;
    final base = TextStyle(
      fontFamily: kFontDisplay,
      fontWeight: FontWeight.w800,
      fontSize: size,
      letterSpacing: -0.025 * size,
      color: AppColors.ink,
      height: 1.0,
    );
    final sep = base.copyWith(color: AppColors.muted, fontWeight: FontWeight.w400);
    final accent = base.copyWith(color: AppColors.accent);
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: 'DOMOVINA', style: base),
        TextSpan(text: '  /  ', style: sep),
        TextSpan(text: 'karta JLS-ova RH', style: accent),
      ]),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }
}

class _Subtitle extends StatelessWidget {
  const _Subtitle();
  @override
  Widget build(BuildContext context) => const Text(
        '556 JLS · 21 ŽUPANIJA · DGU + DZS',
        style: TextStyle(
          fontFamily: kFontMono,
          color: AppColors.muted,
          fontSize: 11,
          letterSpacing: 0.18 * 11,
        ),
      );
}

class _Badges extends StatelessWidget {
  const _Badges();
  @override
  Widget build(BuildContext context) {
    return const Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        _Badge(label: 'GPU', kind: _BadgeKind.gpu),
        _Badge(label: 'OpenFreeMap', kind: _BadgeKind.free),
        _Badge(label: r'$0 / mj', kind: _BadgeKind.zero),
      ],
    );
  }
}

enum _BadgeKind { gpu, free, zero, neutral }

class _Badge extends StatelessWidget {
  const _Badge({required this.label, this.kind = _BadgeKind.neutral});
  final String label;
  final _BadgeKind kind;

  @override
  Widget build(BuildContext context) {
    final (border, text, bg) = switch (kind) {
      _BadgeKind.gpu => (AppColors.accent2.withValues(alpha: 0.4), AppColors.accent2, AppColors.accent2.withValues(alpha: 0.05)),
      _BadgeKind.free => (AppColors.good.withValues(alpha: 0.3), AppColors.good, AppColors.bg3),
      _BadgeKind.zero => (AppColors.accent.withValues(alpha: 0.3), AppColors.accent, AppColors.bg3),
      _BadgeKind.neutral => (AppColors.line, AppColors.text, AppColors.bg3),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(100),
        color: bg,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (kind == _BadgeKind.gpu) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.accent2,
                boxShadow: [BoxShadow(color: AppColors.accent2.withValues(alpha: 0.6), blurRadius: 12)],
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              fontFamily: kFontMono,
              fontSize: 10.5,
              color: text,
            ),
          ),
        ],
      ),
    );
  }
}
