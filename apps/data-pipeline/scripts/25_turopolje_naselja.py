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
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
except ImportError as e:
    print(f"Missing dependency ({e}). pip install shapely", file=sys.stderr)
    sys.exit(1)

OUT_DIR = Path("data")
NASELJA = OUT_DIR / "hr_canonical_naselja.geojson"
OUT = OUT_DIR / "hr_turopolje_naselja.geojson"

# Jezgra: JLS-ovi koji CIJELI ulaze u Turopolje. Redoslijed = redoslijed u
# outputu; VG prva jer je najveća.
TUROPOLJE_JLS = {
    "05410": "Velika Gorica",
    "05444": "Pokupsko",
    "05428": "Orle",
    "05452": "Kravarsko",
}

# Rub regije: JLS-ovi koji ulaze SAMO pojedinim naseljima. Turopolje je
# povijesna regija, a današnje granice JLS-ova su je presjekle — južni rub
# Zagreba i sjever Lekenika su turopoljski, ali Zagreb i Lekenik kao cjeline
# nisu.
#
# OPSEG PO IZVORU: Mladen Klemenčić, "Turopolje uzduž i poprijeko", Studia
# lexicographica 15(2021)29, 141-151 — urednik Turopoljskog leksikona (LZMK,
# 2021) objašnjava kako je uredništvo omeđilo regiju: 4 JLS u cijelosti plus
# "15 naselja iz sastava Grada Zagreba" i "sjeverni dio [općine Lekenik] s
# ukupno osam naselja". https://doi.org/10.33604/sl.15.29.8
#
# Imena su DGU RPJ pisanje, provjereno protiv hr_canonical_naselja.geojson.
# Homonimi postoje (Buzin i u Skradu, Veliko Polje u Lukaču), zato se par
# (jls_mb, name) uvijek koristi zajedno.
TUROPOLJE_NASELJA = {
    "01333": (  # Grad Zagreb, južno od Save — Klemenčićevih 15
        # Jezgra stare općine Odra / kotara Velika Gorica.
        "Odra",              # sastanci turopoljskih plemića do XV. st.
        "Hrašće Turopoljsko",  # sučija "Hrašće" Plemenite opčine
        "Mala Mlaka",        # referentna točka SZ međe (Šenoa 1910)
        "Odranski Obrež",    # "na zapadnoj medji turopoljskog kotara"
        "Gornji Čehi",       # SZ međa = crta Čehi - Mala Mlaka
        "Donji Čehi",
        "Buzin",
        "Veliko Polje",
        "Hudi Bitek",
        "Zadvorsko",
        "Strmec",            # izdvojen iz općine Odra 1952., kao Odr. Obrež
        # Sučije/naselja Plemenite opčine turopoljske (Šenoa 1910: 8) koja su
        # danas u Zagrebu — povijesno jača veza od Buzina ili Zadvorskog.
        "Donji Dragonožec",  # sučija Dragonožec (Vrhovlje)
        "Gornji Dragonožec",
        "Lipnica",
        "Havidić Selo",
    ),
    "02283": (  # Općina Lekenik — sjeverni dio, 8 naselja
        # Kriterij: područje župe Pešćenica, stare turopoljske crkvene
        # jedinice; općina Lekenik bila je 1871-1875. u kotaru Velika Gorica.
        "Lekenik",
        "Pešćenica",  # NE "Peščenica" — DGU piše Pešćenica
        "Donji Vukojevac",
        "Gornji Vukojevac",
        "Brežane Lekeničke",
        "Poljana Lekenička",
        "Cerje Letovanićko",
        "Dužica",
    ),
}

# NAMJERNO IZOSTAVLJENO (fact-check protiv literature):
#
#   Brezovica (Zagreb) — Klemenčić je izrijekom isključuje zajedno sa Svetom
#     Klarom i Jakuševcem; iz općine Odra izdvojena je već 1913., a povijesno
#     pripada okićkom, ne turopoljskom području.
#   Vrh Letovanićki, Palanjek Pokupski (Lekenik) — nema izvora koji ih veže uz
#     Turopolje; u JUŽNOJ su trećini općine (45,51° N, dok je 8 sjevernih
#     između 45,55 i 45,61) i nisu u župi Pešćenica. Uz to su bila odvojena od
#     ostatka regije, pa je obuhvat ispadao u dva dijela.
#   Lučko, Sveta Klara, Trnsko, Savski gaj, Jakuševec i ostatak Novog Zagreba
#     — sjeverno od zagrebačke obilaznice (1981.), koju Klemenčić uzima kao
#     praktičnu sjevernu crtu; većina ionako nisu DGU naselja nego dijelovi
#     naselja Zagreb.
#   Južni Lekenik (Letovanić, Žažina, Šišinec, Stari Brod, Stari Farkašić,
#     Brkiševina, Pokupsko Vratečko, Petrovec) — Pokuplje / sisačka Posavina.
#   Greda, Sela, Odra Sisačka (Sisak) — "jugoistočni dio Turopolja" po
#     Proleksisu, ali izvan definicije Turopoljskog leksikona; prijelazna zona
#     prema donjem Pokuplju.

