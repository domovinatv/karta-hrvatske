import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import '../theme.dart';

/// Compact icon button for collapsing/expanding the legend & fineprint panels.
class _IconToggle extends StatefulWidget {
  const _IconToggle({
    required this.label,
    required this.tooltip,
    required this.active,
    required this.onTap,
  });

  final String label;
  final String tooltip;
  final bool active;
  final VoidCallback onTap;

  @override
  State<_IconToggle> createState() => _IconToggleState();
}

class _IconToggleState extends State<_IconToggle> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 300),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(4),
      ),
      textStyle: const TextStyle(color: AppColors.text, fontFamily: kFontMono, fontSize: 11),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _hover ? AppColors.bg3 : AppColors.bg.withValues(alpha: 0.92),
              border: Border.all(
                color: widget.active ? AppColors.accent2 : AppColors.line,
              ),
              borderRadius: BorderRadius.circular(15),
            ),
            child: Text(
              widget.label,
              style: TextStyle(
                fontFamily: kFontMono,
                fontSize: 14,
                color: widget.active ? AppColors.accent2 : AppColors.muted,
                height: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class CollapsibleLegend extends StatelessWidget {
  const CollapsibleLegend({
    super.key,
    required this.expanded,
    required this.onToggle,
    required this.child,
  });

  final bool expanded;
  final VoidCallback onToggle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return PointerInterceptor(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (expanded) Padding(padding: const EdgeInsets.only(bottom: 8), child: child),
          _IconToggle(
            label: 'ⓘ',
            tooltip: expanded ? 'Sakrij legendu' : 'Prikaži legendu',
            active: expanded,
            onTap: onToggle,
          ),
        ],
      ),
    );
  }
}

class CollapsibleFineprint extends StatelessWidget {
  const CollapsibleFineprint({super.key, required this.expanded, required this.onToggle});

  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return PointerInterceptor(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (expanded)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 320),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  decoration: BoxDecoration(
                    color: AppColors.bg.withValues(alpha: 0.92),
                    border: Border.all(color: AppColors.line),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Stack & izvori',
                        style: TextStyle(
                          fontFamily: kFontDisplay,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.ink,
                        ),
                      ),
                      SizedBox(height: 6),
                      Text(
                        'Karta: MapLibre GL (BSD-2)\n'
                        'Basemap: OpenFreeMap positron · OSM contributors (ODbL)\n'
                        'Granice: DGU RPJ (JLS / županije / državna granica)\n'
                        'Tip JLS: DZS · Naselja: DGU rpj:naselje',
                        style: TextStyle(
                          fontFamily: kFontMono,
                          fontSize: 10.5,
                          color: AppColors.muted,
                          height: 1.55,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          _IconToggle(
            label: '©',
            tooltip: expanded ? 'Sakrij izvore' : 'Prikaži izvore',
            active: expanded,
            onTap: onToggle,
          ),
        ],
      ),
    );
  }
}
