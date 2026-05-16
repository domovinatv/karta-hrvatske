#!/usr/bin/env python3
"""
Step 12 — Merge ISPU-fetched JLS geometries into the processed GeoJSON.

For each ISPU JLS: parse WKT (EPSG:3765), reproject to WGS84, simplify
(matching step 07 tolerance), build a Feature with proper properties,
append to the feature collection.

Special handling for Krk-island JLS: when adding any of the 5 JLS that
were lumped into the geoBoundaries "Otok Krk" polygon, drop the original
"Otok Krk" feature so we don't have overlapping polygons. The 4 small
unmatched fragments (Plavnik, Zeca, etc.) stay as-is.

Input:  data/hr_adm2_processed.geojson
        data/hr_jls_missing_wkt.json
Output: data/hr_adm2_processed.geojson  (in place)
"""
import json
import os

import geopandas as gpd
import pandas as pd
from shapely import wkt
from shapely.geometry import mapping
from shapely.ops import transform
from pyproj import Transformer

PROC_PATH = "data/hr_adm2_processed.geojson"
WKT_PATH = "data/hr_jls_missing_wkt.json"

ZUP_COLORS = {
    "Zagrebačka": "#c8553d", "Krapinsko-zagorska": "#588b8b",
    "Sisačko-moslavačka": "#f4a261", "Karlovačka": "#264653",
    "Varaždinska": "#e76f51", "Koprivničko-križevačka": "#2a9d8f",
    "Bjelovarsko-bilogorska": "#e9c46a", "Primorsko-goranska": "#3d405b",
    "Ličko-senjska": "#81b29a", "Virovitičko-podravska": "#f2cc8f",
    "Požeško-slavonska": "#9d4edd", "Brodsko-posavska": "#e63946",
    "Zadarska": "#a8dadc", "Osječko-baranjska": "#457b9d",
    "Šibensko-kninska": "#1d3557", "Vukovarsko-srijemska": "#bc6c25",
    "Splitsko-dalmatinska": "#606c38", "Istarska": "#06aed5",
    "Dubrovačko-neretvanska": "#c9184a", "Međimurska": "#ef233c",
    "Grad Zagreb": "#d90429",
}

# Krk-island JLS that, once added, replace the lumped "Otok Krk" feature.
KRK_ISLAND_JLS = {"Krk", "Baška", "Dobrinj", "Punat", "Vrbnik"}

SIMPLIFY_TOLERANCE_DEG = 0.0003  # match step 07


def main():
    if not os.path.exists(PROC_PATH):
        raise SystemExit(f"Missing {PROC_PATH}")
    if not os.path.exists(WKT_PATH):
        raise SystemExit(f"Missing {WKT_PATH}. Run 11_fetch_missing_jls.py first.")

    fc = json.load(open(PROC_PATH))
    fetched = json.load(open(WKT_PATH))

    transformer = Transformer.from_crs("EPSG:3765", "EPSG:4326", always_xy=True)
    transformer_back = Transformer.from_crs("EPSG:4326", "EPSG:3765", always_xy=True)

    new_features = []
    krk_replaced = False

    ok_fetches = [r for r in fetched if r.get("status") == "ok"]
    for r in ok_fetches:
        name = r["name"]
        cands = r.get("candidates", [])
        if not cands:
            continue
        # If multiple candidates, prefer first (we'd disambiguate spatially in
        # general, but our 13 missing all have unique ISPU labels).
        cand = cands[0]
        try:
            geom_3765 = wkt.loads(cand["wkt"])
        except Exception as e:
            print(f"  WKT parse failed for {name}: {e}")
            continue

        # Reproject to WGS84
        geom_wgs = transform(lambda x, y, z=None: transformer.transform(x, y), geom_3765)
        # Simplify in degree-space (same convention as step 07)
        geom_simplified = geom_wgs.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)
        if geom_simplified.is_empty:
            print(f"  empty geometry after simplify: {name}")
            continue

        # Area in EPSG:3765 (computed from the simplified WGS84 geometry, reprojected)
        # Use the original (unsimplified) area for accuracy.
        area_m2 = geom_3765.area

        feat = {
            "type": "Feature",
            "id": None,  # filled in below
            "properties": {
                "name": name,
                "shapeName": f"{r['type']} {name}",
                "type": r["type"],
                "is_jls": True,
                "is_island": False,
                "zupanija": r["zupanija"],
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "color": ZUP_COLORS.get(r["zupanija"], "#8d99ae"),
                "source": "ISPU",
            },
            "geometry": mapping(geom_simplified),
        }
        new_features.append(feat)

    # Filter out "Otok Krk" if we have any Krk-island JLS coming in
    incoming_krk = {f["properties"]["name"] for f in new_features} & KRK_ISLAND_JLS
    if incoming_krk:
        before = len(fc["features"])
        fc["features"] = [
            f for f in fc["features"]
            if f["properties"].get("shapeName") != "Otok Krk"
        ]
        krk_replaced = before - len(fc["features"])
        print(f"  Removed 'Otok Krk' lumped polygon ({krk_replaced} feature) since {len(incoming_krk)} Krk-island JLS are being added.")

    # Append new features
    fc["features"].extend(new_features)

    # Re-number ids sequentially
    for i, f in enumerate(fc["features"], start=1):
        f["id"] = i

    with open(PROC_PATH, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))

    counts = {"Grad": 0, "Općina": 0, "Otok": 0}
    for f in fc["features"]:
        t = f["properties"]["type"]
        counts[t] = counts.get(t, 0) + 1

    print(f"\nMerged {len(new_features)} ISPU features into {PROC_PATH}")
    print(f"Total features now: {len(fc['features'])}")
    print(f"  Grad:   {counts.get('Grad', 0)}")
    print(f"  Općina: {counts.get('Općina', 0)}")
    print(f"  Otok:   {counts.get('Otok', 0)}")


if __name__ == "__main__":
    main()
