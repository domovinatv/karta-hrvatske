# Generator plakata — registar subjekata, fit imena, izvori

Stanje na 2026-08-28. Generator je narastao s 2 grada na **8 subjekata**, a s
njima su došla tri problema koja se ne vide iz koda: kako se subjekt definira,
kako ime naselja stane u svoj poligon, i po čemu je Turopolje ovako omeđeno.

## Osam plakata

| ruta | jedinice | km² | stanovnika | sloj |
|---|---|---|---|---|
| `/poster/zagreb` | 191 kvart | 641 | — | `kvartovi` |
| `/poster/velika-gorica` | 58 naselja | 327 | 61.075 | `turopolje` |
| `/poster/velika-gorica-cetvrti` | 8 gradskih četvrti | 37 | — | `kvartovi` |
| `/poster/kravarsko` | 10 naselja | 58 | 1.824 | `turopolje` |
| `/poster/pokupsko` | 14 naselja | 106 | 1.926 | `turopolje` |
| `/poster/orle` | 10 naselja | 59 | 1.765 | `turopolje` |
| `/poster/turopolje` | 115 naselja | 762 | 83.714 | `turopolje` |
| `/poster/plemenita-opcina` | 26 naselja | 194 | 45.005 | `turopolje` |

Pravilo koje drži model dosljednim: **goli slug je uvijek cijela JLS u svojoj
prirodnoj jedinici** (Zagreb kvartovi, ostali naselja). Varijante dobivaju
eksplicitan sufiks (`-cetvrti`). Zato `/poster/velika-gorica` znači cijelu
JLS, a ne 8 gradskih četvrti kao u prvoj verziji.

## Registar je jedan JSON, čitaju ga tri mjesta

`src/lib/poster-subjects.json` je jedini izvor istine. Novi plakat je jedan
unos u tom fileu — ništa drugo se ne dira (osim `POSTER_SOURCES` ako dolazi iz
novog geojsona).

```mermaid
flowchart LR
    R["src/lib/poster-subjects.json<br/>registar subjekata"] --> A["poster.ts<br/>POSTER_SUBJECTS"]
    R --> B["build-lookups.mjs<br/>lookup-poster.json"]
    R --> C["build-sitemap.mjs<br/>/poster/&lt;slug&gt; URL-ovi"]
    A --> D["PosterView.tsx<br/>dropdown + SVG render"]
    B --> E["_worker.js<br/>OG meta za WhatsApp"]
    P["25_turopolje_naselja.py"] --> F["hr_turopolje_naselja.geojson"]
    F -- "sync-data" --> G["public/data/turopolje-naselja.geojson"]
    G --> D
    G --> B
```

Razlog za JSON umjesto TS konstante: build skripte su Node ESM i ne mogu
importati `.ts`. Prije toga je registar bio u `poster.ts`, pa bi OG kartica i
dropdown neizbježno otišli u različitim smjerovima.

### Polja koja nose logiku

| polje | čemu služi |
|---|---|
| `jlsMb` | lista JLS-ova; **više njih = objedinjeni plakat** |
| `unitFilter` | ime boolean propertyja koji jedinica mora imati — tako subjekt može biti podskup koji ne prati granice JLS-a (`plemenita_opcina`) |
| `outlines` | `["jls","regija"]` — koje obrise crtati preko ispuna |
| `unit` | sklonidba `[1, 2-4, 5+]`: „1 kvart, 2 kvarta, 5 kvartova" |
| `attribution` | izvor u footeru plakata; **razlikuje se po subjektu** |

### Zamka: filtar jedinica se zrcali na tri mjesta

`projectSubject()` (render), `stats` u `PosterView` (brojke u kontrolama) i
`countUnits()` u `build-lookups.mjs` (OG kartica) moraju filtrirati **isto**.
Kad je dodan `unitFilter`, lookup ga nije poštovao pa je OG kartica za
Plemenitu opčinu javljala *115 naselja* za plakat koji crta *26*. Ako mijenjaš
filtar, mijenjaj ga na sva tri mjesta.

