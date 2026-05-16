#!/usr/bin/env python3
"""
Step 15 — Build canonical Croatian JLS dataset from DGU + DZS sources, with
topology-preserving simplification so JLS borders align pixel-perfect with
županije borders and the state boundary.

Approach:
  1. Load DGU JLS (556 polygons in EPSG:3765, authoritative geometry).
  2. Build topology — topojson detects shared arcs between adjacent JLS.
  3. Apply topology simplification (each shared arc simplified once).
  4. Derive 21 županije by dissolving simplified JLS by zupanija field.
  5. Derive HR state polygon by unioning all simplified JLS.
  6. Join DGU županija + DZS Census 2021 metadata onto features.
  7. Reproject to WGS84 and write three GeoJSONs.

Result: JLS-rub == županija-rub == državna-granica at every shared vertex,
because all three are derived from the same simplified arc set.

Inputs:
  data/dgu_jls.geojson         (raw DGU JLS, EPSG:3765)
  data/dgu_zupanije.geojson    (raw DGU županije, for metadata only)
  data/hr_jls_list.json        (DZS — for Grad/Općina type)

Outputs:
  data/hr_canonical.geojson           (556 JLS, EPSG:4326, simplified)
  data/hr_canonical_zupanije.geojson  (21 županije, EPSG:4326, simplified)
  data/hr_canonical_drzava.geojson    (1 HR polygon, EPSG:4326, simplified)
"""
import json
import os
import re
import unicodedata
from collections import defaultdict

import geopandas as gpd
import topojson as tp
from shapely.geometry import mapping
from shapely.ops import unary_union
from shapely import make_valid

INPUT_JLS_DGU = "data/dgu_jls.geojson"
INPUT_ZUP_DGU = "data/dgu_zupanije.geojson"
INPUT_DZS = "data/hr_jls_list.json"
OUTPUT_JLS = "data/hr_canonical.geojson"
OUTPUT_ZUP = "data/hr_canonical_zupanije.geojson"
OUTPUT_DRZ = "data/hr_canonical_drzava.geojson"

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

# Topology simplification tolerance in metres (EPSG:3765 is metric)
SIMPLIFY_TOLERANCE_M = 15.0


def short_zupanija(naziv: str) -> str:
    if naziv.endswith(" županija"):
        return naziv[: -len(" županija")]
    return naziv


def strip_bilingual(s: str) -> str:
    return re.split(r"\s[–—-]\s", s, maxsplit=1)[0].strip()


def hyphen_normalize(s: str) -> str:
    return re.sub(r"\s*[-–—]\s*", "-", s)


def ascii_norm(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    ).lower()


def lookup_dzs_type(naziv: str, zupanija_short: str, dzs_type: dict) -> str | None:
    if zupanija_short == "Grad Zagreb":
        return "Grad"
    candidates = [
        strip_bilingual(naziv).lower(),
        hyphen_normalize(strip_bilingual(naziv)).lower(),
        hyphen_normalize(naziv).lower(),
        naziv.lower(),
    ]
    for c in candidates:
        t = dzs_type.get((c, zupanija_short))
        if t:
            return t
    for c in candidates:
        for (n, z), t in dzs_type.items():
            if z == zupanija_short and ascii_norm(n) == ascii_norm(c):
                return t
    return None


