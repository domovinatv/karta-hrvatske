#!/usr/bin/env python3
"""
Step 21 — Export OSM football pitches + stadiums to GeoJSON for new map layers.

Reads from clubs.db (klubovi.domovina.ai). Tables `pitches` and `stadiums`
are populated by `klubovi.domovina.ai/scripts/32_ingest_osm_pitches.py`.

Outputs (separate files; layers toggle independently in karta-web):
  - data/hr_pitches.geojson    — 7000+ Point features, all soccer pitches
  - data/hr_stadiums.geojson   — 400+ Point features, all stadiums

For pitches we also include a linked-club hint: if a club row in the same
DB has `osm_pitch_id = pitch.id`, we surface `linked_club_slug` and
`linked_club_name` so the popup can deep-link back to the club view.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

CLUBS_DB = (
    Path.home() / "git" / "domovinatv" / "klubovi.domovina.ai" / "data" / "clubs.db"
)
OUTPUT_PITCHES = Path("data/hr_pitches.geojson")
OUTPUT_STADIUMS = Path("data/hr_stadiums.geojson")


def main() -> None:
    if not CLUBS_DB.exists():
        raise SystemExit(f"Missing {CLUBS_DB}")
    conn = sqlite3.connect(CLUBS_DB)
    conn.row_factory = sqlite3.Row

    # Build a map of pitch_id → (slug, name) from clubs that match.
    pitch_to_club: dict[int, tuple[str, str]] = {}
    for row in conn.execute(
        "SELECT osm_pitch_id, slug, canonical_name FROM clubs "
        "WHERE osm_pitch_id IS NOT NULL"
    ):
        pitch_to_club[row["osm_pitch_id"]] = (row["slug"], row["canonical_name"])

    # ── Pitches ────────────────────────────────────────────────────────────
    pitches = conn.execute(
        "SELECT id, osm_type, osm_id, name, geom_lat, geom_lng, surface "
        "FROM pitches"
    ).fetchall()
    pitch_features = []
    for p in pitches:
        props: dict[str, object] = {
            "id": p["id"],
            "osm_type": p["osm_type"],
            "osm_id": p["osm_id"],
        }
        if p["name"]:
            props["name"] = p["name"]
        if p["surface"]:
            props["surface"] = p["surface"]
        linked = pitch_to_club.get(p["id"])
        if linked:
            props["linked_club_slug"], props["linked_club_name"] = linked
        pitch_features.append({
            "type": "Feature",
            "id": p["id"],
            "geometry": {"type": "Point", "coordinates": [p["geom_lng"], p["geom_lat"]]},
            "properties": props,
        })

    # ── Stadiums ───────────────────────────────────────────────────────────
    stadiums = conn.execute(
        "SELECT id, osm_type, osm_id, name, geom_lat, geom_lng, capacity "
        "FROM stadiums"
    ).fetchall()
    stadium_features = []
    for s in stadiums:
        props2: dict[str, object] = {
            "id": s["id"],
            "osm_type": s["osm_type"],
            "osm_id": s["osm_id"],
        }
        if s["name"]:
            props2["name"] = s["name"]
        if s["capacity"]:
            props2["capacity"] = s["capacity"]
        stadium_features.append({
            "type": "Feature",
            "id": s["id"],
            "geometry": {"type": "Point", "coordinates": [s["geom_lng"], s["geom_lat"]]},
            "properties": props2,
        })

    conn.close()

    OUTPUT_PITCHES.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PITCHES.write_text(
        json.dumps({"type": "FeatureCollection", "features": pitch_features}, ensure_ascii=False)
    )
    OUTPUT_STADIUMS.write_text(
        json.dumps({"type": "FeatureCollection", "features": stadium_features}, ensure_ascii=False)
    )
    p_size = OUTPUT_PITCHES.stat().st_size
    s_size = OUTPUT_STADIUMS.stat().st_size
    n_linked = sum(1 for p in pitch_features if "linked_club_slug" in p["properties"])
    print(
        f"Wrote {OUTPUT_PITCHES}: {len(pitch_features)} pitches, "
        f"{p_size:,} bytes ({p_size/1024:.1f} KB); {n_linked} linked to clubs"
    )
    print(
        f"Wrote {OUTPUT_STADIUMS}: {len(stadium_features)} stadiums, "
        f"{s_size:,} bytes ({s_size/1024:.1f} KB)"
    )


if __name__ == "__main__":
    main()
