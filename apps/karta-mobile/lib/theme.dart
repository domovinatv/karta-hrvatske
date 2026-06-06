import 'package:flutter/material.dart';

class AppColors {
  static const bg = Color(0xFF0A0E14);
  static const bg2 = Color(0xFF11161E);
  static const bg3 = Color(0xFF1A212C);
  static const line = Color(0xFF232B38);
  static const text = Color(0xFFE6EDF3);
  static const muted = Color(0xFF8B94A8);
  static const accent = Color(0xFFD4322F);
  static const accent2 = Color(0xFF00B4D8);
  static const good = Color(0xFF4ADE80);
  static const ink = Color(0xFFF8FAFC);
}

const kFontMono = 'JetBrainsMono';
const kFontDisplay = 'Fraunces';

ThemeData buildAppTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    canvasColor: AppColors.bg,
    colorScheme: base.colorScheme.copyWith(
      surface: AppColors.bg2,
      primary: AppColors.accent,
      secondary: AppColors.accent2,
      onSurface: AppColors.text,
    ),
    textTheme: base.textTheme.apply(
      bodyColor: AppColors.text,
      displayColor: AppColors.ink,
    ),
    dividerTheme: const DividerThemeData(color: AppColors.line, space: 1, thickness: 1),
  );
}
