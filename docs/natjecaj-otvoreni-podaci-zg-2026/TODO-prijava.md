# TODO — prijava do 16.9.2026. u 23:59

Radna lista. Poredak je po ovisnostima, ne po važnosti: sve u koraku 1 blokira
sve ostalo, a ništa iz koraka 4 ne može početi prije nego je poznat prijavitelj.
Prijavljuju se **tri projekta** — A i B iz ovog repozitorija, C iz
`izbori.domovina.ai`.

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
- [ ] **Provjeriti dvostruko financiranje**: nijedan od tri projekta ne smije
      biti već financiran iz državnog, EU ili gradskog proračuna.
- [x] **Kanal predaje utvrđen 7.9.2026.** — prijava se predaje kroz **SOM
      Natječaj**, `https://natjecaji.zagreb.hr`, javni poziv **40**, forma
      `/applicant/tenders/40/bid-create`. Matija je registriran i prijavljen,
      forma se otvara i radi. Tekst poziva i dalje spominje e-Pisarnicu —
      kontradikcija ostaje, ali praksa je jasna.
- [ ] **Poslati mail Gradu** (`otvoreni.podaci@zagreb.hr`) s dva pitanja:
      (1) potvrda da je SOM jedini kanal, (2) **dinamika isplate** — doznačuje
      li se potpora unaprijed pa pravda, ili je refundacija po utrošku.
      Drugo pitanje je bitno jer o njemu ovisi treba li predfinancirati projekt.

---

## 2. Vanjske potvrde — pravi kritični put (ovaj tjedan)

Sve „ne starije od 30 dana od objave Javnog poziva". **Objava je 1.9.2026.**,
dakle ne smiju biti izdane prije 2.8.2026. Naručiti sve odjednom.

- [ ] **BON-1** (FINA) — poslovnica 38,75 €, online kroz WEB BON / Info.BIZ
      28,94 €, ili mail na `bonplus@fina.hr`; ako nema predan GFI, FINA izdaje
      „Potvrdu o razlozima neizdavanja" (10,75 €) i poziv je prihvaća
