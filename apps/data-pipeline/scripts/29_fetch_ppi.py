#!/usr/bin/env python3
"""
Step 29 — Inkubatori i akceleratori iz JRPI-ja (Jedinstveni registar
poduzetničke infrastrukture, Ministarstvo gospodarstva).

    https://jrpi.mingo.gov.hr/

Aplikacija je Angular SPA, ali pod njom stoji **javni REST bez ikakve
autentikacije**, base `/services`:

    GET  /services/kategorije/PPI_VRSTA/getAll
    POST /services/ppi/search             {"page":{"pageNum":0,"pageSize":N}}
    POST /services/ppi/kontaktOsobe/search

`/ppi/search` vraća svih 236 poduzetničkih potpornih institucija s OIB-om,
adresom, webom, kontaktima, godinom osnivanja i površinama.

## Zašto se geokodira, kad registar ima i GeoServer

Ima ga, `jrpi:jrpi_poduzetnicke_potporne_institucije` na `/services/wfs`, i
uredno vraća GeoJSON. Ali:

    236 značajki, od toga 5 s geometrijom — 231 je `geometry: null`.

(Isto vrijedi i za poslovne zone: 37 od 354.) Registar je dakle autoritativan
za ATRIBUTE, a beskoristan za POLOŽAJ. Zato je jedini put do točke `adresa`,
koja je srećom čista i parsabilna u 234 od 236 slučajeva.

## Opseg

Uzima se uži izbor — ono što se u svakodnevnom govoru zove „startup
inkubator" — a ne svih 236 PPI. Vidi `STARTUP_VRSTE`; proširenje na cijeli
registar je izmjena te jedne konstante.

## Dedupliciranje

Ista pravna osoba upisana je jednom PO VRSTI. ZICER je u registru tri puta
(inkubator + inkubator za nove tehnologije + akcelerator), TICM tri puta,
Poduzetnički centar KZŽ tri puta. Na karti to su tri točke na istoj adresi
jedna preko druge. Spaja se po `(OIB, normalizirana adresa)` — 89 zapisa
postaje 82 subjekta — a vrste se skupljaju u polje `vrste`.

Adresa je dio ključa namjerno: Istarska razvojna agencija vodi PI „Izazov" i
Tehnološki inkubator Pula na DVIJE različite adrese, i to jesu dvije lokacije.

Output: `data/hr_ppi_inkubatori.geojson`
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import httpx
    from shapely.geometry import shape
except ImportError:
    print("Treba httpx + shapely: .venv/bin/pip install httpx shapely", file=sys.stderr)
    sys.exit(1)

from src import dgu
from src.normalize import strip_diacritics

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw" / "jrpi"
OUT = DATA / "hr_ppi_inkubatori.geojson"
OVERRIDES = DATA / "ppi_overrides.json"
NASELJA = ROOT / "hrvatska_naselja.geojson"

BASE = "https://jrpi.mingo.gov.hr/services"
HEADERS = {
    "User-Agent": "domovina.ai-gis (info@domovina.ai)",
    "Accept": "application/json",
    "Accept-Language": "hr",
    "Content-Type": "application/json",
}

# Uži izbor iz šifrarnika PPI_VRSTA. Ostale vrste u registru su poduzetnički
# centri (64), lokalne i županijske razvojne agencije (80) i poslovni parkovi
# (3) — potporna infrastruktura, ali ne ono što se zove inkubatorom.
#
# 5 je u šifrarniku a trenutno bez ijednog zapisa; ostaje jer ga registar
# priznaje i prvi upis ne smije tiho ispasti iz sloja.
STARTUP_VRSTE = {
    5: "Digitalni inovacijski centar",
    7: "Poduzetnički inkubator",
    8: "Inkubator za nove tehnologije",
    9: "Poduzetnički akcelerator",
    11: "Znanstveno-tehnologijski park",
    12: "Centar kompetencije",
}

# Koja se vrsta uzima za boju točke kad subjekt ima više njih. Specifičnije
# ispred općenitijeg: tko je i inkubator i akcelerator, na karti je akcelerator.
VRSTA_PRIORITET = [11, 9, 8, 5, 12, 7]


# ---------------------------------------------------------------------------
# Dohvat
# ---------------------------------------------------------------------------
def _post(path: str, payload: dict, cache_name: str) -> dict:
    """POST na JRPI uz keš na disku. Registar se mijenja rijetko."""
    cache = RAW / cache_name
    if cache.exists():
        return json.loads(cache.read_text())
    r = httpx.post(f"{BASE}/{path}", json=payload, headers=HEADERS, timeout=90)
    r.raise_for_status()
    data = r.json()
    if data.get("isFaulted"):
        raise RuntimeError(f"JRPI {path}: {data.get('faultMessage')}")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    return data


def fetch_ppi() -> list[dict]:
    d = _post("ppi/search", {"page": {"pageNum": 0, "pageSize": 2000}}, "ppi.json")
    print(f"  JRPI /ppi/search → {d['totalCount']} PPI zapisa")
    return d["data"]


def fetch_kontakti() -> dict[int, list[dict]]:
    d = _post(
        "ppi/kontaktOsobe/search",
        {"page": {"pageNum": 0, "pageSize": 5000}},
        "ppi_kontakti.json",
    )
    by_ppi: dict[int, list[dict]] = defaultdict(list)
    for k in d["data"]:
        if k.get("ppi_id") is not None:
            by_ppi[k["ppi_id"]].append(k)
    print(f"  JRPI /ppi/kontaktOsobe/search → {d['totalCount']} kontakata")
    return by_ppi


# ---------------------------------------------------------------------------
# OIB
# ---------------------------------------------------------------------------
def oib_ok(oib: str) -> bool:
    """Kontrolna znamenka OIB-a (ISO 7064, MOD 11,10)."""
    if not re.fullmatch(r"\d{11}", oib):
        return False
    r = 10
    for ch in oib[:10]:
        r = (r + int(ch)) % 10 or 10
        r = (r * 2) % 11
    return (11 - r) % 10 == int(oib[10])


def normalize_oib(raw: object) -> str | None:
    """JRPI-ju znaju otpasti VODEĆE NULE — negdje se OIB drži kao broj.

    U registru su tri takva: „9496667599" je zapravo 09496667599 (Evolve Uni
    Tech, potvrđeno u FINA info.BIZ-u). Bez nadopune sudreg poveznica u popupu
    vodi u prazno, a spajanje na FINA-u tiho promaši.

    Nadopunjava se samo ako kontrolna znamenka NAKON toga prolazi — inače je
    posrijedi nešto drugo i broj se vraća kakav jest, da se greška vidi.
    """
    o = re.sub(r"\D", "", str(raw or ""))
    if not o:
        return None
    if len(o) < 11:
        padded = o.zfill(11)
        if oib_ok(padded):
            return padded
    return o


# ---------------------------------------------------------------------------
# Adresa
# ---------------------------------------------------------------------------
# „Rakovac  6, Karlovac 47000" → ulica / broj / mjesto / pbr.
# Poštanski broj je `\d{1,5}`, a ne `\d{5}`: jedan zapis (Tehnološki centar
# Split) ima doslovno „Split 0" i inače bi ispao iz parsiranja.
_ADR = re.compile(
    r"^(?P<street>.+?)\s+(?P<num>\d+\s*[A-Za-z]?(?:\s*/\s*\w+)?)\s*,\s*"
    r"(?P<city>.+?)\s+(?P<pbr>\d{1,5})$"
)


def parse_adresa(raw: str | None) -> dict[str, str | None]:
    a = re.sub(r"\s+", " ", (raw or "").strip())
    if not a:
        return {"ulica": None, "broj": None, "mjesto": None, "pbr": None}
    m = _ADR.match(a)
    if not m:
        return {"ulica": None, "broj": None, "mjesto": None, "pbr": None}
    return {
        "ulica": m.group("street").strip(),
        "broj": re.sub(r"\s+", "", m.group("num")),
        "mjesto": normalize_mjesto(m.group("city")),
        "pbr": m.group("pbr") if m.group("pbr") != "0" else None,
    }


def normalize_mjesto(city: str) -> str:
    """Grad iz adrese → naziv naselja kakav ima DGU RPJ.

    Dvije stvarne razlike u ovom skupu: jedanaest zagrebačkih adresa piše
    „GRAD ZAGREB" (to je JLS, naselje se zove „Zagreb"), a istarski nazivi
    znaju doći dvojezično („PULA - POLA").
    """
    c = re.sub(r"\s+", " ", city.strip())
    if " - " in c:
        c = c.split(" - ")[0].strip()
    if strip_diacritics(c).upper() == "GRAD ZAGREB":
        return "Zagreb"
    # Registar piše grad verzalom kad ga preuzme iz RPJ JLS tablice; DGU
    # adresni sloj traži „Zagreb", ne „ZAGREB".
    if c.isupper():
        c = c.title()
    return c


# ---------------------------------------------------------------------------
# Brend
# ---------------------------------------------------------------------------
# Pravni oblik i djelatnosna klauzula koji u registru stoje IZA naziva.
#
# Pravilo je namjerno usko: reže se samo ono što nikad ne može biti početak
# imena. Prva verzija je hvatala i goli „za …" pa je „CENTAR ZA RAZVOJ I
# EDUKACIJU POLIČNIK" skratila na „CENTAR", i „ustanova"/„zadruga" bilo gdje
# u nizu pa je od „Poduzetnička zadruga Osvit — …" ostalo „Poduzetnička".
# Prekomjerno rezanje je gore od nerezanja: krivo ime ne možeš prepoznati,
# predugo možeš.
_PRAVNI_OBLIK = re.compile(
    r"(,?\s*(društvo s ograničenom odgovornošću|"
    r"jednostavno društvo s ograničenom odgovornošću)\b.*$)"
    r"|(\s*,?\s*\b(j\.?\s?)?d\.\s?o\.\s?o\.?(\b|$).*$)"
    r"|(\s*,?\s*\bd\.\s?d\.?(\b|$).*$)"
    r"|(\s*,\s*za\s+.*$)",
    re.IGNORECASE,
)


def derive_brand(rec: dict, override: str | None) -> str:
    """Ime pod kojim subjekt stvarno nastupa.

    Registar vodi PRAVNI naziv, a on zna sakriti brend do neprepoznatljivosti:
    Impact Hub Zagreb je upisan kao „Pokreni ideju j.d.o.o.", HUB385 kao
    „NEST 01 d.o.o.", Algebra LAB kao „DigiBoost d.o.o.". Nitko takvo ime neće
    tražiti na karti, pa za te slučajeve postoji `ppi_overrides.json`.

    Bez overridea: `kratki_naziv` je u ovom registru iznenađujuće dobar
    („PISAK", „CTT", „ICENT", „TERA TEHNOPOLIS d.o.o."), treba mu samo skinuti
    pravni oblik. `naziv` je zadnja instanca.
    """
    if override:
        return override
    for cand in (rec.get("kratki_naziv"), rec.get("naziv")):
        if not cand:
            continue
        clean = _PRAVNI_OBLIK.sub("", cand).strip(" ,-–")
        clean = re.sub(r"\s+", " ", clean)
        if len(clean) >= 3:
            return clean
    return (rec.get("naziv") or "").strip()


def clean_web(url: str | None) -> str | None:
    if not url:
        return None
    u = url.strip()
    if u in {"-", "—", ""}:
        return None
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


# ---------------------------------------------------------------------------
# Geokodiranje
# ---------------------------------------------------------------------------
class Naselje(NamedTuple):
    rpj_naziv: str      # točno onako kako piše u RPJ-u, uklj. dvojezični oblik
    jls: str
    lng: float
    lat: float


def load_naselja_index() -> dict[str, list[Naselje]]:
    """kratki naziv (bez dijakritike, mala slova) → [Naselje].

    Ključ je i puni RPJ naziv i njegov PRVI dio, jer je 114 naselja u registru
    dvojezično („Poreč - Parenzo", „Rovinj - Rovigno"), a adrese ih pišu
    jednojezično. Bez toga se dogodi tiha katastrofa opisana u
    `settlement_candidates`.
    """
    if not NASELJA.exists():
        print(f"  ! nema {NASELJA.name} — težište naselja neće raditi")
        return {}
    fc = json.loads(NASELJA.read_text())
    idx: dict[str, list[Naselje]] = defaultdict(list)
    for f in fc["features"]:
        p = f["properties"]
        pt = shape(f["geometry"]).representative_point()
        n = Naselje(p["name"], p.get("jls_name") or "", pt.x, pt.y)
        keys = {strip_diacritics(p["name"]).lower()}
        if " - " in p["name"]:
            keys.add(strip_diacritics(p["name"].split(" - ")[0]).lower())
        for k in keys:
            idx[k].append(n)
    return idx


def settlement_candidates(idx, mjesto: str | None, jls: str | None) -> list[Naselje]:
    """Naselja koja bi mogla biti traženo mjesto, najvjerojatnije prvo.

    Postoje DVA naselja koja se zovu „Poreč": istarski grad, koji je u RPJ-u
    upisan kao „Poreč - Parenzo", i selo kraj Nove Gradiške, koje se zove
    doslovno „Poreč". Upit `naselje='Poreč'` nad DGU adresnim slojem uredno
    vrati slavonsko selo, bez ijedne greške — Poduzetnički inkubator Poreč je
    tako završio 250 km od mora. Isti obrazac čeka Rovinj, Vodnjan, Buje i
    ostalih 111 dvojezičnih naselja.

    Zato se kandidati rangiraju po podudaranju JLS-a, a ne po tome tko je
    prvi našao ime.
    """
    if not mjesto:
        return []
    hits = list(idx.get(strip_diacritics(mjesto).lower(), []))
    if not hits:
        return []
    j = norm_key((jls or "").split(" - ")[0])
    hits.sort(key=lambda n: 0 if j and norm_key(n.jls.split(" - ")[0]) == j else 1)
    return hits


def locate(idx, ov: dict, adr: dict, jls: str | None):
    """(lat, lng, geo_source) za jedan subjekt.

    Redoslijed: ručni override → DGU adresna točka → adresa čije je „ulica"
    zapravo naselje → težište naselja. Svaki izvor se pošteno označi, jer
    razlika između kućnog broja i težišta sela zna biti par kilometara, a na
    karti obje točke izgledaju jednako uvjerljivo.
    """
    if ov.get("lat") is not None and ov.get("lng") is not None:
        return ov["lat"], ov["lng"], "rucno"

    kandidati = settlement_candidates(idx, adr["mjesto"], jls)
    # Uvijek probaj i doslovno ono što piše u adresi: ako naselja nema u
    # našem indeksu, DGU ga možda ipak zna.
    imena = [n.rpj_naziv for n in kandidati] or ([adr["mjesto"]] if adr["mjesto"] else [])
    for ime in imena:
        hit = dgu.geocode(ime, adr["ulica"], adr["broj"])
        if hit:
            return hit.lat, hit.lng, hit.source

    # Seoske adrese nemaju ulicu: „Bobovje 52G, Krapina" znači kućni broj 52G
    # u naselju Bobovje, a ne ulicu Bobovje u Krapini. Registar u polje mjesta
    # upiše najbliži grad, pa se „ulica" mora probati kao naselje.
    # `return` unutar petlje je izlazio u PRVOJ iteraciji, pa se drugi kandidat
    # nikad nije probao — petlja je izgledala kao da prolazi sve, a radila je
    # `if kandidati: uzmi prvog`. Točno protiv toga postoji rangiranje
    # kandidata; centroid je fallback TEK kad nijedna adresa ne pogodi.
    if adr["ulica"]:
        seoski = settlement_candidates(idx, adr["ulica"], jls)
        for n in seoski:
            hit = dgu.geocode(n.rpj_naziv, None, adr["broj"])
            if hit:
                return hit.lat, hit.lng, "dgu-adresa"
        if seoski:
            return seoski[0].lat, seoski[0].lng, "naselje"

    if kandidati:
        return kandidati[0].lat, kandidati[0].lng, "naselje"
    # Zadnja instanca: sjedište JLS-a iz polja `naziv_opcinegrada`.
    fallback = settlement_candidates(idx, normalize_mjesto(jls or ""), jls)
    if fallback:
        return fallback[0].lat, fallback[0].lng, "naselje"
    return None, None, None


# ---------------------------------------------------------------------------
# Glavni tok
# ---------------------------------------------------------------------------
def norm_key(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", strip_diacritics(s or "").lower())


def main() -> int:
    print("Step 29 — inkubatori i akceleratori (JRPI)")

    overrides = {}
    if OVERRIDES.exists():
        overrides = json.loads(OVERRIDES.read_text()).get("subjekti", {})
        print(f"  {OVERRIDES.name}: {len(overrides)} ručnih zapisa")

    svi = fetch_ppi()
    kontakti = fetch_kontakti()

    uzi = [r for r in svi if r["vrsta_ppi_id"] in STARTUP_VRSTE]
    print(f"  uži izbor (vrste {sorted(STARTUP_VRSTE)}): {len(uzi)} zapisa")

    popravljeni = [
        (r["naziv"], r["oib_po_osoba"], normalize_oib(r["oib_po_osoba"]))
        for r in uzi
        if normalize_oib(r["oib_po_osoba"]) != str(r["oib_po_osoba"])
    ]
    for naziv, prije, poslije in popravljeni:
        print(f"    OIB nadopunjen: {prije} → {poslije}  ({naziv[:44]})")

    # ── Dedup po (OIB, adresa) ────────────────────────────────────────────
    grupe: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for r in uzi:
        r["oib_po_osoba"] = normalize_oib(r.get("oib_po_osoba")) or "?"
        grupe[(r["oib_po_osoba"], norm_key(r.get("adresa")))].append(r)
    print(f"  nakon spajanja po (OIB, adresa): {len(grupe)} subjekata")

    idx = load_naselja_index()
    features, stats = [], defaultdict(int)

    for kljuc, recs in sorted(grupe.items(), key=lambda kv: min(r["unit_id"] for r in kv[1])):
        recs.sort(key=lambda r: r["unit_id"])
        base = recs[0]
        # Stabilan id preko pokretanja: najmanji unit_id iz registra. Po njemu
        # se u ppi_overrides.json gađa točno ovaj subjekt.
        ppi_id = base["unit_id"]
        ov = overrides.get(str(ppi_id), {})

        vrste = sorted({r["vrsta_ppi_id"] for r in recs})
        primarna = next((v for v in VRSTA_PRIORITET if v in vrste), vrste[0])

        adr = parse_adresa(base.get("adresa"))
        jls = base.get("naziv_opcinegrada")

        lat, lng, geo_source = locate(idx, ov, adr, jls)
        stats[geo_source or "bez-lokacije"] += 1
        if lat is None:
            print(f"    ! bez lokacije: {base.get('naziv')} ({base.get('adresa')})")
            continue

        osobe = []
        for r in recs:
            for k in kontakti.get(r["unit_id"], []):
                ime = (k.get("naziv_osobe") or "").strip()
                if ime and ime not in osobe:
                    osobe.append(ime)

        emails, telefoni = [], []
        for r in recs:
            for e in r.get("emails") or []:
                if e and e not in emails:
                    emails.append(e)
            for t in r.get("brojevi_telefona") or []:
                if t and t not in telefoni:
                    telefoni.append(t)

        features.append({
            "type": "Feature",
            "id": ppi_id,
            "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
            "properties": {
                "id": ppi_id,
                "brand": derive_brand(base, ov.get("brand")),
                "naziv": base.get("naziv"),
                "vrste": [{"id": v, "naziv": STARTUP_VRSTE[v]} for v in vrste],
                "vrsta_primarna": primarna,
                "vrsta_primarna_naziv": STARTUP_VRSTE[primarna],
                "oib": base.get("oib_po_osoba"),
                "mbs": base.get("mbs_po_osoba"),
                "godina_osnivanja": base.get("godina_osnivanja"),
                "osnivac": base.get("kratki_naziv_osnivaca"),
                "oib_osnivaca": base.get("oib_osnivaca"),
                "upravitelj": base.get("kratki_naziv_upravitelja"),
                "adresa": base.get("adresa"),
                "mjesto": adr["mjesto"],
                "jls": jls,
                "zupanija": base.get("naziv_zupanije"),
                "website": clean_web(base.get("www_page")),
                "emails": emails,
                "telefoni": telefoni,
                "kontakt_osobe": osobe,
                # Površine su u registru često 0 — to znači „nije prijavljeno",
                # ne „nula kvadrata". Nula se ne prosljeđuje da popup ne tvrdi
                # neistinu.
                "povrsina_m2": base.get("uk_pov_m2") or None,
                "povrsina_poduzetnici_m2": base.get("uk_pov_za_poduzetnike_m2") or None,
                "geo_source": geo_source,
                "jrpi_unit_ids": [r["unit_id"] for r in recs],
            },
        })

    # Override koji ne pogađa nijedan subjekt je tiha greška: netko je
    # prepisao unit_id iz krive tablice ili je registar zapis izbacio, a
    # ispravka samo nestane. Ovdje se vidi.
    koristeni = {str(f["properties"]["id"]) for f in features}
    siroci = sorted(set(overrides) - koristeni, key=int)
    if siroci:
        print(f"  ! override bez subjekta (provjeri unit_id): {', '.join(siroci)}")

    fc = {
        "type": "FeatureCollection",
        "name": "hr_ppi_inkubatori",
        "metadata": {
            "izvor": "JRPI — Jedinstveni registar poduzetničke infrastrukture (MINGO)",
            "url": "https://jrpi.mingo.gov.hr/",
            "opseg": [STARTUP_VRSTE[v] for v in sorted(STARTUP_VRSTE)],
            "zapisa_u_registru": len(svi),
            "zapisa_u_opsegu": len(uzi),
            "subjekata": len(features),
        },
        "features": features,
    }
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=1))

    print(f"\n  → {OUT} ({len(features)} subjekata, {OUT.stat().st_size // 1024} KB)")
    print("  geo_source:")
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"    {v:4d}  {k}")
    tocno = sum(v for k, v in stats.items() if k in {"rucno", "dgu-adresa", "dgu-ulica-fuzzy"})
    print(f"  adresna preciznost: {tocno}/{len(grupe)} ({100 * tocno // max(len(grupe), 1)} %)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
