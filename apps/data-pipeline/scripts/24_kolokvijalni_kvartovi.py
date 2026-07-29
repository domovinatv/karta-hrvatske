#!/usr/bin/env python3
"""
Step 24 — Kolokvijalni kvartovi (Zagreb) + VG četvrti kao kvartovi.

Kolokvijalni zagrebački kvartovi (Jarun, Knežija, Špansko…) NEMAJU službene
granice ni u jednom javnom izvoru. Gradimo ih derivacijom:

  1. Sjeme: OSM place=quarter čvorovi (117 imena, kanonski popis kolokvijalnih
     kvartova) → point-in-polygon u mjesne odbore (data.zagreb.hr, 218 kom).
  2. Name-match: neposijani MO čije ime odgovara imenu kvarta.
  3. Region growing: preostali MO se pripajaju susjednom kvartu s najdužom
     zajedničkom granicom (iterativno dok svi nisu dodijeljeni).
  4. Dissolve po kvartu → poligon kvarta.

Mapping (kvart → [MO matični brojevi]) se piše u
  data/kvartovi_kolokvijalni_mapping.json
i commita u git kao RUČNO DOTJERLJIV kuracijski artefakt. Ako datoteka
postoji, skripta je koristi verbatim (auto-algoritam se preskače) — ručne
korekcije preživljavaju svaki rebuild. Za regeneraciju drafta obriši datoteku.

Velika Gorica: gradske četvrti tamo JESU kvartovi — kopiraju se iz
data/hr_kvartovi.geojson (razina=cetvrt) u kvart razinu.

Output: data/hr_kvartovi_kolokvijalni.geojson (razina="kvart", properties
kompatibilni s kvartovi slojem: name, jls_name, jls_maticni_broj, area_km2,
color, source + mo_count).

Ovisi o: data/raw_kvartovi/ (skida 23_fetch_kvartovi.py) i
data/hr_kvartovi.geojson (output koraka 23). Pokreni 23 prije 24.
"""
from __future__ import annotations

import io
import json
import sys
import unicodedata
import zipfile
from pathlib import Path

try:
    import httpx
    import shapefile  # pyshp
    from pyproj import Transformer
    from shapely.geometry import Point, mapping, shape
    from shapely.ops import transform as shp_transform, unary_union
except ImportError as e:
    print(f"Missing dependency ({e}). pip install pyshp pyproj shapely httpx", file=sys.stderr)
    sys.exit(1)

OUT_DIR = Path("data")
RAW_DIR = OUT_DIR / "raw_kvartovi"
MAPPING_FILE = OUT_DIR / "kvartovi_kolokvijalni_mapping.json"
KVARTOVI_23 = OUT_DIR / "hr_kvartovi.geojson"
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = {"User-Agent": "domovina.ai-gis (info@domovina.ai)"}

# Zagreb OSM area id = 3600000000 + relation 3168167 (admin_level=8).
ZG_QUARTERS_QUERY = """
[out:json][timeout:60];
area(3603168167)->.zg;
node["place"="quarter"](area.zg);
out;
"""

ZG_JLS = {"jls_name": "Grad Zagreb", "jls_maticni_broj": "01333", "zupanija": "Grad Zagreb"}
SIMPLIFY_M = 5.0

# Park prirode Medvednica — OSM way (closed polygon). Planinski dijelovi
# sjevernih kvartova (Markuševec drži i vrh Sljemena!) izrezuju se ovom
# granicom u zaseban kvart "Sljeme" — kolokvijalno planina nije ničiji kvart.
MEDVEDNICA_OSM_WAY = 435626488
SLJEME_MIN_CARVE_KM2 = 0.3      # manji presjek se ne reže (rubni sliver)
SLJEME_MIN_REMAINDER_KM2 = 0.2  # ako od kvarta ostane manje, cijeli ide u Sljeme

TX_3765_TO_4326 = Transformer.from_crs("EPSG:3765", "EPSG:4326", always_xy=True)
TX_4326_TO_3765 = Transformer.from_crs("EPSG:4326", "EPSG:3765", always_xy=True)


def color_for(idx: int) -> str:
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


