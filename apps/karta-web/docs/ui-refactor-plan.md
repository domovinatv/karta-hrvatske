# UI/UX refactor — plan

**Datum:** 2026-08-16
**Cilj:** riješiti prelijevanje liste slojeva na kratkim ekranima, prebaciti informacijsku
arhitekturu s "država → županija → JLS" na "platforma s N tematskih slojeva", i dovesti
vizualni dojam na razinu na kojoj se aplikacija može gurati na LinkedIn.

---

## 1. Dijagnoza

### 1.1 Korijenski uzrok

Sučelje je dizajnirano za **v1 opseg**: država, županije, JLS. Svaki novi sloj je inkrementalno
dodan kao još jedna tipka u **jednu ravnu vertikalnu listu** u `ControlsPanel.tsx`. Danas ih je 18
i lista je prerasla svaki viewport.

Lista miješa **četiri različite vrste kontrole** bez ikakve hijerarhije:

| Vrsta | Tipke |
|---|---|
| Prikaz / render | 🎨 Color, 🌓 Tema, 🛰 Ortofoto |
| Administrativne granice | ▦ Granice županija, ▦ Granice JLS, ⊟ Naselja, ⌂ Kvartovi, ▦ Četvrti i MO |
| Tematski podaci | ⚽ Klubovi, 💶 Pinka, ⛪ Crkve, 🏛 Župe, ✝️ Biskupije, ▦ Igrališta, 🏟 Stadioni, ✈ Zračne luke |
| Akcije | ◎ Samo odabrana JLS, ⌖ Fit Hrvatska |

Sve su vizualno **jednako teške**: isti okvir, isti mono font, isti razmak. Korisnik ne vidi da
"Tema" i "Biskupije" pripadaju različitim svjetovima.

### 1.2 Potvrđeni bugovi (verificirano u kodu)

| # | Nalaz | Lokacija |
|---|---|---|
| B1 | Desktop panel nema `max-height` ni `overflow` → donje tipke nedostupne ispod ~760px visine | `ControlsPanel.tsx:51` |
| B2 | Mobilni popover isto nema `max-height` ni scroll; sidran je na `top: safe-area+64px` | `LayersFab.tsx:45` |
| B3 | Popover se **zatvara nakon svakog toggla** (`onAction={() => setOpen(false)}`) → paljenje 3 sloja = 3× otvaranje izbornika | `LayersFab.tsx:52` |
| B4 | Svih 18 tipki reklamira kraticu (`C`, `L`, `B`, `J`, `N`, `Q`, `V`, `K`, `€`, `R`, `Ž`, `D`, `P`, `T`, `A`, `S`, `O`, `F`), a **`keydown` handler ne postoji** — jedini je ESC u `ClubModal.tsx:33` | `ControlsPanel.tsx` |
| B5 | `⌖ Fit Hrvatska` zove samo `reset()` koji briše selekciju; `HR_BOUNDS` se koristi isključivo pri inicijalizaciji karte → kamera se ne vraća | `MapState.tsx:130`, `useMapLibre.ts:33` |
| B6 | `DetailPanel` je u `lg:block` asideu, `BottomSheet` je `md:hidden` → **na 768–1023 px detalji se ne prikazuju nigdje** | `MapView.tsx:169`, `BottomSheet.tsx:54` |
| B7 | `reset()` ne gasi tematske slojeve (crkve, župe, klubovi…), samo naselja/kvartove → "reset" nije reset | `MapState.tsx:130` |
| B8 | Provenance znanje živi samo u `title=""` atributu — na dodiru nevidljivo. Npr. "granice su DERIVIRANE… slaganje 96,6–98,6 %" je najvrjedniji podatak sloja i nitko ga na mobitelu neće vidjeti | `ControlsPanel.tsx:143` |

### 1.3 UX manjkovi

- **Nema legende.** Uključiš Biskupije ili Klubove i boje su neobjašnjene.
- **Nema "što je trenutno upaljeno".** Nakon 5 klikova ne znaš stanje bez skrolanja liste.
- **Nema feedbacka za lazy load.** Svi tematski slojevi se lijeno dohvaćaju; jedini indikator je onaj u pretrazi naselja.
- **Nema brojeva.** "⛪ Crkve" ne kaže 6.966; "🏛 Župe" ne kaže 2.928. To je upravo ono čime se hvališ.
- **Stanje slojeva nije u URL-u.** `useUrlSync` nosi samo `/jls/`, `/zupanija/`, `/klub/`, `/kampanje` — **prizor koji korisnik složi nije dijeljiv**. Za LinkedIn je to blokirajuće.
- **Desktop panel pokriva ~15 % karte** (istočna Slavonija) i ne može se sklopiti.
- **Desni "Detalji" aside trajno drži 380 px**, prazan u većini sesija.

