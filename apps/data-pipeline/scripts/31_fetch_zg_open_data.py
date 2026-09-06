#!/usr/bin/env python3
"""
Step 31 — Gradski sadržaji Zagreba iz portala otvorenih podataka.

    https://data.zagreb.hr/  (CKAN, 199 skupova, „Otvorena dozvola")

Za razliku od koraka 23, koji je hardkodirao dva URL-a shapefileova, ovdje se
skupovi vode **manifestom** (`data/zg_open_data_manifest.json`) i razrješavaju
kroz CKAN `package_show` u vrijeme dohvata. Razlog je praktičan: ArcGIS Hub pod
portalom mijenja potpise datoteka, pa URL prepisan iz kataloga zastari.

## Tri stvari koje portal radi, a naivni klijent ne preživi

1. **Format u katalogu zna biti kriv.** `geoportal-djecji-vrtici` ima resurs
   deklariran kao GEOJSON čiji URL glasi `...&format=fgdb` — to je File
   Geodatabase u ZIP-u, i `json.loads` na njemu pukne na prvom bajtu. Skripta
   zato ne vjeruje polju `format` nego iz URL-a izvuče ArcGIS Hub `datasetId` i
   sama zatraži `format=geojson`. Isti postupak spašava i skupove koji vrate
   HTTP 500 na jednom pokušaju (`geoportal-vatrogasci`).

2. **Shema atributa je po skupu drukčija.** Naziv objekta zove se `naziv`,
   `NAZIV`, `Naziv`, `Naziv_stajališta`, `lokacija`, `Lokacija`, `Vrsta_objekta`
   ili `tip_zdenca`, ovisno o tome tko je skup radio. Pogađa se po listi
   kandidata; gdje pogađanje ne valja, manifest ima eksplicitno polje.

3. **Isti sadržaj postoji pod dva `name`-a.** ZET stajališta, HŽ stajališta i
   područni odsjeci vode se i kao `geoportal-*` (zadnja izmjena 2024-02) i pod
   novim imenom (2026-08). Manifest namjerno bira noviji.

## Gradska četvrt

Dio skupova nosi četvrt u atributima (pod šest različitih imena polja), dio ne
nosi ništa. Umjesto da se vjeruje jednima a drugi ostanu prazni, četvrt se
UVIJEK računa prostorno iz `data/hr_kvartovi.geojson` (RPJ, korak 23), a
vrijednost iz izvora se zadržava zasebno pod `gc_izvor` — neslaganja su
mjerljiva i ispisuju se na kraju. Isto tako se računa mjesni odbor, koji nijedan
izvorni skup nema pouzdano.

Točka izvan granica Grada Zagreba je greška u izvoru, ne u spoju; broji se i
prijavljuje, a značajka ostaje s praznom četvrti.

Output:
  data/zg_gradski_sadrzaji.geojson   — sve točke, normalizirane
  data/zg_cetvrti_pokazatelji.json   — broj po kategoriji × gradska četvrt
  data/zg_provenance.json            — što je dohvaćeno, odakle, kada, koliko
"""
from __future__ import annotations

import json
import sys
import unicodedata
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path

try:
    import httpx
    from shapely.geometry import Point, shape
    from shapely.strtree import STRtree
except ImportError as e:
    print(f"Missing dependency ({e}). pip install httpx shapely", file=sys.stderr)
    sys.exit(1)

CKAN = "https://data.zagreb.hr/api/3/action"
HUB = "https://opendata.arcgis.com/api/v3/datasets/{did}/downloads/data"
UA = {"User-Agent": "domovina.ai-gis (info@domovina.ai)"}

DATA = Path("data")
MANIFEST = DATA / "zg_open_data_manifest.json"
KVARTOVI = DATA / "hr_kvartovi.geojson"
OUT_FC = DATA / "zg_gradski_sadrzaji.geojson"
OUT_AGG = DATA / "zg_cetvrti_pokazatelji.json"
OUT_PROV = DATA / "zg_provenance.json"

# Redoslijed je bitan: prvi pogodak pobjeđuje. `lokacija` je iza `naziv` jer je
# u pola skupova adresa, a ne ime.
NAZIV_KANDIDATI = ("naziv", "NAZIV", "Naziv", "NAZIV_PUNI", "Naziv_stajališta", "ime", "IME")
ADRESA_KANDIDATI = ("adresa", "ADRESA", "Adresa", "ADRESA_LOK", "lokacija", "Lokacija", "adrese")
GC_KANDIDATI = ("GRAD_CETVRT", "Gradska_cetvrt", "GRADSKA_CETVRT", "gradska_cetvrt",
                "grad_cetvrt", "grad_cetvr", "grad_cetv", "naziv_gc", "IME_GC", "GC", "JMS_IME_1")


