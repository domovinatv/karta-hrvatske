#!/usr/bin/env python3
"""
Step 18 — Build canonical naselja layer from DGU rpj:naselje, joined with
the canonical JLS for parent JLS / županija context.

Topology-preserving simplification is applied across all 6759 naselja in
one pass so that adjacent-naselja borders (within the same JLS) align
without sliver gaps. We then join JLS metadata by jls_id.

Inputs:
  data/dgu_naselja.geojson      (raw, ~77 MB)
  data/hr_canonical.geojson     (our 556 JLS — for type & zupanija)
Output:
  data/hr_canonical_naselja.geojson

Per-feature properties:
  id, name, name_full, jls_name, jls_type, zupanija, zupanija_id,
  jls_id, dgu_id, inspire_id, maticni_broj, skraceni_naziv,
  stanovnistvo, area_m2, area_km2, color (per-zupanija).
"""
import json
import os

import math

import geopandas as gpd
import topojson as tp
from shapely import make_valid
from shapely.geometry import mapping


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
    """pandas-NaN- and float-NaN-safe: returns None for NaN/empty, else str."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    s = str(v)
    return s if s else None

INPUT_NAS = "data/dgu_naselja.geojson"
INPUT_JLS = "data/hr_canonical.geojson"
OUTPUT = "data/hr_canonical_naselja.geojson"

# Naselja are smaller than JLS; coarser simplification keeps file size manageable.
SIMPLIFY_TOLERANCE_M = 20.0


def main():
    for p in (INPUT_NAS, INPUT_JLS):
        if not os.path.exists(p):
            raise SystemExit(f"Missing {p}")

    print("Loading raw naselja …")
    nas = gpd.read_file(INPUT_NAS).set_crs("EPSG:3765", allow_override=True)
    print(f"  {len(nas)} naselja")
    nas["area_m2_orig"] = nas.geometry.area

    # JLS lookup. DGU's naselja.jls_id is a SHORT internal id (e.g. 6149) that
    # does not match DGU jls.id (long, e.g. 2185922196). The reliable join key
    # is the naselja.jls field — UPPERCASE JLS name (e.g. "ŠODOLOVCI"). We
    # match it against the canonical JLS name (case-insensitive).
    print("Loading canonical JLS …")
    canonical_features = json.load(open(INPUT_JLS))["features"]
    name_to_canonical = {}
    for f in canonical_features:
        p = f["properties"]
        for n in (p.get("name"), p.get("name_full")):
            if n:
                name_to_canonical[n.upper()] = p

    # Topology-preserving simplify
    print(f"Building topology over {len(nas)} naselja …")
    topo = tp.Topology(nas, prequantize=False)
    print(f"  arcs: {len(topo.output['arcs'])}")
    print(f"Simplifying topology @ {SIMPLIFY_TOLERANCE_M} m …")
    nas_simp = topo.toposimplify(SIMPLIFY_TOLERANCE_M, prevent_oversimplify=True).to_gdf().set_crs("EPSG:3765")
    nas_simp = nas_simp.reset_index(drop=True)
    n_invalid = (~nas_simp.geometry.is_valid).sum()
    if n_invalid:
        print(f"  repairing {n_invalid} invalid geometries via make_valid")
        nas_simp["geometry"] = nas_simp.geometry.apply(make_valid)

    # Re-attach attributes by index
    nas_orig = nas.reset_index(drop=True)
    for col in ("id", "inspire_id", "maticni_broj", "jls", "naziv",
                "skraceni_naziv", "jls_id", "stanovnistvo", "area_m2_orig"):
        nas_simp[col] = nas_orig[col].values

    # Reproject to WGS84
    print("Reprojecting to WGS84 …")
    nas_wgs = nas_simp.to_crs("EPSG:4326")

    # Build canonical features
    features = []
    no_jls_match = 0
    for i, (_, r) in enumerate(nas_wgs.iterrows(), start=1):
        if r.geometry.is_empty:
            continue
        # Resolve parent JLS via DGU jls_id → maticni_broj → canonical JLS row
        jls_props = None
        jls_name_upper = (r["jls"] or "").upper()
        jls_props = name_to_canonical.get(jls_name_upper)
        if jls_props is None:
            no_jls_match += 1

        area_m2 = float(r["area_m2_orig"])
        features.append({
            "type": "Feature", "id": i,
            "properties": {
                "name": _str_or_none(r["naziv"]),
                "name_full": _str_or_none(r["naziv"]),
                "skraceni_naziv": _str_or_none(r["skraceni_naziv"]),
                "dgu_id": _int_or_none(r["id"]),
                "inspire_id": _str_or_none(r["inspire_id"]),
                "maticni_broj": _str_or_none(r["maticni_broj"]),
                "stanovnistvo": _int_or_none(r["stanovnistvo"]),
                "jls_name": jls_props["name"] if jls_props else _str_or_none(r["jls"]),
                "jls_type": jls_props["type"] if jls_props else None,
                "zupanija": jls_props["zupanija"] if jls_props else None,
                "zupanija_id": jls_props.get("zupanija_id") if jls_props else None,
                "jls_id": _int_or_none(r["jls_id"]),
                "area_m2": round(area_m2, 2),
                "area_km2": round(area_m2 / 1e6, 4),
                "color": jls_props["color"] if jls_props else "#8d99ae",
                "source": "DGU rpj:naselje",
            },
            "geometry": mapping(r.geometry),
        })

    if no_jls_match:
        print(f"  !! {no_jls_match} naselja could not be linked to a canonical JLS")

    fc = {"type": "FeatureCollection", "features": features}
    with open(OUTPUT, "w", encoding="utf-8") as f:
        # allow_nan=False raises if any NaN slips through, catching bugs early.
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    total_pop = sum(f["properties"]["stanovnistvo"] or 0 for f in features)
    print(f"\nWrote {OUTPUT}: {len(features)} naselja, {os.path.getsize(OUTPUT):,} bytes")
    print(f"Total population (sum stanovnistvo): {total_pop:,}")


if __name__ == "__main__":
    main()