### 1.4 Vizualni manjkovi ("premium" gap)

- **Emoji kao ikone**, i to pomiješani s geometrijskim glifovima (`▦`, `⊟`, `⌂`, `◎`, `⌖`). Emoji se renderiraju različito po platformama i najjači su pojedinačni signal "hobi projekt".
- **Aktivno stanje = crveni obrub** (`--ui-accent: #ef4444`). Crvena u UI-ju čita se kao *greška*, ne kao *uključeno*. Tri upaljena sloja izgledaju kao tri alarma.
- **Mono 11px na svakoj tipki.** Mono treba biti rezerviran za brojeve i koordinate, ne za labele.
- **Fraunces se učitava, a koristi na 4 mjesta.** Display font bez uloge.
- **Nema skale elevacije/radiusa/motion tokena** — sve je ad-hoc inline `style={{}}`.
- **Prazna stanja su gola:** "Klikni JLS na karti" centrirano u praznini.
- **Nema onboardinga.** Prvi dolazak ne komunicira da ispod postoji 15 slojeva.

---

## 2. Plan refactora

Pet faza. Faza 0 i 1 su preduvjet za sve ostalo i rješavaju prijavljeni bug.

### Faza 0 — Registar slojeva (enabling refactor, bez vidljive promjene)

Uvesti `src/lib/layers.ts` kao **jedini izvor istine** o slojevima:

```ts
export interface LayerDef {
  id: LayerId;                 // "crkve"
  group: LayerGroup;           // "vjera" | "sport" | "granice" | "infrastruktura" | "prikaz"
  label: string;               // "Crkve"          ← mora ostati identičan (e2e locator)
  icon: IconName;              // SVG ikona, ne emoji
  stateKey: keyof MapState;    // "showCrkve"
  shortcut?: string;           // "R"
  count?: number;              // 6966
  blurb: string;               // provenance tekst iz današnjeg title=""
  source?: { label: string; href: string };
  legend?: LegendSpec;         // boje + značenje
  lazy: boolean;
}
```

**Ključna odluka:** `MapState` ostaje API-kompatibilan. Registar samo mapira `stateKey` →
`{ value, set }` kroz `useLayerToggle(def)`. Time **nijedan od 12 layer-hookova ne treba dirati** —
oni i dalje čitaju `s.showCrkve`. Rizik refactora pada na nulu.

`ControlsPanel` se svodi na mapiranje nad registrom umjesto 18 ručno pisanih blokova (192 → ~60 linija).

**Ostavlja se netaknuto:** tekst labela (`Klubovi`, `Igrališta`, `Stadioni`, `Zračne luke`) jer ih
`e2e/smoke.spec.ts` locira preko `page.locator("button", { hasText: /Klubovi/ })`.

### Faza 1 — Popraviti prelijevanje (blokirajući bug)

**Desktop:**
- Panel dobiva `max-height: calc(100dvh - <header> - 2rem)`, `overflow-y: auto`, `overscroll-behavior: contain`, sticky zaglavlja grupa.
- Panel postaje **sklopiv** (⟨ tipka) → karta dobiva punu širinu; stanje u `localStorage`.
- Gradijent-fade na dnu kao signal "ima još".

**Mobile:**
- FAB popover → **pravi bottom sheet**, `max-height: 72dvh`, scrollabilan, s ručkom i poluprozirnim backdropom (karta ostaje djelomično vidljiva da se vidi efekt paljenja sloja).
- **Ukloniti auto-close** nakon toggla (B3). Zatvara se ručkom, backdropom ili ESC-om.
- Riješiti z-index rat: `LayersFab` (700) i `BottomSheet` (600) postaju jedan sustav slojeva.

**Popraviti usput:** B5 (`Fit Hrvatska` → stvarni `fitBounds(HR_BOUNDS)`), B6 (bottom sheet do `lg`, ne do `md`), B7 (`reset()` gasi i tematske slojeve).

### Faza 2 — Pametnija informacijska arhitektura

- **Grupe koje se sklapaju**, stanje u `localStorage`:
  `Prikaz` · `Administrativne granice` · `Naselja i kvartovi` · `Vjerski objekti` · `Sport` · `Infrastruktura`
