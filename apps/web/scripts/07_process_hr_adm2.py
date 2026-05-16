#!/usr/bin/env python3
"""
Step 07 — Process geoBoundaries ADM2 GeoJSON for Croatia.

Pipeline:
  1. Clean shapeName prefixes (Općina/Grad/Otok)
  2. Apply manual alias map for known geoBoundaries typos
  3. Build DZS lookup keyed by (clean_name, type) — bilingual names stripped
  4. Resolve true name+type collisions (e.g. Privlaka × 2) by ADM1 polygon
  5. For features without any name match (islands, fragments), assign by
     centroid containment in ADM1 polygons (geoBoundaries ADM1 ground truth)
  6. Compute area in EPSG:3765 (HTRS96/TM)
  7. Apply Douglas-Peucker simplification (~30m tolerance)
  8. Color-code by županija

JLS (Jedinica Lokalne Samouprave) = Grad or Općina. Features flagged as
'Otok' in geoBoundaries are uninhabited/fragment island polygons, NOT
administrative JLS — they get type='Otok' and is_jls=False.

Input:  data/hr_adm2_geoboundaries_raw.geojson
        data/hr_adm1_geoboundaries_raw.geojson
        data/hr_jls_list.json
Output: data/hr_adm2_processed.geojson
"""
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

INPUT_RAW = "data/hr_adm2_geoboundaries_raw.geojson"
INPUT_ADM1 = "data/hr_adm1_geoboundaries_raw.geojson"
INPUT_DZS = "data/hr_jls_list.json"
OUTPUT_PATH = "data/hr_adm2_processed.geojson"

ZUP_COLORS = {
    "Zagrebačka": "#c8553d",
    "Krapinsko-zagorska": "#588b8b",
    "Sisačko-moslavačka": "#f4a261",
    "Karlovačka": "#264653",
    "Varaždinska": "#e76f51",
    "Koprivničko-križevačka": "#2a9d8f",
    "Bjelovarsko-bilogorska": "#e9c46a",
    "Primorsko-goranska": "#3d405b",
    "Ličko-senjska": "#81b29a",
    "Virovitičko-podravska": "#f2cc8f",
    "Požeško-slavonska": "#9d4edd",
    "Brodsko-posavska": "#e63946",
    "Zadarska": "#a8dadc",
    "Osječko-baranjska": "#457b9d",
    "Šibensko-kninska": "#1d3557",
    "Vukovarsko-srijemska": "#bc6c25",
    "Splitsko-dalmatinska": "#606c38",
    "Istarska": "#06aed5",
    "Dubrovačko-neretvanska": "#c9184a",
    "Međimurska": "#ef233c",
    "Grad Zagreb": "#d90429",
}

# ISO 3166-2:HR (stable) → official DZS županija name.
ADM1_ISO_TO_ZUP = {
    "HR-01": "Zagrebačka",
    "HR-02": "Krapinsko-zagorska",
    "HR-03": "Sisačko-moslavačka",
    "HR-04": "Karlovačka",
    "HR-05": "Varaždinska",
    "HR-06": "Koprivničko-križevačka",
    "HR-07": "Bjelovarsko-bilogorska",
    "HR-08": "Primorsko-goranska",
    "HR-09": "Ličko-senjska",
    "HR-10": "Virovitičko-podravska",
    "HR-11": "Požeško-slavonska",
    "HR-12": "Brodsko-posavska",
    "HR-13": "Zadarska",
    "HR-14": "Osječko-baranjska",
    "HR-15": "Šibensko-kninska",
    "HR-16": "Vukovarsko-srijemska",
    "HR-17": "Splitsko-dalmatinska",
    "HR-18": "Istarska",
    "HR-19": "Dubrovačko-neretvanska",
    "HR-20": "Međimurska",
    "HR-21": "Grad Zagreb",
}

