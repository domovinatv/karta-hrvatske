import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'data/jls_dataset.dart';
import 'screens/map_screen.dart';
import 'theme.dart';
import 'web_native/web_native_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb) usePathUrlStrategy();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: AppColors.bg,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: AppColors.bg,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const DomovinaMapApp());
}

class DomovinaMapApp extends StatelessWidget {
  const DomovinaMapApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DOMOVINA · karta JLS-ova RH',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      initialRoute: '/',
      onGenerateRoute: (settings) {
        final isNative = settings.name == '/native';
        return MaterialPageRoute(
          settings: settings,
          builder: (_) => _DatasetGate(useNative: isNative),
        );
      },
    );
  }
}

class _DatasetGate extends StatefulWidget {
  const _DatasetGate({this.useNative = false});
  final bool useNative;

  @override
  State<_DatasetGate> createState() => _DatasetGateState();
}

class _DatasetGateState extends State<_DatasetGate> {
  late final Future<JlsDataset> _future = loadHrDataset();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<JlsDataset>(
      future: _future,
      builder: (context, snap) {
        if (snap.hasError) {
          return _ErrorPlate(error: snap.error!);
        }
        if (!snap.hasData) {
          return const _Splash();
        }
        return widget.useNative
            ? WebNativeScreen(dataset: snap.data!)
            : MapScreen(dataset: snap.data!);
      },
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(
      color: AppColors.bg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(AppColors.accent),
              ),
            ),
            SizedBox(height: 16),
            Text(
              'UČITAVANJE',
              style: TextStyle(
                fontFamily: kFontMono,
                fontSize: 11,
                color: AppColors.muted,
                letterSpacing: 0.18 * 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorPlate extends StatelessWidget {
  const _ErrorPlate({required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.bg,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: AppColors.accent, size: 32),
              const SizedBox(height: 12),
              const Text(
                'Greška pri učitavanju podataka',
                style: TextStyle(
                  fontFamily: kFontDisplay,
                  fontSize: 18,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '$error',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: kFontMono,
                  fontSize: 11,
                  color: AppColors.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
