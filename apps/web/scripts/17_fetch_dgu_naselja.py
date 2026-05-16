#!/usr/bin/env python3
"""
Step 17 — Fetch all 6759 Croatian naselja (settlements) from DGU WFS.

DGU's rpj:naselje layer carries per-feature:
  id, inspire_id, maticni_broj, jls (parent JLS name), naziv,
  skraceni_naziv, jls_id, stanovnistvo (population!), geometry

Paginated fetch (count=2000 per request) since the full set is ~50 MB+.

Output: data/dgu_naselja.geojson  (raw GeoJSON, EPSG:3765)
"""
import json
import os
import time
import urllib.parse
import urllib.request

OUTPUT_PATH = "data/dgu_naselja.geojson"
AUTH_KEY = "7347002b-e0ed-40ab-8a54-3510f2134358"
BASE = "https://geoportal.dgu.hr/services/sla/rpj/wfs"
HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}
PAGE_SIZE = 2000


def fetch_page(start: int) -> dict:
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": "rpj:naselje", "outputFormat": "application/json",
        "count": str(PAGE_SIZE), "startIndex": str(start),
        "sortBy": "id",  # stable pagination
        "authKey": AUTH_KEY,
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    body = urllib.request.urlopen(req, timeout=180).read()
    return json.loads(body), len(body)


def main():
    if os.path.exists(OUTPUT_PATH):
        print(f"Already have {OUTPUT_PATH}, skipping")
        return

    all_features = []
    start = 0
    total_bytes = 0
    while True:
        print(f"  Fetching naselja [{start}..{start + PAGE_SIZE}) …", end="", flush=True)
        t0 = time.time()
        data, nb = fetch_page(start)
        feats = data.get("features", [])
        all_features.extend(feats)
        total_bytes += nb
        elapsed = time.time() - t0
        print(f" got {len(feats)}  ({nb/1024/1024:.1f} MB, {elapsed:.1f}s)")
        if len(feats) < PAGE_SIZE:
            break
        start += PAGE_SIZE
        time.sleep(0.5)

    fc = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::3765"}},
        "features": all_features,
    }

    os.makedirs("data", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)
    print(f"\nSaved {OUTPUT_PATH}: {len(all_features)} naselja, {os.path.getsize(OUTPUT_PATH):,} bytes")


if __name__ == "__main__":
    main()
