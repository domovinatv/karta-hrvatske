#!/usr/bin/env python3
"""
Step 27 — Naselja gradova kao poster sloj (Petrinja, Split, Osijek, Varaždin,
Dubrovnik) + Urbano područje Pula.

Isti obrazac kao koraci 25 (Turopolje) i 26 (Sisak), ali table-driven: jedna
skripta, jedan file po GRUPI subjekata. Grupa je skup JLS-ova koji se crtaju
iz istog geojsona; poster onda filtrira po `jlsMb`.

    grupa "gradovi" -> data/hr_gradovi_naselja.geojson
        Petrinja   (03280)  56 naselja   390 km2   20.026 st.
        Split      (04090)   8 naselja    79 km2  160.577 st.
        Osijek     (03123)  11 naselja   175 km2   96.313 st.
        Varazdin   (04723)  10 naselja    60 km2   43.782 st.
        Dubrovnik  (00981)  32 naselja   143 km2   41.562 st.

    grupa "pula" -> data/hr_pula_naselja.geojson
        Urbano podrucje Pula, 8 JLS, 84 naselja, 572 km2, 81.080 st.

ZASTO PULA NIJE SAMA: DGU vodi Grad Pulu kao JEDNO naselje (53,8 km2), pa
plakat "Pula po naseljima" nema sto nacrtati - jedan poligon nije anatomija
grada. Pulinih ~15 mjesnih odbora nema javnog poligonskog izvora: OSM ih na
2026-08-30 ima 4 (Arena, Busoler, Gregovica, Kastanjer). Zato ide urbano
podrucje, koje ima sluzbeni obuhvat:

    Grad Pula-Pola (srediste), Grad Vodnjan-Dignano, opcine Barban,
    Fazana-Fasana, Liznjan-Lisignano, Marcana, Medulin, Svetvincenat.

Izvor obuhvata: Strategija razvoja Urbanog podrucja Pula (Grad Pula-Pola,
nositelj izrade) - "Urbano podrucje Pula cine Grad Pula-Pola kao grad
srediste [...] Grad Vodnjan-Dignano te opcine Barban, Fazana - Fasana,
Liznjan - Lisignano, Marcana, Medulin i Svetvincenat."

Isto vrijedi i za Rijeku, ali obrnuto: Rijeka je takoder jedno DGU naselje,
samo sto ONA ima potpunih 34 mjesna odbora u OSM-u - pa ide kroz korak 28,
ne ovdje.

Output po grupi - properties kompatibilni s kvartovi/turopolje/sisak slojem
(name, jls_name, jls_maticni_broj, area_km2, palette_idx), plus razina:

  razina="naselje"  poligoni koje poster boja
  razina="jls"      unija naselja po JLS-u - granice preko naselja
  razina="regija"   dissolve cijele grupe; SAMO ondje gdje grupa JEST jedno
                    podrucje (Pula), ne za skup nepovezanih gradova

Bojanje: jedan greedy coloring po fileu. Pravilno bojanje cjeline ostaje
pravilno za svaki podskup, pa isti palette_idx radi i na pojedinacnom i na
objedinjenom plakatu.

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

# Grupa: (output file, {jls_mb: ime}, regija|None, ocekivan broj naselja).
#
# `regija` je ime vanjskog obuhvata ili None. Skup nepovezanih gradova ga NEMA
# - dissolve pet gradova rastrkanih po Hrvatskoj nije podrucje nego mrlje, a
# projectSubject() bi ga uzeo kao okvir plakata pa bi Varazdin ispao velicine
# postanske marke.
#
# `expect` je brojka iz DGU registra na 2026-08-30. Ako se registar promijeni
# (novo naselje, pripojenje), korak padne umjesto da tiho izbaci drukciji
# plakat - ista provjera kao u koraku 26.
GROUPS = {
    "gradovi": {
        "out": "hr_gradovi_naselja.geojson",
        "jls": {
            "03280": "Petrinja",
            "04090": "Split",
            "03123": "Osijek",
            "04723": "Varazdin",
            "00981": "Dubrovnik",
        },
        "regija": None,
        "expect": {"03280": 56, "04090": 8, "03123": 11, "04723": 10, "00981": 32},
    },
    "pula": {
        "out": "hr_pula_naselja.geojson",
        "jls": {
            "03590": "Pula - Pola",
            "05029": "Vodnjan - Dignano",
            "06190": "Fazana - Fasana",
            "02631": "Medulin",
            "02356": "Liznjan - Lisignano",
            "02542": "Marcana",
            "00060": "Barban",
            "04359": "Svetvincenat",
        },
        "regija": "Urbano podrucje Pula",
        "expect": {"03590": 1, "05029": 4, "06190": 2, "02631": 8,
                   "02356": 5, "02542": 22, "00060": 23, "04359": 19},
        # Obuhvat je priobalan: Brijuni i ostali otoci su zasebni dijelovi
        # unije, pa "jedan povezan poligon" NIJE kriterij ispravnosti kao kod
        # Turopolja. Broj dijelova se ispisuje, ne tretira kao greska.
        "coastal": True,
    },
}

# Geometrija se NE pojednostavljuje - simplify() reze vrhove neovisno na svakoj
# strani zajednickog ruba, pa unija susjednih naselja dobije slivere. Rezanje
# koordinata na 6 decimala (~10 cm) je topoloski sigurno.


def round_coords(obj, nd=6):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), nd) for c in obj]
        return [round_coords(o, nd) for o in obj]
    return obj


def clean(geom):
    """buffer(0) - popravlja self-intersectione koje DGU zna imati."""
    return geom.buffer(0)


def greedy_coloring(geoms: list) -> dict[int, int]:
    """palette_idx takav da se dodirujuci poligoni nikad ne poklope u boji."""
    n = len(geoms)
    adj: list[set[int]] = [set() for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if geoms[i].intersects(geoms[j]):
                adj[i].add(j)
                adj[j].add(i)
    order = sorted(range(n), key=lambda k: -len(adj[k]))  # Welsh-Powell
    colors: dict[int, int] = {}
    for k in order:
        used = {colors[m] for m in adj[k] if m in colors}
        c = 0
        while c in used:
            c += 1
        colors[k] = c
    return colors


def build_group(key: str, spec: dict, nas: dict) -> None:
    jls = spec["jls"]
    sel = [f for f in nas["features"]
           if f["properties"].get("jls_maticni_broj") in jls]
    if not sel:
        print(f"[{key}] nijedno naselje nije matchalo JLS-ove.", file=sys.stderr)
        sys.exit(1)

    got = {mb: sum(1 for f in sel if f["properties"]["jls_maticni_broj"] == mb)
           for mb in jls}
    bad = [f"{jls[mb]}: {got[mb]} umjesto {spec['expect'][mb]}"
           for mb in jls if got[mb] != spec["expect"][mb]]
    if bad:
        print(f"[{key}] broj naselja ne odgovara registru - " + "; ".join(bad),
              file=sys.stderr)
        sys.exit(1)

    order = list(jls)
    sel.sort(key=lambda f: (order.index(f["properties"]["jls_maticni_broj"]),
                            f["properties"]["name"]))

    geoms = [clean(shape(f["geometry"])) for f in sel]
    colors = greedy_coloring(geoms)
    print(f"[{key}] coloring: {len(sel)} naselja, {max(colors.values()) + 1} boja")

    feats = []
    for i, (f, g) in enumerate(zip(sel, geoms)):
        p = f["properties"]
        feats.append({
            "razina": "naselje",
            "name": p["name"],
            "jls_name": p["jls_name"],
            "jls_maticni_broj": p["jls_maticni_broj"],
            "zupanija": p["zupanija"],
            "area_km2": p.get("area_km2"),  # DGU povrsina, ne iz geometrije
            "stanovnistvo": p.get("stanovnistvo"),
            "palette_idx": colors[i],
            "source": p.get("source", "DGU rpj:naselje"),
            "geometry": {"type": g.geom_type,
                         "coordinates": round_coords(mapping(g)["coordinates"])},
        })

    for mb in order:
        idx = [i for i, f in enumerate(sel)
               if f["properties"]["jls_maticni_broj"] == mb]
        u = unary_union([geoms[i] for i in idx])
        pop = sum(sel[i]["properties"].get("stanovnistvo") or 0 for i in idx)
        feats.append({
            "razina": "jls",
            "name": jls[mb],
            "jls_name": jls[mb],
            "jls_maticni_broj": mb,
            "zupanija": sel[idx[0]]["properties"]["zupanija"],
            "area_km2": round(sum(sel[i]["properties"].get("area_km2") or 0 for i in idx), 4),
            "stanovnistvo": pop,
            "naselja_count": len(idx),
            "partial": False,
            "palette_idx": 0,
            "source": "DGU rpj:naselje (unija naselja)",
            "geometry": {"type": u.geom_type,
                         "coordinates": round_coords(mapping(u)["coordinates"])},
        })
        print(f"  {jls[mb]:20} {len(idx):3} naselja  "
              f"{feats[-1]['area_km2']:8.1f} km2  {pop:7} st.")

    if spec["regija"]:
        region = unary_union(geoms)
        parts = [region] if region.geom_type == "Polygon" else list(region.geoms)
        holes = sum(len(g.interiors) for g in parts)
        if spec.get("coastal"):
            print(f"  obuhvat: {len(parts)} dijelova (otoci), {holes} rupa")
        elif len(parts) > 1 or holes:
            print(f"  ! obuhvat nije jedinstven: {len(parts)} dijelova, {holes} rupa",
                  file=sys.stderr)
        else:
            print("  obuhvat je jedan povezan poligon, bez rupa")
        feats.append({
            "razina": "regija",
            "name": spec["regija"],
            "jls_name": spec["regija"],
            "jls_maticni_broj": "*",
            "zupanija": sel[0]["properties"]["zupanija"],
            "area_km2": round(sum(f["properties"].get("area_km2") or 0 for f in sel), 4),
            "stanovnistvo": sum(f["properties"].get("stanovnistvo") or 0 for f in sel),
            "naselja_count": len(sel),
            "parts": len(parts),
            "holes": holes,
            "palette_idx": 0,
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

    out = OUT_DIR / spec["out"]
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False))
    n_nas = sum(1 for f in features if f["properties"]["razina"] == "naselje")
    print(f"OK {out} - {n_nas} naselja + {len(jls)} granica"
          f"{' + obuhvat' if spec['regija'] else ''}, "
          f"{out.stat().st_size / 1e6:.2f} MB\n")


def main() -> None:
    if not NASELJA.exists():
        print(f"Missing {NASELJA} - run 18_build_canonical_naselja.py first.",
              file=sys.stderr)
        sys.exit(1)
    nas = json.loads(NASELJA.read_text())
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for key, spec in GROUPS.items():
        if only and key != only:
            continue
        build_group(key, spec, nas)


if __name__ == "__main__":
    main()
