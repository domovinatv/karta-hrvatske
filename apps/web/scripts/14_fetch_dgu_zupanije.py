#!/usr/bin/env python3
"""
Step 14 — Fetch all 21 Croatian županije from DGU WFS.

Authoritative ADM1 polygons for spatial validation, with DGU's own metadata:
  - id, inspire_id, broj_zupanije (1..21), naziv, skraceni_naziv, roa.

Output: data/dgu_zupanije.geojson  (raw GeoJSON, EPSG:3765)
"""
import json
import os
import urllib.parse
import urllib.request

OUTPUT_PATH = "data/dgu_zupanije.geojson"
AUTH_KEY = "7347002b-e0ed-40ab-8a54-3510f2134358"
BASE = "https://geoportal.dgu.hr/services/sla/rpj/wfs"
HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}


def main():
    if os.path.exists(OUTPUT_PATH):
        print(f"Already have {OUTPUT_PATH}, skipping")
        return

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "rpj:zupanija",
        "outputFormat": "application/json",
        "count": "100",
        "authKey": AUTH_KEY,
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    print(f"GET {BASE}\n  typeNames=rpj:zupanija outputFormat=GeoJSON")
    req = urllib.request.Request(url, headers=HEADERS)
    body = urllib.request.urlopen(req, timeout=60).read()
    print(f"  {len(body):,} bytes")

    data = json.loads(body)
    n = len(data.get("features", []))
    print(f"  {n} županije fetched")

    os.makedirs("data", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
