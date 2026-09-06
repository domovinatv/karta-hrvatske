# Prijedlog projekata za prijavu

Uz [činjenični dosje natječaja](./README.md). Rok **16.9.2026. u 23:59**,
5.000–20.000 € po projektu, subjekt smije prijaviti više projekata.

---

## 1. Što je u međuvremenu napravljeno u codebaseu

Prije prijedloga — polazište više nije opis nego kod. Napravljeno 6.9.2026.,
commitovi `4fde011` i `eb8f388`:

| Što | Gdje | Stanje |
|---|---|---|
| Harvester zagrebačkog CKAN-a | `apps/data-pipeline/scripts/31_fetch_zg_open_data.py` | 33 skupa, **5354 točke**, 33/33 uspješno |
| Kurirani manifest skupova | `apps/data-pipeline/data/zg_open_data_manifest.json` | shema po skupu, obrazloženja uz iznimke |
| Normalizirani izlaz | `data/zg_gradski_sadrzaji.geojson` | jedna shema, provenance po skupu |
| Pokazatelji po četvrti | `data/zg_cetvrti_pokazatelji.json` | 17 GČ × kategorija |
| Nadzor portala | `scripts/32_zg_portal_report.py` → `outputs/zg_portal_izvjestaj.md` | svih 199 skupova |
| Sloj na karti | `apps/karta-web/src/hooks/useZagrebLayer.ts` + grupa „Zagreb — otvoreni podaci" | 6 prekidača, popup s poveznicom na izvorni skup |
| E2e pokrivenost | `e2e/smoke.spec.ts` | 24/24 prolazi |
| Licence | `LICENSE` (MIT), `LICENSE-PODACI.md` (CC BY 4.0 / ODbL) | repozitorij dosad nije imao nijednu |

To izravno pokriva tri kriterija koja se inače dokazuju obećanjem: **tehnička
izvedivost**, **kapacitet prijavitelja** i **open-source licenca**.

### Što je pritom pronađeno u samim podacima

Ovo nisu ilustracije nego nalazi koje reproducira `32_zg_portal_report.py`:

- **99 od 199 skupova (50 %) nije dirano preko dvije godine**; samo 14 u zadnja
  tri mjeseca. Većina `geoportal-*` skupova stoji na veljači 2024.
- `geoportal-vjerske-zajednice` — URL resursa počinje s **`hhttps://`**. Jedan
  znak, resurs je nedostupan, i nitko to nije primijetio.
- `geoportal-djecji-vrtici` — resurs deklariran kao GeoJSON pokazuje na
  `format=fgdb`. Tko vjeruje katalogu, dobije ZIP i pad parsera.
- `proracun-grada-zagreba-2026` — resurs deklariran kao CSV, posluženo XLSX.
- `geoportal-kulturne-ustanove` i `geoportal-kultura` su **isti ArcGIS izvor pod
  dva imena**; ZET, HŽ i područni odsjeci postoje kao stara kopija iz 2024. i
  novi resurs iz 2026., pod gotovo istim naslovom, bez ikakve naznake koji je
  koji.
- `geoportal_podzemni_spremnik` i `polupodzemni_spremnik` — **istoimeni stupci
  imaju zamijenjeno značenje**: kod prvog je `JMS_IME` mjesni odbor a `JMS_IME_1`
  četvrt, kod drugog obrnuto.
- Pet zapisa gdje se **atribut i položaj stvarno ne slažu** (OŠ Ružičnjak, OGŠ
  Zajc – područni odjel Susedgrad, privatna gimnazija u Gundulićevoj, dom na
  Mlinovima 159, parkiralište MUP Heinzelova). Koje je od dvoje krivo, izvor ne
  kaže.
- 24 točke padaju izvan granica Grada Zagreba i **to nije greška**: ZET vozi u
  Zagrebačku županiju, HŽ stajalište Velika Gorica je u Velikoj Gorici,
  knjižnica u Zaprešiću je u Zaprešiću. Skupovi Grada Zagreba nisu ograničeni
  na Grad Zagreb, a nigdje ne piše da nisu.
