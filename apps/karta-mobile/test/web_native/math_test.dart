import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:map/web_native/projection.dart';
import 'package:map/web_native/geometry/point_in_polygon.dart';
import 'package:map/web_native/geometry/bbox_index.dart';

void main() {
  group('WebMercator.project', () {
    test('origin at zoom 0', () {
      final Offset p = WebMercator.project(const LngLat(0, 0), 0);
      expect(p.dx, closeTo(128.0, 1e-9));
      expect(p.dy, closeTo(128.0, 1e-9));
    });

    test('lng=180 at zoom 0', () {
      final Offset p = WebMercator.project(const LngLat(180, 0), 0);
      expect(p.dx, closeTo(256.0, 1e-9));
      expect(p.dy, closeTo(128.0, 1e-9));
    });

    test('round-trip random points', () {
      final math.Random rng = math.Random(42);
      for (int i = 0; i < 200; i++) {
        final double lng = rng.nextDouble() * 360.0 - 180.0;
        final double lat = rng.nextDouble() * 170.0 - 85.0;
        for (final double zoom in <double>[0, 4, 8, 13.5]) {
          final Offset wp = WebMercator.project(LngLat(lng, lat), zoom);
          final LngLat back = WebMercator.unproject(wp, zoom);
          expect(back.lng, closeTo(lng, 1e-6));
          expect(back.lat, closeTo(lat, 1e-6));
        }
      }
    });

    test('round-trip at Zagreb (15.98, 45.81) zoom 8', () {
      const LngLat zagreb = LngLat(15.98, 45.81);
      final Offset wp = WebMercator.project(zagreb, 8);
      final LngLat back = WebMercator.unproject(wp, 8);
      expect(back.lng, closeTo(zagreb.lng, 1e-6));
      expect(back.lat, closeTo(zagreb.lat, 1e-6));
    });
  });

  group('WebMercator viewport transforms', () {
    test('center maps to viewport center', () {
      const Offset center = Offset(1234.5, 5678.25);
      const Offset screenCenter = Offset(400, 300);
      final Offset s =
          WebMercator.worldToScreen(center, center, screenCenter);
      expect(s.dx, closeTo(screenCenter.dx, 1e-12));
      expect(s.dy, closeTo(screenCenter.dy, 1e-12));
    });

    test('worldToScreen / screenToWorld are inverses', () {
      const Offset center = Offset(10000, 20000);
      const Offset screenCenter = Offset(640, 360);
      const Offset world = Offset(10250.5, 19880.125);
      final Offset s =
          WebMercator.worldToScreen(world, center, screenCenter);
      final Offset back =
          WebMercator.screenToWorld(s, center, screenCenter);
      expect(back.dx, closeTo(world.dx, 1e-12));
      expect(back.dy, closeTo(world.dy, 1e-12));
    });
  });

  group('pointInRing', () {
    final List<double> square = <double>[0, 0, 10, 0, 10, 10, 0, 10, 0, 0];

    test('inside', () {
      expect(pointInRing(5, 5, square), isTrue);
    });

    test('outside', () {
      expect(pointInRing(-1, 5, square), isFalse);
      expect(pointInRing(11, 5, square), isFalse);
      expect(pointInRing(5, -1, square), isFalse);
    });

    test('vertex hit is stable (does not throw, returns bool)', () {
      // Spec: behavior on a vertex is undefined-but-stable. Just ensure
      // it returns a bool deterministically.
      final bool a = pointInRing(0, 0, square);
      final bool b = pointInRing(0, 0, square);
      expect(a, equals(b));
    });
  });

  group('pointInPolygon with hole', () {
    final List<List<double>> withHole = <List<double>>[
      <double>[0, 0, 10, 0, 10, 10, 0, 10, 0, 0],
      <double>[3, 3, 7, 3, 7, 7, 3, 7, 3, 3],
    ];

    test('inside outer, outside hole', () {
      expect(pointInPolygon(1, 1, withHole), isTrue);
    });

    test('inside hole → false', () {
      expect(pointInPolygon(5, 5, withHole), isFalse);
    });

    test('outside outer → false', () {
      expect(pointInPolygon(-1, -1, withHole), isFalse);
    });
  });

  group('pointInMultiPolygon', () {
    final List<List<List<double>>> twoPolys = <List<List<double>>>[
      <List<double>>[
        <double>[0, 0, 5, 0, 5, 5, 0, 5, 0, 0],
      ],
      <List<double>>[
        <double>[10, 10, 15, 10, 15, 15, 10, 15, 10, 10],
      ],
    ];

    test('inside first', () {
      expect(pointInMultiPolygon(2, 2, twoPolys), isTrue);
    });

    test('inside second', () {
      expect(pointInMultiPolygon(12, 12, twoPolys), isTrue);
    });

    test('in gap', () {
      expect(pointInMultiPolygon(7, 7, twoPolys), isFalse);
    });
  });

  group('BboxIndex', () {
    test('queryPoint and queryBbox return expected sets', () {
      final BboxIndex<String> idx = BboxIndex<String>(cellSizeDeg: 1.0);
      // 'a' lies entirely in cell (0,0): lng [0,0.5], lat [0,0.5].
      idx.insert('a', const Bbox(0.0, 0.0, 0.5, 0.5));
      // 'b' straddles cells (0,0) and (1,0): lng [0.5, 1.5], lat [0.1, 0.4].
      idx.insert('b', const Bbox(0.5, 0.1, 1.5, 0.4));
      // 'c' in cell (5,5).
      idx.insert('c', const Bbox(5.2, 5.2, 5.8, 5.8));

      // Point at lng=1.2, lat=0.2 → cell (1,0). Only 'b' indexed there.
      final Set<String> q1 = idx.queryPoint(1.2, 0.2).toSet();
      expect(q1, equals(<String>{'b'}));

      // Point at lng=0.2, lat=0.2 → cell (0,0). Both 'a' and 'b'.
      final Set<String> q2 = idx.queryPoint(0.2, 0.2).toSet();
      expect(q2, equals(<String>{'a', 'b'}));

      // Point at lng=5.5, lat=5.5 → only 'c'.
      final Set<String> q3 = idx.queryPoint(5.5, 5.5).toSet();
      expect(q3, equals(<String>{'c'}));

      // Viewport covering only cells (0,0) and (1,0): both 'a' and 'b'.
      final Set<String> qv =
          idx.queryBbox(const Bbox(0.0, 0.0, 1.5, 0.9)).toSet();
      expect(qv, equals(<String>{'a', 'b'}));

      // Viewport covering everything.
      final Set<String> qAll =
          idx.queryBbox(const Bbox(-10, -10, 10, 10)).toSet();
      expect(qAll, equals(<String>{'a', 'b', 'c'}));

      // Deduplication: straddler 'b' appears once even though it lives in
      // two buckets.
      final List<String> list =
          idx.queryBbox(const Bbox(0.0, 0.0, 1.5, 0.9)).toList();
      expect(list.toSet().length, equals(list.length));
    });

    test('clear empties the index', () {
      final BboxIndex<int> idx = BboxIndex<int>(cellSizeDeg: 0.1);
      idx.insert(1, const Bbox(0, 0, 0.05, 0.05));
      expect(idx.queryPoint(0.01, 0.01), isNotEmpty);
      idx.clear();
      expect(idx.queryPoint(0.01, 0.01), isEmpty);
    });
  });
}
