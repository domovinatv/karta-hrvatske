# TODO — prijava do 16.9.2026. u 23:59

Radna lista. Poredak je po ovisnostima, ne po važnosti: sve u koraku 1 blokira
sve ostalo, a ništa iz koraka 4 ne može početi prije nego je poznat prijavitelj.

Legenda: `[ ]` otvoreno · `[x]` gotovo · `[—]` ne primjenjuje se

---

## 0. Već gotovo (ne treba ponavljati)

- [x] Dosje natječaja i sva dokumentacija lokalno — `docs/natjecaj-otvoreni-podaci-zg-2026/`
- [x] Cijeli CKAN katalog snimljen (199 skupova) — `podaci/ckan-inventar.csv`
- [x] Harvester 33 skupa, 5354 točke — `apps/data-pipeline/scripts/31_fetch_zg_open_data.py`
- [x] Nadzor portala i nalazi — `apps/data-pipeline/outputs/zg_portal_izvjestaj.md`
- [x] Sloj „Zagreb — otvoreni podaci" na karti, 24/24 e2e prolazi
- [x] `LICENSE` (MIT) + `LICENSE-PODACI.md` (CC BY 4.0 / ODbL)
- [x] Repozitorij javan — `github.com/domovinatv/karta-hrvatske`, od 20.5.2026.

---

## 1. Blokira sve ostalo — riješiti prvo

- [ ] **Odrediti prijavitelja.** Mora biti d.o.o., j.d.o.o., obrt, udruga,
      umjetnička organizacija ili zadruga. Fizička osoba ne može.
      → o tome ovisi svaki dokument u koraku 2 i ime u `LICENSE`.
- [ ] **Provjeriti de minimis kvotu** subjekta: zbroj svih potpora male
      vrijednosti u tekućoj i prethodne dvije fiskalne godine mora ostati ispod
      300.000 €. Ako ne — prijava otpada bez obzira na bodove.
- [ ] **Provjeriti dvostruko financiranje**: nijedan od dva projekta ne smije
      biti već financiran iz državnog, EU ili gradskog proračuna.
- [ ] **Pitati Grad kojim se kanalom predaje** — `otvoreni.podaci@zagreb.hr`.
      Tekst poziva kaže e-Pisarnica + NIAS, priložene upute su za SOM Natječaj.
      Poslati kratko pitanje, odgovor sačuvati.
- [ ] **Aktivirati NIAS** za osobu ovlaštenu za zastupanje (ako ide e-Pisarnica).
      Ovo zna trajati — ne ostavljati za 15.9.

---

## 2. Vanjske potvrde — pravi kritični put (ovaj tjedan)

Sve „ne starije od 30 dana od objave Javnog poziva". **Objava je 1.9.2026.**,
dakle ne smiju biti izdane prije 2.8.2026. Naručiti sve odjednom.

- [ ] **BON-1** (FINA) — ili potvrda FINA-e o razlozima neizdavanja
- [ ] **BON-2** (FINA)
- [ ] **Potvrda GSKG d.o.o.** o nepostojanju duga prema Gradu Zagrebu — **original**
- [ ] **Potvrda Porezne uprave** o stanju duga (porez + MIO/ZO) — **original**
- [ ] **Aktualni izvadak iz registra** (sudski / obrtni / registar udruga)

> Bez ijednog od ovih prijava se ne razmatra, a **naknadna dopuna nije moguća**.

---

## 3. Obrasci i izjave (do ~12.9.)

Prilozi 2.–7. postoje samo unutar skeniranog `dokumenti/program-potpore-2026-2027.pdf`
— treba ih pretipkati. Tekstualne verzije istih obrazaca iz 2024. su u
`dokumenti/referenca-program-otvoreni-podaci-2024.txt` i strukturno su gotovo
identične; poslužiti se njima kao predloškom, ali **provjeriti razlike prema
verziji 2026.**

- [ ] Obrazac 1. — Prijava za dodjelu potpore (Prilog 2.) — **jedan primjerak**
- [ ] Obrazac 2.1. — osnovni podaci o prijavitelju (Prilog 3.) — **jedan primjerak**
- [ ] Obrazac 2.2. — osnovni podaci o projektu (Prilog 3.) — **po jedan za svaki projekt**
- [ ] Obrazac 3. — financijski plan (Prilog 4.) — **po jedan za svaki projekt**, bez PDV-a
- [ ] Izjava o nefinanciranju iz drugih proračuna (Prilog 5.)
- [ ] Izjava o nepostojanju likvidacije/stečaja i duga prema zaposlenicima (Prilog 6.)
- [ ] Izjava o svim de minimis potporama (Prilozi 7.a i 7.b)
- [ ] Izjava o nekažnjavanju subjekta i osobe ovlaštene za zastupanje

