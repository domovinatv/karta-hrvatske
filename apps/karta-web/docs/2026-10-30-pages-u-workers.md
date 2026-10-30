# gis.domovina.ai: s Pagesa na Worker (2026-10-30)

## Što je napravljeno

- Worker `gis-domovina` (D.O.M. account) sa static assets, config u
  `wrangler.toml`. Kod je isti `public/_worker.js` koji je radio kao Pages
  Advanced Mode, pa radi na oba runtimea.
- Domena nije premještena s Pagesa. Umjesto toga Worker ima **route**
  `gis.domovina.ai/*` na zoni `domovina.ai`. Route presreće zahtjeve prije
  nego dođu do Pages custom domene, pa nije bilo prekida, a Pages ostaje iza
  kao rezerva.
- `scripts/deploy.sh` po defaultu deploya Worker. `DEPLOY_TARGET=pages`
  i dalje radi, ali se na domeni ne vidi dok route postoji.

Provjera tko odgovara:

```bash
curl -sI https://gis.domovina.ai/ | grep -i x-runtime   # x-runtime: worker
```

## Povratak na Pages

1. Iz `wrangler.toml` makni `routes = [...]` i pokreni `npx wrangler deploy`
   (ili obriši route u dashboardu: Workers → gis-domovina → Settings → Domains & Routes).
2. Domena odmah opet ide na Pages, koji ima zadnji Pages deploy.
3. Ako je od prijelaza bilo deployeva, napravi `DEPLOY_TARGET=pages npm run deploy`.

## Razlike koje su se pokazale

| | Pages | Worker static assets | Rješenje |
|---|---|---|---|
| `/index.html` | 308 na `/` | 307 na `/` | worker sam vraća čisti shell s 200 |
| `Access-Control-Allow-Origin: *` na assetima | da | ne | worker ga postavlja |
| `_worker.js` u `dist/` | kod, nije javan | bio bi javni asset | `public/.assetsignore` |
| `/sw.js` Cache-Control na domeni | 4 h (CF prepisivao header) | `no-cache` kako worker kaže | riješeno samo od sebe |
| config | `pages_build_output_dir` | `main` + `[assets]` | `wrangler pages deploy` preskače Workers config |

Redirect na `/index.html` bio je stvaran bug i na Pagesu: service worker
precachira `/index.html` kao `navigateFallback`, a dobivao je redirect.

## Što je otvoreno

- Pages custom domena `gis.domovina.ai` je još spojena na Pages projekt.
  Kad Worker odstoji tjedan-dva bez problema, može se prebaciti na Worker
  custom domenu (makni domenu s Pagesa, pa u `wrangler.toml` umjesto routea
  `{ pattern = "gis.domovina.ai", custom_domain = true }`). Treba DNS write
  ili dashboard; OAuth token iz `wrangler login` ima samo `zone (read)`.
  Dok route radi, ovo nije nužno.
- `X-Runtime` header i `[vars] RUNTIME` mogu van kad se Pages ugasi.

## Tekst za crawlere u `#root`

Isti commit: worker na `/`, `/klub/:slug`, `/jls/:slug`, `/zupanija/:slug`
i `/poster/:slug` ubacuje u `<div id="root">` naslov, opis i poveznice
(županija → svi njezini JLS-ovi, JLS → županija, klub → stadion i JLS,
početna → županije i plakati). Crawleri bez JS-a (AI botovi, pregledi
linkova) dobivaju sadržaj i graf poveznica. React 18 `createRoot` prazni
kontejner pri prvom commitu, pa korisnik vidi kartu. Provjereno u
Playwrightu: ubačeni `<main>` nestane, karta se nacrta, konzola čista.

Polja za to dolaze iz `scripts/build-lookups.mjs`: `zupanijaSlug` na JLS-u,
`city`, `stadium` i `jlsSlug` na klubu. `jlsSlug` je postavljen za 437 od
1014 klubova, jer je kod ostalih `city` naselje, a ne JLS.

## Vezani dokumenti

- [`2026-08-17-deploy-verifikacija.md`](./2026-08-17-deploy-verifikacija.md) — verifikacija deploya; poglavlje 4 o `sw.js` cacheu i `navigateFallback`
- Blog post (EN/HR): https://stepanic.domovina.ai/blog/gis-domovina-pages-to-workers
- Odluka „React SPA ostaje, ne Astro": jedini stvarni dobitak Astra bio je čitljiv HTML za crawlere, a to sad radi worker (poglavlje „Tekst za crawlere" gore). Prepisivanje bi izgubilo montiranu kartu između ruta, uhodan PWA, `useUrlSync` i Playwright pokrivenost.