- **Traka "Aktivni slojevi"** na vrhu: čipovi upaljenih slojeva + `Očisti sve`. Rješava "ne znam što je upaljeno".
- **Broj zapisa uz svaki sloj** (`6.966`, `2.928`, `1.014`) — istovremeno UX i marketing.
- **ⓘ po sloju** → mali popover s `blurb` tekstom + link na izvor. Konačno vidljivo na dodiru (B8).
- **Legenda** koja se pojavljuje samo za aktivne slojeve kojima treba (biskupije, tier boje klubova, naselja).
- **Skeleton + progress** za lazy dohvat sloja, s inline greškom ako padne.
- **Tipkovnica stvarno implementirana** (B4) + `?` cheat sheet. Kratice koje se sudaraju s tipkanjem u pretrazi guardati preko `document.activeElement`.

### Faza 3 — Premium vizualni prolaz

1. **Ikone: emoji → inline SVG set** (~20 ikona, `currentColor`, stroke 1.5, 20×20). Najveći pojedinačni pomak u percepciji.
2. **Boja aktivnog stanja: crvena → brand navy `#002F6C`** (dark: svjetlija varijanta). Crvena ostaje za brand stripe i destruktivne akcije.
3. **Toggle kao switch** (`role="switch"`, `aria-checked`) umjesto samo obruba.
4. **Tipografija:** Fraunces = naslovi i veliki brojevi, sans = UI labele (13px, ne mono 11px), JetBrains Mono = isključivo brojevi/koordinate/ID-evi.
5. **Token sloj u `styles.css`:** elevacija (3 razine), radius (3), motion (fast/base/slow), spacing. Zamjena ad-hoc inline stilova.
6. **Staklene ploče kako spada:** `backdrop-filter` + 1px hairline + dvoslojna sjena, konzistentno u obje teme.
7. **Motion:** 160–220ms ease-out na panele i sheet, `fill-opacity` transition pri paljenju sloja (sloj "izroni" umjesto da bljesne), sve pod `prefers-reduced-motion`.
8. **Prazna stanja s vrijednošću:** umjesto "Klikni JLS na karti" → kartica sa statistikom dataseta i 2–3 prijedloga.
9. **Header:** dodati kompaktni brojač aktivnih slojeva i `Podijeli`; makni "WEBGL" (interno, ne prodaje).

### Faza 4 — Marketing i dijeljivost

- **Stanje slojeva u URL** (`?l=crkve,zupe,biskupije`) + kamera (`?z=`, `?c=`). Bez ovoga nijedan screenshot s LinkedIna nije reproducibilan.
- **`Podijeli` tipka** → kopira link trenutnog prizora.
- **Kurirani presetovi ("Priče")** — 6–8 klikova koji odmah pokazuju multifunkcionalnost:
  `Sakralna Hrvatska` · `Nogometna karta` · `Anatomija Zagreba` · `Zračni prostor` · `Granice i naselja` · `Otoci`.
  Svaki je vlastiti URL → vlastiti OG image preko postojećeg CF Workera → 8 gotovih LinkedIn postova.
- **Onboarding:** 3 koraka, dismissible, `localStorage`. Prvi korak = "ovdje su slojevi", jer je to točno ono što nitko ne otkrije.
- **`Snimi prizor` → PNG** (canvas + legenda + brand stripe). `lib/poster.ts` već radi canvas kompoziciju — reuse.

### Faza 5 — QA

- **e2e dodaci:** viewport 1280×700 i 390×667 → zadnja tipka u listi mora biti dohvatljiva i klikabilna; mobilni sheet ostaje otvoren nakon toggla; preset URL-ovi vraćaju očekivane slojeve.
- **Postojeći testovi:** labele ostaju identične, ali locator `page.locator("button", { hasText: /Klubovi/ })` treba provjeriti nakon uvođenja grupa (moguć sudar s naslovom grupe) — po potrebi dodati `data-testid`.
- **A11y:** focus ring na svemu, `aria-pressed`/`role="switch"`, ESC zatvara sheet i modal, focus trap u sheetu, kontrast ≥ 4.5:1 u obje teme.

---

## 3. Redoslijed i procjena

| Faza | Sadržaj | Rizik | Napomena |
|---|---|---|---|
| 0 | Registar slojeva | nizak | Hookovi netaknuti |
| 1 | Overflow + B3/B5/B6/B7 | nizak | **Rješava prijavljeni problem** |
| 2 | Grupe, legenda, ⓘ, brojevi, kratice | srednji | Najveći UX dobitak |
| 3 | Ikone, boje, tipografija, motion | srednji | Najveći dobitak percepcije |
| 4 | URL slojeva, presetovi, share, onboarding | srednji | Preduvjet za LinkedIn |
| 5 | e2e + a11y | nizak | |