Sve potpisati i ovjeriti, na hrvatskom, popunjeno na računalu.

---

## 4. Pisani prijedlog projekta u Word obliku (do ~14.9.)

Poziv izrijekom traži: popis funkcionalnosti, potencijalni profil korisnika, tip
rješenja, obrazloženje interesa za Grad Zagreb, **popis otvorenih podataka koji
bi se koristili**. Po jedan dokument za svaki projekt.

### Projekt A — „Anatomija Zagreba" (20.000 €)

- [ ] Popis funkcionalnosti (6 isporuka iz `prijedlog-projekta.md` §2/A)
- [ ] Profil korisnika: građani, vijeća gradskih četvrti, škole, novinari, gradska uprava
- [ ] Tip rješenja: programska aplikacija + mrežna stranica
- [ ] Obrazloženje interesa za Grad: dijagnostika mreže gradskih usluga po MO
- [ ] **Popis otvorenih podataka** — izvoz iz `apps/data-pipeline/data/zg_provenance.json`
      (33 skupa s URL-om, licencom i datumom) + planirano proširenje na ~108
- [ ] Poveznice na već napravljeno: gis.domovina.ai, javni repozitorij, obje licence
- [ ] Priznati ograničenje: nema stanovništva po četvrti → pokazatelji nisu *per capita*

### Projekt B — „Termometar otvorenih podataka" (8.000 €)

- [ ] Popis funkcionalnosti (5 isporuka iz `prijedlog-projekta.md` §2/B)
- [ ] Profil korisnika: Grad Zagreb, budući prijavitelji na ovaj natječaj, novinari
- [ ] Tip rješenja: istraživanje + programska aplikacija
- [ ] Obrazloženje interesa za Grad: Grad ulaže 150.000 €/god. u korištenje
      podataka, a nema mjerenje njihove upotrebljivosti
- [ ] **Nalazi kao prilog** — `apps/data-pipeline/outputs/zg_portal_izvjestaj.md`:
      99/199 skupova starije od 2 godine, `hhttps://` u vjerskim zajednicama,
      GeoJSON koji je fgdb, CSV koji je XLSX, dvostruko objavljena kultura,
      zamijenjeni stupci u spremnicima
- [ ] Obrazložiti zašto se traži 8.000 a ne 20.000 (jezgra već radi)

---

## 5. Uskladiti kod s prijavom (kad je prijavitelj poznat)

- [ ] `LICENSE` — nositelj autorskog prava na pravni subjekt koji prijavljuje
      (sada stoji „Matija Stepanić")
- [ ] README repozitorija — dodati odjeljak s poveznicom na natječaj i licence,
      da recenzent na `github.com/domovinatv/karta-hrvatske` odmah vidi dokaz
      za kriterij open-source
- [ ] Provjeriti da je sloj „Zagreb — otvoreni podaci" **na produkciji**
      (`npm run deploy`) — prijava linka živu stranicu, ne lokalni dev

---

## 6. Predaja (15.9., ne 16.9.)

- [ ] Složiti sve u traženom redoslijedu iz točke 4. Javnog poziva (14 stavki)
- [ ] Provjeriti da svaki projekt ima svoj Obrazac 2.2. i svoj Obrazac 3.
- [ ] Predati kroz kanal potvrđen u koraku 1
- [ ] Spremiti potvrdu o predaji u `docs/natjecaj-otvoreni-podaci-zg-2026/`

> Ostavljen je jedan dan zalihe namjerno. Rok je 16.9. u 23:59, ali sustav koji
> se prvi put koristi na dan roka je poznat način da se rok promaši.

---

## Nakon predaje

- [ ] Rezultati se objavljuju na zagreb.hr u roku 8 dana od zaključka o odabiru
- [ ] Pravo prigovora: 8 dana od objave, gradonačelniku preko Gradskog ureda za
      digitalizaciju, nove tehnologije i tehničke poslove
