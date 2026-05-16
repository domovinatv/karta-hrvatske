#!/usr/bin/env python3
"""
Step 13 — Fetch ALL 556 Croatian JLS from DGU WFS (authoritative state source).

DGU = Državna geodetska uprava (Croatian state mapping authority).
Endpoint: https://geoportal.dgu.hr/services/sla/rpj/wfs (Registar prostornih
jedinica). The same authKey is used by ISPU's public web client.

For each JLS we get DGU-official metadata that geoBoundaries doesn't provide:
  - id           (DGU internal id)
  - inspire_id   (INSPIRE-compliant ID, e.g. HR.DGU.RPJ:JLS.0052000022)
  - maticni_broj (Croatian official 5-digit registry number)
  - status       (registration status flag)
  - zupanija     (full county name with "županija" suffix)
  - naziv        (JLS name)
  - skraceni_naziv (abbreviated name, often empty)
  - zupanija_id  (county DGU id 1..21)
  - roa         (administrative seat / "središte")
  - geometry    (MultiPolygon in EPSG:3765)

Output: data/dgu_jls.geojson  (raw GeoJSON, EPSG:3765)
"""
import json
import os
import urllib.parse
import urllib.request

OUTPUT_PATH = "data/dgu_jls.geojson"
AUTH_KEY = "7347002b-e0ed-40ab-8a54-3510f2134358"
BASE = "https://geoportal.dgu.hr/services/sla/rpj/wfs"
HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}
PAGE_SIZE = 1000  # enough to fetch all 556 in one call


def main():
    if os.path.exists(OUTPUT_PATH):
        print(f"Already have {OUTPUT_PATH}, skipping")
        return

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "rpj:jls",
        "outputFormat": "application/json",
        "count": str(PAGE_SIZE),
        "authKey": AUTH_KEY,
    }
    url = BASE + "?" + urllib.parse.urlencode(params)
    print(f"GET {BASE}\n  typeNames=rpj:jls outputFormat=GeoJSON")
    req = urllib.request.Request(url, headers=HEADERS)
    body = urllib.request.urlopen(req, timeout=120).read()
    print(f"  {len(body):,} bytes")

    data = json.loads(body)
    n = len(data.get("features", []))
    print(f"  {n} features fetched")
    if n != 556:
        print(f"  !! Expected 556 JLS, got {n}")

    os.makedirs("data", exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