def norm(s: str) -> str:
    """Za name-matching: lowercase, bez dijakritika, bez navodnika/crtica."""
    s = s.strip().strip('"').lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    for ch in ("-", "–", ".", '"'):
        s = s.replace(ch, " ")
    return " ".join(s.split())


def load_mo_polygons() -> list[dict]:
    """MO iz raw shapefile-a, geometrija u EPSG:3765 (metri — treba za adjacency)."""
    zp = RAW_DIR / "rpj_mo.zip"
    if not zp.exists():
        print("Nema data/raw_kvartovi/rpj_mo.zip — pokreni prvo 23_fetch_kvartovi.py", file=sys.stderr)
        sys.exit(1)
    zf = zipfile.ZipFile(zp)
    names = {Path(n).suffix.lower(): n for n in zf.namelist() if not n.endswith("/")}
    reader = shapefile.Reader(
        shp=io.BytesIO(zf.read(names[".shp"])),
        dbf=io.BytesIO(zf.read(names[".dbf"])),
        shx=io.BytesIO(zf.read(names[".shx"])),
        encoding="cp1250",
    )
    out = []
    for sr in reader.iterShapeRecords():
        rec = sr.record.as_dict()
        out.append({
            "mb": str(rec["JMS_MB"]).strip().zfill(5),
            "name": str(rec["JMS_IME"]).strip().strip('"').strip(),
            "gc": str(rec["MBR_NADR"]).strip().zfill(5),
            "geom": shape(sr.shape.__geo_interface__).buffer(0),
        })
    return out


def fetch_quarter_nodes() -> list[dict]:
    cache = RAW_DIR / "zg_quarter_nodes.json"
    if cache.exists():
        payload = json.loads(cache.read_text())
    else:
        payload = None
        last_err: Exception | None = None
        for attempt in range(4):
            ep = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
            print(f"  ↓ Overpass: ZG place=quarter ({ep.split('/')[2]})")
            try:
                r = httpx.post(ep, data={"data": ZG_QUARTERS_QUERY}, headers=UA, timeout=120.0)
                r.raise_for_status()
                payload = r.json()
                break
            except Exception as e:  # 504/timeout — probaj mirror
                last_err = e
                import time
                time.sleep(5 * (attempt + 1))
        if payload is None:
            raise RuntimeError(f"Overpass nedostupan: {last_err}")
        cache.write_text(json.dumps(payload, ensure_ascii=False))
    nodes = []
    for el in payload["elements"]:
        if el["type"] != "node" or not el.get("tags", {}).get("name"):
            continue
        x, y = TX_4326_TO_3765.transform(el["lon"], el["lat"])
        nodes.append({"name": el["tags"]["name"], "pt": Point(x, y)})
    return nodes


