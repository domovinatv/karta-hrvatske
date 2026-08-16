# karta-web → gis.domovina.ai

Production React/Vite frontend za **krovnu DOMOVINA GIS kartu**. Trenutni layeri: JLS granice, naselja, četvrti, nogometni klubovi/igrališta/stadioni, zračne luke, pinka kampanje, **crkve i sakralni objekti**, **župe i vjerske pravne osobe**, **teritoriji biskupija**.

Sibling `apps/data-pipeline` ostaje Python data pipeline + dev HTML.

### Odakle dolaze podaci layera

Bazni slojevi (granice, naselja, klubovi, aerodromi) dolaze iz `apps/data-pipeline`. **Tematski slojevi dolaze iz vlastitih repozitorija** i samo se preslikavaju u `public/data/` (koji je gitignored):

| Layer | Repo | Datoteka |
|---|---|---|
| ⛪ Crkve | `../../../crkve.domovina.ai` | `crkve.geojson` |
| 🏛 Župe | `../../../crkve.domovina.ai` | `zupe.geojson` |
| ✝️ Biskupije | `../../../crkve.domovina.ai` | `biskupije.geojson` |

`scripts/sync-data.mjs` ih kopira automatski (`SIBLING_LAYERS`), pa `npm run deploy` radi bez ručnih koraka — ali samo ako je susjedni repo kloniran i u njemu pokrenut `make export`. Ako nije, sync ispiše `skip` i deploy prođe bez tog sloja.

## Stack

- **Vite 5 + React 18 + TypeScript**
- **Tailwind CSS** + CSS varijable za brand tokene u `src/styles.css`
- **MapLibre GL JS 4.7** kao map engine
- **react-router-dom v6** za SPA routing + deep links
- **react-helmet-async** za per-route `<head>` (klijent fallback prije CF Worker injekcije)
- **vite-plugin-pwa + Workbox** za offline PWA
- **Cloudflare Pages + Worker** (Advanced Mode) za hosting + OG meta injection

Stack je identičan sibling-u `klubovi.domovina.ai/frontend/` — dijeli infrastrukturu.

## Razvoj

```bash
# 1. Generiraj source data u sibling apps/data-pipeline Python pipeline-u
cd ../data-pipeline && python3 scripts/09_build_hr_full_app.py

# 2. Sync data + install + dev
cd ../karta-web
npm install
npm run sync-data    # apps/data-pipeline/outputs/ → public/data/
npm run dev          # → http://localhost:5174/
```

## Build

```bash
npm run sync-data       # 1. data iz Python pipeline-a
npm run build-lookups   # 2. lookup-{clubs,jls,zupanije}.json za CF Worker
npm run build-sitemap   # 3. sitemap.xml + robots.txt (~1500 URL-ova)
npm run build           # 4. tsc + vite → dist/ (PWA precache)
```

ili sve odjednom:

```bash
npm run deploy          # chain svega + wrangler pages deploy
```

## Deploy (Cloudflare Pages)

Target projekt: **`gis-domovina`** pod D.O.M. accountom (`7dc7167b…df14e4`). Custom domena `gis.domovina.ai` attached u CF dashboardu nakon prvog deploya.

```bash
# Prvi put: kreiraj projekat
npx wrangler pages project create gis-domovina --production-branch=main

# Deploy
npm run deploy
```

`scripts/deploy.sh` lančuje sync-data → build-lookups → build-sitemap → vite build → wrangler. Idempotentno; safe re-run.

**CF Worker contract** (`public/_worker.js`):
- Pages Advanced Mode — worker hendlira SVE requests
- HTMLRewriter injektira `<title>` + `<meta og:*>` na `/klub/:slug`, `/jls/:slug`, `/zupanija/:slug` rutama (čita iz lookup JSON-ova)
- SPA fallback: nepoznate path-ove servira `index.html` s 200 (client router preuzima)
- Cache-Control headeri se postavljaju u workeru (`_headers` ne radi u Advanced Mode)
- **NE dodaj `_redirects`** — shadowa `env.ASSETS.fetch()` i razbije OG injection

## Deep-link rute

| Pattern | Akcija |
|---|---|
| `/` | Default Hrvatska view |
| `/zupanija/:slug` | activeZup filter + fitBounds preko unija JLS-ova |
| `/jls/:slug` | selectJls + focus + naselja + fitBounds |
| `/klub/:slug` | rich-card modal + silent JLS highlight (no fit) |

`useUrlSync` bi-directional: URL→state (route change → dispatch select) + state→URL (selection → navigate). Anti-loop preko `lastWrittenUrl` ref.

## Status

- **Phase 0+1** ✓ scaffold + map + JLS layer (`a350eb6`)
- **Phase 2A** ✓ svi UI featuri iz legacy HTML-a (`c957dca`)
- **Phase 2B** ✓ deep-link rute (`f7852a4`)
- **Phase 3** ✓ CF Worker OG injection + lookup JSON
- **Phase 4** ✓ sitemap.xml + robots.txt
- **Phase 6** ✓ deploy.sh + wrangler.toml
- Phase 5 (PWA polish + perf: MapLibre code split, naselja split po županiji ili PMTiles) — TODO
- Phase 7 (layer registry refactor) — odgođeno do 3+ layera
