#!/usr/bin/env python3
"""
Step 23 — Kvartovi unutar gradova (MVP: Zagreb + Velika Gorica).

Izvori (istraženo 2026-07-28, vidi memory project-kvartovi-layer):
  - Zagreb: data.zagreb.hr CKAN, shapefile RPJ, licenca "Otvorena dozvola"
      rpj_gc.zip  — 17 gradskih četvrti  (JMS_MB, JMS_IME)
      rpj_mo.zip  — 218 mjesnih odbora   (JMS_MB, JMS_IME, MBR_NADR → matična GČ)
      EPSG:3765 (HTRS96/TM) → reprojekcija u WGS84.
  - Velika Gorica: OSM admin_level=9 relacije (8/8 gradskih četvrti),
      jedini javni poligonski izvor — gis.gorica.hr (pipGIS) je iza logina.
      Licenca ODbL.

Kolokvijalni zagrebački kvartovi (Jarun, Knežija…) NEMAJU službeni poligonski
izvor — mjesni odbori su najbliža službena aproksimacija i zato idu u isti
output kao razina "mjesni_odbor" (kasnija faza: kurirani dissolve u kvartove).

Output: data/hr_kvartovi.geojson — jedan FeatureCollection, properties:
  name, mb, parent_mb, razina (cetvrt|mjesni_odbor), jls_name,
  jls_maticni_broj, zupanija, area_km2, color, source
Feature.id je stabilan numerički (sort po jls/razina/mb) — feature-state
hover/select u MapLibreu traži broj.
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

try:
    import httpx
    import shapefile  # pyshp
    from pyproj import Transformer
    from shapely.geometry import LineString, MultiPolygon, Polygon, mapping, shape
    from shapely.ops import linemerge, polygonize, transform as shp_transform, unary_union
except ImportError as e:
    print(f"Missing dependency ({e}). pip install pyshp pyproj shapely httpx", file=sys.stderr)
    sys.exit(1)

OUT_DIR = Path("data")
RAW_DIR = OUT_DIR / "raw_kvartovi"
OVERPASS = "https://overpass-api.de/api/interpreter"
UA = {"User-Agent": "domovina.ai-gis (info@domovina.ai)"}

ZG_SOURCES = {
    "gc": "https://data.zagreb.hr/dataset/9c52e229-09bf-4569-8e01-37f338070d02/resource/f2406ad9-34bf-4235-aa24-d71a08ae2863/download/rpj_gc.zip",
    "mo": "https://data.zagreb.hr/dataset/37fa6630-0a87-4084-b62d-ff5edab3610b/resource/482b7289-d397-4c38-9929-5d0410ad0e16/download/rpj_mo.zip",
}

# Velika Gorica OSM area id = 3600000000 + relation 2345396.
VG_OVERPASS_QUERY = """
[out:json][timeout:60];
area(3602345396)->.vg;
relation["boundary"="administrative"]["admin_level"="9"](area.vg);
out geom;
"""

ZG_JLS = {"jls_name": "Grad Zagreb", "jls_maticni_broj": "01333", "zupanija": "Grad Zagreb"}
VG_JLS = {"jls_name": "Velika Gorica", "jls_maticni_broj": "05410", "zupanija": "Zagrebačka"}

# Geometrija se pojednostavljuje u metarskom sustavu (EPSG:3765) prije
# reprojekcije — 5 m tolerancija je nevidljiva na gradskom zoomu, a shapefile
# gradskih granica je katastarski detaljan.
SIMPLIFY_M = 5.0

TX_3765_TO_4326 = Transformer.from_crs("EPSG:3765", "EPSG:4326", always_xy=True)
TX_4326_TO_3765 = Transformer.from_crs("EPSG:4326", "EPSG:3765", always_xy=True)


def color_for(idx: int) -> str:
    """Zlatni kut po hue — 25+ vizualno različitih, stabilnih boja."""
    h = (idx * 137.508) % 360
    s, li = 0.62, 0.55
    c = (1 - abs(2 * li - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = li - c / 2
    r, g, b = [
        (c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x),
    ][int(h // 60) % 6]
    return "#{:02x}{:02x}{:02x}".format(
        round((r + m) * 255), round((g + m) * 255), round((b + m) * 255)
    )


def fetch_cached(url: str, dest: Path) -> bytes:
    if dest.exists():
        return dest.read_bytes()
    print(f"  ↓ {url}")
    r = httpx.get(url, headers=UA, timeout=120.0, follow_redirects=True)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return r.content


def read_zipped_shp(zip_bytes: bytes) -> list[tuple[dict, object]]:
    """[(record_dict, shapely_geom_u_3765), …] iz zipanog shapefile-a."""
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    names = {Path(n).suffix.lower(): n for n in zf.namelist() if not n.endswith("/")}
    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(names[".shp"])),
        dbf=io.BytesIO(zf.read(names[".dbf"])),
        shx=io.BytesIO(zf.read(names[".shx"])),
        encoding="cp1250",
    )
    out = []
    for sr in reader.iterShapeRecords():
        geom = shape(sr.shape.__geo_interface__)
        out.append((sr.record.as_dict(), geom))
    return out


def clean_geom(geom, already_wgs84: bool = False):
    """Simplify u metrima + reprojekcija u WGS84 + zaokruživanje koordinata."""
    if already_wgs84:
        geom = shp_transform(TX_4326_TO_3765.transform, geom)
    geom = geom.buffer(0)  # sanacija eventualnih self-intersectiona
    geom = geom.simplify(SIMPLIFY_M, preserve_topology=True)
    area_km2 = round(geom.area / 1e6, 2)
    geom = shp_transform(TX_3765_TO_4326.transform, geom)
    geojson = mapping(geom)
    rounded = json.loads(json.dumps(geojson), parse_float=lambda v: round(float(v), 6))
    return rounded, area_km2


def norm_mb(v) -> str:
    """RPJ matični brojevi dolaze i s i bez leading nula — normaliziraj na 5 znamenki."""
    return str(v).strip().zfill(5)


def clean_name(v) -> str:
    """MO nazvani po osobama dolaze s navodnicima ('"Andrija Medulić"')."""
    return str(v).strip().strip('"').strip()


def zagreb_features() -> list[dict]:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    feats = []

    gc_rows = read_zipped_shp(fetch_cached(ZG_SOURCES["gc"], RAW_DIR / "rpj_gc.zip"))
    gc_rows.sort(key=lambda t: norm_mb(t[0]["JMS_MB"]))
    gc_color: dict[str, str] = {}
    for i, (rec, geom) in enumerate(gc_rows):
        mb = norm_mb(rec["JMS_MB"])
        gc_color[mb] = color_for(i)
        g, area = clean_geom(geom)
        feats.append({
            "razina": "cetvrt", "name": clean_name(rec["JMS_IME"]), "mb": mb,
            "parent_mb": None, "color": gc_color[mb], "area_km2": area,
            "source": "data.zagreb.hr (Otvorena dozvola)", "geometry": g, **ZG_JLS,
        })

    mo_rows = read_zipped_shp(fetch_cached(ZG_SOURCES["mo"], RAW_DIR / "rpj_mo.zip"))
    mo_rows.sort(key=lambda t: norm_mb(t[0]["JMS_MB"]))
    for rec, geom in mo_rows:
        parent = norm_mb(rec["MBR_NADR"])
        g, area = clean_geom(geom)
        feats.append({
            "razina": "mjesni_odbor", "name": clean_name(rec["JMS_IME"]),
            "mb": norm_mb(rec["JMS_MB"]), "parent_mb": parent,
            "color": gc_color.get(parent, "#888888"), "area_km2": area,
            "source": "data.zagreb.hr (Otvorena dozvola)", "geometry": g, **ZG_JLS,
        })
    return feats


def osm_relation_to_polygon(rel: dict):
    """Sastavi (Multi)Polygon iz member wayeva OSM relacije (out geom)."""
    outers, inners = [], []
    for m in rel.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        line = LineString([(p["lon"], p["lat"]) for p in m["geometry"]])
        (inners if m.get("role") == "inner" else outers).append(line)

    def rings(lines):
        if not lines:
            return []
        merged = linemerge(lines)
        return list(polygonize(merged))

    outer_polys = rings(outers)
    if not outer_polys:
        return None
    geom = unary_union(outer_polys)
    inner_polys = rings(inners)
    if inner_polys:
        geom = geom.difference(unary_union(inner_polys))
    if isinstance(geom, Polygon):
        return geom
    if isinstance(geom, MultiPolygon):
        return geom
    return None


def velika_gorica_features(start_color_idx: int) -> list[dict]:
    cache = RAW_DIR / "vg_cetvrti_osm.json"
    if cache.exists():
        payload = json.loads(cache.read_text())
    else:
        print("  ↓ Overpass: VG admin_level=9")
        r = httpx.post(OVERPASS, data={"data": VG_OVERPASS_QUERY}, headers=UA, timeout=120.0)
        r.raise_for_status()
        payload = r.json()
        cache.write_text(json.dumps(payload, ensure_ascii=False))

    feats = []
    rels = [e for e in payload["elements"] if e["type"] == "relation"]
    rels.sort(key=lambda e: e.get("tags", {}).get("name", ""))
    for i, rel in enumerate(rels):
        tags = rel.get("tags", {})
        name = tags.get("name", f"rel/{rel['id']}")
        # "Gradska četvrt Stari grad" → "Stari grad"
        for prefix in ("Gradska četvrt ", "Gradska cetvrt "):
            if name.startswith(prefix):
                name = name[len(prefix):]
        geom = osm_relation_to_polygon(rel)
        if geom is None:
            print(f"  ⚠ preskačem {name} — ne mogu sastaviti poligon", file=sys.stderr)
            continue
        g, area = clean_geom(geom, already_wgs84=True)
        feats.append({
            "razina": "cetvrt", "name": name, "mb": f"osm-{rel['id']}",
            "parent_mb": None, "color": color_for(start_color_idx + i),
            "area_km2": area, "source": "OpenStreetMap (ODbL)", "geometry": g, **VG_JLS,
        })
    return feats


def main() -> None:
    print("▸ Zagreb: gradske četvrti + mjesni odbori (data.zagreb.hr)")
    zg = zagreb_features()
    n_gc = sum(1 for f in zg if f["razina"] == "cetvrt")
    n_mo = len(zg) - n_gc
    print(f"  GČ: {n_gc}  MO: {n_mo}")

    print("▸ Velika Gorica: gradske četvrti (OSM)")
    vg = velika_gorica_features(start_color_idx=n_gc)
    print(f"  GČ: {len(vg)}")

    assert n_gc == 17, f"Zagreb GČ: očekivano 17, dobio {n_gc}"
    assert n_mo == 218, f"Zagreb MO: očekivano 218, dobio {n_mo}"
    assert len(vg) == 8, f"VG GČ: očekivano 8, dobio {len(vg)}"
    orphans = [f["name"] for f in zg if f["razina"] == "mjesni_odbor" and f["color"] == "#888888"]
    assert not orphans, f"MO bez matične GČ: {orphans[:5]}"

    rows = zg + vg
    rows.sort(key=lambda f: (f["jls_maticni_broj"], f["razina"], f["mb"]))
    features = []
    for fid, row in enumerate(rows, start=1):
        geometry = row.pop("geometry")
        features.append({
            "type": "Feature", "id": fid,
            "geometry": geometry,
            "properties": {"id": fid, **row},
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "hr_kvartovi.geojson"
    out.write_text(json.dumps(
        {"type": "FeatureCollection", "features": features}, ensure_ascii=False,
    ))
    size_mb = out.stat().st_size / 1e6
    print(f"✔ {out} — {len(features)} featurea, {size_mb:.2f} MB")


if __name__ == "__main__":
    main()
