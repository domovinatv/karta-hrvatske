#!/usr/bin/env python3
"""
Step 19 — Unified topology: build naselja + JLS + županije + država from a
SINGLE topology so every level aligns pixel-perfect.

Why: naselja tile their parent JLS, JLS tile their parent županija, and the
union of all is the state. If we simplify each level independently, shared
borders get different vertex sequences → visible mismatches at high zoom.
This script builds ONE topology over the finest level (naselja), simplifies
it once, then DERIVES the coarser layers by dissolving — guaranteeing every
shared edge is identical.

Inputs:
  data/dgu_naselja.geojson    (6759, EPSG:3765, source of truth for geometry)
  data/dgu_jls.geojson        (556, for DGU JLS metadata: maticni_broj, roa, …)
  data/dgu_zupanije.geojson   (21, for županija metadata)
  data/hr_jls_list.json       (DZS Census 2021, for Grad/Općina type)

Outputs (all WGS84, simplified, topologically consistent):
  data/hr_canonical_naselja.geojson    (6759)
  data/hr_canonical.geojson            (556 JLS, derived)
  data/hr_canonical_zupanije.geojson   (21, derived)
  data/hr_canonical_drzava.geojson     (1, derived)
"""
import json
import math
import os
import re
import unicodedata

import geopandas as gpd
import topojson as tp
from shapely import make_valid
from shapely.geometry import mapping
from shapely.ops import unary_union

INPUT_NAS = "data/dgu_naselja.geojson"
INPUT_JLS = "data/dgu_jls.geojson"
INPUT_ZUP = "data/dgu_zupanije.geojson"
INPUT_DZS = "data/hr_jls_list.json"

OUT_NAS = "data/hr_canonical_naselja.geojson"
OUT_JLS = "data/hr_canonical.geojson"
OUT_ZUP = "data/hr_canonical_zupanije.geojson"
OUT_DRZ = "data/hr_canonical_drzava.geojson"

# Simplification tolerance, metres. Naselja are smaller than JLS so we use a
# slightly looser tolerance than the standalone JLS build (was 15 m). Twenty
# metres still gives smooth borders at the zoom levels users actually reach.
SIMPLIFY_TOLERANCE_M = 20.0

# Palette for per-naselja coloring. Hash of maticni_broj → index. Chosen so
# adjacent naselja most often pick different colors (visually distinct mosaic).
NAS_PALETTE = [
    "#e63946", "#f4a261", "#e9c46a", "#2a9d8f", "#06aed5",
    "#588b8b", "#9d4edd", "#c8553d", "#81b29a", "#bc6c25",
    "#1d3557", "#a8dadc", "#457b9d", "#ef233c", "#606c38",
    "#264653", "#3d405b", "#c9184a",
]


def naselje_color(maticni_broj: str | None) -> str:
    if not maticni_broj:
        return NAS_PALETTE[0]
    h = sum(ord(c) for c in maticni_broj) * 31 + len(maticni_broj)
    return NAS_PALETTE[h % len(NAS_PALETTE)]


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


def _int_or_none(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f):
        return None
    return int(f)


