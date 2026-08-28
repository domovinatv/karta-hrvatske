#!/usr/bin/env python3
"""
Step 25 — Turopolje: naselja 4 JLS kao poster sloj.

Poster generator ("anatomija grada") do sada je znao samo kvartove — a to
pokriva samo Zagreb i urbanu jezgru Velike Gorice (8 gradskih četvrti = 37 od
327 km² JLS-a). Za Turopolje je prirodna jedinica NASELJE: DGU Registar
prostornih jedinica ima potpunu podjelu za sve četiri JLS.

Turopolje ovdje = unija 4 JLS (definicija iz zahtjeva; povijesna regija nema
službenu granicu):

    Velika Gorica (05410)  58 naselja  327 km²
    Pokupsko      (05444)  14 naselja  106 km²
    Orle          (05428)  10 naselja   59 km²
    Kravarsko     (05452)  10 naselja   58 km²
    ────────────────────────────────────────────
                           92 naselja  549 km²

NAPOMENA: "Turopolje" je i ime naselja u općini Orle. Ovdje se misli na
regiju, ne na to naselje — naselje ostaje običan feature među 92.

Output: data/hr_turopolje_naselja.geojson — properties kompatibilni s
kvartovi slojem (name, jls_name, jls_maticni_broj, area_km2, palette_idx),
plus razina:

  razina="naselje"  92 poligona koje poster boja
  razina="jls"       4 unije — granice JLS-a, crtaju se preko naselja na
                     objedinjenom Turopolje plakatu da se vidi od čega je
                     regija složena

Bojanje: JEDAN greedy graph coloring preko svih 92 naselja, ne po JLS-u.
Susjedstvo prelazi granice JLS-a, a pravilno bojanje cjeline ostaje pravilno
i za svaki podskup — tako isti palette_idx radi i na pojedinačnim i na
objedinjenom plakatu, bez druge palete.

Ovisi o: data/hr_canonical_naselja.geojson (korak 18).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from pyproj import Transformer
    from shapely.geometry import mapping, shape
    from shapely.ops import transform as shp_transform, unary_union
except ImportError as e:
    print(f"Missing dependency ({e}). pip install pyproj shapely", file=sys.stderr)
    sys.exit(1)

OUT_DIR = Path("data")
NASELJA = OUT_DIR / "hr_canonical_naselja.geojson"
OUT = OUT_DIR / "hr_turopolje_naselja.geojson"

# Redoslijed određuje redoslijed u outputu; VG prva jer je najveća.
TUROPOLJE_JLS = {
    "05410": "Velika Gorica",
    "05444": "Pokupsko",
    "05428": "Orle",
    "05452": "Kravarsko",
}

SIMPLIFY_M = 5.0  # isto kao kvartovi — na plakatu neprimjetno, file 2× manji

TX_4326_TO_3765 = Transformer.from_crs("EPSG:4326", "EPSG:3765", always_xy=True)
TX_3765_TO_4326 = Transformer.from_crs("EPSG:3765", "EPSG:4326", always_xy=True)


def round_coords(obj, nd=6):
    """Reže koordinate na ~10 cm. Na 70 cm plakatu je to 0.0000001 mm; pun
    float iz shapelya samo napuhne file koji se skida u pregledniku."""
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), nd) for c in obj]
        return [round_coords(o, nd) for o in obj]
    return obj


def simplify_wgs84(geom):
    """Pojednostavi u metarskom CRS-u (tolerancija u metrima ima smisla)."""
    m = shp_transform(TX_4326_TO_3765.transform, geom)
    m = m.buffer(0).simplify(SIMPLIFY_M, preserve_topology=True)
    return shp_transform(TX_3765_TO_4326.transform, m)


def greedy_coloring(geoms: list) -> dict[int, int]:
    """palette_idx takav da se dodirujući poligoni nikad ne poklope u boji."""
    n = len(geoms)
    adj: list[set[int]] = [set() for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            # touches = dijele rub; intersects bez touches = preklop (ne bi
            # smjelo kod DGU naselja, ali tretiraj kao susjedstvo svejedno).
            if geoms[i].intersects(geoms[j]):
                adj[i].add(j)
                adj[j].add(i)
    # Welsh-Powell: najpovezaniji prvi → manje boja.
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
    if not NASELJA.exists():
        print(f"Missing {NASELJA} — run 18_build_canonical_naselja.py first.", file=sys.stderr)
        sys.exit(1)

    nas = json.loads(NASELJA.read_text())
    sel = [f for f in nas["features"] if f["properties"].get("jls_maticni_broj") in TUROPOLJE_JLS]
    if not sel:
        print("Nijedno naselje nije matchalo Turopolje JLS-ove.", file=sys.stderr)
        sys.exit(1)

    # Stabilan redoslijed: JLS kako je nabrojan, pa naselja abecedno.
    jls_order = list(TUROPOLJE_JLS)
    sel.sort(key=lambda f: (jls_order.index(f["properties"]["jls_maticni_broj"]),
                            f["properties"]["name"]))

    geoms = [simplify_wgs84(shape(f["geometry"])) for f in sel]
    colors = greedy_coloring(geoms)
    print(f"  coloring: {len(sel)} naselja, {max(colors.values()) + 1} boja")

    feats = []
    for i, (f, g) in enumerate(zip(sel, geoms)):
        p = f["properties"]
        feats.append({
            "razina": "naselje",
            "name": p["name"],
            "jls_name": p["jls_name"],
            "jls_maticni_broj": p["jls_maticni_broj"],
            "zupanija": p["zupanija"],
            "area_km2": p.get("area_km2"),  # DGU površina, ne iz pojednostavljene geometrije
            "stanovnistvo": p.get("stanovnistvo"),
            "palette_idx": colors[i],
            "source": p.get("source", "DGU rpj:naselje"),
            "geometry": {"type": g.geom_type, "coordinates": round_coords(mapping(g)["coordinates"])},
        })

    # Granice JLS-a = unija njihovih naselja (isti izvor, nema rasparivanja
    # rubova kao kad bi se miješao drugi dataset).
    for mb, name in TUROPOLJE_JLS.items():
        idx = [i for i, f in enumerate(sel) if f["properties"]["jls_maticni_broj"] == mb]
        u = unary_union([geoms[i] for i in idx])
        pop = sum(sel[i]["properties"].get("stanovnistvo") or 0 for i in idx)
        feats.append({
            "razina": "jls",
            "name": name,
            "jls_name": name,
            "jls_maticni_broj": mb,
            "zupanija": sel[idx[0]]["properties"]["zupanija"],
            "area_km2": round(sum(sel[i]["properties"].get("area_km2") or 0 for i in idx), 4),
            "stanovnistvo": pop,
            "naselja_count": len(idx),
            "palette_idx": 0,
            "source": "DGU rpj:naselje (unija naselja)",
            "geometry": {"type": u.geom_type, "coordinates": round_coords(mapping(u)["coordinates"])},
        })
        print(f"  {name:14} {len(idx):3} naselja  {feats[-1]['area_km2']:8.1f} km²  {pop:6} st.")

    features = []
    for fid, row in enumerate(feats, start=1):
        geometry = row.pop("geometry")
        features.append({
            "type": "Feature", "id": fid, "geometry": geometry,
            "properties": {"id": fid, **row},
        })

    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False))
    n_nas = sum(1 for f in features if f["properties"]["razina"] == "naselje")
    print(f"✔ {OUT} — {n_nas} naselja + 4 JLS granice, {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
