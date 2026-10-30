"""Revizija geokoda sloja CroAI: je li točka tamo gdje Google stavlja adresu.

Za svaki subjekt s uličnom adresom pita Google Geocoding API (`geocode_address`
iz 34: točka kuće, ista ulica i kućni broj) i izmjeri udaljenost do točke na
karti. Hvata i ručne unose i Googleove pogotke po imenu. Ispisuje ono što je dalje od praga. Ne mijenja sloj: ispravak
ide u `croai_overrides.json` ili u sam lanac u 34.

    .venv/bin/python scripts/croai_backfill/revizija_geokoda.py [--prag 300]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from src import infobiz, places  # noqa: E402

m34 = __import__("34_fetch_croai")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prag", type=float, default=300.0, help="metri")
    args = ap.parse_args()

    fs = json.loads(m34.OUT.read_text())["features"]
    pl = places.Places()
    out, provjereno = [], 0
    for f in fs:
        p = f["properties"]
        adr = infobiz.parse_adresa(p.get("adresa"))
        g = m34.geocode_address(pl, adr, p.get("adresa"))
        if not g:
            continue
        provjereno += 1
        lng, lat = f["geometry"]["coordinates"]
        d = places.haversine_m(lat, lng, g["lat"], g["lng"])
        if d > args.prag:
            out.append((d, p["name"], p["geo_source"], p["adresa"], g["address"], p.get("geo_izvor")))
    out.sort(reverse=True)
    print(f"provjereno {provjereno}/{len(fs)}, dalje od {args.prag:.0f} m: {len(out)} "
          f"(Places: {pl.calls} novih, {pl.cache_hits} iz keša)")
    for d, name, src, adresa, gadr, izvor in out:
        print(f"  {d / 1000:6.2f} km  {name}  [{src}]\n            karta: {adresa}\n            google: {gadr}"
              + (f"\n            izvor: {izvor[:90]}" if izvor else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
