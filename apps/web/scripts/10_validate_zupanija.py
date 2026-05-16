#!/usr/bin/env python3
"""
Step 10 — Validate ADM2 → županija assignment against geoBoundaries ADM1.

Two checks per feature:
  A) Centroid containment:  feature centroid must lie inside the assigned ADM1
                            (županija) polygon.
  B) Majority area:         majority of the feature's area (>50%) must overlap
                            with the assigned ADM1 polygon.

Also reports:
  - JLS count per županija vs DZS (data completeness, not correctness)
  - Any županija missing entirely from the dataset

Input:  data/hr_adm2_processed.geojson
        data/hr_adm1_geoboundaries_raw.geojson
        data/hr_jls_list.json
Output: outputs/validation_report.json
        Stdout: human-readable summary
"""
import json
import os
import sys
from collections import Counter

import geopandas as gpd

INPUT_PROC = "data/hr_canonical.geojson"
INPUT_ADM1 = "data/hr_canonical_zupanije.geojson"
INPUT_DZS = "data/hr_jls_list.json"
OUTPUT_REPORT = "outputs/validation_report.json"

ADM1_ISO_TO_ZUP = {
    "HR-01": "Zagrebačka", "HR-02": "Krapinsko-zagorska", "HR-03": "Sisačko-moslavačka",
    "HR-04": "Karlovačka", "HR-05": "Varaždinska", "HR-06": "Koprivničko-križevačka",
    "HR-07": "Bjelovarsko-bilogorska", "HR-08": "Primorsko-goranska", "HR-09": "Ličko-senjska",
    "HR-10": "Virovitičko-podravska", "HR-11": "Požeško-slavonska", "HR-12": "Brodsko-posavska",
    "HR-13": "Zadarska", "HR-14": "Osječko-baranjska", "HR-15": "Šibensko-kninska",
    "HR-16": "Vukovarsko-srijemska", "HR-17": "Splitsko-dalmatinska", "HR-18": "Istarska",
    "HR-19": "Dubrovačko-neretvanska", "HR-20": "Međimurska", "HR-21": "Grad Zagreb",
}


