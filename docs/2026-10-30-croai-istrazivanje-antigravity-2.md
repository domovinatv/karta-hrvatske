# CroAI — drugi krug istraživanja, 38 preostalih (handoff za Antigravity)

Pokreće se u Antigravity CLI-ju (`agy`, Gemini 3.8 Flash) iz korijena repoa.
Prompt je ispod crte. Prvi krug: `docs/2026-10-30-croai-istrazivanje-antigravity.md`,
rezultat i stupnjevanje u `docs/2026-10-29-croai-sloj.md`, poglavlje
„Istraživanje preko Antigravityja". Stanje prije ovog kruga: 527 od 565 na karti.

Glavna promjena prema prvom krugu: svaka adresa mora doći s **doslovnim
citatom** sa stranice. Claude dohvati `izvor_url` i traži citat u tekstu; što
se ne nađe, ne ide na kartu.

---

Radiš u repou `/Volumes/DOMOVINA2TB/git/domovinatv/karta-hrvatske`.
Odgovaraj na hrvatskom.

## Zadatak

U `apps/data-pipeline/data/croai_istrazivanje2_ulaz.json` je 38 subjekata
hrvatske AI scene (imenik map.croai.org) kojima još nemamo provjerenu
lokaciju. Za svaki nađi **gdje se nalazi**, s dokazom.

Podijeli posao na **2 subagenta po 19 subjekata** (indeksi 0–18 i 19–37).
Svaki piše `apps/data-pipeline/data/croai_istrazivanje2/batch-NN.json`
(NN = 01, 02) **nakon svakog subjekta**.

## Što je bilo u prvom krugu

Svaki subjekt ima `prvi_krug` (što je tada vraćeno) i `zasto_odbijeno`:

- 27 subjekata: adresa iz prvog kruga **nije pronađena na stranici koja je
  navedena kao izvor**. Dohvaćen je HTML te stranice i u njemu nema te ulice
  i kućnog broja. Adresa možda jest točna, ali je zaključena, a ne pročitana.
  Tvoj posao je naći stranicu na kojoj **doslovno piše**, ili adresu
  zamijeniti onom koja negdje doslovno piše.
- 10 subjekata: prvi krug nije našao adresu. Većinom su to neformalne
  zajednice, studentski projekti i inicijative (Code for Croatia, IT zajednica
  Rijeka, ODOO zajednica, Crop Shepherd…).
- 1 subjekt (Zimo): adresa ne postoji na Google Mapsu u tom obliku.

## Pravila

1. **Citat je obavezan.** U `citat` prepiši točno onaj komad teksta sa
   stranice `izvor_url` u kojem stoji adresa (ulica, kućni broj, mjesto),
   bez prepravljanja, kraćenja ili prevođenja, 10–300 znakova. Citat se
   strojno traži u tekstu stranice. Ako je adresa samo na slici, u PDF-u ili
   se učitava JavaScriptom, to napiši u `napomena` i stavi `pouzdanost: "niska"`.
2. `izvor_url` mora biti stranica koja se otvara bez prijave. LinkedIn,
   Facebook i Instagram ne vrijede kao jedini izvor (iza prijave su). Dobri
   izvori: impresum, kontakt, footer, politika privatnosti, uvjeti
   korištenja, sudreg.pravosudje.hr, companywall.hr, poslovna.hr, fininfo.hr,
   najava ili vijest o događaju, stranica fakulteta, meetup.com stranica
   događaja.
3. **Događaj** (konferencija, meetup, hackathon, festival): mjesto
   **zadnjeg održanog izdanja**, s nazivom dvorane i adresom. `datum_izdanja`
   je datum tog izdanja. Najava ili vijest o tom izdanju je dobar izvor.
4. **Neformalna zajednica ili projekt bez adrese**: lokacija je mjesto gdje
   se zajednica okuplja (prostor, coworking, fakultet domaćin), ili sjedište
   organizacije koja stoji iza nje (udruga, tvrtka osnivača, inkubator).
   Ako ni to ne postoji, smije **samo grad**: `razina_lokacije: "grad"`,
   `adresa: null`, a `citat` mora pokazivati da je subjekt iz tog grada.
5. Strane adrese su u redu. Ako subjekt ima i ured u Hrvatskoj, daj hrvatski.
6. **Ne izmišljaj.** Bolje `adresa: null` s objašnjenjem u `napomena` nego
   pogođena adresa. Ne izmišljaj koordinate.
7. Ne mijenjaj druge datoteke u repou, ne pokreći skripte, ne commitaj.

## Dodatno: četiri sumnjiva OIB-a iz prvog kruga

Za ove subjekte (u ulazu ih nema, već su na karti) provjeri OIB:
Careesma (29598595344), Funderbeam (11407307685), SwipeSpec (44409125570),
Meetup Group: ML/AI Split (OIB iz prvog kruga ima lošu kontrolnu znamenku).
Prva tri su navedena kao d.o.o., ali ih nema u sudskom registru ni po OIB-u
ni po imenu. Nađi pravi pravni subjekt i OIB, ili potvrdi da ga nema. Zapiši
u `apps/data-pipeline/data/croai_istrazivanje2/oib-provjera.json`:
`[{ "ime", "oib_prvi_krug", "oib_ispravan", "pravni_naziv", "izvor_url", "citat", "napomena" }]`.

## Izlaz: `batch-NN.json`

JSON lista, jedan objekt po subjektu, istim redom kao u ulazu:

```json
{
  "croai_id": "326",
  "ime": "Data Science Conference",
  "tip": "sjediste | ured | dogadjaj | institucija | zajednica | nepoznato",
  "razina_lokacije": "adresa | grad",
  "pravni_naziv": null,
  "oib": null,
  "drzava": "HR",
  "naziv_mjesta": "Mozaik Event Centar",
  "adresa": "Slavonska avenija 6",
  "postanski_broj": "10000",
  "mjesto": "Zagreb",
  "datum_izdanja": "2025-11-18",
  "izvor_url": "https://…",
  "citat": "…doslovni tekst sa stranice u kojem je adresa…",
  "drugi_izvor_url": null,
  "pouzdanost": "visoka | srednja | niska",
  "napomena": "…"
}
```

`pouzdanost: "visoka"` smije samo kad je citat doslovno na stranici koja se
otvara bez prijave i kad se ime subjekta ili događaja jednoznačno slaže.

## Na kraju

Spoji oba batcha u `apps/data-pipeline/data/croai_istrazivanje2_izlaz.json`
(38 objekata) i ispiši sažetak: koliko s adresom, koliko samo grad, koliko
bez ičega, i za svaki „bez ičega" jednu rečenicu zašto.

---

## Nakon istraživanja (za Claude)

1. Za svaki rezultat dohvati `izvor_url` i traži `citat` (normaliziran:
   mala slova, bez dijakritike, sažeti razmaci). Na kartu ide samo što se
   nađe, ili što potvrdi sudreg / Google ime na adresi kao u prvom krugu.
2. `razina_lokacije: "grad"` → težište naselja, `geo_source: "naselje"`, a u
   `izvor` napisati da je to razina grada.
3. Geokod, `croai_overrides.json`, skripta 34, count u `layers.ts`, deploy iz
   čistog worktreeja ako u `apps/karta-web` ima tuđih necommitanih izmjena.
