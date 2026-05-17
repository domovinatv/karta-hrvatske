#!/usr/bin/env python3
"""
Step 20 — Export football clubs to GeoJSON (Point features) for map overlay.

Reads SQLite from sibling repo `hrvatski-amaterski-nogometni-klubovi`, joins
clubs with their highest-tier league appearance (MIN(tier) wins), and writes
only clubs that have lat/lng coordinates.

Input:  ~/git/ss/hrvatski-amaterski-nogometni-klubovi/data/clubs.db
Output: data/hr_football_clubs.geojson
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

CLUBS_DB = Path.home() / "git" / "ss" / "hrvatski-amaterski-nogometni-klubovi" / "data" / "clubs.db"
OUTPUT_PATH = Path("data/hr_football_clubs.geojson")

QUERY = """
WITH club_top AS (
  SELECT cs.club_id, MIN(l.tier) AS top_tier
  FROM club_seasons cs
  JOIN leagues l ON l.id = cs.league_id
  GROUP BY cs.club_id
),
club_top_league AS (
  SELECT ct.club_id, ct.top_tier,
         (SELECT l.name FROM club_seasons cs2
          JOIN leagues l ON l.id = cs2.league_id
          WHERE cs2.club_id = ct.club_id AND l.tier = ct.top_tier
          ORDER BY cs2.season DESC LIMIT 1) AS top_league_name
  FROM club_top ct
)
SELECT
  c.id, c.slug, c.canonical_name, c.short_name,
  c.city, c.county, c.founded_year,
  c.stadium_name, c.stadium_capacity,
  c.website, c.email, c.phone, c.address,
  c.fb_url, c.ig_url, c.x_url, c.president,
  c.lat, c.lng,
  ctl.top_tier, ctl.top_league_name
FROM clubs c
LEFT JOIN club_top_league ctl ON ctl.club_id = c.id
WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
ORDER BY ctl.top_tier, c.canonical_name;
"""


def main() -> None:
    if not CLUBS_DB.exists():
        raise SystemExit(f"Missing {CLUBS_DB}. Sibling repo not found.")

    conn = sqlite3.connect(CLUBS_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(QUERY).fetchall()
    conn.close()

    features = []
    by_tier: dict[int | None, int] = {}
    for r in rows:
        props = {k: r[k] for k in r.keys() if k not in ("lat", "lng")}
        props = {k: v for k, v in props.items() if v not in (None, "")}
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": props,
        })
        t = r["top_tier"]
        by_tier[t] = by_tier.get(t, 0) + 1

    fc = {"type": "FeatureCollection", "features": features}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(fc, ensure_ascii=False))
    size = OUTPUT_PATH.stat().st_size
    print(f"Wrote {OUTPUT_PATH}: {len(features)} clubs, {size:,} bytes ({size/1024:.1f} KB)")
    for tier in sorted(by_tier, key=lambda x: (x is None, x)):
        print(f"  tier {tier}: {by_tier[tier]} clubs")


if __name__ == "__main__":
    main()
