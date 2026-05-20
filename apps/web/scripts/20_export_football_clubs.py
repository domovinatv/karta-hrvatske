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

Input:  ~/git/domovinatv/klubovi.domovina.ai/data/clubs.db
Output: data/hr_football_clubs.geojson
"""
from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from pathlib import Path

CLUBS_DB = Path.home() / "git" / "domovinatv" / "klubovi.domovina.ai" / "data" / "clubs.db"
OUTPUT_PATH = Path("data/hr_football_clubs.geojson")

# Source values in club_aliases that are *external IDs* (numeric), not names.
ID_SOURCES = {"sofascore-id", "hrnogomet-id"}

CLUB_COLS = [
    "id", "slug", "canonical_name", "short_name",
    "city", "county", "address",
    "stadium_name", "stadium_capacity", "founded_year",
    "website", "email", "phone", "phone_e164", "phone_kind",
    "president", "president_role",
    "fb_url", "ig_url", "x_url",
    "semafor_url", "sofascore_url",
    # Croatian legal/registry data — added 2026-05-20 after migration to
    # klubovi.domovina.ai. Tells legal entity (udruga vs SDD), OIB, official
    # registry link with already-built URL (do not construct).
    "oib", "udruga_id",
    "registry_url", "registry_status", "registry_naziv",
    # Google Places metadata — google_place_id is a stable reference to a
    # specific map location (not coords). geo_source tags lat/lng provenance:
    # "both" (Google + Nominatim agree), "nominatim" (only Nominatim).
    "google_place_id", "geo_source",
    # OSM-verified truth (filled by klubovi.domovina.ai/scripts/32_ingest_osm_pitches.py):
    # geo_truth_source picks between Nominatim and Google by which one is
    # closer to an OSM-tagged football pitch within 1500 m. Values:
    #   'osm:google' / 'osm:nominatim' / 'osm:tie' / 'unverified' / NULL.
    # See memory: project-geo-truth-verification.
    "geo_truth_source", "osm_pitch_id", "osm_pitch_distance_m",
    "notes", "created_at", "updated_at",
    "lat", "lng", "lat_google", "lng_google",
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

        props = {
            k: r[k]
            for k in CLUB_COLS
            if k not in (
                "lat", "lng", "lat_google", "lng_google",
                "osm_pitch_id", "osm_pitch_distance_m",
            )
        }
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

        # Pick the marker coordinate. Authoritative source is the OSM-pitch
        # verified `geo_truth_source` (script 32 in klubovi.domovina.ai). It
        # tells us which of the two geocoders landed closer to a tagged
        # football pitch. For 'unverified' (no OSM pitch in 1500 m radius)
        # and 'osm:tie' (both same distance) we fall back to the simpler
        # heuristic — Google when `geo_source='both'`, otherwise Nominatim.
        truth = r["geo_truth_source"]
        has_google = r["lat_google"] is not None and r["lng_google"] is not None
        if truth == "osm:google" and has_google:
            lng, lat = r["lng_google"], r["lat_google"]
        elif truth == "osm:nominatim":
            lng, lat = r["lng"], r["lat"]
        else:
            # osm:tie / unverified / NULL → prefer Google when both agreed
            if r["geo_source"] == "both" and has_google:
                lng, lat = r["lng_google"], r["lat_google"]
            else:
                lng, lat = r["lng"], r["lat"]
        if r["osm_pitch_distance_m"] is not None:
            props["osm_pitch_distance_m"] = r["osm_pitch_distance_m"]

        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
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
        "website", "email", "phone", "president", "president_role",
        "fb_url", "ig_url", "x_url", "semafor_url", "sofascore_url",
        "oib", "udruga_id", "registry_url", "google_place_id", "geo_source",
        "geo_truth_source",
        "seasons", "aliases", "source_ids",
    ]
    print("Coverage:")
    for f in coverage_fields:
        n = sum(1 for feat in features if f in feat["properties"])
        print(f"  {f:18s} {n:4d} / {len(features)}  ({100*n/len(features):.0f}%)")


if __name__ == "__main__":
    main()
