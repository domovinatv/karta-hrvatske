#!/usr/bin/env python3
"""
Step 30 — obogaćivanje inkubatora statusom iz FINA info.BIZ-a (po OIB-u).

JRPI je registar UPISA, ne registar stanja: subjekt koji je u međuvremenu
brisan, otišao u likvidaciju ili stečaj i dalje stoji u njemu. Karta koja to
prešuti tvrdi da inkubator radi.

Sav dohvat i parsiranje živi u `src/infobiz.py` — tamo su i zamke (URL se ne
može složiti iz OIB-a, statusi ne glase kako FINA dokumentira).

Ako indeksa nema, skripta **ne dira GeoJSON i izađe s kodom 0** uz jasnu
poruku — sloj mora raditi i bez obogaćivanja. Ono što se ne smije dogoditi je
tiho preskakanje koje ostavi zastarjele `fina_*` iz prošlog pokretanja; zato
se pri svakom uspješnom prolazu prepisuju svi.

Ulaz/izlaz: `data/hr_ppi_inkubatori.geojson` (na mjestu).
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import infobiz

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "data" / "hr_ppi_inkubatori.geojson"

FINA_KEYS = ("fina_status", "fina_velicina", "fina_zaposleni", "fina_url", "fina_aktivan")


def main() -> int:
    print("Step 30 — status inkubatora iz FINA info.BIZ-a")
    if not TARGET.exists():
        print(f"  ! nema {TARGET.name} — pokreni prvo 29_fetch_ppi.py", file=sys.stderr)
        return 1

    fc = json.loads(TARGET.read_text())
    feats = fc["features"]
    oibs = {f["properties"]["oib"] for f in feats if f["properties"].get("oib")}

    urls = infobiz.load_index(oibs)
    if not urls:
        print(f"  ! {infobiz.index_missing_msg()}")
        print("    Sloj radi i bez ovoga — GeoJSON ostaje netaknut.")
        return 0
    print(f"  indeks: {len(urls)}/{len(oibs)} OIB-a pronađeno")

    stats: dict[str, int] = {}
    for f in feats:
        p = f["properties"]
        # Uvijek prepiši: zastarjeli `fina_*` iz prošlog pokretanja gori je od
        # nijednog, jer izgleda jednako pouzdano.
        for k in FINA_KEYS:
            p.pop(k, None)
        url = urls.get(p.get("oib") or "")
        if not url:
            stats["nema u info.BIZ-u"] = stats.get("nema u info.BIZ-u", 0) + 1
            continue
        page = infobiz.fetch_profile(p["oib"], url)
        if not page:
            stats["dohvat pao"] = stats.get("dohvat pao", 0) + 1
            continue
        d = infobiz.parse(page)
        p["fina_status"] = d["status"]
        p["fina_velicina"] = d["velicina"]
        p["fina_zaposleni"] = d["zaposleni"]
        p["fina_url"] = url
        p["fina_aktivan"] = d["aktivan"]
        key = str(d["status"] or "bez statusa")
        stats[key] = stats.get(key, 0) + 1

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