- [ ] **BON-2** (FINA, isti obrazac „Zahtjev za izdavanje informacije o
      bonitetu/solventnosti", ili banka kao SOL-2)
- [ ] **Potvrda GSKG d.o.o.** o nepostojanju duga prema Gradu Zagrebu —
      GSKG, Savska cesta 1, centrala 01/4565-811. **Treba je i onaj tko nije
      obveznik plaćanja** — tada u njoj piše da subjekt nije obveznik
- [x] **Potvrda Porezne uprave** o stanju duga — zatražena 7.9.2026. kroz
      ePorezna, svrha izdavanja „prijava na javni poziv" (šifra 58)
- [ ] **Aktualni izvadak iz registra** — za d.o.o. besplatno i odmah s
      `sudreg.pravosudje.hr`, elektronički s potpisom

> „Original" ne znači papir: točka 5. Javnog poziva prihvaća elektroničke isprave
> koje sadrže podatke za provjeru vjerodostojnosti.

> Bez ijednog od ovih prijava se ne razmatra, a **naknadna dopuna nije moguća**.

---

## 3. Obrasci i izjave (do ~12.9.)

**Pretipkavanje otpada.** Svi obrasci su preuzeti kao izvorni `.docx` s prijavne
forme SOM-a i stoje u `obrasci/` (uz `.txt` ekstrakt svakoga). Popunjava se
izravno u Wordu.

Dvije stvari koje su obrasci otkrili, a tekst poziva ne kaže:
- **Obrazac 2.2. je bodovna lista** — polja 2.2.5, 2.2.7, 2.2.8, 2.2.9 i 2.2.10
  su doslovno kriteriji iz Priloga 1. Ta četiri opisna polja nose 70 od 100
  bodova; pisati ih kao odgovore na kriterij, ne kao opći opis.
- **Promidžba mora biti ≥ 5 % odobrenih sredstava** (napomena u Obrascu 3.).
  Provjeriti: A 1.500/20.000 = 7,5 % ✓, B 500/8.000 = 6,25 % ✓,
  C 700/12.000 = 5,8 % — na rubu, **podići na 800 €**.

- [ ] Obrazac 1. — Prijava za dodjelu potpore (Prilog 2.) — **jedan primjerak**
- [ ] Obrazac 2.1. — osnovni podaci o prijavitelju (Prilog 3.) — **jedan primjerak**
- [ ] Obrazac 2.2. — osnovni podaci o projektu (Prilog 3.) — **po jedan za svaki projekt**
- [ ] Obrazac 3. — financijski plan (Prilog 4.) — **po jedan za svaki projekt**, bez PDV-a
      (promidžba ≥ 5 %; ukupno mora ostati u rasponu 5.000–20.000 €, inače je
      prijava odbačena po točki 7.)
- [ ] Izjava o nefinanciranju iz drugih proračuna (Prilog 5.)
- [ ] Izjava o nepostojanju likvidacije/stečaja i duga prema zaposlenicima (Prilog 6.)
- [ ] Izjava o svim de minimis potporama (Prilozi 7.a i 7.b)
- [ ] Izjava o nekažnjavanju subjekta i osobe ovlaštene za zastupanje (**Prilog 8.**)

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
- [ ] Priznati ograničenje: stanovništvo po MO postoji, ali je iz popisa 2011.
      → *per capita* pokazatelji nose tu ogradu, ili se traži noviji podatak od Grada

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

### Projekt C — „Zagreb po mjesnim odborima" (12.000 €)

Razrada: [`projekt-c-mjesni-odbori.md`](./projekt-c-mjesni-odbori.md). Kod je u
sestrinskom repozitoriju `github.com/domovinatv/izbori.domovina.ai`.

- [ ] Popis funkcionalnosti (6 isporuka iz `projekt-c-mjesni-odbori.md` §3)
- [ ] Profil korisnika: vijeća mjesnih odbora i gradskih četvrti, novinari,
      istraživači, gradska uprava, stranke
- [ ] Tip rješenja: istraživanje + programska aplikacija + mrežna stranica
- [ ] Obrazloženje interesa za Grad: prva izborna statistika na razini mjesne
      samouprave, spojena sa sredstvima koja Grad dodjeljuje toj razini
- [ ] **Popis otvorenih podataka** — `mjesni-odbori`,
      `geoportal-mjesna-samouprava`, `clanovi-vijeca-mjesnih-odbora`,
      `clanovi-vijeca-gradskih-cetvrti`, `predsjednici-*`,
      `gradska-skupstina-grada-zagreba`, `sredstva-mjesne-samouprave-2001-2023`,
      `raspodjela-sredstava-ms-2023` (URL-ovi u
      `sifarnici/zagreb_mjesna_samouprava.json` i `podaci/ckan-inventar.csv`)
- [ ] **Kontrolna tablica kao prilog** — `data/zagreb/izvjestaj.md`:
      218/218 imena, 13/15 utrka na birača točno protiv službenog agregata
- [ ] Priznati ograničenja: stanovništvo po MO iz 2011., dva ciklusa na 99,4 %
      pokrivenosti, MO od 56 do 12.249 birača
- [ ] Razgraničiti prema Gongovom „Parlametru Zagreb" (financiran 2024.)

---

## 5. Uskladiti kod s prijavom (kad je prijavitelj poznat)

- [ ] `LICENSE` — nositelj autorskog prava na pravni subjekt koji prijavljuje
      (sada stoji „Matija Stepanić") — **u oba repozitorija**, `karta-hrvatske`
      i `izbori.domovina.ai`
- [ ] README repozitorija — dodati odjeljak s poveznicom na natječaj i licence,
      da recenzent na `github.com/domovinatv/karta-hrvatske` odmah vidi dokaz
      za kriterij open-source
- [ ] Provjeriti da je sloj „Zagreb — otvoreni podaci" **na produkciji**
      (`npm run deploy`) — prijava linka živu stranicu, ne lokalni dev
- [ ] Za projekt C: `python3 scripts/build_index.py` u `izbori.domovina.ai`
      (novopreuzeta zagrebačka biračka mjesta 2024./2025. još nisu u indeksu)
- [ ] Za projekt C: ponuditi izvedeni skup Gradu za `data.zagreb.hr`

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
