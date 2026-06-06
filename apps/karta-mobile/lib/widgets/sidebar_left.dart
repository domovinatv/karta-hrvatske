import 'package:flutter/material.dart';

import '../data/jls_dataset.dart';
import '../state/map_state.dart';
import '../theme.dart';

class SidebarLeft extends StatefulWidget {
  const SidebarLeft({
    super.key,
    required this.dataset,
    required this.state,
    required this.onSelectFeature,
    required this.onSelectZupanija,
  });

  final JlsDataset dataset;
  final MapStateController state;
  final void Function(JlsFeature) onSelectFeature;
  final void Function(String? zupanija) onSelectZupanija;

  @override
  State<SidebarLeft> createState() => _SidebarLeftState();
}

class _SidebarLeftState extends State<SidebarLeft> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = widget.dataset;
    return AnimatedBuilder(
      animation: widget.state,
      builder: (context, _) {
        return Container(
          color: AppColors.bg2,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: _SectionHeader(
                  title: 'Hrvatska',
                  meta: '${ds.features.length} JLS · ${ds.totalAreaKm2.toStringAsFixed(0)} km²',
                ),
              ),
              SliverToBoxAdapter(
                child: _StatGrid(
                  stats: [
                    ('JLS-ova', '${ds.features.length}', null),
                    ('Županija', '${ds.zupanije.length}', null),
                    ('Gradova', '${ds.gradCount}', null),
                    ('Općina', '${ds.opcinaCount}', null),
                  ],
                ),
              ),
              SliverToBoxAdapter(
                child: _SearchBox(
                  controller: _searchController,
                  onChanged: (v) => setState(() => _query = v.trim()),
                ),
              ),
              if (_query.length >= 2)
                _SearchResults(
                  query: _query,
                  features: ds.features,
                  onPick: (f) {
                    widget.onSelectFeature(f);
                    _searchController.clear();
                    setState(() => _query = '');
                    FocusScope.of(context).unfocus();
                  },
                )
              else ...[
                const SliverToBoxAdapter(
                  child: _SectionHeader(
                    title: 'Po županijama',
                    meta: 'klik = filter',
                  ),
                ),
                _ZupanijaList(
                  zupanije: ds.zupanije,
                  active: widget.state.activeZupanija,
                  onTap: widget.onSelectZupanija,
                ),
              ],
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        );
      },
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.meta});
  final String title;
  final String meta;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontFamily: kFontDisplay,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.muted,
                letterSpacing: 0.12 * 13,
              ),
            ),
          ),
          Text(
            meta,
            style: const TextStyle(
              fontFamily: kFontMono,
              fontSize: 10,
              color: AppColors.accent2,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.stats});
  final List<(String, String, String?)> stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.line,
        border: Border(bottom: BorderSide(color: AppColors.line)),
      ),
      child: GridView.count(
        crossAxisCount: 2,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 1,
        crossAxisSpacing: 1,
        childAspectRatio: 2.0,
        children: [for (final (label, value, unit) in stats) _StatTile(label: label, value: value, unit: unit)],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value, this.unit});
  final String label;
  final String value;
  final String? unit;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.bg2,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontFamily: kFontMono,
              fontSize: 9,
              color: AppColors.muted,
              letterSpacing: 0.15 * 9,
            ),
          ),
          const SizedBox(height: 4),
          Text.rich(
            TextSpan(children: [
              TextSpan(
                text: value,
                style: const TextStyle(
                  fontFamily: kFontDisplay,
                  fontSize: 20,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
              if (unit != null)
                TextSpan(
                  text: ' $unit',
                  style: const TextStyle(
                    fontFamily: kFontMono,
                    fontSize: 11,
                    color: AppColors.muted,
                  ),
                ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _SearchBox extends StatelessWidget {
  const _SearchBox({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        cursorColor: AppColors.accent2,
        style: const TextStyle(fontFamily: kFontMono, fontSize: 12, color: AppColors.text),
        decoration: InputDecoration(
          hintText: 'Pretraži (npr. "Umag")',
          hintStyle: const TextStyle(color: AppColors.muted, fontSize: 12),
          prefixIcon: const Icon(Icons.search, color: AppColors.muted, size: 18),
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
          filled: true,
          fillColor: AppColors.bg3,
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.line),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(6),
            borderSide: const BorderSide(color: AppColors.accent2),
          ),
        ),
      ),
    );
  }
}

class _SearchResults extends StatelessWidget {
  const _SearchResults({
    required this.query,
    required this.features,
    required this.onPick,
  });

  final String query;
  final List<JlsFeature> features;
  final void Function(JlsFeature) onPick;

  @override
  Widget build(BuildContext context) {
    final lower = query.toLowerCase();
    final matches = features.where((f) => f.name.toLowerCase().contains(lower)).take(40).toList();
    if (matches.isEmpty) {
      return const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.fromLTRB(18, 18, 18, 18),
          child: Text(
            'Nema rezultata.',
            style: TextStyle(color: AppColors.muted, fontSize: 12, fontFamily: kFontMono),
          ),
        ),
      );
    }
    return SliverList.builder(
      itemCount: matches.length,
      itemBuilder: (context, i) {
        final f = matches[i];
        return _Row(
          color: f.color,
          name: f.name,
          subtitle: f.zupanija,
          onTap: () => onPick(f),
        );
      },
    );
  }
}

class _ZupanijaList extends StatelessWidget {
  const _ZupanijaList({required this.zupanije, required this.active, required this.onTap});
  final List<ZupanijaSummary> zupanije;
  final String? active;
  final void Function(String? zupanija) onTap;

  @override
  Widget build(BuildContext context) {
    return SliverList.builder(
      itemCount: zupanije.length,
      itemBuilder: (context, i) {
        final z = zupanije[i];
        final isActive = z.name == active;
        return _Row(
          color: z.color,
          name: z.name,
          subtitle: '${z.count} JLS',
          trailing: '${z.areaKm2.toStringAsFixed(0)} km²',
          active: isActive,
          onTap: () => onTap(isActive ? null : z.name),
        );
      },
    );
  }
}

class _Row extends StatefulWidget {
  const _Row({
    required this.color,
    required this.name,
    required this.subtitle,
    this.trailing,
    this.active = false,
    required this.onTap,
  });

  final Color color;
  final String name;
  final String subtitle;
  final String? trailing;
  final bool active;
  final VoidCallback onTap;

  @override
  State<_Row> createState() => _RowState();
}

class _RowState extends State<_Row> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) {
    final bg = widget.active || _hover ? AppColors.bg3 : AppColors.bg2;
    return MouseRegion(
      cursor: SystemMouseCursors.click,
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.fromLTRB(16, 8, 18, 8),
          decoration: BoxDecoration(
            color: bg,
            border: Border(
              left: BorderSide(
                color: widget.active ? AppColors.accent : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: widget.color,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 12,
                        color: AppColors.text,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      widget.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: kFontMono,
                        fontSize: 10,
                        color: AppColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.trailing != null)
                Text(
                  widget.trailing!,
                  style: const TextStyle(
                    fontFamily: kFontMono,
                    fontSize: 10,
                    color: AppColors.muted,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