def build_auto_mapping(mos: list[dict], quarters: list[dict]) -> dict[str, list[str]]:
    """kvart_name -> [mo_mb…]; svaki MO završi u točno jednom kvartu.

    Redoslijed signala (najjači prvi):
      1. exact name-match (MO "Jarun" ↔ kvart "Jarun")
      2. PIP (quarter čvor unutar MO)
      3. partial name-match ("Špansko - jug" → "Špansko")
      4. region growing ≤2 runde, SAMO unutar iste gradske četvrti — sprječava
         da rural chain adjacency (Sesvete, Brezovica) proguta pola grada
      5. ostatak = singleton kvart s imenom samog MO-a (ruralna sela nemaju
         kolokvijalni kvart — ostaju pod svojim imenom)
    """
    assign: dict[str, str] = {}  # mo_mb -> kvart_name
    by_mb = {mo["mb"]: mo for mo in mos}
    norm_to_kvart = {norm(q["name"]): q["name"] for q in quarters}

    # Dozvoljeni "višak" tokena pri name-matchu — samo smjer/veličina/redni
    # sufiksi ("Špansko - jug", "Dubrava - središte", "Donja Kustošija").
    # NE dozvoljava "Sesvetski Kraljevec"→"Kraljevec" (drugo mjesto!).
    ALLOWED_EXTRA = {
        "jug", "juzni", "juzna", "sjever", "sjeverni", "sjeverna", "istok",
        "zapad", "centar", "sredisce", "donja", "donji", "gornja", "gornji",
        "mala", "mali", "velika", "veliki", "nova", "novi", "stara", "stari",
        "i", "ii", "iii", "1", "2", "3",
    }

    def variant_match(mo_norm: str, kvart_norm: str) -> bool:
        """MO ime = kvart ime + eventualni smjer/redni tokeni."""
        mo_t, k_t = mo_norm.split(), kvart_norm.split()
        if not k_t:
            return False
        for start in range(len(mo_t) - len(k_t) + 1):
            if mo_t[start:start + len(k_t)] == k_t:
                rest = mo_t[:start] + mo_t[start + len(k_t):]
                if all(t in ALLOWED_EXTRA for t in rest):
                    return True
        return False

    def kvart_gc(kvart: str) -> str | None:
        """GČ u kojoj kvart već ima dodijeljene MO (većinska)."""
        gcs = [by_mb[mb]["gc"] for mb, k in assign.items() if k == kvart]
        return max(set(gcs), key=gcs.count) if gcs else None

    # 1) PIP — geografska istina. Konflikt (više čvorova u istom MO):
    #    prednost čvoru čije ime odgovara imenu MO-a.
    pip_hits: dict[str, list[str]] = {}
    for q in quarters:
        for mo in mos:
            if mo["geom"].contains(q["pt"]):
                pip_hits.setdefault(mo["mb"], []).append(q["name"])
                break
    for mb, names in pip_hits.items():
        exact = [n for n in names if norm(n) == norm(by_mb[mb]["name"])]
        assign[mb] = (exact or names)[0]

    # 2) Exact name-match — uz GČ konzistentnost ako kvart već ima sjeme.
    for mo in mos:
        if mo["mb"] in assign:
            continue
        kvart = norm_to_kvart.get(norm(mo["name"]))
        if kvart:
            gc = kvart_gc(kvart)
            if gc is None or gc == mo["gc"]:
                assign[mo["mb"]] = kvart

    # 3) Varijantni match ("Špansko - jug" → "Špansko") — ista GČ obavezna
    #    ako kvart već postoji negdje.
    for mo in mos:
        if mo["mb"] in assign:
            continue
        n = norm(mo["name"])
        for qn_norm, qn in norm_to_kvart.items():
            if variant_match(n, qn_norm):
                gc = kvart_gc(qn)
                if gc is None or gc == mo["gc"]:
                    assign[mo["mb"]] = qn
                    break

    # 4) Region growing — max 2 runde, unutar iste GČ.
    seed_gc = {}  # kvart -> GČ u kojoj je nastao (većinska)
    for mb, kvart in assign.items():
        seed_gc.setdefault(kvart, by_mb[mb]["gc"])
    for _ in range(2):
        progressed = []
        for mb, mo in by_mb.items():
            if mb in assign:
                continue
            best, best_len = None, 0.0
            for omb, kvart in assign.items():
                if by_mb[omb]["gc"] != mo["gc"]:
                    continue
                shared = mo["geom"].boundary.intersection(by_mb[omb]["geom"].boundary).length
                if shared > best_len:
                    best, best_len = kvart, shared
            if best and best_len > 1.0:
                progressed.append((mb, best))
        for mb, kvart in progressed:
            assign[mb] = kvart
        if not progressed:
            break

    # 5) Singleton fallback — MO postaje vlastiti kvart.
    for mb, mo in by_mb.items():
        if mb not in assign:
            assign[mb] = mo["name"]

    mapping_out: dict[str, list[str]] = {}
    for mb, kvart in assign.items():
        mapping_out.setdefault(kvart, []).append(mb)
    return {k: sorted(v) for k, v in sorted(mapping_out.items())}


