// Scratch entrypoint for smoke-testing the RasterBasemap in isolation.
//
// Run with:
//   flutter run -d chrome -t lib/web_native/_basemap_smoke_main.dart --web-port 8770
//
// This file is NOT referenced from production code. Do not import it from
// `lib/main.dart` or any production widget.

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import 'raster_basemap.dart';

void main() {
  runApp(const _SmokeApp());
}

class _SmokeApp extends StatelessWidget {
  const _SmokeApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RasterBasemap smoke',
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: RasterBasemap(
          initialCenter: const LatLng(44.7, 16.5),
          initialZoom: 6.8,
          onCameraChanged: (center, zoom) {
            // Prints to the browser dev console.
            // ignore: avoid_print
            print(
              'camera: ${center.latitude.toStringAsFixed(4)}, '
              '${center.longitude.toStringAsFixed(4)} @ '
              '${zoom.toStringAsFixed(2)}',
            );
          },
        ),
      ),
    );
  }
}