# geoBoundaries shapeName (after stripping prefix) → DZS canonical name.
# Catches typos and orthographic mismatches.
NAME_ALIASES = {
    "Hvratska Dubica": "Hrvatska Dubica",
    "Veliki Pisanica": "Velika Pisanica",
    "Donji Kukuzari": "Donji Kukuruzari",
    "Magdenovac": "Magadenovac",
    "Ivanić Grad": "Ivanić-Grad",
    "Malinska - Dubašnica": "Malinska-Dubašnica",
    "Muter-Kornati": "Murter-Kornati",
    "Kaštelir - Labinci": "Kaštelir-Labinci",
    "Losinj": "Mali Lošinj",
}

SIMPLIFY_TOLERANCE_DEG = 0.0003  # ~30 m at HR latitudes


def strip_prefix(s: str) -> str:
    """Strip 'Općina'/'Grad'/'Otok' prefix from raw shapeName."""
    return re.sub(r"^(Općina|Opicina|Grad|Otok)\s+", "", s, flags=re.IGNORECASE).strip()


def get_type(s: str) -> str:
    if s.startswith("Grad "):
        return "Grad"
    if s.startswith("Otok "):
        return "Otok"
    if s.startswith(("Općina ", "Opicina ")):
        return "Općina"
    return "Other"


def strip_bilingual(s: str) -> str:
    """DZS Istria entries are 'Pula – Pola' / 'Tar-Vabriga – Torre-Abrega' etc.
    Strip everything after the language separator (any dash + space). Plain
    hyphens inside one name (Tar-Vabriga, Ivanić-Grad) are preserved."""
    return re.split(r"\s[–—-]\s", s, maxsplit=1)[0].strip()