## Imena se fitaju u oblik: upisani pravokutnik + rotacija

Prva verzija je birala font tako da natpis stane u **bbox** poligona, druga u
**vodoravni presjek na visini retka** (`spanAt()`). Oboje je bilo polovično:

- „Barbarići Kravarski" je ležao preko susjedne Podvornice — stao je u okvir
  svog poligona, ali ne i u sam poligon;
- Donja Lomnica (3,8 × 10,6 km, usko u sredini) i Podvornica **nisu dobile
  ime uopće** — sidro je bio centroid, a on kod takvih oblika pada u struk, pa
  je font pao ispod praga i natpis se tiho preskočio.

Od 2026-08-28 to radi `src/lib/label-fit.ts`, determinističkim postupkom bez
heuristike — naselje po naselje, neovisno o susjedima:

1. **Rasterizacija.** Poligon (vanjski prsten + rupe) u binarnu masku, ~128
   ćelija po duljoj stranici. Ćelija je „unutra" samo ako je *cijela* unutra:
   presjeci se računaju na **oba vodoravna ruba retka** i presijecaju, pa se
   maska još erodira za jednu ćeliju. Presjek samo na sredini retka propušta
   kosi rub koji zasiječe ćeliju — upravo su tako curila tanka dijagonalna
   naselja.
2. **Svi maksimalni upisani pravokutnici** maske, klasičnim „largest rectangle
   in histogram" postupkom sa stogom, O(redaka × stupaca).
3. **Kandidati loma imena** u 1–3 retka (sve particije po riječima); svaki lom
   daje svoj omjer stranica, pa i svoj najveći font u danom pravokutniku.
4. **Kutovi** 0°, ±15°, ±30°, ±45°: poligon se zarotira, pravokutnik ostaje
   osno poravnat, natpis se na kraju vrati u izvorni okvir.

Pobjeđuje najveći font, uz `tiltCost` (0.35) koji favorizira vodoravno i
blagu prednost pravokutniku bliže sredini oblika. Mjerenje na Turopolju (115
naselja): bez kazne za nagib 5 vodoravnih natpisa i prosjek 5,72 mm, s
kaznom ~90 vodoravnih i prosjek 5,6 mm — dakle mirniji plakat praktički
besplatno.

Rezultat: **1296 natpisa** (8 plakata × 3 formata), nijedan ne izlazi iz svog
poligona i nijedno naselje nije bez imena osim par najsitnijih zagrebačkih
mjesnih odbora s dugim imenima (`MIN_LABEL = 0.8` mm).

### Tri zamke oko mjerenja teksta, sve tri su rušile fit

Geometrija je bila lakši dio. Natpisi su i dalje izlazili iz poligona dok se
nisu riješile tri stvari koje nemaju veze s poligonima:

1. **`document.fonts.ready` ne čeka font koji nitko nije zatražio.** Natpisi
   su se mjerili prije nego što je Fraunces stigao, dakle zamjenskim serifom
   (~20 % uže), pa su ispali preveliki. Treba `document.fonts.load()`, a
   renderer javlja stanje kroz `data-labels="measured|pending"` — po tome e2e
   test zna kad je plakat gotov, umjesto da čeka tajmerom.
2. **Fraunces je varijabilni font s optičkom osi (`opsz`).** Glifovi na 4 px
   su osjetno širi nego na 40 px, pa mjera uzeta na jednoj veličini ne vrijedi
   za drugu. Zato `measure(line, size)` mjeri na veličini na kojoj se crta,
   fit se na kraju dotjeruje iteracijom, a klizač „Imena" ulazi **u sam fit**
   umjesto da naknadno skalira gotov natpis.
