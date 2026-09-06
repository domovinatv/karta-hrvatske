# Projekt C — „Zagreb po mjesnim odborima"

Uz [činjenični dosje natječaja](./README.md) i [prijedlog projekata A i B](./prijedlog-projekta.md).
Rok **16.9.2026. u 23:59**, 5.000–20.000 € po projektu, subjekt smije prijaviti
više projekata.

**Traženi iznos: 12.000 €. Vrsta (Obrazac 2.2.): istraživanje + programska
aplikacija + mrežna stranica.**

Kod i podaci nisu u ovom repozitoriju nego u
[`izbori.domovina.ai`](https://github.com/domovinatv/izbori.domovina.ai)
(javan, MIT + CC BY 4.0 od 6.9.2026.).

---

## 1. Nalaz na kojem projekt stoji

Državno izborno povjerenstvo objavljuje rezultate do razine biračkog mjesta.
Biračko mjesto nema adresu ni koordinatu — ima samo naziv. **Za Grad Zagreb taj
naziv nije naziv škole ni ulice: to je naziv mjesnog odbora.**

Zbog toga se rezultati svih izbora u Zagrebu mogu agregirati na **218 mjesnih
odbora i 17 gradskih četvrti** — razinu koju ne objavljuje ni DIP ni Grad, na
poligonima koje Grad objavljuje pod Otvorenom dozvolom.

Provjereno 6.9.2026. na tri neovisna izvora:

| Izvor | Zapisa | Poklapanje |
|---|---:|---|
| `bmNaziv` u DIP arhivi, Zagreb, svih 15 utrka 2013.–2025. | 218 različitih imena | — |
| `mjesni-odbori` (data.zagreb.hr, CSV) | 218 MO | **218/218** uz 3 ispravke imena |
| `geoportal-mjesna-samouprava` (data.zagreb.hr, GeoJSON) | 218 poligona | **218/218** uz 2 ispravke imena |

Spoj radi za **svaki mirroran ciklus**: predsjednički 2019. i 2024. (oba kruga),
saborski 2020. i 2024., europski 2019. i 2024., lokalni 2021. i 2025. (gradska
skupština i gradonačelnik, oba kruga) te referendum 2013.

Reproducira se s dvije naredbe:

```bash
python3 scripts/export_zagreb_mo.py --check   # 218/218 imena, izlazi 0
python3 scripts/export_zagreb_mo.py           # CSV, GeoJSON i izvještaj
```

### Kontrola: zbroj biračkih mjesta protiv službenog agregata

Nije dovoljno da se imena poklope — zbroj mora dati službeni gradski rezultat.
Daje, u 13 od 15 utrka na birača točno:

| Ciklus | Utrka | Birači (zbroj BM) | Birači (službeni agregat) | Pokrivenost |
|---|---|---:|---:|---:|
| parlament-2024 | sabor | 652.313 | 652.313 | 100,00 % |
| lokalni-2025 | gradska skupština | 667.789 | 667.789 | 100,00 % |
| lokalni-2021 | gradska skupština | 693.670 | 693.670 | 100,00 % |
| referendum-2013 | referendum | 686.646 | 686.646 | 100,00 % |
| predsjednik-2024 | predsjednik, k1 | 661.092 | 664.909 | 99,43 % |
| euparlament-2024 | europski parlament | 664.362 | 667.747 | 99,49 % |

Manjak u dva ciklusa nije greška spoja: DIP prijavi više biračkih mjesta nego
što ih objavi kao datoteku (404 na strani servera). Puna tablica svih 15 utrka
je u `data/zagreb/izvjestaj.md`, generira se sama i mora ići uz svaku objavu.

### Što se odmah vidi u brojkama

Odaziv (parlament 2024., Zagreb 67,87 %):

- po gradskoj četvrti raspon je **62,23 % (Sesvete) → 72,20 % (Maksimir)**
- po mjesnom odboru, među onima s najmanje 1.000 birača, **48,3 % (Kozari
  Putevi) → 75,2 % (Cvjetnica)** — gotovo 27 postotnih bodova unutar istog grada
- Kozari Putevi su najniži odaziv u **11 od 15 utrka** 2013.–2025. (među MO-ovima
  s najmanje 1.000 birača), a ni u preostale četiri nisu lošiji od četvrtog s
  dna. To nije slučajnost jednih izbora nego trajno stanje jednog dijela
  Peščenice

Razlika u mobilizaciji između izbora, po mjesnom odboru, ide do 55 postotnih
bodova: Glavničica je na saborskim 2024. imala 68,1 %, na europskim iste godine
12,7 %.

Rezultat po strankama isto se raslojava: na izborima za Gradsku skupštinu 2025.
lista nositelja Tomislava Tomaševića ide od 7,3 % (Resnik) do 61,7 %
(Samoborček) — raspon od 54 postotna boda između dva mjesna odbora istoga grada.

### Nalazi o samim gradskim podacima (materijal i za Projekt B)

1. **Isti mjesni odbor ima dva različita imena u dva gradska skupa.** U skupu
   `mjesni-odbori` zove se **Oton Župančič**, u `geoportal-mjesna-samouprava`
   **Janko Matko**. Ista adresa sjedišta (Ul. Franje Horvata Kiša 12,
   Peščenica – Žitnjak), dakle isto tijelo. Tko spaja ta dva skupa po imenu,
   tiho gubi jedan mjesni odbor.
2. **Broj stanovnika u skupu `mjesni-odbori` je iz 2011.** Zbroj stupca je
   **790.017**, što je točno popis stanovništva 2011. za Grad Zagreb; popis
   2021. daje 767.131. Skup nigdje ne navodi na koju se godinu odnosi.
3. Manje razlike u pisanju: geoportal ima „Sasinovec Šija Vrh" gdje druga dva
   izvora imaju „Sasinovec"; DIP ima „Vugrovec" za „Vugrovec Donji" i „Donja
   Kustošija" za MO koji Grad zove „Matija Gubec".

Svaka od te tri ispravke i obrazloženje kako je uparena je u
`sifarnici/zagreb_mjesna_samouprava.json` — ne u kodu, nego kao podatak koji se
može osporiti.

> Točka 2. ispravlja tvrdnju iz [prijedloga A/B](./prijedlog-projekta.md) da
> „portal nema nijedan skup sa stanovništvom po gradskoj četvrti". Ima ga, po
> mjesnom odboru, i zbraja se na četvrt — ali je star petnaest godina.

---

## 2. Što je već napravljeno (prije prijave, ne obećanje)

Napravljeno 6.9.2026. u repozitoriju `izbori.domovina.ai`:

| Što | Gdje | Stanje |
|---|---|---|
| Spoj DIP ↔ mjesna samouprava | `scripts/export_zagreb_mo.py` | 15 utrka, 218/218 MO, `--check` prolazi |
| Konfiguracija i ispravke imena | `sifarnici/zagreb_mjesna_samouprava.json` | s obrazloženjem po uparivanju i URL-ovima izvora |
| Popravak mirrora za Zagreb | `scripts/mirror.py` | zagrebačka biračka mjesta za cikluse 2024./2025. dosad nisu bila preuzeta |
| Izlazi | `data/zagreb/` | `zagreb_mo_odaziv.csv`, `zagreb_gc_odaziv.csv`, `zagreb_mo_liste.csv` (37.872 retka), `zagreb_mo.geojson` (218 poligona) |
| Kontrola protiv službenog agregata | `data/zagreb/izvjestaj.md` | 13/15 utrka na birača točno |
| Licence | `LICENSE` (MIT), `LICENSE-PODACI.md` (CC BY 4.0) | repozitorij dosad nije imao nijednu |
| Izborni simulator | `web/lib/sim/`, `web/lib/sim/verify.mjs` | 109 provjera; reproducira službenu raspodjelu mandata 2024. i 2020. mandat za mandat |

To pokriva tri kriterija koja se inače dokazuju obećanjem — **tehničku
izvedivost**, **kapacitet prijavitelja** i **open-source licencu**.

---

## 3. Što se isporučuje

1. **Izvedeni skup „Izbori u Zagrebu po mjesnoj samoupravi", 2013.–2025.**
   Rezultati i odaziv po 218 MO i 17 GČ za svih 15 utrka, kao CSV i GeoJSON,
   pod CC BY 4.0, s kontrolnom tablicom pokrivenosti uz svaku objavu i
   provenance po zapisu. Ponuđen Gradu za `data.zagreb.hr` — to je **novi skup
   na portalu**, ne samo prikaz tuđih podataka.
2. **Karta i profil mjesnog odbora.** Stranica po svakom MO i svakoj GČ: tko je
   koliko dobio, kako se odaziv mijenjao kroz šest ciklusa, koliko MO odstupa
   od svoje četvrti i od grada. Poligoni su gradski, imena su gradska.
3. **Pogled „mobilizacija".** Ista razlika koja se sad vidi samo na razini grada
   — 67,9 % na saborskim, 24,4 % na europskim 2024. — razložena po mjesnom
   odboru. Gdje razlika iznosi 55 postotnih bodova, a gdje 25.
4. **Spoj s tijelima mjesne samouprave.** `clanovi-vijeca-mjesnih-odbora`,
   `clanovi-vijeca-gradskih-cetvrti`, `predsjednici-*` i
   `gradska-skupstina-grada-zagreba`: uz izborni rezultat po MO stoji tko u tom
   MO stvarno sjedi u vijeću i koliko je vijeće veliko.
5. **Spoj sa sredstvima.** `sredstva-mjesne-samouprave-2001-2024` i
   `raspodjela-sredstava-ms-2023`: koliko novca ide po mjesnom odboru, po
   stanovniku i po biraču, i kako to stoji prema odazivu. Fiskalni dio je
   nužan — bez njega je ovo samo izborna statistika.
6. **Otvoren kod cijelog lanca**, uključujući tablicu ispravaka imena. Tko god
   idući put spaja državne rezultate s gradskom geografijom, počinje od ovoga.

**Zašto je od interesa za Grad Zagreb:** mjesna samouprava je razina na kojoj
Grad odlučuje o sredstvima i na kojoj se bira 218 vijeća, a nijedan izborni
podatak dosad nije postojao na toj razini. Rezultat je istovremeno podatak o
biračkom tijelu i dijagnostika sudjelovanja: pokazuje gdje odaziv trajno pada
ispod 50 %, u kojim mjesnim odborima i za koje izbore.

---

## 4. Rizici i granice, koje treba napisati u prijavu

- **DIP podaci nisu zagrebački otvoreni podaci.** Bez skupova Grada
  (`mjesni-odbori`, `geoportal-mjesna-samouprava`, vijeća, sredstva) projekt ne
  postoji — oni su ono što nacionalni rezultat pretvara u gradski uvid. Tako i
  treba biti formulirano, bez uljepšavanja.
- **Mjesni odbori su vrlo nejednaki**: od 56 do 12.249 birača, medijan 2.418.
  Ekstremi po postotku moraju biti filtrirani po veličini ili navedeni uz broj
  birača, inače MO od 56 birača izgleda kao gradski rekord. Skripta to već radi
  i tako izvještava.
- **Dva ciklusa nemaju 100 % biračkih mjesta** (predsjednički 2024., europski
  2024.: 99,4 %) zbog 404-ova na strani arhive. Objavljuje se s izmjerenom
  pokrivenošću, ne prešućuje se.
- **Stanovništvo po MO je iz 2011.** Pokazatelji *po stanovniku* dok je tako
  nose tu ogradu; traži se noviji podatak od Grada, a rupa se prijavljuje kao
  nalaz.
- **Granice se s vremenom mijenjaju.** Spoj je provjeren za cikluse 2013.–2025.
  na današnjem popisu mjesnih odbora; usporedbe kroz vrijeme pretpostavljaju da
  su granice MO stabilne, što za dio Sesveta treba dodatno provjeriti prije
  objave longitudinalnih tvrdnji.
- **Nazivi lista nisu nazivi stranaka.** DIP liste vodi po nositelju
  („TOMISLAV TOMAŠEVIĆ – nositelj kandidacijske liste"). Normalizacija na
  stranke i koalicije je zaseban posao i dio je troška projekta.
- **Preklapanje s Gongovim „Parlametrom Zagreb"** (financiran 2024., rang 3).
  Parlametar prati rad Gradske skupštine nakon izbora; ovo prati biračko tijelo
  prije nje, na razini na kojoj Parlametar ne radi. Razliku treba navesti
  eksplicitno jer će je Povjerenstvo tražiti.

---

## 5. Financijski plan (Obrazac 3.)

| Kategorija | Iznos | Za što |
|---|---:|---|
| 1. Troškovi zaposlenih | 6.800 € | spoj i normalizacija svih ciklusa, stranačka normalizacija, profili MO/GČ, kontrola pokrivenosti |
| 2. Vanjski suradnici | 2.700 € | kartografski dizajn, lektura, recenzija metodologije (izborna statistika) |
| 3. Promidžba | 700 € | objava skupa i izvještaja, materijal za vijeća mjesnih odbora |
| 4. Licence i nematerijalna imovina | 1.000 € | hosting, tile hosting, nadzor osvježavanja |
| 5. Oprema | 800 € | — |
| **Ukupno (bez PDV-a)** | **12.000 €** | |

Traži se manje od stropa i to je namjerno: iz liste za 2024. vidi se da bodovi
ne prate cijenu — projekt s rangom 1 tražio je 14.963 €, najmanje od svih 14.

---

## 6. Kako se preslikava na bodovnu listu

| Kriterij | Bod. | Čime se dokazuje |
|---|---:|---|
| Prethodno iskustvo | 10 | izbori.domovina.ai u produkciji, mirror devet izbornih ciklusa, izborni simulator s 109 regresijskih provjera |
| Kapacitet | 10 | spoj napravljen i provjeren **prije** prijave, s kontrolom protiv službenog agregata |
| Tehnička izvedivost | 10 | `export_zagreb_mo.py --check` prolazi 218/218; izlazi postoje |
| **Društvena korist** | **30** | prva izborna statistika na razini mjesne samouprave; odaziv, mobilizacija i sredstva po MO |
| **Inovativnost** | **20** | spoj dvaju registara koje nitko nije spojio — naziv biračkog mjesta kao ključ mjesne samouprave |
| **Open source** | **10** | javni repozitorij, MIT + CC BY 4.0, izvedeni skup ponuđen Gradu |
| Kvaliteta fin. plana | 10 | pet kategorija, bez PDV-a, ispod stropa i obrazloženo |

---

## 7. Odnos prema projektima A i B

Tri prijave, tri različita ulaza, bez preklapanja:

| | Ulazni podaci | Rezultat |
|---|---|---|
| **A — Anatomija Zagreba** | ~108 geoprostornih skupova Grada | dostupnost gradskih usluga po kvartu |
| **B — Termometar** | metapodaci portala | kvaliteta samog portala |
| **C — Mjesni odbori** | DIP arhiva × registar mjesne samouprave | izborna statistika na razini na kojoj je dosad nije bilo |

Obrasci 1. i 2.1. predaju se u jednom primjerku bez obzira na broj projekata,
a vanjske potvrde (BON-1, BON-2, GSKG, Porezna) iste su za sve tri prijave.
Marginalni trošak treće prijave je Obrazac 2.2. i financijski plan.

---

## 8. Što treba odlučiti prije predaje

1. **Nositelj autorskog prava.** `LICENSE` u `izbori.domovina.ai` sada glasi na
   „Matija Stepanić", jednako kao u `karta-hrvatske`. Ako prijavljuje pravna
   osoba, oba repozitorija treba uskladiti s prijaviteljem — isto pitanje kao
   točka 4.1 u prijedlogu A/B.
2. **Ponovni `build_index.py`.** Novopreuzeta zagrebačka biračka mjesta
   (predsjednički 2024., europski 2024., lokalni 2025.) još nisu u SQLite
   indeksu. Izvoz ih ne treba — čita JSON izravno — ali Streamlit aplikacija i
   web izvoz ih vide tek nakon rebuilda.
3. **Ponuda Gradu.** Izvedeni skup treba ponuditi na `data.zagreb.hr` prije
   predaje ili u prijavi navesti kao obvezu; to je dio argumenta „interesa za
   Grad Zagreb" i dio bodova za otvorenost.