def ascii_normalize(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def main():
    for p in (INPUT_RAW, INPUT_ADM1, INPUT_DZS):
        if not os.path.exists(p):
            raise SystemExit(f"Missing {p}. See pipeline.")

    gdf = gpd.read_file(INPUT_RAW).reset_index(drop=True)
    adm1 = gpd.read_file(INPUT_ADM1)
    print(f"Loaded {len(gdf)} ADM2 features, {len(adm1)} ADM1 features")

    # ADM1 ISO → official Croatian županija name
    missing_iso = [iso for iso in adm1["shapeISO"] if iso not in ADM1_ISO_TO_ZUP]
    if missing_iso:
        raise SystemExit(f"ADM1 has unknown ISO codes: {missing_iso}")
    adm1["zupanija"] = adm1["shapeISO"].map(ADM1_ISO_TO_ZUP)

    # Area in HTRS96/TM
    gdf_tm = gdf.to_crs("EPSG:3765")
    gdf["area_m2"] = gdf_tm.geometry.area

    # Clean names + types
    gdf["raw_name"] = gdf["shapeName"].apply(strip_prefix)
    gdf["name"] = gdf["raw_name"].apply(lambda n: NAME_ALIASES.get(n, n))
    gdf["type"] = gdf["shapeName"].apply(get_type)
    # is_jls and is_island are finalised after DZS-authoritative type override below.

    # ---- DZS index keyed by (cleaned-bilingual-name, type) ----
    dzs = json.load(open(INPUT_DZS))
    dzs_index = defaultdict(list)
    for r in dzs:
        canonical = strip_bilingual(r["name"])
        dzs_index[(canonical.lower(), r["type"])].append(
            {"dzs_name": r["name"], "canonical": canonical, "zupanija": r["zupanija"], "type": r["type"]}
        )

    centroids = gdf.geometry.centroid

    def adm1_zupanija_for(point) -> str:
        """ADM1 polygon containing this point; nearest if point lies outside any."""
        hit = adm1[adm1.geometry.contains(point)]
        if len(hit) == 0:
            dists = adm1.geometry.distance(point)
            return adm1.at[dists.idxmin(), "zupanija"]
        return hit.iloc[0]["zupanija"]

    # ---- Match each ADM2 feature ----
    diag = {"exact": 0, "alias": 0, "ascii": 0, "type_collision": 0, "spatial_island": 0, "spatial_other": 0}
    assignments = []

    for idx, row in gdf.iterrows():
        name_clean = row["name"]
        ftype = row["type"]
        centroid = centroids.iloc[idx]

        # 1) Exact (name, type) match
        candidates = dzs_index.get((name_clean.lower(), ftype), [])

        # 2) Try the same name with the OTHER JLS type (geoBoundaries shapeName
        # prefix is unreliable: e.g. "Grad Lobor" but DZS says Općina; "Otok
        # Krk" but DZS says Grad). The DZS-authoritative type override below
        # corrects `type`; here we only need a name match to pin down županija.
        if not candidates:
            for alt_type in ("Grad", "Općina"):
                if alt_type == ftype:
                    continue
                cand = dzs_index.get((name_clean.lower(), alt_type), [])
                if cand:
                    candidates = cand
                    break

        # 3) ASCII-normalised lookup across types as last name-based attempt
        if not candidates:
            for (k_name, k_type), v in dzs_index.items():
                if ascii_normalize(k_name) == ascii_normalize(name_clean):
                    candidates = v
                    diag["ascii"] += 1
                    break

        # 3) Resolve / fall back to ADM1 spatial assignment
        if not candidates:
            zup = adm1_zupanija_for(centroid)
            tag = "spatial_island" if ftype == "Otok" else "spatial_other"
            assignments.append({"zupanija": zup, "match": tag})
            diag[tag] += 1
        elif len(candidates) == 1:
            assignments.append({"zupanija": candidates[0]["zupanija"], "match": "exact"})
            diag["exact"] += 1
            if name_clean != row["raw_name"]:
                diag["alias"] += 1
        else:
            # Genuine (name, type) collision — resolve by ADM1 polygon containment
            zup_by_centroid = adm1_zupanija_for(centroid)
            picked = next((c for c in candidates if c["zupanija"] == zup_by_centroid), None)
            zup_final = picked["zupanija"] if picked else zup_by_centroid
            assignments.append({"zupanija": zup_final, "match": "type_collision"})
            diag["type_collision"] += 1

    gdf["zupanija"] = [a["zupanija"] for a in assignments]
    gdf["_match"] = [a["match"] for a in assignments]

    # ---- Authoritative type from DZS by (name, županija) ----
    # geoBoundaries shapeName prefix is unreliable for Grad/Općina classification
    # (e.g. "Grad Lobor" but DZS officially classifies Lobor as Općina). Trust
    # DZS for JLS type whenever there's a name+županija match. Features without
    # a DZS match are not JLS (Otok fragments / unmatched) and keep their type.
    dzs_type_by_key = {}
    for r in dzs:
        canonical = strip_bilingual(r["name"]).lower()
        dzs_type_by_key[(canonical, r["zupanija"])] = r["type"]

    # Snapshot whether geoBoundaries originally classified the feature as an
    # island fragment, before we overwrite `type` with DZS authority.
    gdf["is_island"] = gdf["type"] == "Otok"

    # Detect multi-JLS islands: an "Otok X" polygon that is adjacent (within
    # 100 m) to a separately-mapped Općina/Grad polygon represents the residual
    # area of a multi-JLS island, NOT a single JLS. Do not override its type
    # (e.g. "Otok Krk" lumps Grad Krk + Baška + Dobrinj + Punat + Vrbnik into
    # one polygon; Malinska-Dubašnica and Omišalj are mapped separately).
    gdf_tm_now = gdf.to_crs("EPSG:3765").reset_index(drop=True)
    non_otok_idx = gdf_tm_now[gdf_tm_now["type"] != "Otok"].index
    multi_jls_island = set()
    for idx in gdf_tm_now[gdf_tm_now["type"] == "Otok"].index:
        ot_geom = gdf_tm_now.loc[idx, "geometry"]
        ot_zup = gdf_tm_now.loc[idx, "zupanija"]
        ot_buf = ot_geom.buffer(100)
        for j in non_otok_idx:
            if gdf_tm_now.loc[j, "zupanija"] != ot_zup:
                continue
            if gdf_tm_now.loc[j, "geometry"].intersects(ot_buf):
                multi_jls_island.add(idx)
                break

    type_overrides = 0
    skipped_multi = 0
    new_types = []
    for idx, row in gdf.iterrows():
        canon = row["name"].lower()
        zup = row["zupanija"]
        dzs_type = dzs_type_by_key.get((canon, zup))
        if dzs_type is None:
            for (n, z), t in dzs_type_by_key.items():
                if z == zup and ascii_normalize(n) == ascii_normalize(canon):
                    dzs_type = t
                    break

        # Refuse to override Otok → JLS for multi-JLS island residuals
        if idx in multi_jls_island and row["type"] == "Otok" and dzs_type in ("Grad", "Općina"):
            skipped_multi += 1
            print(f"  multi-JLS island, override skipped: {row['shapeName']:25} ({zup}) — polygon spans multiple JLS, kept as Otok")
            new_types.append("Otok")
            continue

        if dzs_type is not None and dzs_type != row["type"]:
            type_overrides += 1
            print(f"  type override: {row['shapeName']:35} ({zup}) → {dzs_type} (was {row['type']})")
        new_types.append(dzs_type if dzs_type is not None else row["type"])
    gdf["type"] = new_types
    gdf["is_jls"] = gdf["type"].isin(["Grad", "Općina"])
    print(f"  → {type_overrides} type overrides applied from DZS  ({skipped_multi} skipped as multi-JLS islands)")

    print("\nMatch breakdown:")
    print(f"  exact name+type:           {diag['exact']:3}  (alias-resolved: {diag['alias']}, ascii-resolved: {diag['ascii']})")
    print(f"  name+type collision:       {diag['type_collision']:3}  (resolved by ADM1 polygon)")
    print(f"  spatial-only (Otok):       {diag['spatial_island']:3}  (island fragments not in DZS)")
    print(f"  spatial-only (other):      {diag['spatial_other']:3}  (mainland features without DZS match)")

    counts = gdf["zupanija"].value_counts()
    missing_zup = set(ZUP_COLORS) - set(counts.index)
    if missing_zup:
        print(f"\n!! No features assigned to: {sorted(missing_zup)}", file=sys.stderr)

    # JLS counts (only Grad + Općina are real JLS)
    n_grad = int((gdf["type"] == "Grad").sum())
    n_opc = int((gdf["type"] == "Općina").sum())
    n_otok = int((gdf["type"] == "Otok").sum())
    print(f"\nFeature types:  {n_grad} Grad + {n_opc} Općina = {n_grad + n_opc} JLS  ·  {n_otok} otok fragmenata")
    print(f"DZS official:    126 Grad + 415 Općina + 1 Grad Zagreb = 542 JLS")

    gdf["color"] = gdf["zupanija"].map(ZUP_COLORS).fillna("#8d99ae")

    # Simplify
    n_before = sum(
        len(p.exterior.coords) if p.geom_type == "Polygon"
        else sum(len(g.exterior.coords) for g in p.geoms)
        for p in gdf.geometry
    )
    gdf["geometry"] = gdf.geometry.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)
    n_after = sum(
        len(p.exterior.coords) if p.geom_type == "Polygon"
        else sum(len(g.exterior.coords) for g in p.geoms)
        for p in gdf.geometry
    )
    print(f"\nSimplified: {n_before:,} → {n_after:,} vertices")

    # Build feature collection
    features = []
    for i, (_, r) in enumerate(gdf.iterrows()):
        if r.geometry.is_empty:
            continue
        features.append(
            {
                "type": "Feature",
                "id": i + 1,
                "properties": {
                    "name": r["name"],
                    "shapeName": r["shapeName"],
                    "type": r["type"],
                    "is_jls": bool(r["is_jls"]),
                    "is_island": bool(r["is_island"]),
                    "zupanija": r["zupanija"],
                    "area_m2": round(r["area_m2"], 2),
                    "area_km2": round(r["area_m2"] / 1e6, 4),
                    "color": r["color"],
                },
                "geometry": mapping(r.geometry),
            }
        )

    fc = {"type": "FeatureCollection", "features": features}
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))

    total = sum(f["properties"]["area_m2"] for f in features)
    print(f"\nWrote {OUTPUT_PATH}: {len(features)} features, {os.path.getsize(OUTPUT_PATH):,} bytes")
    print(f"Total area: {total / 1e6:,.2f} km² (DZS official: 56,594 km²)")


if __name__ == "__main__":
    main()