# ---------------------------------------------------------------------------
# Plemenita opčina turopoljska — povijesna jezgra unutar regije.
#
# 22 sučije po Šenoi (1910: 8), preslikane na današnji DGU registar. Nije isto
# što i regija: Klemenčić (2021: 144) izrijekom upozorava da se označavanjem
# samo "plemenitaških" naselja "ne dobije prostorno homogeno i posve zaokruženo
# područje" — među njima ima i naselja koja nisu bila u sastavu Opčine. Zato
# ovo ide kao ZASEBAN sloj preko regije, ne kao njezina granica.
#
# Pet sučija nema današnjeg parnjaka: Mala Gorica, Kurilovec, Pleso, Rakarje i
# Kušanec danas su gradske četvrti unutar naselja Velika Gorica (vidi
# kvartovi sloj) — grad ih je apsorbirao. Pokriva ih naselje Velika Gorica,
# koje je ionako bilo sučija.
PLEMENITA_OPCINA = {
    # sučije "u Polju" (13)
    "Polje": (
        ("05410", "Buševec"),
        ("05410", "Velika Gorica"),  # + Mala Gorica, Kurilovec, Pleso, Rakarje, Kušanec
        ("01333", "Hrašće Turopoljsko"),
        ("05410", "Kobilić"),
        ("05410", "Kuče"),
        ("05410", "Donja Lomnica"),
        ("05410", "Lukavec"),  # Šenoa: "Gornji i Donji Lukavec", danas jedno naselje
        ("05410", "Velika Mlaka"),
        ("05410", "Mraclin"),
        ("05410", "Rakitovec"),
    ),
    # sučije "u Vrhovlju" (8)
    "Vrhovlje": (
        ("05410", "Bukovčak"),
        ("05410", "Cerovski Vrh"),
        ("05410", "Cvetković Brdo"),
        ("01333", "Donji Dragonožec"),  # Šenoa: "Dragonožec", danas dva naselja
        ("01333", "Gornji Dragonožec"),
        ("05410", "Dubranec"),
        ("05410", "Gustelnica"),
        ("05410", "Prvonožina"),
        ("05410", "Vukomerić"),
    ),
    # naselja Opčine uz sučije
    "Pridružena naselja": (
        ("05410", "Gornja Lomnica"),
        ("05410", "Lazi Turopoljski"),   # Šenoa: "Lazi"
        ("01333", "Lipnica"),
        ("05410", "Markuševec Turopoljski"),  # Šenoa: "Markuševec"
        ("01333", "Havidić Selo"),
        ("05410", "Petravec"),           # Šenoa: "Petravci"
        ("05410", "Jerebić"),            # Šenoa: "Jarebić"
    ),
}

# Cerovski Vrh se u popisima zna svrstati pod Lekenik, ali po DGU-u je naselje
# Grada Velike Gorice — dakle već je u jezgri, ne dodaje se posebno.

JLS_LABELS = {**{mb: name for mb, name in TUROPOLJE_JLS.items()},
              "01333": "Grad Zagreb", "02283": "Lekenik"}

# Podregija ide u properties da se dijelovi mogu razlikovati na karti.
ZONE = {
    **{mb: "Jezgra Turopolja" for mb in TUROPOLJE_JLS},
    "01333": "Zagrebački dio",
    "02283": "Lekenički dio",
}

# Geometrija se NE pojednostavljuje. simplify() reže vrhove neovisno na svakoj
# strani zajedničkog ruba, pa unija susjednih naselja dobije slivere: prvi
# pokušaj s tolerancijom 5 m dao je 20 rupa u obuhvatu regije. Uz to je bio i
# VEĆI (0.37 vs 0.23 MB) — DGU naselja su već pojednostavljena u koraku 18, pa
# se nema što dobiti. Rezanje koordinata na 6 decimala je topološki sigurno
# (isti ulazni vrh → isti izlazni) i dovoljno smanjuje file.


def round_coords(obj, nd=6):
    """Reže koordinate na ~10 cm. Na 70 cm plakatu je to 0.0000001 mm; pun
    float iz shapelya samo napuhne file koji se skida u pregledniku."""
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), nd) for c in obj]
        return [round_coords(o, nd) for o in obj]
    return obj


PO_INDEX = {key: skupina for skupina, keys in PLEMENITA_OPCINA.items() for key in keys}


def po_props(mb: str, name: str) -> dict:
    """Oznaka pripadnosti Plemenitoj opčini; prazno ako naselje nije njezino."""
    skupina = PO_INDEX.get((mb, name))
    return {"plemenita_opcina": True, "po_skupina": skupina} if skupina else {}


