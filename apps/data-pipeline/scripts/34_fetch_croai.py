#!/usr/bin/env python3
"""
Step 34 — Croatian AI Landscape (map.croai.org) kao sloj karte.

CroAI drži imenik hrvatskog AI ekosustava u Airtableu i servira ga kroz
`POST /api/fetchEntities` kao stablo: kategorija → potkategorija → subjekt.
Subjekt ima ime, web, opis i godinu osnutka. **Adrese nema**, pa ni
koordinata — imenik je logo-mreža, ne karta.

## Ovo NIJE popis članova udruge

CroAI to sam kaže u pozivu za 5. izdanje (29.10.2026.): „sâm unos u imenik
je odvojen od formalnog članstva u udruzi". Na mapi su i A1, Addiko,
24sata i konferencije; privatni članovi i dio tvrtki-članica nisu. Sloj se
zato zove po imeniku, a ne „članovi CroAI-ja".

## Kako subjekt dobije točku

Identitet je OIB, kao u koraku 33. Redom:

  1. `data/croai_overrides.json` — ručni OIB, ručne koordinate ili
     `"izvan_hr": true` za strane subjekte (Bloomberg, njemački forum).
  2. **OIB s vlastitog weba.** Zakon o elektroničkoj trgovini traži OIB u
     impresumu, pa ga većina hrvatskih tvrtki ima na naslovnici, u podnožju
     ili na /kontakt. Skripta čita naslovnicu i do pet podstranica čiji link
     zvuči kao impresum/kontakt/o nama. Broj vrijedi samo uz kontrolnu
     znamenku i ako postoji u info.BIZ indeksu.
  3. **Slug imena u info.BIZ indeksu**, samo kad je pogodak jedinstven.
     „Addiko Bank d.d." ima tri profila — takav se ne pogađa.

Zamka kod (2): podnožje često nosi OIB agencije koja je radila web
(„Izrada: X d.o.o., OIB …"). Kad stranica ima više OIB-a, pobjeđuje onaj
čiji info.BIZ slug liči na ime ili domenu subjekta, pa tek onda onaj uz
oznaku „OIB".

Adresa, naziv i status dolaze iz info.BIZ-a, geokodiranje je isto kao u
koraku 33 (DGU adresa → težište naselja).

Output: `data/hr_croai.geojson` + `data/croai_report.json` (što nije
razriješeno i zašto — ulaz za ručne overridee).
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import infobiz
from src.normalize import strip_diacritics

sys.path.insert(0, str(Path(__file__).resolve().parent))
_m29 = __import__("29_fetch_ppi")
_m33 = __import__("33_fetch_ppi_privatni")
oib_ok = _m29.oib_ok
load_naselja_index = _m29.load_naselja_index
locate = _m33.locate

ROOT = Path(__file__).resolve().parent.parent
API = "https://map.croai.org/api/fetchEntities"
API_BODY = {"tableId": "tblCgVtW6pcjIja5q", "baseId": "app2Fy0c82KqBtG0N"}
RAW = ROOT / "data" / "raw" / "croai"
WEB_CACHE = RAW / "web"
OVERRIDES = ROOT / "data" / "croai_overrides.json"
OUT = ROOT / "data" / "hr_croai.geojson"
REPORT = ROOT / "data" / "croai_report.json"

# Tri vrha stabla, skraćeni za legendu. Ključ je naslov iz Airtablea.
GRUPE = {
    "Startups & Companies": ("tvrtke", "AI tvrtke i startupi"),
    "Enablers & Extended Ecosystem": ("ekosustav", "Ekosustav"),
    "Early Adopters": ("korisnici", "Rani korisnici AI-ja"),
}

SUBPAGE = re.compile(
    r"impres+um|imprint|kontakt|contact|o-nama|onama|about|legal|pravn|uvjeti|terms|privacy|privatnost",
    re.I,
)
OIB_LABELED = re.compile(r"(?:OIB|VAT|PDV|ID\s*broj|Tax\s*ID)[^0-9]{0,25}(?:HR)?\s*(\d{11})\b", re.I)
AGENCY = re.compile(
    r"izrad|developed|design|dizajn|powered|made by|created by|web by|razvoj web|hosting", re.I
)
OIB_ANY = re.compile(r"(?<![\d.,/-])(?:HR)?(\d{11})(?![\d.,/-])")
LEGAL = re.compile(
    r"\b(d\s*\.?\s*o\s*\.?\s*o|j\s*\.?\s*d\s*\.?\s*o\s*\.?\s*o|d\s*\.?\s*d|ltd|llc|gmbh|inc|obrt|"
    r"ustanova|udruga|zadruga)\b\.?",
    re.I,
)


def slugify(s: str) -> str:
    s = strip_diacritics(s.lower()).replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def core(s: str) -> str:
    """Ime bez pravnog oblika, za usporedbu sa slugom info.BIZ-a."""
    return slugify(LEGAL.sub(" ", strip_diacritics(s)))


def host_of(url: str) -> str:
    h = urlparse(url if "//" in url else "https://" + url).hostname or ""
    return h.removeprefix("www.")


# ---------------------------------------------------------------- imenik


def fetch_tree() -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    snap = RAW / f"entities-{date.today().isoformat()}.json"
    if snap.exists():
        return json.loads(snap.read_text())
    r = httpx.post(API, json=API_BODY, timeout=60, headers={
        "User-Agent": infobiz.UA, "Origin": "https://map.croai.org",
        "Referer": "https://map.croai.org/",
    })
    r.raise_for_status()
    snap.write_text(r.text)
    return r.json()


def flatten(tree: dict) -> list[dict]:
    """Listovi stabla s putanjom kategorija. Isti subjekt može biti u dvije
    potkategorije; spaja se po CroAI id-u."""
    out: dict[str, dict] = {}

    def walk(n, path):
        if "children" in n:
            for c in n["children"]:
                walk(c, path + [n["title"].strip()])
            return
        top = path[1] if len(path) > 1 else None
        sub = path[2] if len(path) > 2 else None
        e = out.setdefault(n["id"], {
            "croai_id": n["id"],
            "name": n["name"].strip(),
            "website": (n.get("domain") or "").strip() or None,
            "about": (n.get("about") or "").strip() or None,
            "year": int(n["yearFounded"]) if str(n.get("yearFounded") or "").isdigit() else None,
            "grupa_src": top,
            "kategorije": [],
        })
        if sub and sub not in e["kategorije"]:
            e["kategorije"].append(sub)

    walk(tree, [])
    return list(out.values())


# ---------------------------------------------------------------- web → OIB


def _get(client: httpx.Client, url: str, cache: Path) -> str | None:
    if cache.exists():
        t = cache.read_text(encoding="utf8", errors="replace")
        return t or None
    try:
        r = client.get(url)
        txt = r.text if r.status_code == 200 and "html" in r.headers.get("content-type", "") else ""
    except Exception:  # noqa: BLE001 — tuđi web: loš TLS, čudni URL-ovi, kodiranje
        txt = ""
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(txt, encoding="utf8")
    return txt or None


def _text(page: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S | re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;|&#160;", " ", s)
    return re.sub(r"\s+", " ", s)


def scan_site(url: str) -> dict[str, int]:
    """OIB → težina. Označen („OIB: …") broji 3, goli broj 1."""
    host = host_of(url)
    if not host:
        return {}
    base = url if "//" in url else "https://" + url
    found: Counter = Counter()
    with httpx.Client(headers={"User-Agent": infobiz.UA}, timeout=20,
                      follow_redirects=True, verify=False) as c:
        home = _get(c, base, WEB_CACHE / host / "0.html")
        if not home:
            return {}
        pages = [home]
        links = []
        for href in re.findall(r'href=["\']([^"\'#]+)', home, re.I):
            u = urljoin(base, href)
            if "@" not in u and host_of(u) == host and SUBPAGE.search(urlparse(u).path) and u not in links:
                links.append(u)
        for i, u in enumerate(links[:5], 1):
            p = _get(c, u, WEB_CACHE / host / f"{i}.html")
            if p:
                pages.append(p)
    for p in pages:
        t = _text(p)
        for m in OIB_LABELED.finditer(t):
            o = m.group(1)
            # „Izrada weba: Agencija d.o.o., OIB …" — tuđi OIB u podnožju.
            if oib_ok(o) and not AGENCY.search(t[max(0, m.start() - 160):m.start()]):
                found[o] += 3
        for o in OIB_ANY.findall(t):
            if oib_ok(o):
                found[o] += 1
    return dict(found)


def slug_similar(entity: dict, url: str) -> bool:
    slug = url.rstrip("/").split("/")[-2]
    want = {core(entity["name"])}
    if entity["website"]:
        want.add(slugify(host_of(entity["website"]).split(".")[0]))
    return any(w and len(w) >= 3 and (w in slug or slug.startswith(w)) for w in want)


def pick_oib(entity: dict, cands: dict[str, int], urls: dict[str, str]) -> tuple[str | None, str]:
    known = {o: w for o, w in cands.items() if o in urls}
    if not known:
        return None, "web: nema OIB-a" if not cands else "web: OIB nije u info.BIZ-u"
    similar = [o for o in known if slug_similar(entity, urls[o])]
    if len(similar) == 1:
        return similar[0], "web+ime"
    if len(known) == 1:
        o = next(iter(known))
        # Jedan označen OIB na vlastitom webu uzima se i kad se ime ne
        # poklapa (brend ≠ tvrtka: „Gideon" → „Gideon Brothers d.o.o.", ali
        # i „Photomath" → „Photomath d.o.o." nakon Googlea). Goli broj ne.
        if known[o] < 3:
            return None, "web: samo neoznačen broj"
        return o, "web"
    best = sorted(similar or known, key=lambda o: -known[o])
    return None, f"web: više OIB-a ({', '.join(best[:3])})"


def name_index(path: Path) -> dict[str, list[tuple[str, str]]]:
    """core(slug) → [(oib, url)]. Samo /tvrtka/ i /neprofitni/ profili."""
    out: dict[str, list[tuple[str, str]]] = defaultdict(list)
    with path.open(encoding="utf8") as fh:
        for line in fh:
            oib, _, url = line.rstrip("\n").partition("\t")
            parts = url.rstrip("/").split("/")
            if len(parts) < 3 or parts[-3] not in ("tvrtka", "neprofitni"):
                continue
            out[core(parts[-2].replace("-", " "))].append((oib, url))
    return out


# ---------------------------------------------------------------- Nominatim


_last_nominatim = [0.0]


def nominatim(adr: dict) -> tuple[float, float] | None:
    """Rezerva kad DGU ne nađe adresu (ili je WFS u ispadu) — inače sve što
    padne na težište naselja leži u jednoj točki usred Zagreba. Strukturirani
    upit, samo HR, 1 req/s po pravilima OSMF-a, keš po adresi."""
    key = f"{adr['ulica']} {adr['broj']}, {adr['pbr']} {adr['mjesto']}"
    cache = RAW / "nominatim" / (re.sub(r"[^\w]+", "_", strip_diacritics(key)).strip("_")[:120] + ".json")
    if cache.exists():
        res = json.loads(cache.read_text())
    else:
        wait = 1.1 - (time.time() - _last_nominatim[0])
        if wait > 0:
            time.sleep(wait)
        _last_nominatim[0] = time.time()
        try:
            r = httpx.get("https://nominatim.openstreetmap.org/search", params={
                "street": f"{adr['broj']} {adr['ulica']}", "city": adr["mjesto"],
                "postalcode": adr["pbr"], "countrycodes": "hr", "format": "jsonv2", "limit": 1,
            }, headers={"User-Agent": "domovina-ai-gis/0.1 (stepanic.matija@gmail.com)"}, timeout=30)
            r.raise_for_status()
            res = r.json()
        except (httpx.HTTPError, ValueError):
            return None
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(res, ensure_ascii=False))
    # Samo pogodak na razini kuće/zgrade; ulica ili mjesto nisu bolji od
    # težišta naselja koje već imamo.
    if res and res[0].get("addresstype") in {"building", "house", "place", "amenity", "office"} \
            or res and res[0].get("category") in {"building", "office", "amenity"}:
        return float(res[0]["lat"]), float(res[0]["lon"])
    return None


