import 'package:flutter/foundation.dart';

import '../data/jls_dataset.dart';
import '../data/naselja_dataset.dart';

enum ColorMode { zupanija, type }

enum SelectionKind { none, jls, naselje }

class MapStateController extends ChangeNotifier {
  MapStateController(this.dataset);

  final JlsDataset dataset;

  // Selection
  SelectionKind _selectionKind = SelectionKind.none;
  int? _selectedId;
  int? _hoveredId;

  // Filters / display modes
  String? _activeZupanija;
  ColorMode _colorMode = ColorMode.zupanija;
  bool _showZupanijeBorders = true;
  bool _showJlsBorders = true;
  bool _focusMode = false;

  // Naselja (lazy)
  bool _showNaselja = false;
  bool _naseljaLoading = false;
  NaseljaDataset? _naselja;
  Object? _naseljaError;

  SelectionKind get selectionKind => _selectionKind;
  int? get selectedId => _selectedId;
  int? get hoveredId => _hoveredId;
  String? get activeZupanija => _activeZupanija;
  ColorMode get colorMode => _colorMode;
  bool get showZupanijeBorders => _showZupanijeBorders;
  bool get showJlsBorders => _showJlsBorders;
  bool get focusMode => _focusMode;

  bool get showNaselja => _showNaselja;
  bool get naseljaLoading => _naseljaLoading;
  bool get naseljaLoaded => _naselja != null;
  NaseljaDataset? get naselja => _naselja;
  Object? get naseljaError => _naseljaError;

  /// Hover always tracks the *active* layer (naselja when on, JLS otherwise).
  /// Resolve via the layer the caller wires.
  JlsFeature? get hoveredJls {
    final id = _hoveredId;
    if (id == null || _showNaselja) return null;
    for (final f in dataset.features) {
      if (f.id == id) return f;
    }
    return null;
  }

  NaseljeFeature? get hoveredNaselje {
    final id = _hoveredId;
    if (id == null || !_showNaselja || _naselja == null) return null;
    for (final f in _naselja!.features) {
      if (f.id == id) return f;
    }
    return null;
  }

  JlsFeature? get selectedJls {
    if (_selectionKind != SelectionKind.jls) return null;
    final id = _selectedId;
    if (id == null) return null;
    for (final f in dataset.features) {
      if (f.id == id) return f;
    }
    return null;
  }

  NaseljeFeature? get selectedNaselje {
    if (_selectionKind != SelectionKind.naselje || _naselja == null) return null;
    final id = _selectedId;
    if (id == null) return null;
    for (final f in _naselja!.features) {
      if (f.id == id) return f;
    }
    return null;
  }

  void selectJls(int? id) {
    if (_selectionKind == SelectionKind.jls && _selectedId == id) return;
    _selectionKind = id == null ? SelectionKind.none : SelectionKind.jls;
    _selectedId = id;
    notifyListeners();
  }

  void selectNaselje(int? id) {
    if (_selectionKind == SelectionKind.naselje && _selectedId == id) return;
    _selectionKind = id == null ? SelectionKind.none : SelectionKind.naselje;
    _selectedId = id;
    notifyListeners();
  }

  void clearSelection() {
    if (_selectionKind == SelectionKind.none) return;
    _selectionKind = SelectionKind.none;
    _selectedId = null;
    notifyListeners();
  }

  void setHover(int? id) {
    if (_hoveredId == id) return;
    _hoveredId = id;
    notifyListeners();
  }

  void setZupanijaFilter(String? z) {
    if (_activeZupanija == z) return;
    _activeZupanija = z;
    notifyListeners();
  }

  void toggleColorMode() {
    _colorMode = _colorMode == ColorMode.zupanija ? ColorMode.type : ColorMode.zupanija;
    notifyListeners();
  }

  void toggleZupanijeBorders() {
    _showZupanijeBorders = !_showZupanijeBorders;
    notifyListeners();
  }

  void toggleJlsBorders() {
    _showJlsBorders = !_showJlsBorders;
    notifyListeners();
  }

  void toggleFocusMode() {
    _focusMode = !_focusMode;
    notifyListeners();
  }

  /// Toggle the naselja layer. On first activation it kicks off the lazy
  /// asset load; subsequent toggles are immediate.
  Future<void> toggleNaselja() async {
    if (_naselja == null) {
      if (_naseljaLoading) return; // de-dupe taps mid-load
      _naseljaLoading = true;
      _naseljaError = null;
      _showNaselja = true; // show as soon as it's ready
      notifyListeners();
      try {
        _naselja = await loadNaseljaDataset();
      } catch (e) {
        _naseljaError = e;
        _showNaselja = false;
      } finally {
        _naseljaLoading = false;
        notifyListeners();
      }
      return;
    }
    _showNaselja = !_showNaselja;
    // When hiding naselja, drop a naselja-typed selection — it would no
    // longer be clickable / visible.
    if (!_showNaselja && _selectionKind == SelectionKind.naselje) {
      _selectionKind = SelectionKind.none;
      _selectedId = null;
    }
    // Hover ids are layer-specific; reset to avoid stale highlight.
    _hoveredId = null;
    notifyListeners();
  }
}
