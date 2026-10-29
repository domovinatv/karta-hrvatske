"""Google Places API (New) — Text Search, keširano po SHA zahtjeva.

Prilagođeno iz ../crkve.domovina.ai/src/places.py, bez dotenv/rapidfuzz
ovisnosti. Ključ je `GOOGLE_MAPS_API_KEY` iz okoline ili iz
`apps/data-pipeline/.env` (gitignoriran).

Text Search UVIJEK nešto vrati, pa validacija nije opcionalna — pozivatelj
mora provjeriti da je rezultat TAJ subjekt (npr. isti web, ili blizina
poznate adrese). Zamke iz sestrinskih repoa:

  - default dnevna kvota `SearchTextRequestPerDayPerProject` je 100;
  - ključ s IP restrikcijom vraća 403 `API_KEY_IP_ADDRESS_BLOCKED` čim se
    promijeni javni IP.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data" / "raw" / "places"
URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join(
    f"places.{f}" for f in (
        "id", "displayName", "formattedAddress", "location", "types",
        "primaryType", "websiteUri", "googleMapsUri", "businessStatus",
    )
)
HR_LAT = (42.30, 46.60)
HR_LNG = (13.40, 19.50)


class PlacesError(RuntimeError):
    """Ključ, kvota ili dozvole — nema smisla pokušavati dalje."""


def _api_key() -> str:
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GOOGLE_MAPS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("\"'")
    if not key:
        raise PlacesError("GOOGLE_MAPS_API_KEY nije postavljen (okolina ili apps/data-pipeline/.env)")
    return key


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin(math.radians(lat2 - lat1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


class Places:
    def __init__(self):
        self.key = _api_key()
        self.client = httpx.Client(timeout=30.0)
        self.calls = 0
        self.cache_hits = 0
        self.disabled: str | None = None

    def search(self, query: str, max_results: int = 3) -> list[dict[str, Any]]:
        if self.disabled:
            return []
        body = {
            "textQuery": query,
            "regionCode": "HR",
            "languageCode": "hr",
            "maxResultCount": max_results,
            "locationRestriction": {"rectangle": {
                "low": {"latitude": HR_LAT[0], "longitude": HR_LNG[0]},
                "high": {"latitude": HR_LAT[1], "longitude": HR_LNG[1]},
            }},
        }
        cache = CACHE_DIR / (hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16] + ".json")
        if cache.exists():
            self.cache_hits += 1
            data = json.loads(cache.read_text())
        else:
            r = self.client.post(URL, json=body, headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": self.key,
                "X-Goog-FieldMask": FIELD_MASK,
            })
            self.calls += 1
            if r.status_code in (401, 403, 429):
                # Ključ/kvota/billing: ostatak runa ide bez Googlea, a ne pada.
                # Sloj se tada gradi kao prije (DGU → težište naselja).
                self.disabled = f"Places {r.status_code}: {r.text[:200]}"
                print(f"  ! Google Places isključen za ovaj run — {self.disabled}")
                return []
            r.raise_for_status()
            data = r.json()
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data, ensure_ascii=False))
        out = []
        for p in data.get("places", []):
            loc = p.get("location") or {}
            if "latitude" not in loc:
                continue
            out.append({
                "place_id": p.get("id"),
                "name": (p.get("displayName") or {}).get("text"),
                "address": p.get("formattedAddress"),
                "lat": float(loc["latitude"]),
                "lng": float(loc["longitude"]),
                "types": p.get("types") or [],
                "primary_type": p.get("primaryType"),
                "website": p.get("websiteUri"),
                "maps_url": p.get("googleMapsUri"),
                "business_status": p.get("businessStatus"),
            })
        return out