def fetch_medvednica_polygon():
    """Poligon PP Medvednica u EPSG:3765 (za carve u metrima)."""
    from shapely.geometry import Polygon
    cache = RAW_DIR / "medvednica_park.json"
    if cache.exists():
        payload = json.loads(cache.read_text())
    else:
        query = f"[out:json][timeout:60];way({MEDVEDNICA_OSM_WAY});out geom;"
        payload = None
        last_err: Exception | None = None
        for attempt in range(4):
            ep = OVERPASS_ENDPOINTS[attempt % len(OVERPASS_ENDPOINTS)]
            print(f"  ↓ Overpass: PP Medvednica ({ep.split('/')[2]})")
            try:
                r = httpx.post(ep, data={"data": query}, headers=UA, timeout=120.0)
                r.raise_for_status()
                payload = r.json()
                break
            except Exception as e:
                last_err = e
                import time
                time.sleep(5 * (attempt + 1))
        if payload is None:
            raise RuntimeError(f"Overpass nedostupan: {last_err}")
        cache.write_text(json.dumps(payload, ensure_ascii=False))
    way = next(e for e in payload["elements"] if e["type"] == "way")
    ring = [(p["lon"], p["lat"]) for p in way["geometry"]]
    poly = Polygon(ring).buffer(0)
    return shp_transform(TX_4326_TO_3765.transform, poly)


def carve_sljeme(kvart_geoms: dict[str, object]) -> dict[str, object]:
    """Izreži planinski dio (unutar PP Medvednica) iz ZG kvartova → "Sljeme".

    kvart_geoms: name -> geom u EPSG:3765; vraća ažurirani dict.
    """
    park = fetch_medvednica_polygon()
    sljeme_parts = []
    absorbed, trimmed = [], []
    for name in list(kvart_geoms):
        geom = kvart_geoms[name]
        inter = geom.intersection(park)
        if inter.area / 1e6 < SLJEME_MIN_CARVE_KM2:
            continue
        remainder = geom.difference(park)
        if remainder.area / 1e6 < SLJEME_MIN_REMAINDER_KM2:
            sljeme_parts.append(geom)
            del kvart_geoms[name]
            absorbed.append(name)
        else:
            sljeme_parts.append(inter)
            kvart_geoms[name] = remainder
            trimmed.append(name)
    if sljeme_parts:
        kvart_geoms["Sljeme"] = unary_union(sljeme_parts).buffer(0)
        print(f"  Sljeme: {kvart_geoms['Sljeme'].area / 1e6:.1f} km² "
              f"(izrezano iz {len(trimmed)} kvartova: {trimmed[:6]}…"
              f"{'; apsorbirano: ' + str(absorbed) if absorbed else ''})")
    return kvart_geoms


