import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:map/main.dart';

void main() {
  testWidgets('App boots without throwing', (tester) async {
    await tester.pumpWidget(const DomovinaMapApp());
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
