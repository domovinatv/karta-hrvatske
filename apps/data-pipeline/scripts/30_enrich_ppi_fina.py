#!/usr/bin/env python3
"""
Step 30 — obogaćivanje inkubatora statusom iz FINA info.BIZ-a (po OIB-u).

JRPI je registar UPISA, ne registar stanja: subjekt koji je u međuvremenu
brisan, otišao u likvidaciju ili stečaj i dalje stoji u njemu. Karta koja to
prešuti tvrdi da inkubator radi.

`infobiz.fina.hr` javno objavljuje po OIB-u službenu **oznaku veličine**
(Mikro/Mali/Srednji/Veliki) i **pravni status** (Aktivan / Brisan /
U likvidaciji / U stečaju …), besplatno i bez Firecrawla.

## Ovisnost o sestrinskom repou — namjerno glasna

Profil se ne može složiti iz OIB-a: URL nosi i slug imena
(`/tvrtka/zagrebacki-inovacijski-centar-d-o-o/OIB-53921712112`), a pretraga
je iza reCAPTCHA-e. Kartu OIB → URL gradi `company-details-api` iz osam
sitemapova (~56 MB, 318 899 subjekata) i drži je u svom kešu.

Ovdje se taj keš SAMO ČITA. Ako ga nema, skripta **ne dira GeoJSON i izađe s
kodom 0** uz jasnu poruku — sloj mora raditi i bez obogaćivanja. Ono što se
ne smije dogoditi je tiho preskakanje koje ostavi zastarjele `fina_*` iz
prošlog pokretanja; zato se pri svakom uspješnom prolazu prepisuju svi.

Ulaz/izlaz: `data/hr_ppi_inkubatori.geojson` (na mjestu).
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Treba httpx.", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "data" / "hr_ppi_inkubatori.geojson"
CACHE = ROOT / "data" / "raw" / "fina"
INDEX = ROOT / "../../../company-details-api/data/cache/infobiz/oib-index.tsv"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124 Safari/537.36")

# Status koji znači „ovo više ne posluje".
#
# Podudaranje je po KORIJENU, ne po cijelom nizu: info.BIZ ne piše statuse
# onako kako ih navodi vlastita dokumentacija. Izmjereno na ovih 78 OIB-a
# stvarno stoji „Likvidacija", „Neaktivan/izbrisan" i „otvoren stečajni
# postupak" — nijedan od njih ne bi pogodio skup punih nizova, pa bi svih 78
# subjekata ispalo aktivno i sloj bi tiho tvrdio neistinu.
MRTVI_KORIJENI = ("likvidacij", "stecaj", "stečaj", "izbrisan", "brisan", "neaktivan")


def load_index(oibs: set[str]) -> dict[str, str]:
    """OIB → URL profila, samo za OIB-e koji nas zanimaju (indeks je 26 MB)."""
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
    time.sleep(0.4)          # pristojnost; 82 zahtjeva nisu teret, ali neka
    return r.text


def flatten(page: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", "|", s))
    return re.sub(r"[ \t]+", " ", re.sub(r"\|+", "|", s))


def field(txt: str, label: str) -> str | None:
    """„Status:|\\n |Aktivan|" → „Aktivan". Vrijednost je prva neprazna ćelija."""
    m = re.search(re.escape(label) + r":\|((?:\s*\|)*)\s*([^|\n]+)", txt)
    return m.group(2).strip() if m else None


def employees(txt: str) -> int | None:
    m = re.search(r"Broj zaposlenih prema satima rada u \|(\d{4})\.\| godini je \|([\d.]+)\|", txt)
    return int(m.group(2).replace(".", "")) if m else None


def main() -> int:
    print("Step 30 — status inkubatora iz FINA info.BIZ-a")
    if not TARGET.exists():
        print(f"  ! nema {TARGET.name} — pokreni prvo 29_fetch_ppi.py", file=sys.stderr)
        return 1

    fc = json.loads(TARGET.read_text())
    feats = fc["features"]
    oibs = {f["properties"]["oib"] for f in feats if f["properties"].get("oib")}

    urls = load_index(oibs)
    if not urls:
        print(f"  ! nema indeksa {INDEX.resolve()}")
        print("    Pokreni `npm run enrich` u ../../company-details-api da ga izgradi.")
        print("    Sloj radi i bez ovoga — obogaćivanje se preskače, GeoJSON ostaje netaknut.")
        return 0
    print(f"  indeks: {len(urls)}/{len(oibs)} OIB-a pronađeno")

    stats: dict[str, int] = {}
    for f in feats:
        p = f["properties"]
        # Uvijek prepiši: zastarjeli `fina_*` iz prošlog pokretanja gori je od
        # nijednog, jer izgleda jednako pouzdano.
        for k in ("fina_status", "fina_velicina", "fina_zaposleni", "fina_url", "fina_aktivan"):
            p.pop(k, None)
        url = urls.get(p.get("oib") or "")
        if not url:
            stats["nema u info.BIZ-u"] = stats.get("nema u info.BIZ-u", 0) + 1
            continue
        page = fetch_profile(p["oib"], url)
        if not page:
            stats["dohvat pao"] = stats.get("dohvat pao", 0) + 1
            continue
        txt = flatten(page)
        status = field(txt, "Status")
        p["fina_status"] = status
        p["fina_velicina"] = field(txt, "Veličina")
        p["fina_zaposleni"] = employees(txt)
        p["fina_url"] = url
        p["fina_aktivan"] = None if not status else not any(
            k in status.lower() for k in MRTVI_KORIJENI
        )
        stats[status or "bez statusa"] = stats.get(status or "bez statusa", 0) + 1

    fc.setdefault("metadata", {})["fina_provjereno"] = date.today().isoformat()
    TARGET.write_text(json.dumps(fc, ensure_ascii=False, indent=1))

    print(f"\n  → {TARGET.name} osvježen")
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"    {v:4d}  {k}")
    mrtvi = [f["properties"] for f in feats if f["properties"].get("fina_aktivan") is False]
    if mrtvi:
        print(f"\n  {len(mrtvi)} subjekata NIJE aktivno:")
        for p in mrtvi:
            print(f"    {p['brand'][:40]:40s} {p['fina_status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
