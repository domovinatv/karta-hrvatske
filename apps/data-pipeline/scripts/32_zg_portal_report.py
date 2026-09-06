#!/usr/bin/env python3
"""
Step 32 — Izvještaj o stanju portala otvorenih podataka Grada Zagreba.

    https://data.zagreb.hr/

Ne dohvaća sadržaj za kartu — mjeri **sam portal**: koliko su skupovi svježi,
je li deklarirani format ono što se stvarno posluži, koji resursi ne odgovaraju
i koji su skupovi duplikati.

## Duplikati se mjere dvama signalima, i oni ne znače isto

**Isti ArcGIS izvor.** Ispod većine `geoportal-*` skupova stoji ArcGIS Hub, a URL
resursa nosi `datasets/<id>/downloads/data`. Dva CKAN skupa s istim `<id>` su
ista tablica objavljena dvaput — provjerljiva tvrdnja, ne procjena sličnosti.

**Isti naslov.** Slabiji signal: `Geoportal Autobusna stajališta ZET` i
`Geoportal autobusna stajalista ZET` su dva skupa koja se razlikuju samo u
velikom slovu, ali NISU ista tablica — jedan je stara kopija s Huba (2024-02,
1888 zapisa), drugi novi resurs na samom CKAN-u (2026-08). Zato se prijavljuju
odvojeno: prvi je za brisanje, drugi za odabir.

## Što se smatra „mrtvim linkom"

Samo ono što se ne može pročitati: HTTP greška, prazan odgovor, ili sadržaj koji
ne odgovara deklariranom formatu (JSON koji počinje `PK\\x03\\x04` je ZIP, ne
GeoJSON). Skupovi bez ijednog strojno čitljivog resursa broje se zasebno — nisu
pokvareni, samo su PDF.

Čita se prvih nekoliko kilobajta i veza se prekida; cilj je provjeriti potpis,
ne preuzeti 40 MB geodatabaza.

Output:
  outputs/zg_portal_izvjestaj.json  — strojno čitljiv nalaz po skupu
  outputs/zg_portal_izvjestaj.md    — sažetak za čitanje
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    import httpx
except ImportError as e:
    print(f"Missing dependency ({e}). pip install httpx", file=sys.stderr)
    sys.exit(1)

CKAN = "https://data.zagreb.hr/api/3/action"
UA = {"User-Agent": "domovina.ai-gis (info@domovina.ai)"}
OUT_DIR = Path("outputs")
OUT_JSON = OUT_DIR / "zg_portal_izvjestaj.json"
OUT_MD = OUT_DIR / "zg_portal_izvjestaj.md"

STROJNO_CITLJIVI = ("GEOJSON", "CSV", "JSON", "XLSX", "XLS", "SHP", "KML", "GML", "XML")
PROVJERAVA_SE = ("GEOJSON", "CSV", "JSON")
POTPISI = {b"PK\x03\x04": "ZIP", b"%PDF": "PDF", b"\xd0\xcf\x11\xe0": "OLE (stari Office)"}


def naslov_kljuc(s: str) -> str:
    """Naslov sveden na usporedivi oblik: bez dijakritike, bez prefiksa
    „Geoportal", bez interpunkcije. `Geoportal Autobusna stajališta ZET` i
    `Geoportal autobusna stajalista ZET` daju isti ključ."""
    s = s.translate(str.maketrans({"đ": "d", "Đ": "D"}))
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    s = " ".join(s.split())
    return s[len("geoportal "):] if s.startswith("geoportal ") else s


def hub_id(url: str) -> str | None:
    parts = urllib.parse.urlparse(url).path.strip("/").split("/")
    if "datasets" in parts:
        i = parts.index("datasets")
        if i + 1 < len(parts):
            return parts[i + 1]
    return None


def probe(client: httpx.Client, url: str, fmt: str, pokusaja: int = 3) -> tuple[str, str]:
    """Vrati (status, detalj). Čita najviše 8 KB pa prekida vezu.

    Ponavlja se jer `opendata.arcgis.com` povremeno vrati HTTP 500 na skup koji
    minutu kasnije radi. U dva uzastopna pokretanja 500 je pao na dva različita
    skupa — prijaviti ga bez ponavljanja značilo bi optužiti nasumičan skup.
    Ovdje se prijavljuje tek ono što padne u svim pokušajima."""
    glava = b""
    zadnji = ""
    for pokusaj in range(pokusaja):
        if pokusaj:
            time.sleep(1.5 * pokusaj)
        try:
            with client.stream("GET", url, timeout=45.0, follow_redirects=True) as r:
                if r.status_code >= 400:
                    zadnji = f"HTTP {r.status_code}"
                    continue
                glava = b""
                for chunk in r.iter_bytes(4096):
                    glava += chunk
                    if len(glava) >= 8192:
                        break
            break
        except Exception as e:  # noqa: BLE001
            zadnji = type(e).__name__
    else:
        return "greška", f"{zadnji} (u {pokusaja} pokušaja)"

    if not glava:
        return "greška", "prazan odgovor"
    for potpis, ime in POTPISI.items():
        if glava.startswith(potpis):
            return ("neslaganje", f"deklarirano {fmt}, posluženo {ime}")
    if fmt in ("GEOJSON", "JSON"):
        tekst = glava.lstrip()[:1]
        if tekst not in (b"{", b"["):
            return "neslaganje", f"deklarirano {fmt}, sadržaj ne počinje kao JSON"
    return "ok", ""


def main() -> int:
    OUT_DIR.mkdir(exist_ok=True)
    danas = datetime.now(timezone.utc)

    with httpx.Client(headers=UA) as client:
        skupovi: list[dict] = []
        start = 0
        while True:
            r = client.get(f"{CKAN}/package_search", params={"rows": 100, "start": start}, timeout=90.0)
            r.raise_for_status()
            res = r.json()["result"]
            skupovi.extend(res["results"])
            start += 100
            if start >= res["count"]:
                break
        print(f"Katalog: {len(skupovi)} skupova\n")

        nalazi: list[dict] = []
        po_hubu: dict[str, list[str]] = defaultdict(list)
        for i, d in enumerate(skupovi, 1):
            name = d["name"]
            formati = sorted({(r.get("format") or "").upper() for r in d.get("resources", [])} - {""})
            mod = (d.get("metadata_modified") or "")[:10]
            starost = None
            if mod:
                try:
                    starost = (danas - datetime.fromisoformat(mod).replace(tzinfo=timezone.utc)).days
                except ValueError:
                    pass

            for r in d.get("resources", []):
                h = hub_id(r.get("url") or "")
                if h:
                    if name not in po_hubu[h]:
                        po_hubu[h].append(name)
                    break

            problemi: list[dict] = []
            for r in d.get("resources", []):
                fmt = (r.get("format") or "").upper()
                if fmt not in PROVJERAVA_SE or not r.get("url"):
                    continue
                status, detalj = probe(client, r["url"], fmt)
                if status != "ok":
                    problemi.append({"format": fmt, "status": status, "detalj": detalj, "url": r["url"]})

            nalazi.append({
                "name": name,
                "naslov": d.get("title"),
                "licenca": d.get("license_title") or None,
                "azurirano": mod,
                "starost_dana": starost,
                "formati": formati,
                "strojno_citljiv": bool(set(formati) & set(STROJNO_CITLJIVI)),
                "problemi": problemi,
            })
            if problemi:
                print(f"  ! {name}: " + "; ".join(f"{p['format']} → {p['detalj']}" for p in problemi))
            if i % 25 == 0:
                print(f"    …{i}/{len(skupovi)}")

    duplikati = {h: ns for h, ns in po_hubu.items() if len(ns) > 1}

    # Drugi signal: isti naslov pod dva imena. Ne dokazuje da je sadržaj
    # identičan (ZET stajališta pod dva imena imaju različit broj zapisa i
    # različit izvor), ali pokazuje gdje korisnik mora birati a nema po čemu.
    po_naslovu: dict[str, list[str]] = defaultdict(list)
    for n in nalazi:
        kljuc = naslov_kljuc(n["naslov"] or n["name"])
        po_naslovu[kljuc].append(n["name"])
    isti_naslov = {k: v for k, v in po_naslovu.items() if len(v) > 1}

    bez_licence = [n["name"] for n in nalazi if not n["licenca"]]
    bez_strojnog = [n["name"] for n in nalazi if not n["strojno_citljiv"]]
    s_problemom = [n for n in nalazi if n["problemi"]]

    kosevi = Counter()
    for n in nalazi:
        d = n["starost_dana"]
        if d is None:
            kosevi["nepoznato"] += 1
        elif d <= 90:
            kosevi["do 3 mjeseca"] += 1
        elif d <= 365:
            kosevi["3–12 mjeseci"] += 1
        elif d <= 730:
            kosevi["1–2 godine"] += 1
        else:
            kosevi["preko 2 godine"] += 1

    formati = Counter()
    for d in skupovi:
        for r in d.get("resources", []):
            formati[(r.get("format") or "?").upper()] += 1

    izvjestaj = {
        "portal": "https://data.zagreb.hr/",
        "snimljeno": danas.date().isoformat(),
        "skupova": len(nalazi),
        "svjezina": dict(kosevi),
        "formati_resursa": dict(formati.most_common()),
        "bez_licence": bez_licence,
        "bez_strojno_citljivog_resursa": bez_strojnog,
        "duplikati_isti_arcgis_izvor": duplikati,
        "isti_naslov_pod_vise_imena": isti_naslov,
        "resursi_s_problemom": s_problemom,
        "skupovi": nalazi,
    }
    OUT_JSON.write_text(json.dumps(izvjestaj, ensure_ascii=False, indent=1))

    red = []
    red.append(f"# Stanje portala data.zagreb.hr — {danas.date().isoformat()}\n")
    red.append(f"Automatski nalaz, `scripts/32_zg_portal_report.py`. **{len(nalazi)} skupova.**\n")
    red.append("## Svježina\n")
    red.append("| Zadnja izmjena | Skupova |\n|---|---:|")
    for k in ("do 3 mjeseca", "3–12 mjeseci", "1–2 godine", "preko 2 godine", "nepoznato"):
        if kosevi.get(k):
            red.append(f"| {k} | {kosevi[k]} |")
    red.append("\n## Formati resursa\n")
    red.append("| Format | Resursa |\n|---|---:|")
    for f, c in formati.most_common():
        red.append(f"| {f} | {c} |")
    red.append(f"\n## Nalazi\n")
    red.append(f"- **Bez licence:** {len(bez_licence)}" + (f" — {', '.join(bez_licence)}" if bez_licence else ""))
    red.append(f"- **Bez ijednog strojno čitljivog resursa:** {len(bez_strojnog)}"
               + (f" — {', '.join(bez_strojnog)}" if bez_strojnog else ""))
    red.append(f"- **Skupova s neispravnim ili krivo deklariranim resursom:** {len(s_problemom)}")
    for n in s_problemom:
        for p in n["problemi"]:
            red.append(f"  - `{n['name']}` — {p['detalj']}")
    red.append(f"- **Isti ArcGIS izvor objavljen pod više imena:** {len(duplikati)}")
    for h, ns in sorted(duplikati.items(), key=lambda kv: kv[1][0]):
        red.append(f"  - {' = '.join(f'`{n}`' for n in ns)}")
    red.append(f"- **Isti naslov pod više imena** (korisnik bira, a nema po čemu): {len(isti_naslov)}")
    for k, ns in sorted(isti_naslov.items()):
        opis = ", ".join(
            f"`{n}` ({next(x['azurirano'] for x in nalazi if x['name'] == n)})" for n in ns)
        red.append(f"  - {k} — {opis}")
    OUT_MD.write_text("\n".join(red) + "\n")

    print(f"\n  → {OUT_JSON}")
    print(f"  → {OUT_MD}")
    print(f"\n  svježina: " + ", ".join(f"{k}: {v}" for k, v in kosevi.items()))
    print(f"  bez licence: {len(bez_licence)} | bez strojno čitljivog: {len(bez_strojnog)}")
    print(f"  resursa s problemom: {len(s_problemom)} | isti ArcGIS izvor: {len(duplikati)}"
          f" | isti naslov: {len(isti_naslov)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
