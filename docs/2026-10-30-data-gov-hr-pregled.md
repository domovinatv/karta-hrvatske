# data.gov.hr — pregled kataloga za slojeve karte (30.10.2026.)

Portal otvorenih podataka RH je CKAN: `https://data.gov.hr/ckan/api/3/action/`
(`package_search?rows=1000&start=…`, bez ključa). Snimljeno 30.10.2026.:
**3961 dataset, 391 organizacija**. Formati: 2071 XLSX, 1630 PDF, 1382 CSV,
1202 XLS, 235 JSON; s geometrijom samo 211 (WMS 126, GeoJSON 108, SHP 102,
WFS 61, KML 79). Od tih 211, 112 je Grad Zagreb (to već imamo kroz
data.zagreb.hr, vidi sloj „ZG …") i 75 DGU-ovi INSPIRE servisi.

Velik dio kataloga su lokalni dokumenti (proračuni, odluke u PDF-u, 57 skupova
Grada Ivanca…). Za kartu vrijede nacionalni popisi s adresom ili geometrijom.

## Već se koristi (sibling repoi)

| Skup | Gdje |
|---|---|
| MZO Osnovne škole, Srednje škole, Dječji vrtići | `oou.domovina.ai/src/datagovhr.py` → slojevi Škole, Vrtići |
| Evidencija pravnih osoba Katoličke Crkve, Evidencija vjerskih zajednica | `crkve.domovina.ai` → Crkve, Župe |
| Registar udruga (katoličke udruge) | `crkve.domovina.ai` → Katoličke udruge |
| Registar kulturnih dobara | `crkve.domovina.ai/scripts/04_ingest_heritage.py` |

## Kandidati: s geometrijom (WFS, većinom DGU INSPIRE)

DGU WFS je 29.10.2026. bio „Service WFS is disabled" — prije gradnje sloja
provjeriti da servis radi.

- **Kakvoća mora za kupanje** (točke plaža s ocjenom), Zaštićena područja,
  Ekološka mreža Natura 2000, Karta staništa
- **Registar geografskih imena** (vrhovi, otoci, uvale — i kao geokoder za
  toponime)
- Državna mreža meteoroloških i hidroloških postaja, mreža radara, oceanografske postaje
- **Plovput: Registar objekata sigurnosti plovidbe** (svjetionici, WMS)
- **Hrvatske autoceste: mreža autocesta** (WFS)
- Područni uredi civilne zaštite, Očevidnik velikih nesreća
- Okoliš: Registar onečišćavanja, Seveso postrojenja, odlagališta otpada,
  istražni i eksploatacijski prostori ugljikovodika i geotermalne vode
- DGU zgrade (DKP i TTB), Popis 2021. po JLS-u (stanovništvo, kućanstva)

## Kandidati: popisi s adresom, bez koordinata

Geokod istim lancem kao CroAI (Google Places po adresi uz isti poštanski broj).

| Skup | Izdavač | Napomena |
|---|---|---|
| **Adresar vatrogasnih organizacija** | HVZ | DVD-ovi su po selima — jaka veza s [zajedno.domovina.ai] i JLS slojem |
| **Registar energetskih zajednica građana** | HERA | izravno za zajedno.domovina.ai (elektrane zajednica) |
| **Popis kategoriziranih turističkih objekata** | Min. turizma | hoteli, kampovi; XLSX iz 2019., provjeriti svježinu |
| Upisnik knjižnica RH | NSK | ima OIB i adresu; uz to adresari narodnih, školskih, visokoškolskih knjižnica 2024. |
| Ustanove iz sustava visokog obrazovanja | MZO | fakulteti, veleučilišta; dopuna sloja Ustanove |
| Adresar zdravstvenih ustanova, Lokacije ordinacija PZZ | HZZO | CSV „lokacije" je s hackathon URL-a, 30.10. prazan |
| Adresar ustanova socijalne skrbi | Min. demografije | 30.10. prazan odgovor |
| Poštanski uredi | HP | XLSX/XML |
| **Popis poduzetničkih centara** | Min. poduzetništva | `.xlsb`; unakrsna provjera sloja Inkubatori (JRPI) |
| Registar zaklada | MPUDT | OIB, web, sjedište; 681 zapis |
| Registar udruga | MPUDT | OIB, e-mail, web, sjedište; 113 MB, 327 tis. redaka, ažurira se dnevno |
| Registar proračunskih i izvanproračunskih korisnika | MF | javne ustanove s OIB-om |
| **Registar birača — broj birača po adresi** | MPUDT | svaki kućni broj u RH (naselje, ulica, broj), bez koordinata — popis adresa za provjeru geokodera |
| Središnji registar državne imovine — nekretnine | MPUDT | JSON API `srdi.gov.hr/api/nekretnine/export` |

## Primjena na CroAI (30.10.2026.)

Registar udruga i zaklada spojen po domeni weba i e-maila s CroAI imenikom
(skripta jednokratna, `data/raw/datagovhr/{udruge,zaklade}.csv`). Jednoznačno
samo 5: HACK → udruga P.O.I.N.T. (Križevci), Split Tech City → „Startup —
udruga za poticanje i razvoj IT sektora" (Split), te OIB za CVCA, The geek
gathering i eStudent. Domene sveučilišta i velikih firmi daju lažne pogotke
(studentske i sportske udruge dijele domenu), pa domena sama ne vrijedi bez
sličnosti imena.

## Registar birača — broj birača po adresi (detalj, 30.10.2026.)

- **Izdavač:** Ministarstvo pravosuđa, uprave i digitalne transformacije,
  licenca Otvorena dozvola, na portalu od 3.9.2021. Snimljena verzija od
  13.5.2026. (`bb_po_adresi_13_05_2026.csv`).
- **Format:** CSV, separator `;`, kodiranje **cp1250** (nije UTF-8 — `utf-8`
  pada na „Č").
- **Stupci:** `ZUPANIJA_NAZIV; GROP_NAZIV; NASELJE_NAZIV; ULICA_NAZIV; ADR_KBR;
  ADR_KBR_DODA; ADR_KBR_DODN; BROJ_BIRACA; STATUS`. Nema imena, OIB-a ni
  datuma rođenja — samo broj birača po adresi.
- **Brojke:** 1 014 364 adrese (989 279 `VAŽEĆA`, 25 085 `NEVAŽEĆA`),
  3 600 345 birača. 260 328 adresa ima točno jednog birača, 261 327 točno dva.
- **Što nije:** popis svih kućnih brojeva. U njemu su samo adrese na kojima je
  prijavljen barem jedan birač — poslovni prostori, vikendice i prazne kuće
  nisu.

**Privatnost.** Skup je zbirni, ali adresa s jednim biračem kaže da na toj
kućnoj adresi živi jedna punoljetna osoba s biračkim pravom; spojeno s
imenikom, katastrom ili društvenim mrežama to postaje podatak o kućanstvu.
Je li to osobni podatak u smislu GDPR-a (prepoznatljiva osoba), procjena je
AZOP-a; pravna osnova objave nije provjerena. Za karti je pravilo: **nikad
broj birača po kućnom broju** (ni popup, ni toplinska karta na razini
zgrade). Smije: provjera postoji li adresa i je li stambena (validacija
geokodera), i zbirovi po naselju ili mjesnom odboru.