def _str_or_none(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    s = str(v)
    return s if s else None


def short_zupanija(naziv: str) -> str:
    return naziv[: -len(" županija")] if naziv.endswith(" županija") else naziv


def strip_bilingual(s: str) -> str:
    return re.split(r"\s[–—-]\s", s, maxsplit=1)[0].strip()


def hyphen_normalize(s: str) -> str:
    return re.sub(r"\s*[-–—]\s*", "-", s)


def ascii_norm(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
    ).lower()


def lookup_dzs_type(naziv: str, zupanija_short: str, dzs_idx: dict) -> str | None:
    if zupanija_short == "Grad Zagreb":
        return "Grad"
    candidates = [
        strip_bilingual(naziv).lower(),
        hyphen_normalize(strip_bilingual(naziv)).lower(),
        hyphen_normalize(naziv).lower(),
        naziv.lower(),
    ]
    for c in candidates:
        t = dzs_idx.get((c, zupanija_short))
        if t:
            return t
    for c in candidates:
        for (n, z), t in dzs_idx.items():
            if z == zupanija_short and ascii_norm(n) == ascii_norm(c):
                return t
    return None


def main():
    for p in (INPUT_NAS, INPUT_JLS, INPUT_ZUP, INPUT_DZS):
        if not os.path.exists(p):
            raise SystemExit(f"Missing {p}")

    print("Loading DGU naselja …")
    nas = gpd.read_file(INPUT_NAS).set_crs("EPSG:3765", allow_override=True)
    print(f"  {len(nas)} naselja")

    print("Loading DGU JLS for parent metadata …")
    jls = gpd.read_file(INPUT_JLS).set_crs("EPSG:3765", allow_override=True)
    jls["zupanija_short"] = jls["zupanija"].apply(short_zupanija)
    # NOTE: DGU's `jls` field on naselja is just the upper-case JLS NAME, which
    # collides for Otok / Privlaka / Sveta Nedelja (2 distinct JLS each). The
    # short `jls_id` on naselja is yet another DGU internal id that does NOT
    # match `jls.id` either. The only reliable parent join is therefore SPATIAL:
    # naselja centroid → JLS polygon (point-in-polygon).

    print("Loading DGU županije metadata …")
    zup_dgu = gpd.read_file(INPUT_ZUP)
    zup_meta_by_short = {}
    for _, r in zup_dgu.iterrows():
        short = short_zupanija(r["naziv"])
        zup_meta_by_short[short] = {
            "naziv_full": r["naziv"],
            "broj_zupanije": _int_or_none(r["broj_zupanije"]),
            "inspire_id": _str_or_none(r["inspire_id"]),
            "skraceni_naziv": _str_or_none(r["skraceni_naziv"]),
            "roa": _str_or_none(r["roa"]),
        }

    print("Loading DZS for Grad/Općina type …")
    dzs = json.load(open(INPUT_DZS))
    dzs_idx = {}
    for r in dzs:
        canon = strip_bilingual(r["name"]).lower()
        dzs_idx[(canon, r["zupanija"])] = r["type"]

    # Spatial join: naselje centroid → containing JLS polygon (unique).
    print("Spatial-joining naselja → parent JLS by centroid containment …")
    nas = nas.reset_index(drop=True).copy()
    centroids = nas.geometry.centroid
    cen_gdf = gpd.GeoDataFrame(
        {"_nas_idx": nas.index}, geometry=centroids, crs=nas.crs
    )
    joined = gpd.sjoin(
        cen_gdf, jls[["geometry", "naziv", "zupanija", "zupanija_short",
                       "zupanija_id", "inspire_id", "maticni_broj",
                       "skraceni_naziv", "roa", "status"]],
        how="left", predicate="within"
    )
    # Some centroids may fall on a JLS border or just outside (coastal); for
    # those, fall back to the geographically NEAREST JLS by centroid distance.
    missing = joined[joined.index_right.isna()]
    if len(missing):
        print(f"  {len(missing)} naselje centroids not strictly within any JLS — using nearest")
        # Per-row nearest (Pandas-friendly via apply)
        for idx, row in missing.iterrows():
            dists = jls.geometry.distance(row.geometry)
            j = dists.idxmin()
            for col in ("naziv", "zupanija", "zupanija_short", "zupanija_id",
                        "inspire_id", "maticni_broj", "skraceni_naziv", "roa", "status"):
                joined.at[idx, col] = jls.at[j, col]
    # Drop dupes (a centroid exactly on a shared edge can match >1 polygon)
    joined = joined[~joined["_nas_idx"].duplicated(keep="first")]
    joined = joined.sort_values("_nas_idx").reset_index(drop=True)

    nas["jls_name"] = joined["naziv"].values
    nas["zupanija_full"] = joined["zupanija"].values
    nas["zupanija_short"] = joined["zupanija_short"].values
    nas["zupanija_id"] = [_int_or_none(v) for v in joined["zupanija_id"].values]
    nas["jls_inspire_id"] = [_str_or_none(v) for v in joined["inspire_id"].values]
    nas["jls_maticni_broj"] = [_str_or_none(v) for v in joined["maticni_broj"].values]
    nas["jls_skraceni"] = [_str_or_none(v) for v in joined["skraceni_naziv"].values]
    nas["jls_roa"] = [_str_or_none(v) for v in joined["roa"].values]
    nas["jls_status"] = [_int_or_none(v) for v in joined["status"].values]
    nas["jls_type"] = [
        lookup_dzs_type(name, zsh, dzs_idx) or "Općina"
        for name, zsh in zip(nas["jls_name"], nas["zupanija_short"])
    ]
    nas["color"] = nas["zupanija_short"].map(lambda z: ZUP_COLORS.get(z, "#8d99ae"))

    # Pre-compute naselje area in metric CRS BEFORE simplification (true area).
    nas["area_m2_orig"] = nas.geometry.area

    n_unmatched = nas["jls_name"].isna().sum()
    if n_unmatched:
        print(f"  !! {n_unmatched} naselja could not be linked to a JLS — sample:")
        for u in nas[nas["jls_name"].isna()]["jls"].unique()[:5]:
            print(f"     '{u}'")

    # ---- Topology ----
    print(f"\nBuilding topology over {len(nas)} naselja …")
    topo = tp.Topology(nas, prequantize=False)
    print(f"  arcs: {len(topo.output['arcs'])}")
    print(f"Simplifying topology @ {SIMPLIFY_TOLERANCE_M} m …")
    nas_simp = topo.toposimplify(SIMPLIFY_TOLERANCE_M, prevent_oversimplify=True).to_gdf().set_crs("EPSG:3765")
    nas_simp = nas_simp.reset_index(drop=True)
    n_invalid = (~nas_simp.geometry.is_valid).sum()
    if n_invalid:
        print(f"  repairing {n_invalid} invalid geometries via make_valid")
        nas_simp["geometry"] = nas_simp.geometry.apply(make_valid)

    # Re-attach attributes by row index (topojson preserves order)
    for col in ("id", "inspire_id", "maticni_broj", "jls", "naziv", "skraceni_naziv",
                "jls_id", "stanovnistvo", "jls_name", "jls_inspire_id",
                "jls_maticni_broj", "jls_skraceni", "jls_roa", "jls_status",
                "zupanija_full", "zupanija_short", "zupanija_id", "jls_type",
                "color", "area_m2_orig"):
        nas_simp[col] = nas[col].values

    # ---- Derive JLS by dissolving naselja by jls_maticni_broj ----
    # NB: jls_name alone collides for "Otok" / "Sveta Nedelja" / "Privlaka",
    # which would silently merge two distinct JLS in different counties.
    # maticni_broj is unique per JLS and is the safe key.
    print("\nDeriving JLS from naselja-union (by jls_maticni_broj) …")
    jls_dissolved = nas_simp.dissolve(by="jls_maticni_broj", as_index=False)
    first_attrs = nas_simp.groupby("jls_maticni_broj").first()[
        ["jls_name", "jls_type", "zupanija_short", "zupanija_full", "zupanija_id",
         "jls_inspire_id", "jls_skraceni", "jls_roa", "jls_status", "color"]
    ].reset_index()
    jls_dissolved = jls_dissolved.drop(columns=[
        "jls_name", "jls_type", "zupanija_short", "zupanija_full", "zupanija_id",
        "jls_inspire_id", "jls_skraceni", "jls_roa", "jls_status", "color"
    ], errors="ignore").merge(first_attrs, on="jls_maticni_broj", how="left")
    jls_dissolved["area_m2_calc"] = jls_dissolved.geometry.area
    print(f"  {len(jls_dissolved)} JLS polygons (derived)")

    # ---- Derive županije ----
    print("Deriving županije from JLS-union (by zupanija_short) …")
    zup_diss = jls_dissolved.dissolve(by="zupanija_short", as_index=False)
    zup_diss["area_m2_calc"] = zup_diss.geometry.area
    print(f"  {len(zup_diss)} županije polygons (derived)")

    # ---- Derive državna granica ----
    print("Deriving državna granica (union of all naselja) …")
    hr_geom = unary_union(list(nas_simp.geometry))
    drz_gdf = gpd.GeoDataFrame(
        [{"naziv": "Republika Hrvatska"}], geometry=[hr_geom], crs="EPSG:3765"
    )
    drz_gdf["area_m2_calc"] = drz_gdf.geometry.area
    print(f"  HR polygon area: {drz_gdf.iloc[0]['area_m2_calc'] / 1e6:,.1f} km²")

    # ---- Reproject to WGS84 ----
    print("\nReprojecting + writing canonical layers …")
    nas_wgs = nas_simp.to_crs("EPSG:4326")
    jls_wgs = jls_dissolved.to_crs("EPSG:4326")
    zup_wgs = zup_diss.to_crs("EPSG:4326")
    drz_wgs = drz_gdf.to_crs("EPSG:4326")

    # ---- Write naselja ----
    nas_features = []
    for i, (_, r) in enumerate(nas_wgs.iterrows(), start=1):
        if r.geometry.is_empty:
            continue
        area_m2 = float(r["area_m2_orig"])
        nas_features.append({
            "type": "Feature", "id": i,
            "properties": {
                "name": _str_or_none(r["naziv"]),
                "name_full": _str_or_none(r["naziv"]),
                "skraceni_naziv": _str_or_none(r["skraceni_naziv"]),
                "dgu_id": _int_or_none(r["id"]),
                "inspire_id": _str_or_none(r["inspire_id"]),
                "maticni_broj": _str_or_none(r["maticni_broj"]),
                "stanovnistvo": _int_or_none(r["stanovnistvo"]),
                "jls_name": _str_or_none(r["jls_name"]) or _str_or_none(r["jls"]),
                "jls_type": _str_or_none(r["jls_type"]),
                "jls_maticni_broj": _str_or_none(r["jls_maticni_broj"]),
                "zupanija": _str_or_none(r["zupanija_short"]),
                "zupanija_id": _int_or_none(r["zupanija_id"]),
                "jls_id": _int_or_none(r["jls_id"]),
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "color": _str_or_none(r["color"]) or "#8d99ae",
                "nas_color": naselje_color(_str_or_none(r["maticni_broj"])),
                "source": "DGU rpj:naselje",
            },
            "geometry": mapping(r.geometry),
        })
    with open(OUT_NAS, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": nas_features}, f,
                  ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"Wrote {OUT_NAS}: {len(nas_features)} naselja, {os.path.getsize(OUT_NAS):,} bytes")

    # ---- Write JLS ----
    jls_features = []
    for i, (_, r) in enumerate(jls_wgs.iterrows(), start=1):
        if r.geometry.is_empty:
            continue
        area_m2 = float(r["area_m2_calc"])
        jls_features.append({
            "type": "Feature", "id": i,
            "properties": {
                "name": _str_or_none(r["jls_name"]),
                "name_full": _str_or_none(r["jls_name"]),
                "type": _str_or_none(r["jls_type"]),
                "is_jls": True,
                "zupanija": _str_or_none(r["zupanija_short"]),
                "zupanija_full": _str_or_none(r["zupanija_full"]),
                "zupanija_id": _int_or_none(r["zupanija_id"]),
                "inspire_id": _str_or_none(r["jls_inspire_id"]),
                "maticni_broj": _str_or_none(r["jls_maticni_broj"]),
                "skraceni_naziv": _str_or_none(r["jls_skraceni"]),
                "roa": _str_or_none(r["jls_roa"]),
                "status": _int_or_none(r["jls_status"]),
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "color": _str_or_none(r["color"]) or "#8d99ae",
                "source": "DGU+DZS (derived from naselja-union)",
            },
            "geometry": mapping(r.geometry),
        })

    n_grad = sum(1 for f in jls_features if f["properties"]["type"] == "Grad")
    n_opc = sum(1 for f in jls_features if f["properties"]["type"] == "Općina")
    print(f"\n  Final JLS counts:  {n_grad} Grad + {n_opc} Općina = {n_grad + n_opc}")
    print(f"  Official targets:    128 Grad + 428 Općina = 556")

    with open(OUT_JLS, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": jls_features}, f,
                  ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"Wrote {OUT_JLS}: {len(jls_features)} JLS, {os.path.getsize(OUT_JLS):,} bytes")

    # ---- Write županije ----
    zup_features = []
    for i, (_, r) in enumerate(zup_wgs.iterrows(), start=1):
        if r.geometry.is_empty:
            continue
        meta = zup_meta_by_short.get(r["zupanija_short"], {})
        area_m2 = float(r["area_m2_calc"])
        zup_features.append({
            "type": "Feature", "id": i,
            "properties": {
                "name": _str_or_none(r["zupanija_short"]),
                "name_full": _str_or_none(meta.get("naziv_full")) or _str_or_none(r["zupanija_short"]),
                "broj_zupanije": _int_or_none(meta.get("broj_zupanije")),
                "inspire_id": _str_or_none(meta.get("inspire_id")),
                "skraceni_naziv": _str_or_none(meta.get("skraceni_naziv")),
                "roa": _str_or_none(meta.get("roa")),
                "color": ZUP_COLORS.get(r["zupanija_short"], "#8d99ae"),
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "source": "DGU (derived from naselja-union)",
            },
            "geometry": mapping(r.geometry),
        })
    with open(OUT_ZUP, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": zup_features}, f,
                  ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"Wrote {OUT_ZUP}: {len(zup_features)} županije, {os.path.getsize(OUT_ZUP):,} bytes")

    # ---- Write država ----
    drz_features = []
    for _, r in drz_wgs.iterrows():
        area_m2 = float(r["area_m2_calc"])
        drz_features.append({
            "type": "Feature", "id": 1,
            "properties": {
                "name": "Republika Hrvatska",
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "source": "DGU (derived from naselja-union)",
            },
            "geometry": mapping(r.geometry),
        })
    with open(OUT_DRZ, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": drz_features}, f,
                  ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"Wrote {OUT_DRZ}: 1 polygon, {os.path.getsize(OUT_DRZ):,} bytes")


if __name__ == "__main__":
    main()