- **Stanovništvo po gradskoj četvrti postoji, ali je iz 2011.** Skup
  `mjesni-odbori` nosi stupac *Broj stanovnika* po mjesnom odboru, koji se
  zbraja na gradsku četvrt — pa pokazatelji *po stanovniku* jesu izvedivi.
  Ali zbroj tog stupca je **790.017**, točno popis 2011. za Grad Zagreb
  (popis 2021: 767.131), a skup nigdje ne navodi na koju se godinu odnosi.
  Tko ga uzme zdravo za gotovo, računa po petnaest godina starom nazivniku.
  *(Ispravak izvorne tvrdnje iz ovog dokumenta da takvog skupa nema —
  provjereno 6.9.2026., v. [Projekt C](./projekt-c-mjesni-odbori.md).)*

Ovo je materijal za prijavu: pokazuje da je posao već započet, i pokazuje da
prijavitelj zna gdje su granice izvora.

---

## 2. Prijava: dva projekta ovdje, treći u sestrinskom repozitoriju

Ovaj dokument razrađuje **A** i **B**. Treći projekt — [**C — „Zagreb po
mjesnim odborima"**](./projekt-c-mjesni-odbori.md), 12.000 € — stoji na
kodu iz `izbori.domovina.ai` i spaja DIP arhivu s registrom mjesne samouprave
Grada Zagreba. Ne preklapa se ni s A ni s B: A koristi geoprostorne skupove
Grada, B mjeri sam portal, C spaja izborne rezultate s gradskom geografijom.

Preporuka je prijaviti **dva projekta**, ne jedan. Obrasci 1. i 2.1. predaju se
jednom bez obzira na broj projekata; svaki projekt dodatno traži samo Obrazac
2.2. i vlastiti financijski plan. Marginalni trošak druge prijave je nekoliko
sati, a projekti se međusobno ne isključuju: jedan je za građane, drugi za
gradsku upravu.

U 2024. financirano je 14 projekata s ukupno 296.685 € pri stropu od 30.000 €.
Ove godine je pot 150.000 € pri stropu od 20.000 € — dakle prostor za otprilike
8–15 projekata. Dvije prijave iz istog subjekta nisu zabranjene ni jednom
odredbom Programa.

---

### Projekt A — „Anatomija Zagreba" · **20.000 €**

**Vrsta (Obrazac 2.2.):** programska aplikacija + mrežna stranica

Gradski modul karte gis.domovina.ai koji zagrebački katalog pretvara u
održavan javni sloj, i iz njega računa ono što se ni iz jednog pojedinačnog
skupa ne vidi.

**Što se isporučuje**

1. **Proširenje harvestera s 33 na svih ~108 geoprostornih skupova**, uključujući
   poligonske (planirana namjena, pješačka zona, evakuacijske površine,
   topografska osnova, ZG3D po četvrtima). Nightly osvježavanje na GitHub
   Actions; kad se skup na portalu promijeni, sloj se osvježi sam.
2. **Profil kvarta** — javna stranica za svaku od 17 gradskih četvrti i 218
   mjesnih odbora: koliko čega ima, gdje je najbliže, po čemu kvart odstupa od
   gradskog prosjeka. Geometrija već postoji (`hr_kvartovi.geojson`), brojevi
   po četvrti već se računaju (`zg_cetvrti_pokazatelji.json`).
3. **Pješačka dostupnost, ne zračna linija.** Za svaku točku grada vrijeme hoda
   do najbližeg vrtića, škole, ljekarne, igrališta i stajališta ZET-a — mjereno
   po uličnoj mreži. Iz toga **karta manjka**: gdje u Zagrebu nema koje od tih
   usluga unutar 15 minuta hoda. To je rezultat koji nastaje tek presjekom
   desetak skupova i nijedan od njih ga sam ne sadrži.
4. **Pristupačnost kao vlastiti pogled.** Skupovi ZET-a i HŽ-a nose atribute
   koje gotovo nitko ne koristi — `PristupRampa`, `TaktilnaCrta`,
   `StajalisteURazini`, `UzdignutaPloha`, `Nadstresnica`. Već su u popupu; ovdje
   postaju sloj: koja stajališta jesu, a koja nisu pristupačna, i što to znači
   za put do najbliže škole, doma zdravlja ili ustanove socijalne skrbi.
5. **Plakat za svaku gradsku četvrt** kroz postojeći generator (18 plakata već
   radi, `zagreb` među njima) — besplatno za preuzimanje pod CC BY 4.0, za
   vijeća gradskih četvrti, škole i knjižnice.
6. **Izvedeni skupovi vraćeni u ekosustav** — normalizirani slojevi i pokazatelji
   po kvartu objavljeni kao GeoJSON/CSV i ponuđeni Gradu za `data.zagreb.hr`.

**Zašto je od interesa za Grad Zagreb:** rezultat je istovremeno usluga
građanima i dijagnostika gradskih usluga — pokazuje gdje mreža vrtića, ljekarni
i igrališta ima rupu, na razini mjesnog odbora, s poveznicom na službeni izvor
za svaki broj.

**Rizik koji treba priznati u prijavi:** bez podatka o stanovništvu po četvrti
pokazatelji ostaju apsolutni, ne *per capita*. Projekt to rješava tako da
zatraži podatak od Grada i, dok ga nema, računa i objavljuje po površini i po
dostupnosti — a rupu prijavi kao nalaz.

| Kategorija (Obrazac 3.) | Iznos |
|---|---:|
| 1. Troškovi zaposlenih | 11.000 € |
| 2. Vanjski suradnici (kartografski dizajn, lektura, urbanistička recenzija pokazatelja) | 5.500 € |
| 3. Promidžba (objava, tiskani plakati za vijeća GČ i škole) | 1.500 € |
| 4. Licence i nematerijalna imovina (routing engine, tile hosting, geokodiranje) | 1.000 € |
| 5. Oprema | 1.000 € |
| **Ukupno (bez PDV-a)** | **20.000 €** |

---

### Projekt B — „Termometar otvorenih podataka Grada Zagreba" · **8.000 €**

**Vrsta (Obrazac 2.2.):** istraživanje + programska aplikacija

Dnevni automatski nadzor svih 199 skupova na `data.zagreb.hr` i javna nadzorna
ploča. Ne koristi podatke *o gradu* nego mjeri *sam portal*.

**Što se isporučuje**

1. **Dnevni nadzor** svake objave: svježina, dostupnost svakog resursa,
   poklapa li se deklarirani format sa stvarno posluženim, ima li skup licencu,
   je li se shema promijenila od jučer.
2. **Javna nadzorna ploča** — koji su skupovi živi, koji su zamrznuti, koji su
   pokvareni, tko ih objavljuje. Povijest po skupu, da se vidi trend.
3. **Strojno čitljiv feed** (`JSON`) koji drugi korisnici portala mogu
   konzumirati prije nego što napišu vlastiti parser.
4. **Tromjesečno izvješće Gradu** s popisom konkretnih kvarova i prijedlogom
   ispravaka — počevši od onih koji su već nađeni (`hhttps://`, GeoJSON koji je
   fgdb, CSV koji je XLSX, dvostruko objavljena kultura, zamijenjeni stupci u
   spremnicima).
5. **Otvoreni kod harvestera** koji sve to radi — svaki sljedeći prijavitelj na
   ovaj natječaj počinje od radnog klijenta umjesto od nule.

**Zašto je od interesa za Grad Zagreb:** Grad godišnje ulaže 150.000 € u
projekte koji koriste otvorene podatke, a nema mjerenje koliko su ti podaci
upotrebljivi. Polovica kataloga stoji dvije godine, a neispravni resursi se
otkrivaju tek kad netko na njih naleti. Ovo je jedini projekt u nizu koji
poboljšava *ulaz*, a ne samo *izlaz*.

**Zašto je jeftin:** jezgra već radi (`32_zg_portal_report.py`) i nalazi iz
ovog dokumenta su njezin izlaz. Traži se 8.000 €, ne strop — a iz liste za
2024. vidi se da bodovi ne prate cijenu: projekt s rangom 1 tražio je 14.963 €,
najmanje od svih 14.

| Kategorija (Obrazac 3.) | Iznos |
|---|---:|
| 1. Troškovi zaposlenih | 5.500 € |
| 2. Vanjski suradnici (dizajn nadzorne ploče) | 1.200 € |
| 3. Promidžba (objava izvješća) | 500 € |
| 4. Licence i nematerijalna imovina (hosting, monitoring) | 800 € |
| **Ukupno (bez PDV-a)** | **8.000 €** |

---

## 3. Kako se prijave preslikavaju na bodovnu listu

Bodovna usporedba za Projekt C je u [njegovom dokumentu](./projekt-c-mjesni-odbori.md#6-kako-se-preslikava-na-bodovnu-listu).

| Kriterij | Bod. | Projekt A | Projekt B |
|---|---:|---|---|
| Prethodno iskustvo | 10 | gis.domovina.ai u produkciji, 32 koraka pipelinea, tematski repozitoriji | isto |
| Kapacitet | 10 | deploy lanac, 24 e2e testa, radni sloj prije prijave | jezgra već radi |
| Tehnička izvedivost | 10 | harvester i sloj su gotovi i commitani | izvještaj se već generira |
| **Društvena korist** | **30** | karta manjka vrtića/ljekarni/igrališta po kvartu; pristupačnost stajališta | bolji podaci za sve buduće korisnike portala |
| **Inovativnost** | **20** | presjek stotinjak skupova, pješačka a ne zračna udaljenost | nitko ne mjeri sam portal |
| **Open source** | **10** | javni repozitorij od 20.5.2026., MIT + CC BY 4.0, skupovi vraćeni Gradu | isto |
| Kvaliteta fin. plana | 10 | razrađen po pet kategorija, bez PDV-a | traži se manje od stropa, obrazloženo |

---

## 4. Što još treba odlučiti — i to nije kod

1. **Koji subjekt prijavljuje.** Poziv traži d.o.o., j.d.o.o., obrt, udrugu,
   umjetničku organizaciju ili zadrugu — pravnu osobu s OIB-om, IBAN-om,
   registarskim izvatkom, BON-1 i BON-2. Fizička osoba ne može. O tome ovisi i
   ime u `LICENSE` (sada stoji „Matija Stepanić" — ako prijavljuje tvrtka,
   nositelj autorskog prava trebao bi biti ona).
2. **Kriterij open-source je pokriven.** `github.com/domovinatv/karta-hrvatske`
   javan je od 20.5.2026., a od 6.9.2026. ima i `LICENSE` (MIT) i
   `LICENSE-PODACI.md` (CC BY 4.0). U prijavi se navodi izravna poveznica na
   repozitorij i na obje licence — to je cijelih 10 bodova, bez daljnjeg posla.
   Ostaje samo uskladiti nositelja autorskog prava u `LICENSE` s prijaviteljem
   (v. točka 1).
3. **Preklapanje s drugim financiranjem.** Isti projekt ne smije biti financiran
   iz drugog izvora; potpisuje se izjava (Prilog 5.).
4. **Zagreb kao izlog, ne kao izuzetak.** Karta je nacionalna, a poziv financira
   samo zagrebački dio. Rješava se time što je harvester generički — isti kod
   poslije radi za Split, Rijeku i Osijek — pa je Zagreb referentna
   implementacija, a ne jednokratni posao. To je i argument „interesa za Grad".

---

## 5. Kritični put do 16.9.

Tekst projekta nije usko grlo. **Vanjske potvrde jesu.**

| Kad | Što |
|---|---|
| odmah | naručiti **BON-1 i BON-2** (FINA), **potvrdu GSKG-a** o nepostojanju duga prema Gradu, **potvrdu Porezne uprave** — sve „ne starije od 30 dana od objave poziva" (objava 1.9.2026.) |
| odmah | pitati `otvoreni.podaci@zagreb.hr` predaje li se prijava kroz **e-Pisarnicu (NIAS)** ili kroz **SOM Natječaj** — dokumentacija si proturječi (dosje, §4) |
| odmah | aktivirati **NIAS** račun osobe ovlaštene za zastupanje |
| do ~12.9. | pretipkati Priloge 2.–7. iz skeniranog PDF-a (tekstualne verzije iz 2024. su u `dokumenti/referenca-program-otvoreni-podaci-2024.txt` i strukturno su gotovo iste) |
| do ~14.9. | **pisani prijedlog projekta u Word obliku** za svaki projekt — popis funkcionalnosti, profil korisnika, tip rješenja, obrazloženje interesa za Grad Zagreb i **poimenični popis otvorenih podataka** (izvoz iz `podaci/ckan-inventar.csv`, a za Projekt A doslovno iz `apps/data-pipeline/data/zg_provenance.json`) |
| 15.9. | predaja — **naknadna dopuna nije moguća** |
