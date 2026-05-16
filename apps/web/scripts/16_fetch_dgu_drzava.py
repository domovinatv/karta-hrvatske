#!/usr/bin/env python3
"""
Step 16 — Fetch HR state border (rpj:drzava) from DGU WFS.

Output: data/dgu_drzava.geojson  (raw GeoJSON, EPSG:3765)
"""
import json
import os
import urllib.parse
import urllib.request

OUTPUT_PATH = "data/dgu_drzava.geojson"
AUTH_KEY = "7347002b-e0ed-40ab-8a54-3510f2134358"
BASE = "https://geoportal.dgu.hr/services/sla/rpj/wfs"
HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}


def main():
    if os.path.exists(OUTPUT_PATH):
        print(f"Already have {OUTPUT_PATH}, skipping")
        return
    params = {
        "service": "WFS", "version": "2.0.0", "request": "GetFeature",
        "typeNames": "rpj:drzava", "outputFormat": "application/json",
        "authKey": AUTH_KEY,
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    print(f"GET {BASE}\n  typeNames=rpj:drzava")
    req = urllib.request.Request(url, headers=HEADERS)
    body = urllib.request.urlopen(req, timeout=120).read()
    print(f"  {len(body):,} bytes")
    os.makedirs("data", exist_ok=True)
    with open(OUTPUT_PATH, "wb") as f:
        f.write(body)
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
