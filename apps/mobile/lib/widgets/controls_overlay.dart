import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

import '../state/map_state.dart';
import '../theme.dart';

class ControlsOverlay extends StatelessWidget {
  const ControlsOverlay({
    super.key,
    required this.state,
    required this.onToggleColor,
    required this.onToggleZupBorders,
    required this.onToggleJlsBorders,
    required this.onToggleNaselja,
    required this.onToggleFocus,
    required this.onFit,
  });

  final MapStateController state;
  final VoidCallback onToggleColor;
  final VoidCallback onToggleZupBorders;
  final VoidCallback onToggleJlsBorders;
  final Future<void> Function() onToggleNaselja;
  final VoidCallback onToggleFocus;
  final VoidCallback onFit;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: state,
      builder: (context, _) {
        final byZup = state.colorMode == ColorMode.zupanija;
        final zupOn = state.showZupanijeBorders;
        final jlsOn = state.showJlsBorders;
        final naseljaOn = state.showNaselja;
        final naseljaLoading = state.naseljaLoading;
        final naseljaCount = state.naselja?.features.length;
        final focusOn = state.focusMode;
        final focusActive = focusOn && state.selectionKind == SelectionKind.jls;

        return Padding(
          padding: const EdgeInsets.fromLTRB(0, 14, 14, 0),
          child: PointerInterceptor(
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.bg.withValues(alpha: 0.92),
                border: Border.all(color: AppColors.line),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  IntrinsicHeight(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _ToolbarItem(
                          icon: Icons.palette_outlined,
                          caption: 'Boja',
                          label: byZup ? 'po županiji' : 'po tipu',
                          tooltip: 'Promijeni način bojanja  (C)',
                          onTap: onToggleColor,
                          accent: byZup ? AppColors.accent : AppColors.accent2,
                        ),
                        const _Sep(),
                        _ToolbarItem(
                          icon: zupOn ? Icons.south_america_outlined : Icons.layers_clear_outlined,
                          caption: 'Granice ŽUP',
                          label: zupOn ? 'uključene' : 'isključene',
                          tooltip: 'Prikaži/sakrij granice županija  (B)',
                          onTap: onToggleZupBorders,
                          accent: zupOn ? AppColors.text : AppColors.muted,
                        ),
                        const _Sep(),
                        _ToolbarItem(
                          icon: jlsOn ? Icons.grid_view_outlined : Icons.grid_off_outlined,
                          caption: 'Granice JLS',
                          label: jlsOn ? 'uključene' : 'isključene',
                          tooltip: 'Prikaži/sakrij granice JLS-ova  (J)',
                          onTap: onToggleJlsBorders,
                          accent: jlsOn ? AppColors.text : AppColors.muted,
                        ),
                      ],
                    ),
                  ),
                  const Divider(height: 1, color: AppColors.line),
                  IntrinsicHeight(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _ToolbarItem(
                          icon: naseljaLoading
                              ? Icons.hourglass_top
                              : (naseljaOn ? Icons.location_city : Icons.location_city_outlined),
                          caption: 'Naselja',
                          label: naseljaLoading
                              ? 'učitavam…'
                              : naseljaOn
                                  ? (naseljaCount == null ? 'uključena' : '$naseljaCount uključeno')
                                  : 'isključena',
                          tooltip: naseljaOn
                              ? 'Sakrij naselja (DGU rpj:naselje)  (N)'
                              : 'Prikaži 6759 naselja (lazy-load, ~21 MB)  (N)',
                          onTap: naseljaLoading ? () {} : () => onToggleNaselja(),
                          accent: naseljaLoading
                              ? AppColors.accent2
                              : (naseljaOn ? AppColors.accent : AppColors.muted),
                        ),
                        const _Sep(),
                        _ToolbarItem(
                          icon: focusOn ? Icons.center_focus_weak : Icons.center_focus_weak_outlined,
                          caption: 'Fokus',
                          label: focusActive
                              ? 'samo odabrani'
                              : (focusOn ? 'odaberi JLS' : 'isključen'),
                          tooltip: 'Sakrij sve osim odabrane JLS i naselja u njoj  (Z)',
                          onTap: onToggleFocus,
                          accent: focusActive
                              ? AppColors.accent
                              : (focusOn ? AppColors.accent2 : AppColors.muted),
                        ),
                        const _Sep(),
                        _ToolbarItem(
                          icon: Icons.public,
                          caption: 'Fit',
                          label: 'Hrvatska',
                          tooltip: 'Resetiraj pogled na cijelu Hrvatsku  (F)',
                          onTap: onFit,
                          accent: AppColors.muted,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Sep extends StatelessWidget {
  const _Sep();
  @override
  Widget build(BuildContext context) =>
      const VerticalDivider(width: 1, thickness: 1, color: AppColors.line);
}

class _ToolbarItem extends StatefulWidget {
  const _ToolbarItem({
    required this.icon,
    required this.label,
    required this.caption,
    required this.tooltip,
    required this.onTap,
    required this.accent,
  });

  final IconData icon;
  final String caption;
  final String label;
  final String tooltip;
  final VoidCallback onTap;
  final Color accent;

  @override
  State<_ToolbarItem> createState() => _ToolbarItemState();
}

class _ToolbarItemState extends State<_ToolbarItem> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: widget.tooltip,
      waitDuration: const Duration(milliseconds: 350),
      decoration: BoxDecoration(
        color: AppColors.bg2,
        border: Border.all(color: AppColors.line),
        borderRadius: BorderRadius.circular(4),
      ),
      textStyle: const TextStyle(
        color: AppColors.text,
        fontFamily: kFontMono,
        fontSize: 11,
      ),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            color: _hover ? AppColors.bg3 : Colors.transparent,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(widget.icon, size: 16, color: widget.accent),
                const SizedBox(width: 10),
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.caption.toUpperCase(),
                      style: const TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 8.5,
                        color: AppColors.muted,
                        letterSpacing: 1.2,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      widget.label,
                      style: const TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 11.5,
                        color: AppColors.text,
                        height: 1,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