def norm(s: str) -> str:
    """Za usporedbu imena četvrti iz izvora s onima iz RPJ-a.

    Skupovi pišu isto ime na tri načina: „Maksimir", „Gradska četvrt Maksimir"
    i „GRADSKA ČETVRT MAKSIMIR". Prefiks se skida da usporedba mjeri stvarno
    neslaganje, a ne stil pisanja."""
    s = s.translate(str.maketrans({"đ": "d", "Đ": "D"}))
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = " ".join(s.lower().replace("-", " ").replace('"', "").split())
    for prefiks in ("gradska cetvrt ", "gc ", "mjesni odbor ", "mo "):
        if s.startswith(prefiks):
            s = s[len(prefiks):]
    return s


def hub_dataset_id(url: str) -> str | None:
    """`.../api/v3/datasets/<id>/downloads/data?...` → `<id>`."""
    parts = urllib.parse.urlparse(url).path.strip("/").split("/")
    if "datasets" in parts:
        i = parts.index("datasets")
        if i + 1 < len(parts):
            return parts[i + 1]
    return None


def fetch_geojson(client: httpx.Client, resources: list[dict]) -> tuple[dict, str]:
    """Vrati (FeatureCollection, url). Redom: deklarirani GeoJSON resursi, pa
    ArcGIS Hub s eksplicitnim `format=geojson`. Podiže iznimku ako sve padne."""
    kandidati: list[str] = []
    for r in resources:
        if (r.get("format") or "").upper() == "GEOJSON" and r.get("url"):
            kandidati.append(r["url"])
    for r in resources:
        did = hub_dataset_id(r.get("url") or "")
        if did:
            heal = f"{HUB.format(did=did)}?format=geojson&spatialRefId=4326&where=1%3D1"
            if heal not in kandidati:
                kandidati.append(heal)
            break

    zadnja: Exception | None = None
    for url in kandidati:
        try:
            resp = client.get(url, timeout=120.0, follow_redirects=True)
            resp.raise_for_status()
            fc = json.loads(resp.content.decode("utf-8"))
            if fc.get("type") == "FeatureCollection":
                return fc, url
            zadnja = ValueError(f"nije FeatureCollection nego {fc.get('type')!r}")
        except Exception as e:  # noqa: BLE001 — svaka greška je „probaj sljedeći"
            zadnja = e
    raise RuntimeError(f"nijedan resurs nije dao GeoJSON ({zadnja})")


def pick(props: dict, explicit: str | None, kandidati: tuple[str, ...]) -> str | None:
    keys = (explicit,) if explicit else kandidati
    for k in keys:
        if k and props.get(k) not in (None, "", " "):
            return str(props[k]).strip()
    return None


def load_kvartovi() -> tuple[STRtree, list[dict], STRtree, list[dict]]:
    if not KVARTOVI.exists():
        print(f"  ! {KVARTOVI} ne postoji — pokreni scripts/23_fetch_kvartovi.py", file=sys.stderr)
        sys.exit(1)
    fc = json.loads(KVARTOVI.read_text())
    zg = [f for f in fc["features"] if f["properties"].get("jls_maticni_broj") == "01333"]
    cet = [f for f in zg if f["properties"]["razina"] == "cetvrt"]
    mo = [f for f in zg if f["properties"]["razina"] == "mjesni_odbor"]
    return (STRtree([shape(f["geometry"]) for f in cet]), cet,
            STRtree([shape(f["geometry"]) for f in mo]), mo)


