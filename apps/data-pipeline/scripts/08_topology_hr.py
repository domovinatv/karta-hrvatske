#!/usr/bin/env python3
"""
Step 08 — Topology report for full Croatia ADM2 dataset.

Input:  data/hr_adm2_processed.geojson
Output: outputs/hr_topology_report.json
"""
import json
import os

INPUT_PATH = "data/hr_adm2_processed.geojson"
OUTPUT_PATH = "outputs/hr_topology_report.json"


def main():
    if not os.path.exists(INPUT_PATH):
        raise SystemExit(f"Missing {INPUT_PATH}. Run 07_process_hr_adm2.py first.")

    fc = json.load(open(INPUT_PATH))
    features = fc["features"]
    total_area = sum(f["properties"]["area_m2"] for f in features)

    zups = {}
    for f in features:
        z = f["properties"]["zupanija"]
        if z not in zups:
            zups[z] = {"count": 0, "area": 0}
        zups[z]["count"] += 1
        zups[z]["area"] += f["properties"]["area_m2"]

    report = {
        "snapshot_date": "2026-04-28",
        "scope": "All of Republic of Croatia, JLS level (ADM2)",
        "data_source": {
            "primary": "geoBoundaries Open ADM2 (CC0)",
            "url": "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/HRV/ADM2/geoBoundaries-HRV-ADM2.geojson",
            "license": "Creative Commons CC0 (public domain)",
        },
        "feature_counts": {
            "total_features": len(features),
            "expected_jls_dzs": 556,
            "extra_features": len(features) - 556,
            "extra_explanation": "geoBoundaries fragments some islands into separate polygons",
        },
        "area_summary": {
            "computed_km2": round(total_area / 1e6, 2),
            "dzs_official_km2": 56594,
            "delta_km2": round(total_area / 1e6 - 56594, 2),
            "delta_percent": round((total_area / 1e6 - 56594) / 56594 * 100, 3),
        },
        "by_zupanija": [
            {"name": z, "count": s["count"], "area_km2": round(s["area"] / 1e6, 2)}
            for z, s in sorted(zups.items(), key=lambda x: -x[1]["area"])
        ],
        "comparison_to_ispu": {
            "ispu_canonical_status": "Canonical (Croatian Ministry of Construction & Spatial Planning)",
            "ispu_acquisition_speed": "Slow (~7s per request, 556 JLS × 2 requests = ~2 hours sequential)",
            "geoboundaries_acquisition_speed": "Instant (single 20MB file download)",
            "use_for_ground_truth": "ISPU when accuracy critical (smart contract Merkle commitment)",
            "use_for_visualization": "geoBoundaries (sufficient accuracy, 100x faster, no rate limits)",
        },
    }

    os.makedirs("outputs", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"=== FULL HR PROCESSING SUMMARY ===")
    print(f"Features:   {len(features)} JLS")
    print(f"Total area: {total_area / 1e6:,.2f} km² (DZS: 56,594 km²)")
    print(f"Delta:      {total_area / 1e6 - 56594:+,.2f} km²")
    print(f"Saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
