# Licenca podataka

Kod u ovom repozitoriju je pod [MIT licencom](./LICENSE). Podaci nisu isto što i
kod i imaju vlastite uvjete, koji ovise o tome tko je izvor.

## Ono što ovaj repozitorij proizvodi

**GeoJSON izlazi, izvedeni pokazatelji i plakati koje generira
`apps/data-pipeline` objavljuju se pod [Creative Commons Attribution 4.0
International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.hr).**

To znači: smijete ih koristiti, mijenjati i objavljivati, uključujući u
komercijalne svrhe, uz navođenje izvora. Traženo navođenje:

> Izvor: gis.domovina.ai (CC BY 4.0), izvedeno iz [naziv izvornog registra].

Atribucija izvornih registara ne nestaje time — ide uz našu, ne umjesto nje.

## Ono što dolazi iz tuđih izvora

Izvedeni skupovi nasljeđuju obveze izvora. Redom po slojevima:

| Izvor | Što daje | Uvjeti |
|---|---|---|
| **DGU** — Registar prostornih jedinica, INSPIRE | granice države, županija, JLS, naselja, adresne točke | otvoreni podaci RH, navođenje izvora |
| **DZS** — Popis 2021. | popis i tip JLS-a, stanovništvo naselja | otvoreni podaci RH, navođenje izvora |
| **data.zagreb.hr** | gradske četvrti i mjesni odbori, 33 skupa gradskih sadržaja | „Otvorena dozvola (OD)" — dopušta korištenje i preradu uz navođenje izvora |
| **OpenStreetMap** | teren, aerodromi, igrališta, stadioni, granice VG četvrti | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) — **share-alike**: izvedena baza mora ostati pod ODbL |
| **JRPI** — Ministarstvo gospodarstva | poduzetnička potporna infrastruktura | javni registar, navođenje izvora |
| **FINA info.BIZ** | status i veličina poslovnog subjekta | javno dostupni podaci registra, bez preprodaje |

**ODbL je jedina odredba koja nešto traži natrag.** Slojevi izvedeni iz
OpenStreetMapa — `hr_pitches`, `hr_stadiums`, `hr_airports`, `hr_approaches`,
`hr_runways` — su pod ODbL-om, ne pod CC BY 4.0, i tako ih treba navoditi.

Jedan slučaj je pomiješan i to treba znati prije ponovne upotrebe:
**`hr_kvartovi.geojson` u istoj datoteci nosi zagrebačke gradske četvrti i
mjesne odbore (RPJ, Otvorena dozvola) i četvrti Velike Gorice (OSM, ODbL)**,
jer za VG ne postoji javni poligonski izvor osim OSM-a. Polje `source` po
značajki kaže odakle je koja. Tko preuzima samo zagrebački dio, ne ulazi u
ODbL; tko preuzima cijelu datoteku, ulazi.

`zg_gradski_sadrzaji.geojson` ne miješa ništa — svih 33 skupa su iz
data.zagreb.hr pod Otvorenom dozvolom, a `dataset` po značajki vodi na točan
izvorni skup.

Tematski slojevi iz sestrinskih repozitorija (crkve, župe, biskupije, škole,
vrtići, ustanove) ovdje se samo preslikavaju i **licencu nose iz svojih
repozitorija** — vidi `SIBLING_LAYERS` u `apps/karta-web/scripts/sync-data.mjs`.

## Osnovna karta

Podloge (CARTO dark matter, OpenFreeMap positron, DGU ortofoto) nisu dio ovog
repozitorija — one se poslužuju sa svojih izvora i vrijede njihovi uvjeti.
