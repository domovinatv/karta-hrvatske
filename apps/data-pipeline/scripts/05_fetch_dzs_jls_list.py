#!/usr/bin/env python3
"""
Step 05 — Extract official list of all 556 Croatian JLS from DZS Census 2021.

Downloads DZS xlsx, parses sheet 1, extracts all (županija, type, name) triples.

Output: data/hr_jls_list.json
"""
import json
import os
import urllib.request

import openpyxl

DZS_URL = (
    "https://podaci.dzs.hr/media/td3jvrbu/"
    "popis_2021-stanovnistvo_po_gradovima_opcinama.xlsx"
)
LOCAL_XLSX = "data/dzs_jls.xlsx"
OUTPUT_PATH = "data/hr_jls_list.json"

HEADERS = {"User-Agent": "Mozilla/5.0 (DOMOVINA-research)"}


def download_dzs():
    if os.path.exists(LOCAL_XLSX):
        print(f"Already have {LOCAL_XLSX}, skipping download")
        return
    print(f"Downloading {DZS_URL}...")
    os.makedirs("data", exist_ok=True)
    req = urllib.request.Request(DZS_URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r, open(LOCAL_XLSX, "wb") as f:
        f.write(r.read())
    print(f"Saved {LOCAL_XLSX}: {os.path.getsize(LOCAL_XLSX):,} bytes")


def main():
    download_dzs()

    wb = openpyxl.load_workbook(LOCAL_XLSX, data_only=True, read_only=True)
    ws = wb["1."]

    jls_list = []
    for row in ws.iter_rows(values_only=True):
        if not row or len(row) < 5:
            continue
        zupanija, type_hr, _, _, name = row[:5]
        if zupanija and name and type_hr in ("Grad", "Općina"):
            jls_list.append(
                {
                    "zupanija": zupanija.strip() if isinstance(zupanija, str) else None,
                    "type": type_hr,
                    "name": name.strip() if isinstance(name, str) else str(name),
                }
            )

    # Add Grad Zagreb explicitly (it is both city and county)
    jls_list.append({"zupanija": "Grad Zagreb", "type": "Grad", "name": "Zagreb"})

    print(f"Total: {len(jls_list)} JLS")
    print(f"  Gradova: {sum(1 for j in jls_list if j['type'] == 'Grad')}")
    print(f"  Općina:  {sum(1 for j in jls_list if j['type'] == 'Općina')}")

    from collections import Counter
    zup_counts = Counter(j["zupanija"] for j in jls_list)
    print(f"  Županija: {len(zup_counts)}")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(jls_list, f, ensure_ascii=False, indent=2)
    print(f"\nSaved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