def locate(tree: STRtree, feats: list[dict], pt: Point) -> str | None:
    for i in tree.query(pt):
        if shape(feats[i]["geometry"]).contains(pt):
            return feats[i]["properties"]["name"]
    return None


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    skupine: dict[str, str] = manifest["skupine"]
    skupovi: list[dict] = manifest["skupovi"]

    print(f"Manifest: {len(skupovi)} skupova u {len(skupine)} skupina\n")
    cet_tree, cet, mo_tree, mo = load_kvartovi()
    print(f"Geometrija: {len(cet)} gradskih četvrti, {len(mo)} mjesnih odbora\n")

    features: list[dict] = []
    provenance: list[dict] = []
    izvan = Counter()
    neslaganje = Counter()
    fid = 0

    with httpx.Client(headers=UA) as client:
        for spec in skupovi:
            name = spec["dataset"]
            try:
                pkg = client.get(f"{CKAN}/package_show", params={"id": name}, timeout=60.0)
                pkg.raise_for_status()
                meta = pkg.json()["result"]
            except Exception as e:  # noqa: BLE001
                print(f"  ! {name}: package_show pao ({e})")
                provenance.append({"dataset": name, "status": "greška", "poruka": str(e)})
                continue

            try:
                fc, url = fetch_geojson(client, meta.get("resources", []))
            except Exception as e:  # noqa: BLE001
                print(f"  ! {name}: {e}")
                provenance.append({"dataset": name, "status": "greška", "poruka": str(e)})
                continue

            src = fc.get("features") or []
            kat, label, skup = spec["kategorija"], spec["label"], spec["skupina"]
            uzeto = 0
            for f in src:
                g = f.get("geometry") or {}
                if g.get("type") != "Point":
                    continue
                lon, lat = g["coordinates"][0], g["coordinates"][1]
                p = Point(lon, lat)
                props = f.get("properties") or {}

                cetvrt = locate(cet_tree, cet, p)
                if cetvrt is None:
                    izvan[kat] += 1
                gc_izvor = pick(props, spec.get("gc"), GC_KANDIDATI)
                if cetvrt and gc_izvor and norm(gc_izvor) != norm(cetvrt):
                    neslaganje[kat] += 1

                detalji = {}
                for out_key, in_key in (spec.get("detalji") or {}).items():
                    v = props.get(in_key)
                    if v not in (None, "", " ", 0):
                        detalji[out_key] = v

                fid += 1
                features.append({
                    "type": "Feature",
                    "id": fid,
                    "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
                    "properties": {
                        "id": fid,
                        "kategorija": kat,
                        "label": label,
                        "skupina": skup,
                        "naziv": pick(props, spec.get("naziv"), NAZIV_KANDIDATI) or label,
                        "adresa": pick(props, spec.get("adresa"), ADRESA_KANDIDATI),
                        "gradska_cetvrt": cetvrt,
                        "mjesni_odbor": locate(mo_tree, mo, p),
                        "gc_izvor": gc_izvor,
                        "detalji": detalji or None,
                        "dataset": name,
                    },
                })
                uzeto += 1

            azurirano = (meta.get("metadata_modified") or "")[:10]
            licenca = meta.get("license_title") or "?"
            provenance.append({
                "dataset": name,
                "naslov": meta.get("title"),
                "kategorija": kat,
                "skupina": skup,
                "status": "ok",
                "zapisa_u_izvoru": len(src),
                "zapisa_uzeto": uzeto,
                "url_resursa": url,
                "url_skupa": f"https://data.zagreb.hr/dataset/{name}",
                "licenca": licenca,
                "azurirano": azurirano,
            })
            zastavica = "" if licenca.startswith("Otvorena") else f"  ⚠ licenca: {licenca}"
            print(f"  {uzeto:5d}  {label:<32} {name:<42} {azurirano}{zastavica}")

    if not features:
        print("\n  ! ništa dohvaćeno — prekid", file=sys.stderr)
        return 1

    # Pokazatelji po četvrti: brojevi koje nijedan pojedinačni skup ne daje.
    agg: dict[str, Counter] = defaultdict(Counter)
    for f in features:
        c = f["properties"]["gradska_cetvrt"]
        if c:
            agg[c][f["properties"]["kategorija"]] += 1
    labels = {s["kategorija"]: s["label"] for s in skupovi}
    OUT_AGG.write_text(json.dumps({
        "_": "Broj objekata po gradskoj četvrti i kategoriji. Izvor: data.zagreb.hr.",
        "labels": labels,
        "skupine": skupine,
        "cetvrti": {c: dict(sorted(v.items())) for c, v in sorted(agg.items())},
    }, ensure_ascii=False, indent=1))

    OUT_FC.write_text(json.dumps({
        "type": "FeatureCollection",
        "name": "zg_gradski_sadrzaji",
        "metadata": {
            "izvor": "data.zagreb.hr — portal otvorenih podataka Grada Zagreba",
            "licenca": "Otvorena dozvola (OD)",
            "skupova": sum(1 for p in provenance if p["status"] == "ok"),
            "objekata": len(features),
            "skupine": skupine,
            "labels": labels,
        },
        "features": features,
    }, ensure_ascii=False, indent=1))

    OUT_PROV.write_text(json.dumps({
        "portal": "https://data.zagreb.hr/",
        "skupovi": provenance,
    }, ensure_ascii=False, indent=1))

    ok = sum(1 for p in provenance if p["status"] == "ok")
    print(f"\n  → {OUT_FC} ({len(features)} objekata iz {ok}/{len(skupovi)} skupova, "
          f"{OUT_FC.stat().st_size // 1024} KB)")
    print(f"  → {OUT_AGG} ({len(agg)} gradskih četvrti)")
    print(f"  → {OUT_PROV}")

    if izvan:
        print(f"\n  ! izvan granica Grada Zagreba: {sum(izvan.values())} točaka")
        for k, v in izvan.most_common(8):
            print(f"      {v:4d}  {k}")
    if neslaganje:
        print(f"\n  ! četvrt u izvoru ≠ prostorno izračunata: {sum(neslaganje.values())} točaka")
        for k, v in neslaganje.most_common(8):
            print(f"      {v:4d}  {k}")
    pao = [p for p in provenance if p["status"] != "ok"]
    if pao:
        print(f"\n  ! nedohvaćeno: {', '.join(p['dataset'] for p in pao)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