Preporuka: **0 + 1 odmah** (bug), zatim **3 prije 2** ako je LinkedIn rok blizu — vizualni prolaz
je ono što se vidi na screenshotu, a Faza 2 je ono što se osjeti u korištenju.

---

## 4. Status

### Napravljeno (2026-08-16)

**Faza 0 — registar slojeva**
- `src/lib/layers.ts` — 18 kontrola, 6 grupa, po sloju: ikona, kratica, broj zapisa, `blurb`, izvor, legenda.
- `src/hooks/useLayerControls.ts` — razrješava `stateKey` → `{ value, set }`. **Nijedan `use*Layer` hook nije diran.**
- `ControlsPanel.tsx` (192 linije ručno pisanih blokova) obrisan → `LayersPanel.tsx`, generiran iz registra.

**Faza 1 — prelijevanje i prateći bugovi**
- B1 → desktop dock: `max-height: calc(100% - 2rem)`, unutarnji scroll, sticky zaglavlja grupa, sklapanje u pilulu (stanje u `localStorage`). Izmjereno na 1280×620: panel završava na 604 px, scroll 808 → 474.
- B2 → mobilni popover zamijenjen bottom sheetom, 72dvh, skrolabilan, backdrop.
- B3 → sheet **ostaje otvoren** nakon toggla.
- B4 → `useKeyboardShortcuts.ts`; kratice guardane preko `document.activeElement` da ne otimaju tipkanje u pretragu.
- B5 → `Fit Hrvatska` sad zove `fitBounds(HR_BOUNDS)`.
- B6 → `BottomSheet` `md:hidden` → `lg:hidden`; mrtva zona 768–1023 px zatvorena.
- B8 → `title=""` provenance preseljen u ⓘ popover, vidljiv na dodiru.

**Iz Faze 2/3 povučeno naprijed** (jer se panel ionako pisao iznova):
- Sklopive grupe s pamćenjem stanja, brojač aktivnih slojeva, `Očisti`, brojevi zapisa (klubovi i naselja dinamički iz učitanih kolekcija — 1.014 klubova, ne zastarjeli statični broj).
- **Emoji → lucide-react**, u cijeloj aplikaciji: panel, tabovi sheeta, header, ClubModal, PosterView, NotFound. MapLibre popupi (HTML stringovi, izvan Reacta) preko `lib/svgIcons.ts` s doslovno prepisanim lucide pathovima.
- Aktivno stanje **crvena → `--ui-active`** (`#5b8dce` tamna / `#002F6C` svijetla), `role="switch"` prekidači.
- `WEBGL` iz headera → opseg dataseta.

**B7 — namjerno odbijeno.** Plan je tražio da `reset()` gasi i tematske slojeve. Odbačeno: korisnik koji je upalio crkve i klikne `Fit Hrvatska` ne očekuje da izgubi sloj. Umjesto toga je razdvojeno — `Fit Hrvatska` = kamera + odabir, `Očisti` uz brojač = podatkovni slojevi.

**Odluka koju je iznudio test:** granice županija i JLS su `baseline: true` — ne broje se u aktivne slojeve i `Očisti` ih ne gasi. Bez toga je svježe učitana karta javljala „2 aktivna sloja" prije nego je korisnik išta dirao.

### Testovi

12/12 prolazi. Četiri nova:
- zadnja kontrola dohvatljiva na 1280×620 + kamera se stvarno vraća,
- svaka kontrola dohvatljiva na 1280×600,
- mobilni sheet ≤ 72dvh, ostaje otvoren nakon toggla, brojač na FAB-u,
- kratice rade i ne otimaju tipkanje u pretragu.

Locatori novih testova ciljaju `[role="switch"]`, ne `button`: naslov grupe „Naselja i kvartovi" je i sam `<button>`, pa ga `hasText: /^Naselja/` uhvati prije reda sloja. Postojeći testovi (`Klubovi`, `Igrališta`, `Stadioni`, `Zračne luke`) nemaju koliziju s imenima grupa.

Test `klub click` sad prvo sklopi panel — panel je plutajući dock nad kartom, pa marker ispod njega nije klikabilan.

### Ostaje

Faza 3 (tipografija, tokeni elevacije/radiusa/motiona, prazna stanja, staklene ploče), Faza 2 (legenda za aktivne slojeve, skeleton/progress za lazy dohvat, `?` cheat sheet, čipovi aktivnih slojeva), Faza 4 (slojevi u URL, presetovi, share, onboarding, `Snimi prizor`), Faza 5 (a11y prolaz).
