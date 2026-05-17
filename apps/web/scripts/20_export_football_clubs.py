#!/usr/bin/env python3
"""
Step 20 — Export football clubs to GeoJSON (Point features) for map overlay.

Reads SQLite from sibling repo `hrvatski-amaterski-nogometni-klubovi` and
emits ALL available fields per club: core attributes, full league/season
history, name aliases and external source IDs. Only clubs with lat/lng
are written (Point geometry requires coords).

Properties shape (per Feature):
  Core:        id, slug, canonical_name, short_name
  Location:    city, county, address
  Stadium:     stadium_name, stadium_capacity, founded_year
  Contact:     website, email, phone, phone_e164, phone_kind, president
  Social:      fb_url, ig_url, x_url
  Map vis:     top_tier, top_league_name  (derived: MIN tier across seasons)
  Rich card:   seasons    = [{league, tier, season, source}, ...]
               aliases    = [{alias, source}, ...]      (name aliases only)
               source_ids = [{id, source}, ...]         (sofascore-id, hrnogomet-id)
  Meta:        notes, created_at, updated_at

Empty / NULL fields are omitted entirely from properties so the renderer
can fall back cleanly (no `"field": null` noise in the GeoJSON).

Input:  ~/git/ss/hrvatski-amaterski-nogometni-klubovi/data/clubs.db
Output: data/hr_football_clubs.geojson
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

CLUBS_DB = Path.home() / "git" / "ss" / "hrvatski-amaterski-nogometni-klubovi" / "data" / "clubs.db"
OUTPUT_PATH = Path("data/hr_football_clubs.geojson")

# Source values in club_aliases that are *external IDs* (numeric), not names.
ID_SOURCES = {"sofascore-id", "hrnogomet-id"}

CLUB_COLS = [
    "id", "slug", "canonical_name", "short_name",
    "city", "county", "address",
    "stadium_name", "stadium_capacity", "founded_year",
    "website", "email", "phone", "phone_e164", "phone_kind",
    "president",
    "fb_url", "ig_url", "x_url",
    "notes", "created_at", "updated_at",
    "lat", "lng",
]


def _strip_empty(d: dict) -> dict:
    """Drop keys whose value is None or empty string; keep 0 / False."""
    return {k: v for k, v in d.items() if v not in (None, "")}


def main() -> None:
    if not CLUBS_DB.exists():
        raise SystemExit(f"Missing {CLUBS_DB}. Sibling repo not found.")

    conn = sqlite3.connect(CLUBS_DB)
    conn.row_factory = sqlite3.Row

    # ── 1. Seasons: full history per club, joined to league for name/tier ──
    seasons_by_club: dict[int, list[dict]] = defaultdict(list)
    for r in conn.execute(
        "SELECT cs.club_id, l.name AS league, l.tier, l.county AS league_county, "
        "       cs.season, cs.source "
        "FROM club_seasons cs JOIN leagues l ON l.id = cs.league_id "
        "ORDER BY l.tier ASC, cs.season DESC"
    ):
        seasons_by_club[r["club_id"]].append(_strip_empty({
            "league": r["league"],
            "tier": r["tier"],
            "league_county": r["league_county"],
            "season": r["season"],
            "source": r["source"],
        }))

    # ── 2. Aliases: split into human-readable names vs external IDs ─────────
    aliases_by_club: dict[int, list[dict]] = defaultdict(list)
    source_ids_by_club: dict[int, list[dict]] = defaultdict(list)
    for r in conn.execute("SELECT club_id, alias, source FROM club_aliases"):
        entry = {"alias": r["alias"], "source": r["source"]}
        if r["source"] in ID_SOURCES:
            source_ids_by_club[r["club_id"]].append({"id": r["alias"], "source": r["source"]})
        else:
            aliases_by_club[r["club_id"]].append(entry)

    # ── 3. Clubs: pull all columns; derive top_tier + top_league_name ───────
    cols_sql = ", ".join(CLUB_COLS)
    rows = conn.execute(
        f"SELECT {cols_sql} FROM clubs "
        "WHERE lat IS NOT NULL AND lng IS NOT NULL "
        "ORDER BY canonical_name"
    ).fetchall()
    conn.close()

    features: list[dict] = []
    by_tier: dict[int | None, int] = defaultdict(int)

    for r in rows:
        club_id = r["id"]
        seasons = seasons_by_club.get(club_id, [])
        top_tier = min((s["tier"] for s in seasons if s.get("tier") is not None), default=None)
        top_league_name = next(
            (s["league"] for s in seasons if s.get("tier") == top_tier and s.get("league")),
            None,
        )

        props = {k: r[k] for k in CLUB_COLS if k not in ("lat", "lng")}
        props["top_tier"] = top_tier
        props["top_league_name"] = top_league_name
        if seasons:
            props["seasons"] = seasons
        if aliases_by_club.get(club_id):
            # De-dupe by (alias, source); keep first occurrence
            seen = set()
            uniq = []
            for a in aliases_by_club[club_id]:
                key = (a["alias"], a["source"])
                if key in seen:
                    continue
                seen.add(key)
                uniq.append(a)
            props["aliases"] = uniq
        if source_ids_by_club.get(club_id):
            props["source_ids"] = source_ids_by_club[club_id]

        props = _strip_empty(props)

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": props,
        })
        by_tier[top_tier] += 1

    fc = {"type": "FeatureCollection", "features": features}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(fc, ensure_ascii=False))
    size = OUTPUT_PATH.stat().st_size
    print(f"Wrote {OUTPUT_PATH}: {len(features)} clubs, {size:,} bytes ({size/1024:.1f} KB)")
    for tier in sorted(by_tier, key=lambda x: (x is None, x)):
        print(f"  tier {tier}: {by_tier[tier]} clubs")
    # Field coverage telemetry — useful to see what backfill has filled.
    coverage_fields = [
        "short_name", "address", "stadium_name", "stadium_capacity", "founded_year",
        "website", "email", "phone", "president",
        "fb_url", "ig_url", "x_url",
        "seasons", "aliases", "source_ids",
    ]
    print("Coverage:")
    for f in coverage_fields:
        n = sum(1 for feat in features if f in feat["properties"])
        print(f"  {f:18s} {n:4d} / {len(features)}  ({100*n/len(features):.0f}%)")


if __name__ == "__main__":
    main()