def clean(geom):
    """buffer(0) — popravlja self-intersectione koje DGU zna imati."""
    return geom.buffer(0)


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

    # Rubna naselja po imenu — svako se MORA naći, inače je popis promašio
    # (preimenovanje, dijakritik, homonim u drugoj JLS). Tiho preskakanje bi
    # dalo kartu s rupom koju nitko ne bi primijetio.
    missing = []
    for mb, names in TUROPOLJE_NASELJA.items():
        for name in names:
            hit = [f for f in nas["features"]
                   if f["properties"].get("jls_maticni_broj") == mb
                   and f["properties"]["name"] == name]
            if not hit:
                missing.append(f"{name} (JLS {mb})")
                continue
            sel.extend(hit)
    if missing:
        print("Nema u DGU naseljima: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)

    # Stabilan redoslijed: JLS kako je nabrojan, pa naselja abecedno.
    jls_order = list(TUROPOLJE_JLS) + list(TUROPOLJE_NASELJA)
    sel.sort(key=lambda f: (jls_order.index(f["properties"]["jls_maticni_broj"]),
                            f["properties"]["name"]))

    # Svaki unos PO popisa MORA se naći među odabranim naseljima — inače je
    # sloj tiho nepotpun (preimenovanje, dijakritik, naselje izvan regije).
    have = {(f["properties"]["jls_maticni_broj"], f["properties"]["name"]) for f in sel}
    lost = [f"{n} (JLS {mb})" for (mb, n) in PO_INDEX if (mb, n) not in have]
    if lost:
        print("Plemenita opčina — nema među naseljima regije: " + ", ".join(lost),
              file=sys.stderr)
        sys.exit(1)

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
            **po_props(p["jls_maticni_broj"], p["name"]),
            "source": p.get("source", "DGU rpj:naselje"),
            "geometry": {"type": g.geom_type, "coordinates": round_coords(mapping(g)["coordinates"])},
        })

    # Granice po JLS-u = unija UKLJUČENIH naselja tog JLS-a (isti izvor, nema
    # rasparivanja rubova kao kad bi se miješao drugi dataset). Za Zagreb i
    # Lekenik to NIJE granica JLS-a nego njegovog turopoljskog dijela —
    # `partial` to označava da se ne čita krivo.
    for mb in jls_order:
        idx = [i for i, f in enumerate(sel) if f["properties"]["jls_maticni_broj"] == mb]
        if not idx:
            continue
        u = unary_union([geoms[i] for i in idx])
        pop = sum(sel[i]["properties"].get("stanovnistvo") or 0 for i in idx)
        partial = mb in TUROPOLJE_NASELJA
        feats.append({
            "razina": "jls",
            "name": JLS_LABELS[mb],
            "jls_name": JLS_LABELS[mb],
            "jls_maticni_broj": mb,
            "zupanija": sel[idx[0]]["properties"]["zupanija"],
            "area_km2": round(sum(sel[i]["properties"].get("area_km2") or 0 for i in idx), 4),
            "stanovnistvo": pop,
            "naselja_count": len(idx),
            "partial": partial,
            "historical_zone": ZONE[mb],
            "palette_idx": 0,
            "source": "DGU rpj:naselje (unija naselja)",
            "geometry": {"type": u.geom_type, "coordinates": round_coords(mapping(u)["coordinates"])},
        })
        flag = " (dio)" if partial else ""
        print(f"  {JLS_LABELS[mb] + flag:22} {len(idx):3} naselja  "
              f"{feats[-1]['area_km2']:8.1f} km²  {pop:6} st.")

    # Vanjski obuhvat cijele regije — jedan dissolve svih naselja. Služi kao
    # najdeblji obris na plakatu i kao provjera: ako unija nije JEDAN poligon
    # ili ima rupe, popis naselja nije susjedan i karta bi imala prazninu.
    region = unary_union(geoms)
    holes = 0
    parts = [region] if region.geom_type == "Polygon" else list(region.geoms)
    for g in parts:
        holes += len(g.interiors)
    if len(parts) > 1 or holes:
        print(f"  ⚠ obuhvat nije jedinstven: {len(parts)} dijelova, {holes} rupa",
              file=sys.stderr)
    else:
        print("  ✓ obuhvat je jedan povezan poligon, bez rupa")
    feats.append({
        "razina": "regija",
        "name": "Turopolje",
        "jls_name": "Turopolje",
        "jls_maticni_broj": "*",
        "zupanija": "Zagrebačka, Grad Zagreb, Sisačko-moslavačka",
        "area_km2": round(sum(f["properties"].get("area_km2") or 0 for f in sel), 4),
        "stanovnistvo": sum(f["properties"].get("stanovnistvo") or 0 for f in sel),
        "naselja_count": len(sel),
        "parts": len(parts),
        "holes": holes,
        "palette_idx": 0,
        "historical_zone": "Turopolje",
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
    n_po = sum(1 for f in features if f["properties"].get("plemenita_opcina"))
    print(f"  Plemenita opčina: {n_po} naselja "
          f"({', '.join(f'{k} {sum(1 for x in v if x in PO_INDEX)}' for k, v in PLEMENITA_OPCINA.items())})")
    print(f"✔ {OUT} — {n_nas} naselja + {n_jls} granica + obuhvat, "
          f"{OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
