# Plan: stanje karte u URL-u + sidebari ovisni o ruti

30.10.2026. Nastavak Faze 4 iz `ui-refactor-plan.md` („Stanje slojeva u URL").

Cilj: **URL je cijelo dijeljivo stanje.** Ono što ja vidim na ekranu, drugi
korisnik dobije otvaranjem istog linka: isti odabir (JLS / županija / klub),
isti upaljeni slojevi, ista kamera, isti raspored ploča.

## 1. Zatečeno stanje

| Što | Gdje živi | U URL-u? |
|---|---|---|
| Odabir JLS / županije / kluba | `MapState` + `useUrlSync` (dvosmjerno, `navigate` push) | da, putanja |
| Kampanja (pinka) | `/kampanje?c=slug` | da |
| 30 `show*` zastavica slojeva | 30 zasebnih `useState` u `MapState.tsx` | **ne** |
| `colorMode` (županija / tip) | `MapState` | ne |
| `theme` | `MapState` + localStorage | ne |
| `jlsClick` | `MapState` + localStorage | ne (i ne treba, osobna postavka) |
| Kamera (zoom, centar) | samo MapLibre | ne |
| Odabrano naselje | `selectedNaselje` | ne |
| Lijevi sidebar (pretraga + županije) i desni (detalji) | uvijek prikazani od `md` / `lg` | — |

Dodatna zamka koja već postoji: `useUrlSync` zove `navigate("/jls/x")` bez
`location.search`, pa bi svaki klik na JLS **obrisao** query. Čim slojevi uđu u
query, to se mora riješiti, inače klik na općinu ugasi sve slojeve u linku.

## 2. Shema URL-a

```
/jls/samobor?l=crkve,zupe,-granice-jls&boja=tip#map=11.2/45.8011/15.7103
└── putanja ─┘└──────────── query ─────────────┘└──────── hash ──────────┘
   što je         koji slojevi i opcije              kamera
   odabrano
```

### Putanja: entitet (postojeće, ne mijenja se)

`/`, `/jls/:slug`, `/zupanija/:slug`, `/klub/:slug`, `/kampanje`.
Kasnije: `/jls/:slug?naselje=<slug>` za odabrano naselje.

### Query: slojevi i opcije

| Param | Vrijednost | Primjer |
|---|---|---|
| `l` | id-jevi slojeva iz `lib/layers.ts`, **diff od defaulta**: `id` pali, `-id` gasi | `l=crkve,zupe,-granice-jls` |
| `boja` | `tip` (default `zupanija` se ne piše) | `boja=tip` |
| `tema` | `svijetla` (samo override, ne upisuje se u localStorage primatelja) | `tema=svijetla` |
| `c` | slug kampanje (postojeće, samo uz `/kampanje`) | |

Zašto diff, a ne puni popis: ručno napisan link `?l=crkve` mora značiti „uz
uobičajeno još i crkve". Kod punog popisa isti bi link ugasio granice
županija i JLS-ova (default upaljene), što nitko ne bi očekivao. Diff je
otporan i na buduću promjenu defaulta.

Pravila:
- Kanonski redoslijed = redoslijed u registru, pa isti prizor uvijek daje isti URL.
- Nepoznat id se tiho ignorira. Preimenovanje id-a ide preko `ALIASES` mape u
  `layers.ts` da stari linkovi ne puknu. **Id sloja postaje javni API**, što treba
  zapisati u komentar na vrhu registra.
- Bez ijednog parametra = točno default prizor (`/` ostaje čist link).

### Hash: kamera

MapLibre ima ugrađenu opciju `hash: "map"` → `#map=zoom/lat/lng[/bearing/pitch]`,
piše preko `replaceState`, ne dira React Router. Nula vlastitog koda za sync.
Hash ne ide na server, pa OG worker kameru ne vidi, što je u redu.

Interakcija s deep-linkom: ako hash postoji, `useUrlSync` na `/jls/:slug` **ne
radi `fitBounds`**. Kamera iz linka ima prednost nad automatskim fitom.

### Što namjerno NE ide u URL

`jlsClick`, otvorenost panela slojeva / bottom sheeta, sklopljenost grupa, tekst
u pretrazi. To je stanje sučelja onoga tko gleda, ne prizora.

## 3. History semantika

| Promjena | API | Zašto |
|---|---|---|
| Odabir JLS / županije / kluba | `push` (kao sad) | Back vraća prethodni odabir |
| Paljenje / gašenje sloja, `boja`, `tema` | `replace` | Inače je Back „undo" za 20 klikova po panelu |
| Kamera | `replace` (MapLibre hash to radi sam) | Pan ne smije puniti povijest |

## 4. Arhitektura: URL je izvor istine za slojeve

Dvije opcije:

- **A. Još jedan dvosmjerni sync** (`useQuerySync` po uzoru na `useUrlSync`).
  Brzo, ali dvosmjerni sync već ima dva guarda protiv petlji (`lastWrittenUrl`,
  `hadSelectionRef`), a treći bi bio još krhkiji.
- **B. Slojevi se izvode iz URL-a** (preporuka). `MapStateProvider` je unutar
  routera (`RootLayout`), pa smije zvati `useSearchParams`:
  - `layers = parseLayers(searchParams.get("l"))` → `Record<LayerStateKey, boolean>`
  - `setShowCrkve(on)` → `setSearchParams(prev => withLayer(prev, "crkve", on), { replace: true })`
  - imenovani API (`showCrkve`, `setShowCrkve`, …) ostaje isti, pa **nijedan
    `use*Layer` hook se ne dira**. Generira se iz registra umjesto 30 ručnih
    `useState` + 30 stavki u `useMemo` deps.

  Nema petlje jer nema dva stanja koja se usklađuju: postoji samo URL.

Za odabir (JLS / županija / klub) zadržava se postojeći `useUrlSync`; jedina
izmjena je da svaki `navigate` nosi trenutni `location.search` i `hash`.

Novi modul `src/lib/urlState.ts`:
- `parseLayers(l: string | null): Record<LayerStateKey, boolean>`
- `serializeLayers(state): string | null` (diff, kanonski redoslijed, `null` kad je sve default)
- `withLayer(params, id, on): URLSearchParams`
- jedinični testovi (round-trip, nepoznat id, alias, prazan `l`)

Usput: header link `/` i „Fit Hrvatska" — `reset()` danas ne gasi podatkovne
slojeve. Link na naslov treba onda ići na `/` **uz zadržan `?l=`**, ili
namjerno na goli `/` (potpuni reset). Odluka ispod.

## 5. Sidebari ovisni o ruti

Raspored postaje funkcija putanje:

| Ruta | Lijevo | Karta | Desno |
|---|---|---|---|
| `/` | — | puna širina, pretraga plutajuća gore lijevo | — |
| `/zupanija/:slug` | županija: popis njezinih JLS-ova | | — |
| `/jls/:slug` | županija te JLS (kontekst, klik na susjednu) | | detalji |
| `/klub/:slug` | — | | — (modal kao sad) |

Problem koji treba riješiti prije skrivanja lijevog sidebara: u njemu je
**pretraga**, a otkad je klik na JLS ugašen, pretraga je glavni put do JLS-a.
Zato pretraga izlazi iz sidebara u plutajuću kutiju nad kartom (gore lijevo,
desktop) / ostaje u peeku bottom sheeta (mobitel). Popis županija postaje
prazno stanje pretrage (fokus u polje bez teksta → 21 županija), pa ništa ne
nestaje, samo se ne vidi dok ne zatreba.

Tehnički:
- `main` grid dobiva klase po ruti (`grid-cols-[1fr]` / `[320px_1fr]` / `[320px_1fr_380px]`).
- MapLibre 4 prati veličinu kontejnera preko `ResizeObserver`; provjeriti na
  pravoj karti da nema sivog ruba nakon promjene, inače `map.resize()` na
  `transitionend`.
- `fitBounds` padding: fit se radi nakon što se sidebar pojavi, inače je JLS
  centriran ispod desne ploče.
- Mobitel: bottom sheet bez odabira je samo peek s pretragom (kao sad), s odabirom
  se otvara na detalje (kao sad). Mijenja se uglavnom desktop.

## 6. Podijeli

Tipka u headeru: `navigator.share({ url: location.href })` na mobitelu,
inače kopiranje u clipboard + kratka potvrda. Budući da je `location.href` već
cijelo stanje, tipka nema vlastitu logiku. Presetovi („Sakralna Hrvatska" =
`/?l=crkve,zupe,biskupije`) postaju obični linkovi; OG worker kasnije može iz
`l` složiti naslov.

## 7. Redoslijed rada

1. `lib/urlState.ts` + testovi (parse/serialize/diff/alias).
2. `MapState`: slojevi, `boja`, `tema` izvedeni iz `useSearchParams`; generirano iz registra.
3. `useUrlSync`: `navigate` čuva `search` + `hash`; `/kampanje` → `l=pinka`
   (ruta ostaje kao alias).
4. MapLibre `hash: "map"` + preskakanje auto-fita kad hash postoji.
5. Sidebari po ruti + plutajuća pretraga.
6. Tipka Podijeli.
7. e2e (`e2e/smoke.spec.ts`):
   - `/?l=crkve,-granice-jls` → crkve upaljene, JLS granice ugašene
   - toggle sloja mijenja `l`, a `history.length` ostaje isti (replace)
   - klik na JLS iz pretrage → putanja `/jls/…`, `l` ostaje
   - Back nakon odabira → prethodna putanja, slojevi isti
   - `#map=…` u linku pobjeđuje auto-fit
   - `/` → nema lijevog ni desnog sidebara; `/jls/x` → oba

Koraci 1–4 su jedan commit (URL stanje), 5 drugi (raspored), 6 treći.

---

## 8. Status: napravljeno 30.10.2026.

Sve iz koraka 1–7. Odstupanja od plana, nađena tek u e2e:

**Arhitektura nije čisti „URL je izvor istine” (opcija B), nego jedan pisac.**
Prva verzija je pisala prizor u URL iz `MapStateProvider` (replace u
`setTimeout`), a `useUrlSync` je odvojeno radio push putanje. Ta dva poziva su
se utrkivala: replace bi pogodio stari unos povijesti, pa je Back na `/` vraćao
slojeve koji su bili upaljeni tek na `/jls/…`. Sada:

- `MapState` drži slojeve/boju/temu u stanju (inicijalno iz URL-a) i izlaže `scene`.
- **`useUrlSync` je jedini pisac URL-a**: putanja + `writeScene(...)` u jednoj
  navigaciji. Push kad se mijenja odabir, replace kad samo prizor.
- URL → stanje (u provideru) primjenjuje query samo kad se razlikuje od
  zadnjeg upisanog (`lastScene`) i nije REPLACE. Inače bi push sa
  zastarjelim queryjem (header link, useUrlSync) vratio npr. naselja koja je
  `reset()` upravo ugasio.
- `/poster` ne dobiva parametre jer tamo `useUrlSync` nije montiran.

**`fitAfterLayout` (`lib/fit.ts`).** Odabir mijenja raspored, a fit se zvao u
istom potezu: MapLibre je računao za staru širinu kanvasa (Samobor 770 px
širok u kanvasu od 580 px). Svi fitovi koji prate odabir idu kroz dva frame-a +
`map.resize()`.

**StrictMode i `#map=`.** `map.remove()` iz MapLibre `Hash` briše hash, pa je u
devu (dvostruki mount) druga instanca gubila kameru iz linka. `useMapLibre` ga
vraća, ali samo ako je kamera stigla linkom; inače bi drugoj instanci ostao
međukorak prve (`#map=0.36/0/0`).

**Poznato, nije mijenjano:** tipkanje ≥2 znaka u pretragu pali sloj naselja
(da bi pretraga našla naselja), pa taj sloj uđe i u `?l=`. Tako je bilo i prije,
sada se samo vidi u URL-u.

e2e: `e2e/url-state.spec.ts` (9 testova), `smoke.spec.ts` 18/18, ukupno 27/27.
