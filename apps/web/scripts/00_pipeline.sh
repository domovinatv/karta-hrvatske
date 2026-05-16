#!/usr/bin/env bash
#
# DOMOVINA — End-to-end reproducibility pipeline
#
# Runs all steps from raw API fetching to final web app generation.
# Resumable — each step skips if its output already exists.
#
# Usage:
#   ./00_pipeline.sh          # run all steps
#   ./00_pipeline.sh zg       # only Zagrebačka županija pipeline
#   ./00_pipeline.sh hr       # only full-Croatia pipeline
#

set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data outputs

PYTHON="${PYTHON:-python3}"
TARGET="${1:-all}"

echo "=== DOMOVINA pipeline (target: $TARGET) ==="
echo "Working directory: $(pwd)"
echo

if [[ "$TARGET" == "zg" || "$TARGET" == "all" ]]; then
    echo "--- Step 1: Fetch Zagrebačka županija (34 JLS) from ISPU ---"
    if [[ ! -f data/zg_jls_with_wkt.json ]]; then
        $PYTHON scripts/fetch_zg.py
    else
        echo "  ✓ data/zg_jls_with_wkt.json exists, skipping"
    fi

    echo "--- Step 2: Reproject WKT to GeoJSON ---"
    if [[ ! -f data/zg_jls.geojson ]]; then
        $PYTHON scripts/01_wkt_to_geojson_zg.py
    else
        echo "  ✓ data/zg_jls.geojson exists, skipping"
    fi

    echo "--- Step 3: Topology analysis ---"
    if [[ ! -f outputs/zg_topology_report.json ]]; then
        $PYTHON scripts/02_topology_zg.py
    else
        echo "  ✓ outputs/zg_topology_report.json exists, skipping"
    fi

    echo "--- Step 4: Generate Phase 1 (Leaflet) web app ---"
    if [[ ! -f outputs/zagrebacka_zupanija.html ]]; then
        $PYTHON scripts/03_build_zg_phase1_leaflet.py
    else
        echo "  ✓ outputs/zagrebacka_zupanija.html exists, skipping"
    fi

    echo "--- Step 5: Generate Phase 2 (MapLibre) web app ---"
    if [[ ! -f outputs/zg_phase2_maplibre.html ]]; then
        $PYTHON scripts/04_build_zg_phase2_maplibre.py
    else
        echo "  ✓ outputs/zg_phase2_maplibre.html exists, skipping"
    fi
fi

if [[ "$TARGET" == "hr" || "$TARGET" == "all" ]]; then
    echo
    echo "--- Step 6: Fetch DZS official JLS list ---"
    if [[ ! -f data/hr_jls_list.json ]]; then
        $PYTHON scripts/05_fetch_dzs_jls_list.py
    else
        echo "  ✓ data/hr_jls_list.json exists, skipping"
    fi

    echo "--- Step 7a: Download geoBoundaries ADM2 (JLS polygons) ---"
    if [[ ! -f data/hr_adm2_geoboundaries_raw.geojson ]]; then
        $PYTHON scripts/06_fetch_geoboundaries.py
    else
        echo "  ✓ data/hr_adm2_geoboundaries_raw.geojson exists, skipping"
    fi

    echo "--- Step 7b: Download geoBoundaries ADM1 (županije, ground truth) ---"
    if [[ ! -f data/hr_adm1_geoboundaries_raw.geojson ]]; then
        $PYTHON scripts/06b_fetch_geoboundaries_adm1.py
    else
        echo "  ✓ data/hr_adm1_geoboundaries_raw.geojson exists, skipping"
    fi

    echo "--- Step 8: Process ADM2 (name match + ADM1 spatial collision resolver) ---"
    if [[ ! -f data/hr_adm2_processed.geojson ]]; then
        $PYTHON scripts/07_process_hr_adm2.py
    else
        echo "  ✓ data/hr_adm2_processed.geojson exists, skipping"
    fi

    echo "--- Step 9: Topology report for full HR ---"
    if [[ ! -f outputs/hr_topology_report.json ]]; then
        $PYTHON scripts/08_topology_hr.py
    else
        echo "  ✓ outputs/hr_topology_report.json exists, skipping"
    fi

    echo "--- Step 10: Generate full Croatia MapLibre web app ---"
    if [[ ! -f outputs/hrvatska_full.html ]]; then
        $PYTHON scripts/09_build_hr_full_app.py
    else
        echo "  ✓ outputs/hrvatska_full.html exists, skipping"
    fi

    echo "--- Step 11: Validate (geoBoundaries-derived dataset) ---"
    $PYTHON scripts/10_validate_zupanija.py

    echo
    echo "--- Step 12: Fetch DGU-authoritative JLS + županije from rpj WFS ---"
    if [[ ! -f data/dgu_jls.geojson ]]; then
        $PYTHON scripts/13_fetch_dgu_jls.py
    else
        echo "  ✓ data/dgu_jls.geojson exists, skipping"
    fi
    if [[ ! -f data/dgu_zupanije.geojson ]]; then
        $PYTHON scripts/14_fetch_dgu_zupanije.py
    else
        echo "  ✓ data/dgu_zupanije.geojson exists, skipping"
    fi

    echo "--- Step 13: Fetch all 6759 naselja from DGU (rpj:naselje, paginated) ---"
    if [[ ! -f data/dgu_naselja.geojson ]]; then
        $PYTHON scripts/17_fetch_dgu_naselja.py
    else
        echo "  ✓ data/dgu_naselja.geojson exists, skipping"
    fi

    echo "--- Step 14: Unified topology — naselja + JLS + županije + država ---"
    echo "    All four layers derived from one topology so shared edges align pixel-perfect."
    $PYTHON scripts/19_unified_topology.py

    $PYTHON scripts/09_build_hr_full_app.py
    $PYTHON scripts/10_validate_zupanija.py

    echo
    echo "  (Optional, slow): full ISPU scrape of all 556 JLS"
    echo "  Run separately: python3 scripts/fetch_all_hr.py"
    echo "  Output: data/hr_jls_full.json (~16 MB)"
fi

echo
echo "=== Pipeline complete ==="
echo "Outputs in: $(pwd)/outputs/"
ls -lh outputs/
