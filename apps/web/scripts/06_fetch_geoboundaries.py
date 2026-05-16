#!/usr/bin/env python3
"""
Step 06 — Download geoBoundaries ADM2 (CC0) for Croatia.

Pinned to specific commit hash for reproducibility.

Output: data/hr_adm2_geoboundaries_raw.geojson
"""
import os
import urllib.request

PINNED_COMMIT = "9469f09"
URL = (
    f"https://github.com/wmgeolab/geoBoundaries/raw/{PINNED_COMMIT}/"
    f"releaseData/gbOpen/HRV/ADM2/geoBoundaries-HRV-ADM2.geojson"
)
OUTPUT_PATH = "data/hr_adm2_geoboundaries_raw.geojson"

HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}


def main():
    if os.path.exists(OUTPUT_PATH):
        print(f"Already have {OUTPUT_PATH}, skipping")
        return

    os.makedirs("data", exist_ok=True)
    print(f"Downloading {URL}")
    print(f"  (geoBoundaries Open ADM2, CC0 license, commit {PINNED_COMMIT})")
    req = urllib.request.Request(URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as r, open(OUTPUT_PATH, "wb") as f:
        f.write(r.read())
    print(f"Saved {OUTPUT_PATH}: {os.path.getsize(OUTPUT_PATH):,} bytes")


if __name__ == "__main__":
    main()
