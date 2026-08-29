#!/usr/bin/env python3
"""
Step 26 — Sisak: naselja Grada Siska i Urbanog područja Sisak kao poster sloj.

Isti obrazac kao korak 25 (Turopolje), ali bez uredničkog popisa naselja:
obuhvat je ovdje SLUŽBEN, pa se subjekt definira cijelim JLS-ovima.

    Grad Sisak      (03913)  36 naselja  424 km²  40.245 st.
    Općina Sunja    (04260)  40 naselja  288 km²   4.124 st.
    Martinska Ves   (02593)  16 naselja  130 km²   3.061 st.
    ─────────────────────────────────────────────────────────
                             92 naselja  843 km²  47.430 st.

"Sisak i okolica" = Urbano područje Sisak, obuhvat koji čine te tri JLS.
Nije naša procjena nego akt: Ministarstvo regionalnoga razvoja i fondova EU
očitovalo se na konačni prijedlog obuhvata 28. 10. 2020., članice su
11. 8. 2021. sklopile Sporazum o suradnji na izradi i provedbi Strategije
razvoja Urbanog područja Sisak 2021.-2027., a Gradsko vijeće Grada Siska
donijelo je Odluku o sastavu Urbanog područja Sisak 19. 10. 2022.
https://sisak.hr/itu-mehanizam/uspostava-urbanog-podrucja-sisak/

Zašto baš to, a ne "Sisak + sve susjedne JLS": Sisak graniči s devet JLS-ova,
među njima i s Kutinom, Popovačom, Lipovljanima i Velikom Ludinom — preko
Lonjskog polja, dakle s Moslavinom, koja nije sisačka okolica. Svaki drugi
izbor bio bi naša procjena; ovaj ima potpis.

NAPOMENA: "Sisak" je i ime naselja unutar Grada Siska. Ovdje se pod Siskom
misli na JLS; naselje ostaje običan feature među 36.

Output: data/hr_sisak_naselja.geojson — properties kompatibilni s turopolje i
kvartovi slojem (name, jls_name, jls_maticni_broj, area_km2, palette_idx),
plus razina:

  razina="naselje"  92 poligona koje poster boja
  razina="jls"       3 unije — granice JLS-a, crtaju se preko naselja na
                     plakatu "Sisak i okolica"
  razina="regija"    1 dissolve — vanjski obuhvat urbanog područja

Bojanje: JEDAN greedy coloring preko svih 92 naselja, ne po JLS-u. Pravilno
bojanje cjeline ostaje pravilno i za svaki podskup, pa isti palette_idx radi
i na plakatu Grada Siska i na objedinjenom — bez druge palete.

Ovisi o: data/hr_canonical_naselja.geojson (korak 18).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
except ImportError as e:
    print(f"Missing dependency ({e}). pip install shapely", file=sys.stderr)
    sys.exit(1)

OUT_DIR = Path("data")
NASELJA = OUT_DIR / "hr_canonical_naselja.geojson"
OUT = OUT_DIR / "hr_sisak_naselja.geojson"

# Redoslijed = redoslijed u outputu; Sisak prvi jer je središte područja.
SISAK_JLS = {
    "03913": "Sisak",
    "04260": "Sunja",
    "02593": "Martinska Ves",
}

# Zona ide u properties da se dijelovi mogu razlikovati na karti: središte
# područja naspram općina koje su mu pristupile.
ZONE = {
    "03913": "Grad Sisak",
    "04260": "Sunja",
    "02593": "Martinska Ves",
}

# Očekivane brojke (DZS 2021 / DGU) — provjeravaju se na kraju. Ako se DGU
# registar promijeni (novo naselje, pripojenje), skripta to javi umjesto da
# tiho izbaci drukčiji plakat.
EXPECT_NASELJA = {"03913": 36, "04260": 40, "02593": 16}

# Geometrija se NE pojednostavljuje — isti razlog kao u koraku 25: simplify()
# reže vrhove neovisno na svakoj strani zajedničkog ruba, pa unija susjednih
# naselja dobije slivere. Rezanje koordinata na 6 decimala je topološki
# sigurno (isti ulazni vrh → isti izlazni).


def round_coords(obj, nd=6):
    """Reže koordinate na ~10 cm — ispod razlučivosti plakata, a file je manji."""
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), nd) for c in obj]
        return [round_coords(o, nd) for o in obj]
    return obj


def clean(geom):
    """buffer(0) — popravlja self-intersectione koje DGU zna imati."""
    return geom.buffer(0)


def greedy_coloring(geoms: list) -> dict[int, int]:
    """palette_idx takav da se dodirujući poligoni nikad ne poklope u boji."""
    n = len(geoms)
    adj: list[set[int]] = [set() for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
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
    sel = [f for f in nas["features"]
           if f["properties"].get("jls_maticni_broj") in SISAK_JLS]
    if not sel:
        print("Nijedno naselje nije matchalo sisačke JLS-ove.", file=sys.stderr)
        sys.exit(1)

    # Broj naselja po JLS-u mora odgovarati registru. Tiho odstupanje bi dalo
    # plakat s rupom ili viškom koji nitko ne bi primijetio.
    got = {mb: sum(1 for f in sel if f["properties"]["jls_maticni_broj"] == mb)
           for mb in SISAK_JLS}
    bad = [f"{SISAK_JLS[mb]}: {got[mb]} umjesto {EXPECT_NASELJA[mb]}"
           for mb in SISAK_JLS if got[mb] != EXPECT_NASELJA[mb]]
    if bad:
        print("Broj naselja ne odgovara registru — " + "; ".join(bad), file=sys.stderr)
        sys.exit(1)

    # Stabilan redoslijed: JLS kako je nabrojan, pa naselja abecedno.
    jls_order = list(SISAK_JLS)
    sel.sort(key=lambda f: (jls_order.index(f["properties"]["jls_maticni_broj"]),
                            f["properties"]["name"]))

    geoms = [clean(shape(f["geometry"])) for f in sel]
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
            "historical_zone": ZONE[p["jls_maticni_broj"]],
            "source": p.get("source", "DGU rpj:naselje"),
            "geometry": {"type": g.geom_type,
                         "coordinates": round_coords(mapping(g)["coordinates"])},
        })

    # Granica po JLS-u = unija njegovih naselja (isti izvor, pa nema
    # rasparivanja rubova kao kad bi se miješao drugi dataset). Ovdje nijedan
    # JLS ne ulazi djelomično, pa je `partial` uvijek false.
    for mb in jls_order:
        idx = [i for i, f in enumerate(sel) if f["properties"]["jls_maticni_broj"] == mb]
        u = unary_union([geoms[i] for i in idx])
        pop = sum(sel[i]["properties"].get("stanovnistvo") or 0 for i in idx)
        feats.append({
            "razina": "jls",
            "name": SISAK_JLS[mb],
            "jls_name": SISAK_JLS[mb],
            "jls_maticni_broj": mb,
            "zupanija": sel[idx[0]]["properties"]["zupanija"],
            "area_km2": round(sum(sel[i]["properties"].get("area_km2") or 0 for i in idx), 4),
            "stanovnistvo": pop,
            "naselja_count": len(idx),
            "partial": False,
            "historical_zone": ZONE[mb],
            "palette_idx": 0,
            "source": "DGU rpj:naselje (unija naselja)",
            "geometry": {"type": u.geom_type,
                         "coordinates": round_coords(mapping(u)["coordinates"])},
        })
        print(f"  {SISAK_JLS[mb]:16} {len(idx):3} naselja  "
              f"{feats[-1]['area_km2']:8.1f} km²  {pop:6} st.")

    # Vanjski obuhvat urbanog područja — jedan dissolve svih naselja. Služi kao
    # najdeblji obris na plakatu i kao provjera: ako unija nije JEDAN poligon
    # bez rupa, obuhvat nije susjedan i karta bi imala prazninu.
    region = unary_union(geoms)
    parts = [region] if region.geom_type == "Polygon" else list(region.geoms)
    holes = sum(len(g.interiors) for g in parts)
    if len(parts) > 1 or holes:
        print(f"  ⚠ obuhvat nije jedinstven: {len(parts)} dijelova, {holes} rupa",
              file=sys.stderr)
    else:
        print("  ✓ obuhvat je jedan povezan poligon, bez rupa")
    feats.append({
        "razina": "regija",
        "name": "Urbano područje Sisak",
        "jls_name": "Urbano područje Sisak",
        "jls_maticni_broj": "*",
        "zupanija": "Sisačko-moslavačka",
        "area_km2": round(sum(f["properties"].get("area_km2") or 0 for f in sel), 4),
        "stanovnistvo": sum(f["properties"].get("stanovnistvo") or 0 for f in sel),
        "naselja_count": len(sel),
        "parts": len(parts),
        "holes": holes,
        "palette_idx": 0,
        "historical_zone": "Urbano područje Sisak",
        "source": "DGU rpj:naselje (dissolve svih naselja)",
        "geometry": {"type": region.geom_type,
                     "coordinates": round_coords(mapping(region)["coordinates"])},
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
    n_nas = sum(1 for f in features if f["properties"]["razina"] == "naselje")
    n_jls = sum(1 for f in features if f["properties"]["razina"] == "jls")
    print(f"✔ {OUT} — {n_nas} naselja + {n_jls} granice + obuhvat, "
          f"{OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