3. **`dominant-baseline="middle"` nije pouzdana referenca.** Browser taj pomak
   računa ovisno o kontekstu iscrtavanja — u CSS-skaliranom pregledu plakata
   ispao je drukčiji nego u pomoćnom elementu, pa je natpis sjedao ~0,2 em
   previsoko. Sada se atribut ne koristi: `y` svakog `tspan`-a **je** pismovna
   linija, a blok se centrira po izmjerenoj tinti (`dyEm`).

### Provjera je automatska, ne na oko

`e2e/poster-labels.spec.ts` uzima ono što je stvarno nacrtano (`tspan` x/y,
font-size, rotacija), izmjeri otisak slova canvasom i svaki vrh te kutije
testira s `SVGGeometryElement.isPointInFill` nad poligonom istog naselja —
par se poznaje po `data-unit` atributu. Ide preko tri plakata × tri formata,
plus sva tri fonta i krajnji položaji klizača.

`node scripts/audit-poster-labels.mjs [--all] [slug]` vrti isti engine u
nodeu (bez preglednika — `label-fit.ts` i `poster-geom.ts` namjerno nemaju
runtime importe) i ispisuje kut, broj redaka i veličinu za svako naselje.
Širine su ondje procijenjene iz tablice, pa je to izvještaj o geometriji
(„koje je naselje tijesno"), a mjerodavan render je preglednik.

Naslov i podnaslov se od 2026-08-28 skaliraju **i po širini**:
„PLEMENITA OPČINA TUROPOLJSKA" je dvostruko duži od „ZAGREB" i prije bi
jednostavno prešao rub papira. Faktor `0.72` = širina znaka `0.6` +
letter-spacing `0.12`, oboje u jedinicama font-sizea.

## Turopolje: opseg je urednička odluka, ne geometrija

Geometrija je DGU RPJ, ali **koja naselja čine regiju nije podatak nego
odluka**. Uzet je izvor:

> Mladen Klemenčić, „Turopolje uzduž i poprijeko", *Studia lexicographica*
> 15(2021)29, 141–151. <https://doi.org/10.33604/sl.15.29.8>

Urednik *Turopoljskog leksikona* (LZMK, 2021) ondje objašnjava kako je
uredništvo omeđilo regiju: 4 JLS u cijelosti + **„15 naselja iz sastava Grada
Zagreba"** + **„sjeverni dio [općine Lekenik] s ukupno osam naselja"**. Naš
popis daje točno 15 + 8.

Zato footer tog plakata nosi dvije atribucije:
`podaci: DGU RPJ · opseg: Turopoljski leksikon (LZMK, 2021)`.

### Što je namjerno izostavljeno i zašto

| izostavljeno | razlog |
|---|---|
| **Brezovica** | Klemenčić je izrijekom isključuje uz Svetu Klaru i Jakuševec; iz općine Odra izdvojena 1913.; povijesno okićko, ne turopoljsko područje |
| **Vrh Letovanićki**, **Palanjek Pokupski** | nema izvora; u južnoj trećini Lekenika (45,51° N naspram 45,55–45,61 za sjevernih osam); nisu u župi Pešćenica |
| Lučko, Sveta Klara, Trnsko, Savski gaj, Jakuševec | sjeverno od zagrebačke obilaznice (1981.), koju Klemenčić uzima kao praktičnu sjevernu crtu; većina ionako nisu DGU naselja nego dijelovi naselja Zagreb |
| južni Lekenik (Letovanić, Žažina, Šišinec, Stari Brod, Stari Farkašić, Brkiševina, Pokupsko Vratečko, Petrovec) | Pokuplje / sisačka Posavina |
| Greda, Sela, Odra Sisačka | „jugoistočni dio Turopolja" po Proleksisu, ali izvan definicije leksikona — kandidati za prijelazni pojas |

### Dvije zamke u imenima

- DGU piše **Pešćenica**, ne „Peščenica".
- **Cerovski Vrh** je naselje Grada Velike Gorice, ne Lekenika — popisi ga
  znaju krivo svrstati.

### Neriješena brojka

Klemenčić piše da njegov obuhvat daje „nešto manje od 1000 km²", a zbroj DGU
poligona za tih 115 naselja je **762 km²**. Hrvatska enciklopedija za
Turopolje kaže „oko 600 km²" (≈ naša jezgra od 550). Naš broj sjeda između, i
svaki je član popisa zasebno potkrijepljen, ali razlika se ne može razriješiti
bez samog leksikona — nije digitaliziran.

## Plemenita opčina je zaseban sloj, ne granica

22 sučije po M. Šenoi (1910: 8), preslikane na današnji DGU registar:
Polje 10, Vrhovlje 9, pridružena naselja 7 = **26 naselja**.

Ide kao zaseban plakat, a ne kao granica Turopolja, jer Klemenčić (2021: 144)
izrijekom kaže da se označavanjem samo „plemenitaških" naselja *„ne dobije
prostorno homogeno i posve zaokruženo područje"*. Plakat to i pokazuje:
26 ispuna preko tankog obrisa cijele regije, s vidljivim rupama.

Preslikavanje nije 1:1:

- „Gornji i Donji Lukavec" → danas jedno naselje **Lukavec**
- „Dragonožec" → **Donji** i **Gornji Dragonožec**
- Lazi → **Lazi Turopoljski**, Markuševec → **Markuševec Turopoljski**,
  Petravci → **Petravec**, Jarebić → **Jerebić**
- **Mala Gorica, Kurilovec, Pleso, Rakarje, Kušanec** nemaju današnjeg
  parnjaka — danas su gradske četvrti *unutar* naselja Velika Gorica. Grad ih
  je apsorbirao, pa ih pokriva to naselje, koje je ionako bilo sučija.

Skripta puca ako se ijedan unos popisa ne nađe — tiho preskakanje bi dalo
nepotpun sloj koji nitko ne bi primijetio.

## Pipeline korak 25: dvije provjere koje se isplate

`apps/data-pipeline/scripts/25_turopolje_naselja.py`:

- **Svako ime s popisa mora se naći** u DGU naseljima, inače `sys.exit(1)`.
  Uhvatilo „Peščenicu".
- **Dissolve svih naselja mora biti jedan poligon bez rupa**, inače upozorenje.
  Uhvatilo da Vrh Letovanićki i Palanjek Pokupski vise kao otok — što se i
  vidjelo na plakatu kao odvojena mrlja.

### `simplify()` je izbačen, i to dvaput na štetu

Prva verzija je pojednostavljivala geometriju na 5 m u EPSG:3765. Dvije
posljedice:

1. **20 sliver-rupa** u uniji — `simplify()` reže vrhove neovisno na svakoj
   strani zajedničkog ruba, pa se susjedna naselja razmaknu.
2. Bio je **veći**: 0,37 MB naspram 0,23 MB sirovog. DGU naselja su već
   pojednostavljena u koraku 18, pa se nema što dobiti.

Ostalo je samo rezanje koordinata na 6 decimala (~10 cm), što je topološki
sigurno jer isti ulazni vrh daje isti izlazni.

## Zamka u alatu: `tsc -p tsconfig.json` ne provjerava ništa

Root `tsconfig.json` ima `"files": []` i samo `references`. `npx tsc --noEmit
-p tsconfig.json` zato **prolazi i kad kod ne kompajlira**. Koristi:

```bash
npx tsc -b --force        # ili npm run build, koji ionako vrti tsc -b
```

`npm run lint` u ovom checkoutu ne radi — `eslint` nije instaliran u
`node_modules/.bin`. Nije blokirajuće jer build vrti `tsc -b`, ali lint
zapravo nikad ne prolazi.

## Vezani dokumenti

- [`2026-08-17-deploy-verifikacija.md`](./2026-08-17-deploy-verifikacija.md) —
  tihi kvarovi u deploy lancu; poglavlje 4 opisuje SW koji se nije instalirao
- [`ui-refactor-plan.md`](./ui-refactor-plan.md) — plan UI refactora
