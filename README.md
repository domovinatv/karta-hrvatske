# karta-hrvatske

Monorepo za interaktivnu kartu Republike Hrvatske — JLS-ovi, županije, naselja.

Pragmatičan split: dvije nezavisne implementacije koje rade dobro na svojim platformama, nema dijeljenog koda među njima.

## Struktura

```
apps/
├── mobile/   Flutter + maplibre — iOS, Android (i webview fallback)
└── web/      Pure WebGL (jedan statički HTML) — produkcijska web verzija
```

### `apps/mobile/` — Flutter

Prepisano iz `domovinatv/map.domovina.ai`. Koristi `maplibre 0.3.5` (locked) + free tiles (OpenFreeMap). 2D, bez 3D, bez style togglea.

```bash
cd apps/mobile
flutter pub get
flutter run -d chrome --web-port=8080   # ili -d ios / -d android
```

### `apps/web/` — pure WebGL

Prepisano iz `domovina/draft_karta_rh`. Build pipeline (Python) generira jedan samostalan HTML (`hrvatska_full.html`) — to je produkcijski deliverable.

```bash
cd apps/web
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/00_pipeline.sh   # regenerira sve iz raw DGU/DZS izvora
```

## Zašto dvije implementacije

Iskustvo iz oba projekta:
- **iOS/Android**: Flutter + maplibre je najpragmatičnije — native scroll/touch, jedan codebase, prolazi App Store/Play.
- **Web**: pure WebGL u jednom HTML-u (12 MB) puca s najmanjom latencijom i bez Flutter Web overheada. Eksperiment s `lib/web_native/` Flutter web rendererom je bio dead end (vidi memoriju `web_native_renderer_decision`).

Deprecirani izvori (zadržati za referencu, ne mergati natrag):
- `domovinatv/map.domovina.ai`
- `domovina/draft_karta_rh`
