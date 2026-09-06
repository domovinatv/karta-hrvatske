#!/usr/bin/env python3
"""
Step 33 — privatni startup ekosustav: subjekti kojih NEMA u JRPI-ju.

JRPI pokriva formalni sustav poduzetničke potpore. Izvan njega ostaje dio
ekosustava koji svatko iz branše zna napamet: VC fondovi (Fil Rouge,
Feelsgood, AYMO), udruge koje drže zajednicu (Osijek Software City, Split
Tech City), privatni coworkinzi i korporativni programi. Bez njih karta
pokazuje samo ono što je država upisala.

## Ovo NIJE registar

Za razliku od sloja Inkubatori, ovdje ne postoji autoritet — popis je
kuriran i netko ga mora održavati. Zato:

  * **Identitet je OIB**, ne ime. Ime i adresa se ne prepisuju ručno nego
    dohvaćaju iz FINA info.BIZ-a, pa popis preživi preseljenje i
    preimenovanje. U `data/ppi_privatni.json` stoji samo ono što registar ne
    zna: brend, kategorija, web, i zašto je subjekt na popisu.
  * `izvor: "kurirano"` ide u svaki feature i prikazuje se u popupu. Korisnik
    mora moći razlikovati državni upis od naše prosudbe.
  * Preklapanje s JRPI slojem je **glasna greška** — isti subjekt na dvije
    karte je dvostruko brojanje.

Brojevi 31 i 32 zauzeti su zagrebačkim open-data skriptama; ovo je treći
korak PPI obitelji (29 → 30 → 33), ne novi lanac.

Output: `data/hr_ppi_privatni.geojson`
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import dgu, infobiz
from src.normalize import strip_diacritics

# Ponovna upotreba geokodirajućeg sloja iz 29 — indeks naselja s razrješavanjem
# dvojezičnih RPJ naziva, i „ulica je zapravo selo" fallback. Vidi tamošnji
# docstring `settlement_candidates`; ista zamka vrijedi i ovdje.
sys.path.insert(0, str(Path(__file__).resolve().parent))
_m = __import__("29_fetch_ppi")
load_naselja_index = _m.load_naselja_index
settlement_candidates = _m.settlement_candidates
norm_key = _m.norm_key

ROOT = Path(__file__).resolve().parent.parent
KURIRANI = ROOT / "data" / "ppi_privatni.json"
JRPI_SLOJ = ROOT / "data" / "hr_ppi_inkubatori.geojson"
OUT = ROOT / "data" / "hr_ppi_privatni.geojson"

KATEGORIJE = {
    "fond": "Fond / investitor",
    "inkubator": "Privatni inkubator",
    "zajednica": "Tehnološka zajednica",
    "hub": "Coworking / hub",
    "korporativni": "Korporativni program",
}


def locate(idx, s: dict, adr: dict):
    """(lat, lng, geo_source). Ručni override → DGU adresa → težište naselja."""
    if s.get("lat") is not None and s.get("lng") is not None:
        return s["lat"], s["lng"], "rucno"
    kandidati = settlement_candidates(idx, adr["mjesto"], adr["mjesto"])
    for ime in [n.rpj_naziv for n in kandidati] or ([adr["mjesto"]] if adr["mjesto"] else []):
        hit = dgu.geocode(ime, adr["ulica"], adr["broj"])
        if hit:
            return hit.lat, hit.lng, hit.source
    # Vidi isti popravak u 29_fetch_ppi.py: `return` unutar petlje izlazio je
    # u prvoj iteraciji i drugi kandidat naselja nikad nije dobio priliku.
    if adr["ulica"]:
        seoski = settlement_candidates(idx, adr["ulica"], adr["mjesto"])
        for n in seoski:
            hit = dgu.geocode(n.rpj_naziv, None, adr["broj"])
            if hit:
                return hit.lat, hit.lng, "dgu-adresa"
        if seoski:
            return seoski[0].lat, seoski[0].lng, "naselje"
    if kandidati:
        return kandidati[0].lat, kandidati[0].lng, "naselje"
    return None, None, None


def main() -> int:
    print("Step 33 — privatni startup ekosustav (kurirano)")
    kur = json.loads(KURIRANI.read_text())
    subjekti = kur["subjekti"]
    print(f"  {KURIRANI.name}: {len(subjekti)} subjekata")

    # Preklapanje s JRPI-jem znači dvostruko brojanje na karti.
    if JRPI_SLOJ.exists():
        jrpi_oibs = {
            f["properties"].get("oib")
            for f in json.loads(JRPI_SLOJ.read_text())["features"]
        }
        dupli = [s for s in subjekti if s["oib"] in jrpi_oibs]
        if dupli:
            print("  ! OVI SU VEĆ U JRPI SLOJU — makni ih iz kuriranog popisa:")
            for s in dupli:
                print(f"      {s['oib']}  {s['brand']}")
            return 1
        print(f"  preklapanja s JRPI slojem: nema ({len(jrpi_oibs)} provjereno)")
    else:
        print("  ! nema hr_ppi_inkubatori.geojson — preklapanje NIJE provjereno")

    # Kurirani popis piše čovjek; neispravan OIB znači krivu tvrtku na karti.
    losi = [s for s in subjekti if not _m.oib_ok(s["oib"])]
    if losi:
        print("  ! neispravna kontrolna znamenka OIB-a:")
        for s in losi:
            print(f"      {s['oib']}  {s['brand']}")
        return 1

    urls = infobiz.load_index({s["oib"] for s in subjekti})
    if not urls:
        print(f"  ! {infobiz.index_missing_msg()}")
        print("    Bez njega nema ni adresa ni naziva — ovaj sloj ovisi o indeksu.")
        return 1
    print(f"  info.BIZ indeks: {len(urls)}/{len(subjekti)} OIB-a pronađeno")

    idx = load_naselja_index()
    features, stats = [], defaultdict(int)

    for s in subjekti:
        oib = s["oib"]
        url = urls.get(oib)
        if not url:
            print(f"    ! {s['brand']}: OIB {oib} nije u info.BIZ indeksu")
            stats["nema u info.BIZ-u"] += 1
            continue
        page = infobiz.fetch_profile(oib, url)
        if not page:
            stats["dohvat pao"] += 1
            continue
        d = infobiz.parse(page)
        adr = s.get("adresa_override") or d["adresa"]
        parsed = infobiz.parse_adresa(adr if isinstance(adr, str) else None)

        lat, lng, geo_source = locate(idx, s, parsed)
        stats[geo_source or "bez-lokacije"] += 1
        if lat is None:
            print(f"    ! bez lokacije: {s['brand']} ({adr})")
            continue

        features.append({
            "type": "Feature",
            # Stabilan numerički id iz OIB-a: MapLibre feature-state traži broj,
            # a OIB je 11 znamenki i stane u Number bez gubitka.
            "id": int(oib),
            "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
            "properties": {
                "id": int(oib),
                "brand": s["brand"],
                "naziv": d["naziv"],
                "kategorija": s["kategorija"],
                "kategorija_naziv": KATEGORIJE.get(s["kategorija"], s["kategorija"]),
                "oib": oib,
                "adresa": adr,
                "mjesto": parsed["mjesto"],
                "website": s.get("website"),
                "napomena": s.get("napomena"),
                "pravni_oblik": d["pravni_oblik"],
                "nkd": d["nkd"],
                "fina_status": d["status"],
                "fina_velicina": d["velicina"],
                "fina_zaposleni": d["zaposleni"],
                "fina_url": url,
                "fina_aktivan": d["aktivan"],
                "geo_source": geo_source,
                "izvor": "kurirano",
            },
        })

    fc = {
        "type": "FeatureCollection",
        "name": "hr_ppi_privatni",
        "metadata": {
            "izvor": "kurirani popis + FINA info.BIZ (naziv, adresa, status)",
            "napomena": "Nije registar. Subjekti kojih nema u JRPI-ju.",
            "provjereno": date.today().isoformat(),
            "subjekata": len(features),
        },
        "features": features,
    }
    OUT.write_text(json.dumps(fc, ensure_ascii=False, indent=1))

    print(f"\n  → {OUT.name} ({len(features)} subjekata)")
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"    {v:4d}  {k}")
    for f in features:
        p = f["properties"]
        flag = "" if p["fina_aktivan"] is not False else f"  ← {p['fina_status']}"
        print(f"    {p['brand'][:26]:26s} {p['kategorija']:13s} {p['mjesto'] or '?':14s}"
              f" {p['geo_source']}{flag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