def main():
    for p in (INPUT_JLS_DGU, INPUT_ZUP_DGU, INPUT_DZS):
        if not os.path.exists(p):
            raise SystemExit(f"Missing {p}")

    print("Loading DGU JLS …")
    gdf_jls = gpd.read_file(INPUT_JLS_DGU).set_crs("EPSG:3765", allow_override=True)
    print(f"  {len(gdf_jls)} features")

    # DZS type lookup
    dzs = json.load(open(INPUT_DZS))
    dzs_type_idx = {}
    for r in dzs:
        canon = strip_bilingual(r["name"]).lower()
        dzs_type_idx[(canon, r["zupanija"])] = r["type"]

    # Add type + zupanija_short as columns BEFORE topology so they survive the round-trip
    gdf_jls["zupanija_short"] = gdf_jls["zupanija"].apply(short_zupanija)
    gdf_jls["jls_type"] = [
        lookup_dzs_type(r["naziv"], r["zupanija_short"], dzs_type_idx) or "Općina"
        for _, r in gdf_jls.iterrows()
    ]
    gdf_jls["area_m2_orig"] = gdf_jls.geometry.area  # before simplification

    # ---- Topology-preserving simplification ----
    print(f"Building topology over {len(gdf_jls)} JLS polygons …")
    topo = tp.Topology(gdf_jls, prequantize=False)
    print(f"  arcs: {len(topo.output['arcs'])}")
    print(f"Simplifying topology @ {SIMPLIFY_TOLERANCE_M} m …")
    topo_simp = topo.toposimplify(SIMPLIFY_TOLERANCE_M, prevent_oversimplify=True)
    gdf_jls_simp = topo_simp.to_gdf().set_crs("EPSG:3765")
    print(f"  simplified GDF: {len(gdf_jls_simp)} features")

    # Repair any invalid topology introduced by simplification (rare, near
    # very narrow features). buffer(0) is the canonical way to clean these up.
    n_invalid = (~gdf_jls_simp.geometry.is_valid).sum()
    if n_invalid:
        print(f"  repairing {n_invalid} invalid simplified geometries via make_valid")
        gdf_jls_simp["geometry"] = gdf_jls_simp.geometry.apply(make_valid)

    # The to_gdf() returns geometries in original coordinate space (EPSG:3765).
    # Re-attach the original DGU attributes by index (topojson preserves order).
    gdf_jls_simp = gdf_jls_simp.reset_index(drop=True)
    for col in ("naziv", "zupanija", "zupanija_short", "zupanija_id", "inspire_id",
                "maticni_broj", "skraceni_naziv", "roa", "status", "jls_type",
                "area_m2_orig"):
        gdf_jls_simp[col] = gdf_jls.reset_index(drop=True)[col].values

    # ---- Derive županije from simplified JLS ----
    print("Deriving županije from JLS-union (per zupanija_short) …")
    zup_diss = gdf_jls_simp.dissolve(by="zupanija_short", as_index=False)
    # Join DGU's own županija attributes by name
    zup_dgu = gpd.read_file(INPUT_ZUP_DGU).set_crs("EPSG:3765", allow_override=True)
    zup_dgu["zupanija_short"] = zup_dgu["naziv"].apply(short_zupanija)
    zup_attrs = zup_dgu[["zupanija_short", "broj_zupanije", "inspire_id", "skraceni_naziv", "roa", "naziv"]]
    zup_attrs = zup_attrs.rename(columns={
        "broj_zupanije": "zup_broj",
        "inspire_id": "zup_inspire_id",
        "skraceni_naziv": "zup_skraceni",
        "roa": "zup_roa",
        "naziv": "zup_naziv_full",
    })
    zup_merged = zup_diss.merge(zup_attrs, on="zupanija_short", how="left")
    zup_merged["area_m2_calc"] = zup_merged.geometry.area
    print(f"  {len(zup_merged)} županije polygons (derived)")

    # ---- Derive HR state border ----
    print("Deriving državna granica (union of all JLS) …")
    hr_geom = unary_union(list(gdf_jls_simp.geometry))
    drz_gdf = gpd.GeoDataFrame(
        [{"naziv": "Republika Hrvatska"}], geometry=[hr_geom], crs="EPSG:3765"
    )
    drz_gdf["area_m2_calc"] = drz_gdf.geometry.area
    print(f"  HR polygon area: {drz_gdf.iloc[0]['area_m2_calc'] / 1e6:,.1f} km²")

    # ---- Reproject to WGS84 + write ----
    print("Reprojecting + writing canonical layers …")
    gdf_jls_wgs = gdf_jls_simp.to_crs("EPSG:4326")
    zup_wgs = zup_merged.to_crs("EPSG:4326")
    drz_wgs = drz_gdf.to_crs("EPSG:4326")

    # JLS feature collection
    jls_features = []
    for i, (_, r) in enumerate(gdf_jls_wgs.iterrows(), start=1):
        if r.geometry.is_empty:
            continue
        area_m2 = float(r["area_m2_orig"])
        jls_features.append({
            "type": "Feature", "id": i,
            "properties": {
                "name": strip_bilingual(r["naziv"]),
                "name_full": r["naziv"],
                "type": r["jls_type"],
                "is_jls": True,
                "zupanija": r["zupanija_short"],
                "zupanija_full": r["zupanija"],
                "zupanija_id": int(r["zupanija_id"]) if r["zupanija_id"] else None,
                "inspire_id": r["inspire_id"],
                "maticni_broj": r["maticni_broj"],
                "skraceni_naziv": r["skraceni_naziv"] or None,
                "roa": r["roa"],
                "status": int(r["status"]),
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "color": ZUP_COLORS.get(r["zupanija_short"], "#8d99ae"),
                "source": "DGU+DZS",
            },
            "geometry": mapping(r.geometry),
        })

    n_grad = sum(1 for f in jls_features if f["properties"]["type"] == "Grad")
    n_opc = sum(1 for f in jls_features if f["properties"]["type"] == "Općina")
    print(f"\nFinal JLS counts:  {n_grad} Grad + {n_opc} Općina = {n_grad + n_opc}")
    print(f"Official targets:    128 Grad + 428 Općina = 556")

    with open(OUTPUT_JLS, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": jls_features},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUTPUT_JLS}: {len(jls_features)} features, {os.path.getsize(OUTPUT_JLS):,} bytes")

    # Županije FC (derived geometry)
    zup_features = []
    for i, (_, r) in enumerate(zup_wgs.iterrows(), start=1):
        if r.geometry.is_empty:
            continue
        area_m2 = float(r["area_m2_calc"])
        zup_features.append({
            "type": "Feature", "id": i,
            "properties": {
                "name": r["zupanija_short"],
                "name_full": r.get("zup_naziv_full") or r["zupanija_short"],
                "broj_zupanije": int(r["zup_broj"]) if r.get("zup_broj") is not None else None,
                "inspire_id": r.get("zup_inspire_id"),
                "skraceni_naziv": r.get("zup_skraceni") or None,
                "roa": r.get("zup_roa"),
                "color": ZUP_COLORS.get(r["zupanija_short"], "#8d99ae"),
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "source": "DGU (derived from JLS-union)",
            },
            "geometry": mapping(r.geometry),
        })
    with open(OUTPUT_ZUP, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": zup_features},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUTPUT_ZUP}: {len(zup_features)} županije, {os.path.getsize(OUTPUT_ZUP):,} bytes")

    # Državna granica FC
    drz_features = []
    for _, r in drz_wgs.iterrows():
        area_m2 = float(r["area_m2_calc"])
        drz_features.append({
            "type": "Feature", "id": 1,
            "properties": {
                "name": "Republika Hrvatska",
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "source": "DGU (derived from JLS-union)",
            },
            "geometry": mapping(r.geometry),
        })
    with open(OUTPUT_DRZ, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": drz_features},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUTPUT_DRZ}: 1 polygon, {os.path.getsize(OUTPUT_DRZ):,} bytes")


if __name__ == "__main__":
    main()
