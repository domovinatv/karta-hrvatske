# CroAI backfill — jednokratne skripte (30.10.2026.)

Skripte kojima su nerazriješeni subjekti CroAI imenika dovedeni s 301 na 565
točaka. Ne pokreću se iz pipelinea: njihov trajni rezultat je
`data/croai_overrides.json`, koji `scripts/34_fetch_croai.py` čita pri svakom
buildu. Ovdje su da se postupak može ponoviti kad imenik naraste.

Pokreću se iz `apps/data-pipeline/` s `.venv/bin/python -W ignore`. Prvi
argument je radni direktorij za međurezultate (scratch), ne repo.

| Redom | Skripta | Što radi |
|---|---|---|
| 1 | `kandidati.py` | Google Places kandidati po imenu iz keša → `data/croai_kandidati.csv` |
| 2 | `izvuci.py` | tragovi iz keširanih webova (Maps embed, JSON-LD, HR adresa) |
| 3 | `sudreg_match.py` | domena e-maila u sudregu = web iz imenika; jedinstveno ime |
| 4 | `sudreg_geo.py` | geokod sudreg sjedišta → overrides |
| 5 | `udruge_match.py` | Registar udruga i zaklada (data.gov.hr) po domeni |
| 6 | `provjera_oib.py` | agy OIB-i: kontrolna znamenka, sudreg, naziv, sjedište |
| 7 | `provjera_url.py` | stoji li agy adresa na `izvor_url` |
| 8 | `geo_tier.py` | geokod + razine A/B/C/D (1. krug agy) |
| 9 | `provjera_citat.py` | doslovni citat na `izvor_url` (2. krug agy) |
| 10 | `krug2_upis.py` | upis 2. kruga u overrides |

Sudreg tablice: `data/raw/sudreg/*.jsonl`, registri udruga i zaklada:
`data/raw/datagovhr/*.csv` (oboje gitignorirano; kako se povlače piše u
`docs/2026-10-29-croai-sloj.md`). Opis postupka, mjerenja i zamki:
`docs/2026-10-29-croai-sloj.md`.
