"""FINA info.BIZ — službena veličina i pravni status po OIB-u, besplatno.

`infobiz.fina.hr` javno objavljuje po OIB-u oznaku veličine (Mikro/Mali/
Srednji/Veliki), pravni status (Aktivan / Likvidacija / Neaktivan-izbrisan /
otvoren stečajni postupak …), adresu sjedišta, pravni oblik i NKD djelatnost.
Bez ključa, bez Firecrawla, bez kvote.

## Zašto treba indeks iz sestrinskog repoa

Profil se NE MOŽE složiti iz OIB-a: URL nosi i slug imena
(`/tvrtka/zagrebacki-inovacijski-centar-d-o-o/OIB-53921712112`,
`/neprofitni/osc/OIB-06519815245`), a pretraga je iza reCAPTCHA-e. Kartu
OIB → URL gradi `company-details-api` iz osam sitemapova (~56 MB,
318 899 subjekata) i drži je u svom kešu. Ovdje se taj keš SAMO ČITA.

Ako ga nema, `load_index` vrati prazno i pozivatelj mora to preživjeti —
nijedan sloj ne smije pasti zato što obogaćivanje nije dostupno.

## Zamka: statusi ne glase kako FINA dokumentira

Izmjereno 2026-09-06 na stvarnim profilima: „Aktivan", „Likvidacija",
„Neaktivan/izbrisan", „otvoren stečajni postupak". Podudaranje po punom nizu
(„u likvidaciji", „brisan") ne pogodi NIŠTA i sve proglasi aktivnim. Zato
`is_active` gleda korijene.
"""
from __future__ import annotations

import html
import re
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data" / "raw" / "fina"
INDEX = ROOT / "../../../company-details-api/data/cache/infobiz/oib-index.tsv"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124 Safari/537.36")

MRTVI_KORIJENI = ("likvidacij", "stecaj", "stečaj", "izbrisan", "brisan", "neaktivan")


def is_active(status: str | None) -> bool | None:
    """None kad se ne zna — nepoznato nije isto što i mrtvo."""
    if not status:
        return None
    return not any(k in status.lower() for k in MRTVI_KORIJENI)


def load_index(oibs: set[str]) -> dict[str, str]:
    """OIB → URL profila, samo za tražene OIB-e (indeks je 26 MB)."""
    idx = INDEX.resolve()
    if not idx.exists():
        return {}
    out: dict[str, str] = {}
    with idx.open(encoding="utf8") as fh:
        for line in fh:
            tab = line.find("\t")
            if tab > 0 and line[:tab] in oibs:
                out[line[:tab]] = line[tab + 1:].strip()
    return out


def index_missing_msg() -> str:
    return (
        f"nema indeksa {INDEX.resolve()}\n"
        "    Izgradi ga u ../../company-details-api (info.BIZ sitemapovi, ~56 MB)."
    )


def fetch_profile(oib: str, url: str) -> str | None:
    cache = CACHE / f"{oib}.html"
    if cache.exists():
        return cache.read_text(encoding="utf8", errors="replace")
    try:
        r = httpx.get(url, headers={"User-Agent": UA}, timeout=45, follow_redirects=True)
    except httpx.HTTPError as e:
        print(f"    ! {oib}: {type(e).__name__}")
        return None
    if r.status_code != 200:
        print(f"    ! {oib}: HTTP {r.status_code}")
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(r.text, encoding="utf8")
    time.sleep(0.4)
    return r.text


def _flatten(page: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", "|", s))
    return re.sub(r"[ \t]+", " ", re.sub(r"\|+", "|", s))


def _field(txt: str, label: str) -> str | None:
    """„Status:|\\n |Aktivan|" → „Aktivan". Vrijednost je prva neprazna ćelija."""
    m = re.search(re.escape(label) + r"[^|]*:\|((?:\s*\|)*)\s*([^|\n]+)", txt)
    if not m:
        return None
    val = m.group(2).strip()
    return None if val in {"-", "—", ""} else val


def parse(page: str) -> dict[str, object]:
    txt = _flatten(page)
    zap = re.search(
        r"Broj zaposlenih prema satima rada u \|(\d{4})\.\| godini je \|([\d.]+)\|", txt
    )
    status = _field(txt, "Status")
    return {
        "naziv": _field(txt, "Naziv"),
        "adresa": _field(txt, "Adresa"),
        "status": status,
        "aktivan": is_active(status),
        "velicina": _field(txt, "Veličina"),
        "pravni_oblik": _field(txt, "Pravni oblik"),
        "nkd": _field(txt, "Djelatnost (NKD"),
        "zaposleni": int(zap.group(2).replace(".", "")) if zap else None,
    }


# info.BIZ piše adresu kao „Radnička cesta 50, 10000 Zagreb" — poštanski broj
# ISPRED mjesta, obrnuto od JRPI-ja („Rakovac 6, Karlovac 47000"). Sitnica koja
# tiho razbije zajednički parser.
_ADR = re.compile(
    r"^(?P<street>.+?)\s+(?P<num>\d+\s*[A-Za-z]?(?:\s*/\s*\w+)?)\s*,\s*"
    r"(?P<pbr>\d{5})\s+(?P<city>.+)$"
)


def parse_adresa(raw: str | None) -> dict[str, str | None]:
    a = re.sub(r"\s+", " ", (raw or "").strip())
    m = _ADR.match(a)
    if not m:
        return {"ulica": None, "broj": None, "mjesto": None, "pbr": None}
    city = m.group("city").strip()
    return {
        "ulica": m.group("street").strip().title() if m.group("street").isupper()
        else m.group("street").strip(),
        "broj": re.sub(r"\s+", "", m.group("num")),
        "mjesto": city.title() if city.isupper() else city,
        "pbr": m.group("pbr"),
    }
