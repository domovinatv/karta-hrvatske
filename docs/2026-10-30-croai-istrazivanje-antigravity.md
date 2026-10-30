# CroAI — istraživanje lokacija za 119 nerazriješenih (handoff za Antigravity)

Pokreće se u Antigravity CLI-ju (`agy`, model Gemini 3.8 Flash) iz korijena
repoa. Prompt je ispod crte, kopira se cijeli. Rezultat ne ide na kartu
izravno: Claude ga pregleda i tek onda upisuje u `croai_overrides.json`
(vidi „Nakon istraživanja" na dnu).

Kontekst: `docs/2026-10-29-croai-sloj.md`. Stanje 30.10.2026.: 446 od 565
na karti; ovih 119 nije riješeno ni impresumom weba, ni info.BIZ-om po
imenu, ni Google Placesom uz isti web, ni sudskim registrom (e-mail domena
ili jedinstveno ime u 186 637 subjekata).

---

Radiš u repou `/Volumes/DOMOVINA2TB/git/domovinatv/karta-hrvatske`.
Odgovaraj na hrvatskom.

## Zadatak

Za svaki od 119 subjekata iz `apps/data-pipeline/data/croai_istrazivanje_ulaz.json`
nađi **gdje se nalazi**: adresu sjedišta ili ureda, za događaj mjesto
posljednjeg održavanja. To su subjekti iz imenika hrvatske AI scene
(map.croai.org): startupi, agencije, fondovi, fakultetski labovi, konferencije
i meetupi. Subjekt izvan Hrvatske je u redu, samo daj njegovu stvarnu adresu.

Podijeli posao na **6 subagenata po ~20 subjekata** (redom po indeksu u
datoteci: 0–19, 20–39, … 100–118). Svaki subagent piše svoju datoteku
`apps/data-pipeline/data/croai_istrazivanje/batch-NN.json` (NN = 01…06)
**nakon svakog subjekta**, ne tek na kraju, da se ništa ne izgubi.

## Ulaz (po subjektu)

- `croai_id`, `ime`, `web`, `kategorije`
- `oib`, `adresa_fina`: imaju ih samo 3 subjekta (OIB nađen, adresa se ne da
  geokodirati — vjerojatno strana)
- `zasto_nerazrijeseno`: zašto automatika nije uspjela
- `vrsta_procjena`: gruba heuristika (firma / događaj / institucija), smije biti kriva
- `tragovi`: što je već izvučeno iz spremljenih stranica weba i Googlea.
  `web_adresa` je regex nad tekstom i zna pokupiti tuđu adresu (dvorana,
  partner, kontakt obrazac). `google_*` je najbliži Google Maps pogodak po
  imenu, **s drugim webom** — dakle sumnjiv. `sudreg_sumnjiv` znači da je
  sudski registar dao pogodak koji je vjerojatno kriv.

## Kako istraživati, po redu

1. Web subjekta: stranice kontakt, impresum, imprint, about, footer,
   uvjeti korištenja, politika privatnosti (tamo često stoji pravni naziv,
   OIB/VAT i adresa).
2. LinkedIn stranica tvrtke (Headquarters), Crunchbase, PitchBook, Dealroom.
3. Hrvatski registri po pravnom nazivu ili OIB-u: sudreg.pravosudje.hr,
   companywall.hr, poslovna.hr, fininfo.hr, infobiz.fina.hr. Za strane:
   nacionalni registar (Companies House, Handelsregister, Ariregister…).
4. Za događaje: stranica zadnjeg izdanja, najava ili vijest s mjestom
   (dvorana + adresa). Za fakultetske labove i centre: adresa fakulteta ili
   zgrade u kojoj su.
5. Google Maps samo kao potvrda adrese koju si našao drugdje.

Pravila:

- **Ne izmišljaj.** Adresa mora biti doslovno na stranici koju navodiš u
  `izvor_url`. Ako je ne nađeš, `adresa: null` i u `napomena` kratko što si
  probao. Prazno je bolje od pogođenog.
- Ime brenda često nije pravni naziv (npr. „Lebesgue" je LEBEG SOFTWARE d.o.o.).
  Kad nađeš pravni naziv i OIB, upiši ih — OIB je 11 znamenki, provjeri da
  pripada baš tom subjektu.
- Ako subjekt ima više lokacija, uzmi sjedište (HQ); hrvatski ured stavi u
  `napomena`. Za subjekt čije je sjedište u inozemstvu, a ima ured u
  Hrvatskoj, **daj hrvatski ured** i označi `tip: "ured"`.
- Ne geokodiraj i ne izmišljaj koordinate. Adresu geokodira Claude
  (Google Places) kad pregleda rezultat. Koordinate upiši samo ako ih je
  stranica sama objavila (ugrađena karta) i navedi to u `napomena`.
- Ne mijenjaj nijednu drugu datoteku u repou. Ne pokreći skripte iz
  `apps/data-pipeline/scripts/`. Ne commitaj.

## Izlaz: `batch-NN.json`

JSON lista, jedan objekt po subjektu, istim redom kao u ulazu:

```json
{
  "croai_id": "486",
  "ime": "Martian&Machine",
  "tip": "sjediste | ured | dogadjaj | institucija | nepoznato",
  "pravni_naziv": "Martian & Machine d.o.o.",
  "oib": "12345678901",
  "drzava": "HR",
  "adresa": "Ulica kneza Branimira 41",
  "postanski_broj": "10000",
  "mjesto": "Zagreb",
  "izvor_url": "https://…",
  "drugi_izvor_url": "https://…",
  "pouzdanost": "visoka | srednja | niska",
  "napomena": "LinkedIn kaže Berlin, impresum Zagreb — uzeto Zagreb (impresum)"
}
```

`pouzdanost`:

- `visoka`: adresa s weba samog subjekta ili iz službenog registra, i ime/web
  se jednoznačno slažu;
- `srednja`: jedan neslužbeni izvor (LinkedIn, Crunchbase, vijest) ili
  subjekt bez vlastitog impresuma;
- `niska`: posredni zaključak (npr. samo grad, ili lokacija organizatora
  događaja).

`drzava` je ISO kod (HR, DE, GB, US…). Polja koja ne znaš su `null`.

## Na kraju

Kad svih 6 subagenata završi, spoji batcheve u
`apps/data-pipeline/data/croai_istrazivanje_izlaz.json` (jedna lista, 119
objekata) i ispiši sažetak: koliko visoka/srednja/niska/null, koliko izvan
Hrvatske, i popis subjekata za koje adresa nije nađena.

---

## Nakon istraživanja (za Claude)

1. Pročitaj `data/croai_istrazivanje_izlaz.json`. Sve `niska`, sve izvan HR i
   uzorak `visoka` provjeri jednim pogledom na `izvor_url`.
2. Geokodiraj adrese Google Placesom (`src/places.py`; za strane adrese
   upit bez `locationRestriction` na HR pravokutnik) i prihvati pogodak samo
   s istim mjestom/poštanskim brojem.
3. Upiši u `data/croai_overrides.json` u istom obliku kao postojeći unosi
   (`oib` ako je nađen, `lat`, `lng`, `adresa_override`, `izvor` s URL-om i
   datumom), ponovno pokreni `scripts/34_fetch_croai.py`, ažuriraj count u
   `apps/karta-web/src/lib/layers.ts`, `sync-data`, pokaži korisniku, deploy
   tek na njegov ok.