# ---------------------------------------------------------------- main


def main() -> int:
    print("Step 34 — Croatian AI Landscape (map.croai.org)")
    entities = flatten(fetch_tree())
    print(f"  imenik: {len(entities)} subjekata")
    overrides = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}

    if not infobiz.INDEX.exists():
        print(f"  ! {infobiz.index_missing_msg()}")
        return 1

    t0 = time.time()
    todo = [e for e in entities if e["website"] and e["croai_id"] not in overrides]
    with ThreadPoolExecutor(8) as ex:
        scans = dict(zip((e["croai_id"] for e in todo), ex.map(lambda e: scan_site(e["website"]), todo)))
    print(f"  web: {len(todo)} stranica pročitano ({time.time() - t0:.0f} s, keš u {WEB_CACHE.relative_to(ROOT)})")

    all_oibs = {o for s in scans.values() for o in s} | {
        v["oib"] for v in overrides.values() if v.get("oib")
    }
    urls = infobiz.load_index(all_oibs)
    by_name = name_index(infobiz.INDEX.resolve())

    resolved: dict[str, tuple[str, str]] = {}
    report, stats = [], Counter()
    for e in entities:
        cid = e["croai_id"]
        ov = overrides.get(cid, {})
        if ov.get("izvan_hr"):
            stats["izvan HR (ručno)"] += 1
            continue
        if ov.get("oib") or ov.get("lat") is not None:
            resolved[cid] = (ov.get("oib"), "ručno")
            continue
        oib, why = pick_oib(e, scans.get(cid, {}), urls)
        if not oib:
            key = core(e["name"])
            hits = by_name.get(key, [])
            # Kratko ime na stranoj domeni je loterija: „Atos" (atos.net) je
            # jedinstven u info.BIZ-u — kao lovačko društvo u Netretiću.
            short_foreign = len(key.replace("-", "")) < 6 and not host_of(e["website"] or "").endswith(".hr")
            if len(hits) == 1 and short_foreign:
                why += f"; ime: kratko i strana domena ({hits[0][1].split('/')[-2]})"
            elif len(hits) == 1:
                oib, why = hits[0][0], "ime u info.BIZ-u"
                urls[oib] = hits[0][1]
            elif len(hits) > 1:
                why += f"; ime: {len(hits)} profila"
        if oib:
            resolved[cid] = (oib, why)
        else:
            stats["bez OIB-a"] += 1
            report.append({"croai_id": cid, "name": e["name"], "website": e["website"],
                           "grupa": e["grupa_src"], "kategorije": e["kategorije"], "razlog": why})

    missing = {o for o, _ in resolved.values() if o and o not in urls}
    urls.update(infobiz.load_index(missing))

    idx = load_naselja_index()
    features = []
    by_id = {e["croai_id"]: e for e in entities}
    for cid, (oib, oib_src) in resolved.items():
        e, ov = by_id[cid], overrides.get(cid, {})
        d = {"naziv": None, "adresa": None, "status": None, "aktivan": None,
             "velicina": None, "pravni_oblik": None, "nkd": None, "zaposleni": None}
        if oib and urls.get(oib):
            page = infobiz.fetch_profile(oib, urls[oib])
            if page:
                d = infobiz.parse(page)
        adr = ov.get("adresa_override") or d["adresa"]
        parsed = infobiz.parse_adresa(adr)
        lat, lng, geo_source = locate(idx, ov, parsed)
        if geo_source == "naselje" and parsed["ulica"]:
            hit = nominatim(parsed)
            if hit:
                lat, lng, geo_source = *hit, "nominatim"
        if lat is None:
            stats["OIB bez lokacije"] += 1
            report.append({"croai_id": cid, "name": e["name"], "website": e["website"],
                           "oib": oib, "adresa": adr, "razlog": "nema geokoda"})
            continue
        stats[f"OIB: {oib_src}"] += 1
        key, label = GRUPE.get(e["grupa_src"], ("ostalo", e["grupa_src"] or "?"))
        features.append({
            "type": "Feature",
            "id": int(cid),
            "geometry": {"type": "Point", "coordinates": [round(lng, 6), round(lat, 6)]},
            "properties": {
                "id": int(cid),
                "name": e["name"],
                "grupa": key,
                "grupa_naziv": label,
                "kategorije": ", ".join(e["kategorije"]) or None,
                "about": e["about"],
                "website": e["website"],
                "year": e["year"],
                "oib": oib,
                "oib_izvor": oib_src,
                "naziv": d["naziv"],
                "adresa": adr,
                "mjesto": parsed["mjesto"],
                "fina_status": d["status"],
                "fina_aktivan": d["aktivan"],
                "fina_velicina": d["velicina"],
                "fina_zaposleni": d["zaposleni"],
                "fina_url": urls.get(oib) if oib else None,
                "geo_source": geo_source,
            },
        })

    features.sort(key=lambda f: f["id"])
    OUT.write_text(json.dumps({
        "type": "FeatureCollection",
        "name": "hr_croai",
        "metadata": {
            "izvor": "map.croai.org (Croatian AI Landscape) + FINA info.BIZ (naziv, adresa, status)",
            "napomena": "Imenik AI ekosustava, NE popis članova udruge CroAI.",
            "provjereno": date.today().isoformat(),
            "u_imeniku": len(entities),
            "na_karti": len(features),
        },
        "features": features,
    }, ensure_ascii=False, indent=1))
    REPORT.write_text(json.dumps(sorted(report, key=lambda r: r["name"].lower()),
                                 ensure_ascii=False, indent=1))

    print(f"\n  → {OUT.name}: {len(features)}/{len(entities)} na karti")
    for k, v in stats.most_common():
        print(f"    {v:4d}  {k}")
    print(f"  → {REPORT.name}: {len(report)} nerazriješenih (ulaz za {OVERRIDES.name})")
    print("  po grupi:", dict(Counter(f["properties"]["grupa"] for f in features)))
    print("  po mjestu:", Counter(f["properties"]["mjesto"] for f in features).most_common(8))
    return 0


if __name__ == "__main__":
    sys.exit(main())
