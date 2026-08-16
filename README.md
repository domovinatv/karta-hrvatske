# karta-hrvatske

Monorepo za interaktivnu kartu Republike Hrvatske — JLS-ovi, županije, naselja, nogometni klubovi, aerodromi.

Tri nezavisne komponente, bez dijeljenog koda: jedan podatkovni sloj (Python) hrani dvije nezavisne klijentske implementacije (web + mobile).

## Struktura

```
apps/
├── karta-web/        React + maplibre + pmtiles — PRODUKCIJA, gis.domovina.ai
├── karta-mobile/     Flutter + maplibre — iOS, Android (i webview fallback)
└── data-pipeline/    Python — generira sve GeoJSON/topologiju + dev HTML (podatkovni sloj)
```

### `apps/karta-web/` — React frontend (LIVE)

Produkcijska web verzija na **gis.domovina.ai** (Cloudflare Pages, projekt `gis-domovina`). maplibre-gl + pmtiles, lazy-loaded layeri (naselja, klubovi, aerodromi). Vuče podatke iz `data-pipeline` preko `npm run sync-data`.

```bash
cd apps/karta-web
npm install
npm run dev          # lokalni dev
npm run deploy       # sync-data → build-lookups → sitemap → vite build → wrangler deploy
```

### `apps/karta-mobile/` — Flutter

Prepisano iz (sad deprecirane) `domovinatv/map.domovina.ai`. Koristi `maplibre 0.3.5` (locked) + free tiles (OpenFreeMap). 2D, bez 3D, bez style togglea.

```bash
cd apps/karta-mobile
flutter pub get
flutter run -d chrome --web-port=8080   # ili -d ios / -d android
```

### `apps/data-pipeline/` — podatkovni sloj (Python)

Prepisano iz `domovina/draft_karta_rh`. Build pipeline generira kanonske GeoJSON-ove (JLS/županije/naselja iz DGU+DZS), nogometne klubove, OSM teren/aerodrome, te samostalan dev HTML (`hrvatska_full.html`). Izlazi iz `outputs/` i `data/` se sinkaju u `karta-web`.

```bash
cd apps/data-pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/00_pipeline.sh   # regenerira sve iz raw DGU/DZS izvora
```

## Tok podataka

```
data-pipeline (Python)  →  outputs/*.geojson + data/*.geojson
        │
        ├─ karta-web `npm run sync-data`  →  public/data/  →  Cloudflare Pages
        │                                        ▲
tematski repoi (izvan ovog monorepoa)             │
  ../crkve.domovina.ai  `make export`  →  data/exports/*.geojson
```

Bazni slojevi (granice, naselja, klubovi, aerodromi) nastaju u `data-pipeline`.
**Tematski slojevi imaju vlastite repozitorije** — `sync-data.mjs` ih pokupi iz
`SIBLING_LAYERS` ako su klonirani pokraj ovoga:

| Layer | Repo | Napomena |
|---|---|---|
| ⛪ Crkve i sakralni objekti | [`crkve.domovina.ai`](../crkve.domovina.ai) | ~6900 objekata; OSM + data.gov.hr + Wikidata |
| 🏛 Župe i vjerske pravne osobe | [`crkve.domovina.ai`](../crkve.domovina.ai) | 2928 pravnih osoba; isti repo, drugi skup (građevina ≠ pravna osoba) |
| ✝️ Biskupije | [`crkve.domovina.ai`](../crkve.domovina.ai) | 15 teritorija; DERIVIRANI iz sjedišta župa — službene granice ne postoje kao javna geometrija |

## Deprecirani izvori (premješteni u `~/git/legacy/`, ne mergati natrag)

- `map.domovina.ai` — standalone Flutter preteča, u cijelosti migrirana u `apps/karta-mobile` (zadnji commit: *"DEPRECATED on arrival"*).
- Upstream izvori za referencu: `domovina/draft_karta_rh` (→ data-pipeline).
