# karta.domovina.ai

Production React/Vite frontend za interaktivnu kartu RH. Sibling `apps/web` ostaje data-pipeline + dev HTML (Python).

## Stack

- **Vite 5 + React 18 + TypeScript**
- **Tailwind CSS** za styling, CSS varijable u `src/styles.css` za brand tokene
- **MapLibre GL JS 4.7** kao map engine
- **react-router-dom v6** za SPA routing
- **vite-plugin-pwa + Workbox** za offline PWA
- **react-helmet-async** za per-route `<head>` (Phase 2)

Stack je identičan sibling-u `klubovi.domovina.ai/frontend/` — dijeli infrastrukturu i CF Worker pattern za SEO injection.

## Razvoj

```bash
# Prvo: izgeneriraj podatke kroz Python pipeline u apps/web
cd ../web && python3 scripts/09_build_hr_full_app.py

# Onda: sync u apps/karta-web/public/data
cd ../karta-web && npm install && npm run sync-data && npm run dev
```

Dev server: `http://localhost:5174`.

## Build + deploy

```bash
npm run sync-data   # iz apps/web/outputs/ u public/data/
npm run build       # tsc + vite build → dist/
wrangler pages deploy dist --project=karta-domovina-ai
```

`public/data/` i `public/logos/` su gitignored — generiraju se iz pipeline-a, deploy CI ih ponovo radi.

## Status

- **Phase 1 (skeleton)** ✓ scaffold + map + JLS/županije/državna granica
- Phase 2 (deep links + entity routing) — TODO
- Phase 3 (CF Worker SEO + OG) — TODO
- Phase 4 (sitemap + robots) — TODO
- Phase 5 (perf + PWA polish) — TODO
- Phase 6 (CI/CD) — TODO
