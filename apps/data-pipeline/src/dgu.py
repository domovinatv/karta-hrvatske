"""Geokodiranje adresa preko DGU INSPIRE WFS-a. Bez API ključa, bez kvota.

Ovo je zamjena za Google Places i Nominatim, i bolja je od oba za hrvatske
adrese: `AD.Address` je **službeni Registar prostornih jedinica** — 1,68
milijuna adresnih točaka, istih onih iz kojih država izdaje kućne brojeve.
Nema rate limita od 1 req/s kao Nominatim i nema dnevne kvote kao Places.

  https://geoportal.dgu.hr/services/inspire/ad/wfs

PRENESENO iz `oou.domovina.ai/src/dgu.py` (commit iz 2026-08). Logika je
netaknuta — mijenjani su samo putanja keša, User-Agent i uvoz `normalize`.
Ako se tamo popravi zamka, popravi je i ovdje; drugi smjer vrijedi jednako.

Zašto ovdje treba: JRPI (Jedinstveni registar poduzetničke infrastrukture)
ima 236 poduzetničkih potpornih institucija, a njegov GeoServer sloj
`jrpi:jrpi_poduzetnicke_potporne_institucije` ima geometriju za **5 od 236**.
Adresa je jedini put do točke.

## Tri sloja, jer se adrese iz registra i iz RPJ-a ne poklapaju doslovno

  1. `ulica ILIKE '%ključna riječ%' AND broj=N`  — uska pretraga, obično ≤5
     rezultata. Pokriva većinu.
  2. `naselje AND broj=N` pa fuzzy izbor ulice lokalno. Treba jer registri
     pišu „SPLITSKA 2", a RPJ za tu adresu ima **„Splitski put 2"** (Šibenik).
     Naziv ulice u registru je često kolokvijalan ili skraćen.
  3. težište naselja — pozivatelj to rješava sam (u ovom repou iz
     `hrvatska_naselja.geojson`), ali pošteno označeno kroz `geo_source`.

Sloj se UVIJEK zapisuje u `geo_source`, pa potrošač zna razliku između
koordinate kućnog broja i točke usred sela.

## Zamke izmjerene 2026-08-27

  * **`kucni_broj` je VERZALAN**: RPJ ima `'37B'`, ne `'37b'`. Upit s malim
    slovom vraća nula. Postoji i rastavljen oblik (`broj=37`,
    `podbroja_alfa='B'`) koji je pouzdaniji, pa se koristi on.
  * **Bez `srsName=EPSG:4326` vraća EPSG:3765** (HTRS96/TM), tj. metarske
    koordinate koje na karti završe negdje kod Gvineje.
  * `count=` radi na `ad` sloju (za razliku od `au`, gdje se ignorira).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, NamedTuple

import httpx
from rapidfuzz import fuzz

from src.normalize import strip_diacritics

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "raw" / "dgu"
WFS = "https://geoportal.dgu.hr/services/inspire/ad/wfs"

# Prag za prihvaćanje pogotka na nazivu ulice unutar ISTOG naselja i s ISTIM
# kućnim brojem.
MIN_STREET_SCORE = 78.0

# …i, važnije od praga, PRAVILO RAZLIKOVNOSTI. Izmjereno na „SPLITSKA 2,
# Šibenik" (Glazbena škola Ivana Lukačića): u Šibeniku ima 378 adresa s brojem
# 2, a fuzzy rang izgleda ovako —
#     71,4  Pulska        (kriva)
#     70,6  Sopaljska     (kriva)
#     70,0  Splitski put  (TOČNA)
#     66,7  Velebitska    (kriva)
# Točan odgovor je TREĆI. Spuštanje praga na 70 ne bi pomoglo nego bi
# zajamčeno izabralo krivu ulicu. Zato se fuzzy pogodak prihvaća samo ako je
# ODVOJEN od sljedećeg za `MIN_STREET_MARGIN` — inače nema pobjednika i
# ustanova pada na težište naselja, što je pošteno.
MIN_STREET_MARGIN = 10.0

# Generičke riječi u nazivima ulica — loši ključevi za ILIKE, jer ih ima na
# tisuće. Ključna riječ je najduža riječ KOJA NIJE ovdje.
_GENERIC = {
    "ulica", "ul", "put", "trg", "cesta", "obala", "setaliste", "šetalište",
    "odvojak", "prilaz", "park", "naselje", "kralja", "bana", "svetog", "sv",
    "dr", "brace", "braće", "don", "fra", "kneza", "grada", "hrvatskih",
    "hrvatske", "narodnog", "matice", "stjepana", "ivana", "josipa",
}


class Hit(NamedTuple):
    lat: float
    lng: float
    street: str | None
    housenumber: str | None
    settlement: str | None
    postal_code: str | None
    source: str          # 'dgu-adresa' | 'dgu-ulica-fuzzy'
    score: float


def _user_agent() -> str:
    contact = os.environ.get("CONTACT_EMAIL", "stepanic.matija@gmail.com")
    return f"domovina-ai-gis/0.1 (karta-hrvatske data pipeline; {contact})"


HEADERS = {"User-Agent": _user_agent(), "Accept": "application/json"}


def _cache_path(cql: str) -> Path:
    h = hashlib.sha256(cql.encode()).hexdigest()[:16]
    return CACHE_DIR / f"{h}.json"


def _fetch(cql: str, count: int = 200) -> list[dict[str, Any]]:
    """Pokreni CQL upit nad AD.Address. Keširano po SHA upita."""
    cache = _cache_path(f"{cql}|{count}")
    if cache.exists():
        return json.loads(cache.read_text())

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "ad:AD.Address",
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",   # bez ovoga vraća EPSG:3765 (metri)
        "count": str(count),
        "CQL_FILTER": cql,
    }
    for attempt in range(3):
        try:
            r = httpx.get(WFS, params=params, headers=HEADERS, timeout=90)
        except httpx.HTTPError as e:
            logger.warning("DGU %s, retry %d", type(e).__name__, attempt + 1)
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code != 200:
            logger.warning("DGU %d, retry %d", r.status_code, attempt + 1)
            time.sleep(2 * (attempt + 1))
            continue
        try:
            feats = r.json().get("features", [])
        except json.JSONDecodeError:
            # GeoServer na grešci u CQL-u vraća XML ExceptionReport s 200.
            logger.warning("DGU vratio ne-JSON za: %s", cql[:120])
            feats = []
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(feats, ensure_ascii=False))
        return feats
    return []


def _quote(s: str) -> str:
    """CQL literal — apostrof se udvostručuje („Kralja Petra Krešimira IV.")."""
    return str(s).replace("'", "''")


# Hrvatski nastavci koje ILIKE ne smije nositi. Registar ustanova piše ulicu
# pridjevski („KLAIĆEVA"), a RPJ posvojno-genitivno („Ulica Vjekoslava
# Klaića") — `ILIKE '%KLAIĆEVA%'` na tome vraća NULA. Rezanjem nastavka ostaje
# „KLAIĆ", što pogađa oba oblika. Duži nastavci prvi.
_SUFFIXES = ("ijeva", "ovica", "ečka", "ačka", "ička", "eva", "ova", "ska",
             "čka", "cka", "ina", "ega", "oga", "og", "a", "e", "i", "u", "o")

# Ispod ove duljine korijen postaje pregeneričan i ILIKE vrati pola grada.
_MIN_STEM = 4


def _stem(word: str) -> str:
    for suf in _SUFFIXES:
        if len(word) - len(suf) >= _MIN_STEM and word.lower().endswith(suf):
            return word[: -len(suf)]
    return word


def _norm_street(s: str | None) -> str:
    return " ".join(strip_diacritics(s or "").lower().split())


def _tokens(s: str | None) -> list[str]:
    return [t.strip(".,") for t in _norm_street(s).split() if t.strip(".,")]


def street_similarity(a: str | None, b: str | None) -> float:
    """Sličnost dvaju naziva ulica, otporna na KRAĆENJE.

    RPJ krati duge nazive („Trg Hrv. brat. zaj." za „Trg hrvatske bratske
    zajednice"), pa čisti `token_set_ratio` na tom paru daje 65 — ispod svakog
    razumnog praga. Prefiksna usporedba po riječima daje 100, jer je svaka
    kraćena riječ prefiks pune.

    Uzima se veći od dva rezultata: prefiksni hvata kraćenja, `token_set_ratio`
    hvata promijenjen redoslijed i sitne razlike u nastavku.
    """
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0

    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    used: set[int] = set()
    matched = 0
    for t in short:
        for i, u in enumerate(long_):
            if i in used:
                continue
            # Prefiks u bilo kojem smjeru, najmanje 3 znaka — „zaj"/„zajednice".
            # Uspoređuju se i KORIJENI, jer registar piše pridjevski
            # („KLAIĆEVA") a RPJ genitivno („Klaića") — isti korijen „klaić".
            st_, su = _stem(t), _stem(u)
            if len(t) >= 3 and (u.startswith(t) or t.startswith(u)
                                or (len(st_) >= _MIN_STEM and st_ == su)):
                used.add(i)
                matched += 1
                break
    prefix_score = 100.0 * matched / len(long_)
    return max(prefix_score,
               float(fuzz.token_set_ratio(_norm_street(a), _norm_street(b))))


def keyword(street: str | None) -> str | None:
    """Najduža riječ naziva ulice koja nije generička — ključ za ILIKE.

    „IVANA PERKOVCA" → „PERKOVCA" (jer je „Ivana" generičko ime iz stotina
    naziva). „Braće Radića" → „Radića". Bez ovoga bi ILIKE '%Ivana%' u Zagrebu
    vratio nekoliko tisuća adresa.

    Vraća riječ **s dijakritikom, iz izvornog niza**. Dijakritika se skida samo
    za provjeru je li riječ generička. Ovo je bio pravi bug: `ILIKE '%Klaiceva%'`
    ne pogađa „Klaićeva ulica", pa je svaka adresa s č/ć/š/ž/đ u nazivu ulice
    promašivala sloj 1. Na uzorku od 90 adresa to je bila većina promašaja.
    """
    if not street:
        return None
    originals = street.split()
    keep = [w for w in originals
            if len(w) >= 4 and strip_diacritics(w).lower().strip(".,") not in _GENERIC]
    if not keep:
        keep = [w for w in originals if len(w) >= 3]
    return _stem(max(keep, key=len).strip(".,")) if keep else None


def _split_number(housenumber: str | None) -> tuple[int | None, str | None]:
    """`„37b"` → `(37, "B")`. RPJ drži broj i slovo odvojeno, i slovo je VERZAL.

    Podbroj iza kose crte se ODBACUJE: „Bartola Kašića 3/1" je stan 1 u kući
    broj 3, a RPJ adresna točka postoji za kuću. Bez rezanja se „3/1" spajalo
    u broj 31 i geokodiranje je promašivalo cijelu ulicu.
    """
    if not housenumber:
        return None, None
    parts = [p.strip() for p in str(housenumber).strip().split("/")]
    raw = parts[0]
    digits = "".join(c for c in raw if c.isdigit())
    if not digits:
        return None, None
    letter = "".join(c for c in raw if c.isalpha()).upper() or None
    # „7/A" je kuća 7, ulaz A — slovo je iza crte. „3/1" je stan 1 u kući 3 i
    # taj se dio odbacuje. Razlika je je li iza crte slovo ili broj.
    if letter is None and len(parts) > 1 and len(parts[1]) == 1 and parts[1].isalpha():
        letter = parts[1].upper()
    return int(digits), letter


def _to_hit(feat: dict, source: str, score: float) -> Hit | None:
    geom = feat.get("geometry") or {}
    coords = geom.get("coordinates")
    if not coords or len(coords) < 2:
        return None
    p = feat.get("properties") or {}
    pc = p.get("postanski_broj")
    return Hit(
        lat=float(coords[1]),
        lng=float(coords[0]),
        street=p.get("ulica"),
        housenumber=p.get("kucni_broj"),
        settlement=p.get("naselje"),
        postal_code=str(pc) if pc else None,
        source=source,
        score=score,
    )


def _pick(feats: list[dict], street: str | None, letter: str | None,
          source: str, min_score: float, require_margin: bool = False) -> Hit | None:
    """Izaberi adresu koja najbolje odgovara nazivu ulice i slovnom podbroju.

    `require_margin` uključuje pravilo razlikovnosti — obavezno u sloju 2, gdje
    se bira između stotina ulica istog naselja. Vidi `MIN_STREET_MARGIN`.
    """
    want = _norm_street(street)
    best, best_score = None, 0.0
    # Drugi najbolji se mjeri po RAZLIČITOJ ulici, ne po različitoj adresi:
    # ista ulica zna imati dvije točke s istim brojem (dvije zgrade u dvorištu)
    # i one si ne smiju međusobno obarati razliku.
    scores_by_street: dict[str, float] = {}
    for f in feats:
        p = f.get("properties") or {}
        # Slovni podbroj mora se poklapati kad ga tražimo: „37" i „37B" su
        # dvije različite kuće, ponekad stotinama metara razmaknute.
        got_letter = (p.get("podbroja_alfa") or "").strip().upper() or None
        if letter != got_letter:
            continue
        s = 100.0 if not want else street_similarity(want, p.get("ulica"))
        key = _norm_street(p.get("ulica"))
        scores_by_street[key] = max(scores_by_street.get(key, 0.0), s)
        if s > best_score:
            best, best_score = f, s

    if best is None or best_score < min_score:
        return None
    if require_margin and want:
        others = sorted((v for k, v in scores_by_street.items()
                         if k != _norm_street((best.get("properties") or {}).get("ulica"))),
                        reverse=True)
        if others and best_score - others[0] < MIN_STREET_MARGIN:
            return None
    return _to_hit(best, source, best_score)


def geocode(settlement: str | None, street: str | None,
            housenumber: str | None) -> Hit | None:
    """Adresa → točka, ili None. Vidi docstring modula za slojeve.

    `settlement` je obavezan — bez naselja upit vraća cijelu Hrvatsku.
    """
    if not settlement:
        return None
    number, letter = _split_number(housenumber)
    if number is None:
        return None

    nas = _quote(settlement)

    # Sloj 1 — uska pretraga po ključnoj riječi ulice.
    kw = keyword(street)
    if kw:
        feats = _fetch(
            f"naselje='{nas}' AND ulica ILIKE '%{_quote(kw)}%' AND broj={number}",
            count=50,
        )
        # Prag je namjerno 0, a odlučuje PRAVILO RAZLIKOVNOSTI. Uvjet sloja 1
        # je već vrlo uzak: isto naselje, isti kućni broj, i naziv ulice koji
        # sadrži korijen tražene. Traženje visoke sličnosti PUNOG naziva povrh
        # toga samo odbacuje točne pogotke — „KLAIĆEVA 7" (registar) i „Ulica
        # Vjekoslava Klaića 7" (RPJ) su ista adresa, a `token_set_ratio` im
        # daje ~60 zbog imena „Vjekoslava" koje registar ne piše.
        # Ako u tom uskom skupu ima više RAZLIČITIH ulica, margina presuđuje.
        hit = _pick(feats, street, letter, "dgu-adresa", 0.0, require_margin=True)
        if hit:
            return hit

    # Sloj 2 — sve adrese tog broja u naselju, pa fuzzy izbor ulice.
    # Ovo hvata slučaj „SPLITSKA 2" (registar) ↔ „Splitski put 2" (RPJ).
    feats = _fetch(f"naselje='{nas}' AND broj={number}", count=1000)
    if not feats:
        return None
    if not street:
        # Bez naziva ulice biramo samo ako je adresa u naselju jedinstvena —
        # inače bismo nasumično birali između desetaka kuća s istim brojem.
        def _alfa(f):
            return ((f.get("properties") or {}).get("podbroja_alfa") or "").strip().upper() or None

        candidates = [f for f in feats if _alfa(f) == letter]
        if len(candidates) == 1:
            return _to_hit(candidates[0], "dgu-adresa", 100.0)
        return None
    return _pick(feats, street, letter, "dgu-ulica-fuzzy", MIN_STREET_SCORE,
                 require_margin=True)
