#!/usr/bin/env python3
"""
Step 06b — Download geoBoundaries ADM1 (županije) for Croatia.

Used as ground truth for spatial validation of ADM2 → županija assignment:
each ADM2 feature centroid must fall inside one of these 21 ADM1 polygons.

Pinned to specific commit hash for reproducibility.

Output: data/hr_adm1_geoboundaries_raw.geojson
"""
import os
import urllib.request

PINNED_COMMIT = "9469f09"
URL = (
    f"https://github.com/wmgeolab/geoBoundaries/raw/{PINNED_COMMIT}/"
    f"releaseData/gbOpen/HRV/ADM1/geoBoundaries-HRV-ADM1.geojson"
)
OUTPUT_PATH = "data/hr_adm1_geoboundaries_raw.geojson"

HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}


def main():
    if os.path.exists(OUTPUT_PATH):
        print(f"Already have {OUTPUT_PATH}, skipping")
        return

    os.makedirs("data", exist_ok=True)
    print(f"Downloading {URL}")
    print(f"  (geoBoundaries Open ADM1, CC0 license, commit {PINNED_COMMIT})")
    req = urllib.request.Request(URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as r, open(OUTPUT_PATH, "wb") as f:
        f.write(r.read())
    print(f"Saved {OUTPUT_PATH}: {os.path.getsize(OUTPUT_PATH):,} bytes")


if __name__ == "__main__":
    main()
