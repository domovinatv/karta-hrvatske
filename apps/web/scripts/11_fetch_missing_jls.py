#!/usr/bin/env python3
"""
Step 11 — Fetch the 13 (or however many) JLS that are absent from
geoBoundaries' ADM2 dataset directly from ISPU MGIPU's authoritative API.

ISPU is the official Croatian Ministry of Construction & Spatial Planning
geoportal. Its API serves JLS boundary geometry as WKT in EPSG:3765
(HTRS96/TM). We disambiguate by exact name match (case-insensitive),
since search-text returns label without županija.

Input:  data/hr_jls_missing.json   (list of {name, type, zupanija})
Output: data/hr_jls_missing_wkt.json   (same list + id, hash, wkt)

Polite rate limit: 0.4s between calls.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

INPUT_PATH = "data/hr_jls_missing.json"
OUTPUT_PATH = "data/hr_jls_missing_wkt.json"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (DOMOVINA-research)",
    "Referer": "https://ispu.mgipu.hr/",
}
RATE_DELAY = 0.4


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers=HEADERS)
    return urllib.request.urlopen(req, timeout=timeout).read()


def search_jls(name: str):
    q = urllib.parse.quote(name)
    data = json.loads(http_get(f"https://ispu.mgipu.hr/api/v1/gis/search-text?input={q}"))
    matches = []
    for cat in data:
        label = cat.get("label", {}).get("hr", "").lower()
        if label.startswith("gradovi") or "općin" in label or "opcin" in label:
            for it in cat["items"]:
                if it.get("source") == "jls":
                    matches.append(it)
    return matches


def fetch_geom(jls_id: str, jls_hash: str) -> str:
    url = (
        f"https://ispu.mgipu.hr/api/v1/gis/search-geom?"
        f"id={jls_id}&source=jls&hash={jls_hash}"
    )
    text = http_get(url, timeout=30).decode("utf-8").strip()
    if text.startswith('"'):
        text = json.loads(text)
    return text


def pick_match(matches, expected_name: str):
    """ISPU labels are like 'BAŠKA (00086)'. Pick the exact name match."""
    target = expected_name.lower()
    candidates = [m for m in matches if m["label"].split(" (")[0].lower() == target]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        # Multiple JLS share name across županije — let the merger resolve by location.
        # Return all so caller can pick the right one spatially.
        return candidates
    return None


def main():
    if not os.path.exists(INPUT_PATH):
        raise SystemExit(f"Missing {INPUT_PATH}")

    missing = json.load(open(INPUT_PATH))
    results = []
    if os.path.exists(OUTPUT_PATH):
        prev = {(r["name"], r["zupanija"]): r for r in json.load(open(OUTPUT_PATH))}
    else:
        prev = {}

    for i, jls in enumerate(missing):
        key = (jls["name"], jls["zupanija"])
        if key in prev and prev[key].get("wkt"):
            results.append(prev[key])
            print(f"[{i+1:>2}/{len(missing)}] {jls['name']:25} ({jls['zupanija']}) — cached")
            continue

        try:
            time.sleep(RATE_DELAY)
            matches = search_jls(jls["name"])
            chosen = pick_match(matches, jls["name"])
            if chosen is None:
                print(f"[{i+1:>2}/{len(missing)}] {jls['name']:25} — NO MATCH ({len(matches)} candidates)")
                results.append({**jls, "status": "no_match"})
                continue

            # Multiple candidates — fetch all geometries and let the merger
            # pick the one whose centroid falls in the expected ADM1 polygon.
            picks = chosen if isinstance(chosen, list) else [chosen]
            geoms = []
            for c in picks:
                time.sleep(RATE_DELAY)
                wkt = fetch_geom(c["id"], c["hash"])
                geoms.append({"id": c["id"], "hash": c["hash"], "label": c["label"], "wkt": wkt})

            results.append({**jls, "status": "ok", "candidates": geoms})
            print(f"[{i+1:>2}/{len(missing)}] {jls['name']:25} ({jls['zupanija']:25}) → {len(geoms)} geom(s)  {picks[0]['label']}")

            # Incremental save
            with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
                json.dump(results, f, ensure_ascii=False)

        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} for {jls['name']}: {e.reason}", file=sys.stderr)
            results.append({**jls, "status": f"http_{e.code}"})
            time.sleep(2)
        except Exception as e:
            print(f"  ERR {jls['name']}: {e}", file=sys.stderr)
            results.append({**jls, "status": f"err: {e}"})
            time.sleep(1)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)
    ok = sum(1 for r in results if r.get("status") == "ok")
    print(f"\nDONE: {ok}/{len(missing)} fetched. Saved to {OUTPUT_PATH}.")


if __name__ == "__main__":
    main()
