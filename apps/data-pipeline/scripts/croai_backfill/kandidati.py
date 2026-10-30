"""Popis kandidata za 155 nerazriješenih CroAI subjekata, iz Places keša."""
import csv, json, re, sys, difflib, importlib.util
from pathlib import Path
sys.path.insert(0, '.')
from src import places
spec = importlib.util.spec_from_file_location("s34", "scripts/34_fetch_croai.py")
s34 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s34)

rep = json.load(open('data/croai_report.json'))['nerazrijeseno']
pl = places.Places()
DOGADAJ = re.compile(r'hackathon|conference|konferencij|forum|summit|weekend|sajam|dani |festival|meetup|days|battleground|week', re.I)
INSTIT = re.compile(r'@|fakultet|faculty|institut|centre|center|centar|lab\b|sveučili|university|ruđer|zavod', re.I)

rows = []
for e in rep:
    name, web = e['name'], e.get('website')
    if e['razlog'] == 'nema geokoda':
        vrsta = 'adresa izvan HR / bez geokoda'
    elif DOGADAJ.search(name):
        vrsta = 'događaj'
    elif INSTIT.search(name):
        vrsta = 'institucija / lab'
    elif web and not s34.host_of(web).endswith('.hr') and False:
        vrsta = ''
    else:
        vrsta = 'firma / udruga'
    best, sim = None, 0.0
    for r in (pl.search(name) if web else []):
        sc = difflib.SequenceMatcher(None, s34.core(name), s34.core(r['name'])).ratio()
        if sc > sim:
            best, sim = r, sc
    rows.append({
        'croai_id': e['croai_id'], 'ime': name, 'vrsta': vrsta, 'razlog': e['razlog'],
        'croai_web': web or '', 'oib': e.get('oib') or '',
        'google_ime': best['name'] if best else '', 'slicnost': round(sim, 2),
        'google_web': (best or {}).get('website') or '', 'google_adresa': best['address'] if best else '',
        'lat': best['lat'] if best else '', 'lng': best['lng'] if best else '',
        'maps': best['maps_url'] if best else '',
    })
rows.sort(key=lambda r: (r['vrsta'], -r['slicnost']))
out = Path('data/croai_kandidati.csv')
with out.open('w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
print('novih Places poziva:', pl.calls if hasattr(pl, 'calls') else '?', '| keš:', pl.cache_hits)
from collections import Counter
print(Counter(r['vrsta'] for r in rows))
jak = [r for r in rows if r['slicnost'] >= 0.8]
print('Google pogodak sa sličnim imenom (≥0.8):', len(jak))
for r in jak: print(f"  {r['ime']:<38} → {r['google_ime'][:38]:<38} {r['google_adresa'][:45]} | web {r['google_web'][:30]}")
