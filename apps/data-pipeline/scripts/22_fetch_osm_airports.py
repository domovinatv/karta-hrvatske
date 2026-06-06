#!/usr/bin/env python3
"""
Step 22 — Fetch HR airports + runways from OSM + derive approach corridors.

OSM tags:
  - aeroway=aerodrome  → airport perimeter / centroid
  - aeroway=runway     → runway centerline (LineString)
  - aeroway=helipad    → small heliports

The runway centerline geometry gives us BOTH endpoints + heading directly,
so we don't need any external aeronautical database. For each runway end
we project a 15 km approach corridor along the reverse runway bearing.

Approach geometry assumption: standard 3° glide slope. At 15 km from the
threshold the aircraft altitude is ~785 m AGL (15000 × tan 3°). The
corridor is rendered in karta-web with a `line-gradient` so altitude is
visually obvious (low = warm colour, high = cool).

Outputs (geojson) into apps/data-pipeline/data/ ; the karta-web sync-data step
ships them to public/data/.
  - data/hr_airports.geojson    (Point features, ~30-50)
  - data/hr_runways.geojson     (LineString, ~50-100)
  - data/hr_approaches.geojson  (LineString, 2 per runway end)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Install httpx first.", file=sys.stderr)
    sys.exit(1)

OVERPASS = "https://overpass-api.de/api/interpreter"
HR_BBOX = "42.3,13.4,46.6,19.5"
OUT_DIR = Path("data")

# Approach geometry constants.
APPROACH_LENGTH_KM = 15.0
GLIDE_SLOPE_DEG = 3.0
END_ALT_M = round(APPROACH_LENGTH_KM * 1000 * math.tan(math.radians(GLIDE_SLOPE_DEG)))

# Scope queries to features explicitly inside the Croatia OSM relation
# (id 214885). Bbox alone leaks in Slovenian, Hungarian, Austrian, Bosnian
# and Serbian airfields. The area filter is exact and Overpass-cheap.
OVERPASS_QUERY = """
[out:json][timeout:60];
area(3600214885)->.hr;
(
  way["aeroway"="aerodrome"](area.hr);
  relation["aeroway"="aerodrome"](area.hr);
  node["aeroway"="aerodrome"](area.hr);
  way["aeroway"="runway"](area.hr);
);
out geom;
"""

# ICAO prefix LD = Croatia. Used as a sanity filter on aerodromes that
# carry an ICAO code (catches the rare cross-border airfield that the area
# filter doesn't trim — e.g. a runway physically straddling the border).
HR_ICAO_PREFIX = "LD"


def fetch_osm() -> dict:
    headers = {"User-Agent": "domovina.ai-gis (info@domovina.ai)"}
    with httpx.Client(timeout=120.0, headers=headers) as c:
        r = c.post(OVERPASS, data={"data": OVERPASS_QUERY})
    r.raise_for_status()
    return r.json()


def haversine_destination(
    lat: float, lng: float, bearing_deg: float, dist_km: float
) -> tuple[float, float]:
    """Project a coordinate along a great-circle bearing."""
    R = 6371.0
    br = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)
    d = dist_km / R
    lat2 = math.asin(
        math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(br)
    )
    lng2 = lng1 + math.atan2(
        math.sin(br) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lng2)


def bearing(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Forward bearing from (lat1, lng1) to (lat2, lng2), degrees 0-360."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def polygon_centroid(coords: list[tuple[float, float]]) -> tuple[float, float]:
    """Simple lng/lat average — adequate for OSM aerodrome polygons (small bbox)."""
    if not coords:
        return 0.0, 0.0
    lat_sum = sum(c[1] for c in coords)
    lng_sum = sum(c[0] for c in coords)
    n = len(coords)
    return lat_sum / n, lng_sum / n


def main() -> None:
    print(f"▸ Querying Overpass for HR aerodromes + runways…")
    payload = fetch_osm()
    print(f"  {len(payload['elements'])} elements")

    airports: list[dict] = []
    runways: list[dict] = []
    approaches: list[dict] = []

    for el in payload["elements"]:
        tags = el.get("tags", {}) or {}
        aeroway = tags.get("aeroway")
        name = tags.get("name") or tags.get("iata") or tags.get("icao")
        icao = tags.get("icao")
        iata = tags.get("iata")

        # Skip cross-border airports that the area filter let through.
        if icao and not icao.startswith(HR_ICAO_PREFIX):
            continue

        # Aerodrome only — helipads (hospitals, factories) are out of scope
        # for this layer; can become a separate toggle later if useful.
        if aeroway == "aerodrome":
            if el["type"] == "node":
                lat, lng = el["lat"], el["lon"]
            elif el.get("geometry"):
                coords = [(g["lon"], g["lat"]) for g in el["geometry"]]
                lat, lng = polygon_centroid(coords)
            else:
                # Relations without flat geometry — skip; rare for HR
                continue
            props = {
                "id": f"{el['type']}/{el['id']}",
                "osm_type": el["type"],
                "osm_id": el["id"],
                "aeroway": aeroway,
            }
            if name:
                props["name"] = name
            if icao:
                props["icao"] = icao
            if iata:
                props["iata"] = iata
            if tags.get("aerodrome:type"):
                props["aerodrome_type"] = tags["aerodrome:type"]
            airports.append({
                "type": "Feature",
                "id": el["id"] if el["type"] == "node" else None,
                "geometry": {"type": "Point", "coordinates": [lng, lat]},
                "properties": props,
            })

        # Runway: LineString — first + last node define the heading + length.
        elif aeroway == "runway":
            if not el.get("geometry") or len(el["geometry"]) < 2:
                continue
            line = [(g["lon"], g["lat"]) for g in el["geometry"]]
            start_lng, start_lat = line[0]
            end_lng, end_lat = line[-1]
            head_fwd = bearing(start_lat, start_lng, end_lat, end_lng)
            head_rev = (head_fwd + 180) % 360
            # Runway segment length in km via simple haversine.
            R = 6371.0
            p1 = math.radians(start_lat)
            p2 = math.radians(end_lat)
            dphi = math.radians(end_lat - start_lat)
            dlam = math.radians(end_lng - start_lng)
            a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
            length_km = 2 * R * math.asin(math.sqrt(a))

            rw_ref = tags.get("ref")  # e.g. "05/23"
            rw_props = {
                "id": el["id"],
                "osm_id": el["id"],
                "ref": rw_ref,
                "surface": tags.get("surface"),
                "length_m": round(length_km * 1000),
                "heading_fwd": round(head_fwd, 1),
                "heading_rev": round(head_rev, 1),
            }
            if name:
                rw_props["name"] = name
            runways.append({
                "type": "Feature",
                "id": el["id"],
                "geometry": {"type": "LineString", "coordinates": line},
                "properties": rw_props,
            })

            # Approach corridor from each end. Aircraft approach FROM the
            # reverse bearing (i.e. comes from heading {fwd} side toward
            # the runway end facing {rev}). Project APPROACH_LENGTH_KM
            # outward from each end along the runway's natural direction.
            for end_idx, (elng, elat) in enumerate([(start_lng, start_lat), (end_lng, end_lat)]):
                # Project away from the runway, opposite the heading of arrival.
                outward_bearing = head_rev if end_idx == 0 else head_fwd
                far_lat, far_lng = haversine_destination(
                    elat, elng, outward_bearing, APPROACH_LENGTH_KM
                )
                # Direction labels: end_idx 0 → reverse heading "23" of a 05/23 runway
                hdg_label = round(head_rev / 10) if end_idx == 0 else round(head_fwd / 10)
                approaches.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        # ORDER: from runway threshold OUTWARD to far point.
                        # MapLibre line-gradient evaluates 0→1 along this order,
                        # so 0 = ground (yellow), 1 = high altitude (blue).
                        "coordinates": [[elng, elat], [far_lng, far_lat]],
                    },
                    "properties": {
                        "runway_id": el["id"],
                        "runway_ref": rw_ref,
                        "heading_deg": round(outward_bearing, 1),
                        "heading_label": f"{hdg_label:02d}",
                        "end_alt_m": END_ALT_M,
                        "length_km": APPROACH_LENGTH_KM,
                        "glide_slope_deg": GLIDE_SLOPE_DEG,
                    },
                })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "hr_airports.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": airports}, ensure_ascii=False)
    )
    (OUT_DIR / "hr_runways.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": runways}, ensure_ascii=False)
    )
    (OUT_DIR / "hr_approaches.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": approaches}, ensure_ascii=False)
    )
    print(f"  airports:   {len(airports)}")
    print(f"  runways:    {len(runways)}")
    print(f"  approaches: {len(approaches)} (2 per runway, {APPROACH_LENGTH_KM} km / {END_ALT_M} m AGL at far end, {GLIDE_SLOPE_DEG}° glide)")


if __name__ == "__main__":
    main()
