#!/usr/bin/env python3
"""
Step 28 - Gradski kotari / mjesni odbori iz OSM-a: Rijeka i Split.

ZASTO POSTOJI: DGU vodi Rijeku kao JEDNO naselje (43,4 km2, 107.964 st.), pa
"anatomija grada po naseljima" za nju nema sto nacrtati. Prirodna jedinica
Rijeke je mjesni odbor, kao sto je za Zagreb kvart - i to je jedini nacin da
goli slug /poster/rijeka i dalje znaci CIJELU JLS u njezinoj prirodnoj
jedinici.

Split ima 8 naselja, ali od toga je naselje Split cijeli grad (160k od 161k
stanovnika). Njegovih 27 gradskih kotara pokriva urbani dio i daje varijantu
/poster/split-kotari, isto kao sto Velika Gorica ima /poster/velika-gorica
(naselja) i /poster/velika-gorica-cetvrti.

    Rijeka  (03735)  34 mjesna odbora   - potpuno (Rijeka ih ima 34)
    Split   (04090)  27 gradskih kotara - potpuno za urbani dio; preostalih
                                          7 prigradskih naselja su mjesni
                                          odbori i ostaju u naselja sloju

NIJE OVDJE, i zasto:
    Pula     OSM ima 4 od ~15 mjesnih odbora -> nepotpuno, plakat bi lagao.
             Ide kao Urbano podrucje Pula (korak 27).
    Osijek   OSM ima 10 (7 GC + 3 MO) od 13 gradskih cetvrti -> nepotpuno.
             Osijek ionako ima 11 naselja, pa ide po naseljima.
    Varazdin OSM nema nijednu podjedinicu; 10 naselja je dovoljno.

IZVOR: OpenStreetMap, relacije boundary=administrative admin_level=9 unutar
granice grada. Licenca ODbL - ide u attribution plakata. Isti pristup kao za
gradske cetvrti Velike Gorice u koraku 23.

VAZNO: ovaj korak NE dira hr_kvartovi.geojson ni hr_kvartovi_kolokvijalni.
geojson. Zagrebacki sloj je izveden iz kuriranog mappinga (korak 24) i
ponovno vrtjeti 23/24 znacilo bi riskirati tihu promjenu vec objavljenog
zagrebackog plakata. Ovo je zaseban file.

Output: data/hr_grad_kotari.geojson
  razina="cetvrt"  poligoni koje poster boja (isti kljuc kao VG cetvrti)
  razina="jls"     unija po gradu - vanjski obris

Bojanje: greedy coloring PO GRADU (Rijeka i Split se ne dodiruju).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

try:
    import httpx
    from shapely.geometry import LineString, MultiPolygon, Polygon, mapping, shape
    from shapely.ops import linemerge, polygonize, unary_union
except ImportError as e:
    print(f"Missing dependency ({e}). pip install shapely httpx", file=sys.stderr)
    sys.exit(1)

OUT_DIR = Path("data")
OUT = OUT_DIR / "hr_grad_kotari.geojson"
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = {"User-Agent": "domovina.ai-gis (info@domovina.ai)"}

# OSM area id = 3600000000 + relation id (admin_level=8 granica grada).
# `strip` skida prefiks iz OSM imena ("Mjesni odbor Zamet" -> "Zamet"), jer na
# plakatu ide samo ime kotara - prefiks bi pojeo cijeli poligon.
CITIES = {
    "03735": {
        "name": "Rijeka",
        "zupanija": "Primorsko-goranska",
        "relation": 16380291,
        "strip": ("Mjesni odbor ",),
        "expect": 34,
        "unit": "mjesni odbor",
    },
    "04090": {
        "name": "Split",
        "zupanija": "Splitsko-dalmatinska",
        "relation": 11153757,
        "strip": ("Gradski kotar ",),
        "expect": 27,
        "unit": "gradski kotar",
    },
}


def overpass(query: str) -> dict:
    """Overpass zna vratiti 429/504 pod opterecenjem - probaj oba endpointa."""
    last = None
    for attempt in range(6):
        url = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
        try:
            r = httpx.post(url, data={"data": query}, timeout=180, headers=UA)
            if r.status_code == 200 and r.text.lstrip().startswith("{"):
                return r.json()
            last = f"{url} -> HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001 - mrezna greska, retry
            last = f"{url} -> {e}"
        time.sleep(15)
    print(f"Overpass ne odgovara: {last}", file=sys.stderr)
    sys.exit(1)


def rel_to_polygon(el: dict):
    """OSM relacija (out geom) -> Polygon/MultiPolygon.

    Granice dolaze kao skup wayeva u proizvoljnom redoslijedu i smjeru, pa se
    sastavljaju linemerge + polygonize umjesto naivnog nadovezivanja - inace
    kotar s vise segmenata ispadne otvoren i nestane.
    """
    lines = []
    for m in el.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        pts = [(p["lon"], p["lat"]) for p in m["geometry"]]
        if len(pts) >= 2:
            lines.append(LineString(pts))
    if not lines:
        return None
    polys = list(polygonize(linemerge(unary_union(lines))))
    if not polys:
        return None
    g = polys[0] if len(polys) == 1 else MultiPolygon(
        [p for p in polys if isinstance(p, Polygon)])
    return g.buffer(0)


def round_coords(obj, nd=6):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), nd) for c in obj]
        return [round_coords(o, nd) for o in obj]
    return obj


def greedy_coloring(geoms: list) -> dict[int, int]:
    n = len(geoms)
    adj: list[set[int]] = [set() for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if geoms[i].intersects(geoms[j]):
                adj[i].add(j)
                adj[j].add(i)
    order = sorted(range(n), key=lambda k: -len(adj[k]))
    colors: dict[int, int] = {}
    for k in order:
        used = {colors[m] for m in adj[k] if m in colors}
        c = 0
        while c in used:
            c += 1
        colors[k] = c
    return colors


def main() -> None:
    feats = []
    for mb, city in CITIES.items():
        q = f"""
        [out:json][timeout:180];
        area({3600000000 + city['relation']})->.a;
        relation["boundary"="administrative"]["admin_level"="9"](area.a);
        out geom;
        """
        els = overpass(q)["elements"]
        rows = []
        for el in els:
            name = el.get("tags", {}).get("name", "").strip()
            for pre in city["strip"]:
                if name.startswith(pre):
                    name = name[len(pre):]
            g = rel_to_polygon(el)
            if g is None or g.is_empty:
                print(f"  ! {city['name']}: '{name}' nema upotrebljivu geometriju",
                      file=sys.stderr)
                continue
            rows.append((name, g))
        rows.sort(key=lambda r: r[0])

        # Broj mora odgovarati stvarnom broju jedinica grada. Nepotpun OSM je
        # tihi kvar: plakat bi izgledao dobro, samo bi mu nedostajala cetvrt.
        if len(rows) != city["expect"]:
            print(f"{city['name']}: OSM je dao {len(rows)} {city['unit']}a, "
                  f"ocekivano {city['expect']} - sloj bi bio nepotpun.",
                  file=sys.stderr)
            sys.exit(1)

        geoms = [g for _, g in rows]
        colors = greedy_coloring(geoms)
        print(f"[{city['name']}] {len(rows)} x {city['unit']}, "
              f"{max(colors.values()) + 1} boja")

        # OSM nema povrsinu; racuna se iz geometrije u ekvivalentnom metarskom
        # priblizenju (cos(lat) korekcija) - dovoljno za brojku ispod dropdowna.
        import math
        lat0 = math.radians(unary_union(geoms).centroid.y)
        kx = math.cos(lat0) * 111.320
        for i, (name, g) in enumerate(rows):
            feats.append({
                "razina": "cetvrt",
                "name": name,
                "jls_name": city["name"],
                "jls_maticni_broj": mb,
                "zupanija": city["zupanija"],
                "area_km2": round(g.area * kx * 110.574, 4),
                "stanovnistvo": None,
                "palette_idx": colors[i],
                "source": "OSM boundary=administrative admin_level=9 (ODbL)",
                "geometry": {"type": g.geom_type,
                             "coordinates": round_coords(mapping(g)["coordinates"])},
            })

        u = unary_union(geoms)
        feats.append({
            "razina": "jls",
            "name": city["name"],
            "jls_name": city["name"],
            "jls_maticni_broj": mb,
            "zupanija": city["zupanija"],
            "area_km2": round(u.area * kx * 110.574, 4),
            "stanovnistvo": None,
            "naselja_count": len(rows),
            "partial": False,
            "palette_idx": 0,
            "source": "OSM admin_level=9 (unija)",
            "geometry": {"type": u.geom_type,
                         "coordinates": round_coords(mapping(u)["coordinates"])},
        })

    features = []
    for fid, row in enumerate(feats, start=1):
        geometry = row.pop("geometry")
        features.append({
            "type": "Feature", "id": fid, "geometry": geometry,
            "properties": {"id": fid, **row},
        })
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False))
    n_unit = sum(1 for f in features if f["properties"]["razina"] == "cetvrt")
    print(f"OK {OUT} - {n_unit} jedinica + {len(CITIES)} granica, "
          f"{OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
