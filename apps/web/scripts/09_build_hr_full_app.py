#!/usr/bin/env python3
"""
Step 09 — Build full Croatia MapLibre web app.

Loads the template, injects processed GeoJSON + computed stats.

Input:  data/hr_adm2_processed.geojson
        scripts/templates/hrvatska_full.html.tmpl
Output: outputs/hrvatska_full.html
"""
import json
import os
import shutil
from pathlib import Path

INPUT_PATH = "data/hr_canonical.geojson"
INPUT_ZUP_PATH = "data/hr_canonical_zupanije.geojson"
INPUT_DRZ_PATH = "data/hr_canonical_drzava.geojson"
INPUT_NAS_PATH = "data/hr_canonical_naselja.geojson"
INPUT_CLUBS_PATH = "data/hr_football_clubs.geojson"
CLUBS_LOGOS_SRC = Path.home() / "git" / "ss" / "hrvatski-amaterski-nogometni-klubovi" / "data" / "logos"
TEMPLATE_PATH = "scripts/templates/hrvatska_full.html.tmpl"
OUTPUT_PATH = "outputs/hrvatska_full.html"
OUTPUT_NAS_PATH = "outputs/hrvatska_naselja.geojson"
OUTPUT_CLUBS_PATH = "outputs/hr_football_clubs.geojson"
OUTPUT_LOGOS_DIR = Path("outputs/logos")


def main():
    for p in (INPUT_PATH, INPUT_ZUP_PATH, INPUT_DRZ_PATH, TEMPLATE_PATH):
        if not os.path.exists(p):
            raise SystemExit(f"Missing {p}. Run scripts/15_build_canonical_dataset.py.")

    geojson_str = open(INPUT_PATH).read()
    geojson_zup_str = open(INPUT_ZUP_PATH).read()
    geojson_drz_str = open(INPUT_DRZ_PATH).read()
    template = open(TEMPLATE_PATH).read()

    # Naselja are loaded on-demand (~21 MB) via fetch() — copy beside the HTML.
    has_naselja = os.path.exists(INPUT_NAS_PATH)
    if has_naselja:
        os.makedirs(os.path.dirname(OUTPUT_NAS_PATH), exist_ok=True)
        with open(INPUT_NAS_PATH, "rb") as src, open(OUTPUT_NAS_PATH, "wb") as dst:
            dst.write(src.read())
        print(f"Copied {OUTPUT_NAS_PATH}: {os.path.getsize(OUTPUT_NAS_PATH):,} bytes")

    # Football clubs overlay — lazy-loaded too. Optional (skipped if not exported).
    n_clubs = 0
    if os.path.exists(INPUT_CLUBS_PATH):
        os.makedirs(os.path.dirname(OUTPUT_CLUBS_PATH), exist_ok=True)
        shutil.copyfile(INPUT_CLUBS_PATH, OUTPUT_CLUBS_PATH)
        n_clubs = len(json.loads(open(INPUT_CLUBS_PATH).read())["features"])
        print(f"Copied {OUTPUT_CLUBS_PATH}: {os.path.getsize(OUTPUT_CLUBS_PATH):,} bytes ({n_clubs} clubs)")
        if CLUBS_LOGOS_SRC.is_dir():
            OUTPUT_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
            copied = 0
            for png in CLUBS_LOGOS_SRC.glob("*.png"):
                shutil.copyfile(png, OUTPUT_LOGOS_DIR / png.name)
                copied += 1
            print(f"Copied {copied} logos -> {OUTPUT_LOGOS_DIR}")
    fc = json.loads(geojson_str)
    features = fc["features"]

    total_area = sum(f["properties"]["area_m2"] for f in features)
    n_zup = len(set(f["properties"]["zupanija"] for f in features))
    n_grad = sum(1 for f in features if f["properties"]["type"] == "Grad")
    n_opc = sum(1 for f in features if f["properties"]["type"] == "Općina")
    n_otok = sum(1 for f in features if f["properties"]["type"] == "Otok")
    # is_jls = real Jedinica Lokalne Samouprave (Grad or Općina). Otok features
    # are island fragments in geoBoundaries that aren't administrative JLS.
    n_jls = sum(
        1 for f in features
        if f["properties"].get("is_jls", f["properties"]["type"] in ("Grad", "Općina"))
    )

    # Aggregate per županija for sidebar
    zup_stats = {}
    for f in features:
        z = f["properties"]["zupanija"]
        if z not in zup_stats:
            zup_stats[z] = {"count": 0, "area": 0, "color": f["properties"]["color"]}
        zup_stats[z]["count"] += 1
        zup_stats[z]["area"] += f["properties"]["area_m2"]
    zup_sorted = sorted(zup_stats.items(), key=lambda x: -x[1]["area"])

    zup_summary_html = "".join(
        f'<div class="zup-row" data-zupanija="{z}">'
        f'<div class="zup-swatch" style="background:{s["color"]}"></div>'
        f'<div class="zup-name">{z}</div>'
        f'<div class="zup-meta">{s["count"]} · {s["area"] / 1e6:.0f}km²</div>'
        f"</div>"
        for z, s in zup_sorted
    )

    html = (
        template.replace("__GEOJSON__", geojson_str)
        .replace("__GEOJSON_ZUP__", geojson_zup_str)
        .replace("__GEOJSON_DRZ__", geojson_drz_str)
        .replace("__ZUP_ROWS__", zup_summary_html)
        .replace("__NJLS__", str(n_jls))
        .replace("__NOTOK__", str(n_otok))
        .replace("__N__", str(len(features)))
        .replace("__NZ__", str(n_zup))
        .replace("__NG__", str(n_grad))
        .replace("__NO__", str(n_opc))
        .replace("__AREA__", f"{total_area / 1e6:,.0f}".replace(",", " "))
        .replace("__TOTAL_AREA__", str(total_area))
        .replace("__NCLUBS__", str(n_clubs))
    )

    os.makedirs("outputs", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Generated {OUTPUT_PATH}: {os.path.getsize(OUTPUT_PATH):,} bytes ({os.path.getsize(OUTPUT_PATH) / 1024 / 1024:.2f} MB)")


if __name__ == "__main__":
    main()