def geom_to_feature_dict(geom_3765, name: str, idx: int, extra: dict) -> dict:
    geom = geom_3765.buffer(0).simplify(SIMPLIFY_M, preserve_topology=True)
    area_km2 = round(geom.area / 1e6, 2)
    geom = shp_transform(TX_3765_TO_4326.transform, geom)
    rounded = json.loads(json.dumps(mapping(geom)), parse_float=lambda v: round(float(v), 6))
    return {
        "razina": "kvart", "name": name, "color": color_for(idx),
        "area_km2": area_km2, "geometry": rounded, **extra,
    }


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("▸ MO poligoni + OSM quarter čvorovi")
    mos = load_mo_polygons()
    quarters = fetch_quarter_nodes()
    print(f"  MO: {len(mos)}  quarter čvorova: {len(quarters)}")

    if MAPPING_FILE.exists():
        print(f"▸ Mapping postoji ({MAPPING_FILE}) — koristim ručno kuriranu verziju")
        kvart_map: dict[str, list[str]] = json.loads(MAPPING_FILE.read_text())
    else:
        print("▸ Gradim auto-mapping (PIP → name-match → region growing)")
        kvart_map = build_auto_mapping(mos, quarters)
        MAPPING_FILE.write_text(
            json.dumps(kvart_map, ensure_ascii=False, indent=1, sort_keys=True)
        )
        print(f"  draft zapisan u {MAPPING_FILE} — ručno dotjerati pa commitati")

    # Sanity: svaki MO točno jednom.
    all_mb = [mb for mbs in kvart_map.values() for mb in mbs]
    assert len(all_mb) == len(set(all_mb)), "MO dodijeljen u više kvartova"
    known = {mo["mb"] for mo in mos}
    unknown = [mb for mb in all_mb if mb not in known]
    assert not unknown, f"Nepoznati MO u mappingu: {unknown[:5]}"
    missing = known - set(all_mb)
    if missing:
        print(f"  ⚠ {len(missing)} MO nije ni u jednom kvartu: {sorted(missing)[:5]}…", file=sys.stderr)

    print(f"▸ Dissolve {len(mos)} MO → {len(kvart_map)} kvartova")
    by_mb = {mo["mb"]: mo for mo in mos}
    kvart_geoms: dict[str, object] = {}
    mo_counts: dict[str, int] = {}
    for kvart, mbs in kvart_map.items():
        kvart_geoms[kvart] = unary_union([by_mb[mb]["geom"] for mb in mbs if mb in by_mb])
        mo_counts[kvart] = len(mbs)

    print("▸ Carve: Sljeme (PP Medvednica)")
    kvart_geoms = carve_sljeme(kvart_geoms)
    mo_counts["Sljeme"] = 0

    feats = []
    for i, (kvart, geom) in enumerate(kvart_geoms.items()):
        source = (
            "derivirano: MO (data.zagreb.hr) + granica PP Medvednica (OSM)"
            if kvart == "Sljeme"
            else "derivirano: MO (data.zagreb.hr) + OSM imena"
        )
        feats.append(geom_to_feature_dict(
            geom, kvart, i,
            {"mo_count": mo_counts.get(kvart, 0), "source": source, **ZG_JLS},
        ))

    # VG: četvrti su kvartovi — kopiraj iz outputa koraka 23.
    if KVARTOVI_23.exists():
        k23 = json.loads(KVARTOVI_23.read_text())
        vg = [f for f in k23["features"]
              if f["properties"]["razina"] == "cetvrt"
              and f["properties"]["jls_name"] == "Velika Gorica"]
        for j, f in enumerate(vg):
            p = f["properties"]
            feats.append({
                "razina": "kvart", "name": p["name"], "color": color_for(len(feats)),
                "area_km2": p["area_km2"], "geometry": f["geometry"], "mo_count": 0,
                "source": p["source"], "jls_name": p["jls_name"],
                "jls_maticni_broj": p["jls_maticni_broj"], "zupanija": p["zupanija"],
            })
        print(f"  + {len(vg)} VG četvrti kao kvartovi")

    # Greedy graph coloring po JLS-u: palette_idx (0-3+) takav da susjedni
    # kvartovi nikad ne dijele boju — temelj za poster palete ("anatomija
    # grada" stil: 4 boje, susjedi uvijek različiti).
    from shapely.geometry import shape as shp_shape
    for jls_mb in {f["jls_maticni_broj"] for f in feats}:
        group = [f for f in feats if f["jls_maticni_broj"] == jls_mb]
        geoms = [shp_shape(f["geometry"]).buffer(0) for f in group]
        n = len(group)
        adj: list[set[int]] = [set() for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                if geoms[i].intersects(geoms[j]) and not geoms[i].touches(geoms[j]):
                    # overlap (ne bi smjelo) — tretiraj kao susjede
                    adj[i].add(j); adj[j].add(i)
                elif geoms[i].touches(geoms[j]):
                    adj[i].add(j); adj[j].add(i)
        order = sorted(range(n), key=lambda k: -len(adj[k]))
        colors: dict[int, int] = {}
        for k in order:
            used = {colors[m] for m in adj[k] if m in colors}
            c = 0
            while c in used:
                c += 1
            colors[k] = c
        for k, f in enumerate(group):
            f["palette_idx"] = colors[k]
        n_colors = max(colors.values()) + 1 if colors else 0
        print(f"  coloring {jls_mb}: {n} kvartova, {n_colors} boja")

    feats.sort(key=lambda f: (f["jls_maticni_broj"], f["name"]))
    features = []
    for fid, row in enumerate(feats, start=1):
        geometry = row.pop("geometry")
        features.append({
            "type": "Feature", "id": fid, "geometry": geometry,
            "properties": {"id": fid, **row},
        })

    out = OUT_DIR / "hr_kvartovi_kolokvijalni.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False))
    print(f"✔ {out} — {len(features)} kvartova, {out.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