def main():
    for p in (INPUT_PROC, INPUT_ADM1, INPUT_DZS):
        if not os.path.exists(p):
            raise SystemExit(f"Missing {p}")

    proc = gpd.read_file(INPUT_PROC)
    adm1 = gpd.read_file(INPUT_ADM1)
    # Canonical županije file already has property "name" = short županija name.
    # geoBoundaries fallback uses shapeISO. Detect which one we have.
    if "name" in adm1.columns:
        adm1["zupanija"] = adm1["name"]
    else:
        adm1["zupanija"] = adm1["shapeISO"].map(ADM1_ISO_TO_ZUP)
    dzs = json.load(open(INPUT_DZS))

    # Project to HTRS96/TM for accurate centroid + area math
    proc_tm = proc.to_crs("EPSG:3765")
    adm1_tm = adm1.to_crs("EPSG:3765")
    adm1_geom = {z: g for z, g in zip(adm1_tm["zupanija"], adm1_tm.geometry)}

    hard_violations = []   # both centroid AND majority-area disagree
    borderline = []        # centroid disagrees but >50% area is in assigned (DZS still authoritative)

    for idx, row in proc_tm.iterrows():
        assigned = row["zupanija"]
        geom = row.geometry
        if geom.is_empty:
            continue

        target = adm1_geom.get(assigned)
        if target is None:
            hard_violations.append({
                "id": int(proc.iloc[idx]["id"]) if "id" in proc.columns else int(idx),
                "name": row["name"], "type": row["type"],
                "assigned": assigned,
                "reason": "assigned županija missing from ADM1",
            })
            continue

        cen = geom.centroid

        # Where is the centroid: containing županija, or nearest if it falls in
        # the sea (coastal features can have centroids just offshore).
        real = next((z for z, g in adm1_geom.items() if g.contains(cen)), None)
        if real is None:
            real = min(adm1_geom.items(), key=lambda kv: kv[1].distance(cen))[0]

        # Area overlap with assigned, plus best alternative
        try:
            assigned_ratio = geom.intersection(target).area / geom.area if geom.area > 0 else 0
        except Exception:
            assigned_ratio = 0
        best_z, best_r = max(
            ((z, geom.intersection(g).area / geom.area if geom.area > 0 else 0)
             for z, g in adm1_geom.items()),
            key=lambda kv: kv[1],
        )

        if real == assigned and assigned_ratio >= 0.5:
            continue  # all good

        record = {
            "id": int(proc.iloc[idx]["id"]) if "id" in proc.columns else int(idx),
            "name": row["name"], "shapeName": row.get("shapeName") or row.get("name_full") or row["name"],
            "type": row["type"], "is_jls": bool(row.get("is_jls", True)),
            "assigned": assigned,
            "centroid_in": real,
            "assigned_overlap_pct": round(assigned_ratio * 100, 1),
            "best_match": best_z,
            "best_overlap_pct": round(best_r * 100, 1),
        }

        # Hard violation: majority of polygon area is NOT in the assigned županija
        if assigned_ratio < 0.5 and best_z != assigned:
            hard_violations.append(record)
        else:
            # Borderline: centroid in neighbour county but most of polygon is in
            # the assigned županija. DZS is authoritative; usually a thin strip
            # crossing geoBoundaries' (imprecise) ADM1 border line.
            borderline.append(record)

    # Coverage check
    dzs_counts = Counter(j["zupanija"] for j in dzs)
    proc_jls_counts = Counter(
        f["properties"]["zupanija"]
        for _, f in proc.iterrows()
        for f in [{"properties": {"zupanija": _.zupanija, "is_jls": _.get("is_jls", True)}}]
    ) if False else Counter(
        row["zupanija"] for _, row in proc.iterrows() if bool(row.get("is_jls", True))
    )

    coverage_diffs = []
    for z in sorted(set(dzs_counts) | set(proc_jls_counts)):
        d = dzs_counts.get(z, 0)
        p = proc_jls_counts.get(z, 0)
        if d != p:
            coverage_diffs.append({"županija": z, "dzs": d, "ours_jls": p, "diff": p - d})

    # Print summary
    print("=" * 70)
    print("VALIDATION REPORT  —  ADM2 → županija assignment")
    print("=" * 70)
    print(f"\nFeatures total:    {len(proc)}")
    print(f"  is_jls=True:     {int(proc['is_jls'].sum() if 'is_jls' in proc.columns else 0)}  (Grad + Općina)")
    print(f"  is_jls=False:    {int((~proc['is_jls']).sum() if 'is_jls' in proc.columns else 0)}  (Otok fragments)")

    print(f"\n[A] HARD violations (majority of polygon is in another županija): {len(hard_violations)}")
    for v in hard_violations:
        print(f"  - {v['name']:35} ({v['type']}): assigned={v['assigned']} ({v['assigned_overlap_pct']}%)  best={v['best_match']} ({v['best_overlap_pct']}%)")
    if not hard_violations:
        print("  (none — every feature's polygon is majority-inside its assigned županija)")

    print(f"\n[B] Borderline (centroid falls in neighbour but >50% area is in assigned): {len(borderline)}")
    for v in borderline:
        print(f"  - {v['name']:35} ({v['type']}): assigned={v['assigned']} ({v['assigned_overlap_pct']}% area)  centroid in {v['centroid_in']}")

    print(f"\n[C] JLS-count diffs vs DZS (data completeness, not assignment correctness): {len(coverage_diffs)}")
    for d in coverage_diffs:
        print(f"  {d['županija']:30}  DZS={d['dzs']}  ours={d['ours_jls']}  diff={d['diff']:+d}")
    if not coverage_diffs:
        print("  (perfect coverage)")

    report = {
        "summary": {
            "features_total": len(proc),
            "hard_violations": len(hard_violations),
            "borderline": len(borderline),
            "coverage_diffs": len(coverage_diffs),
        },
        "hard_violations": hard_violations,
        "borderline": borderline,
        "coverage_diffs": coverage_diffs,
    }
    os.makedirs(os.path.dirname(OUTPUT_REPORT), exist_ok=True)
    with open(OUTPUT_REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {OUTPUT_REPORT}")

    if hard_violations:
        sys.exit(1)


if __name__ == "__main__":
    main()
