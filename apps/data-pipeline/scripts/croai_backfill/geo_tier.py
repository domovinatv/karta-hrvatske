import json, sys, re, difflib
sys.path.insert(0, '.')
from src import places
from src.normalize import strip_diacritics as sd
S = sys.argv[1]
n = lambda s: re.sub(r'\s+', ' ', sd((s or '').lower()))
DRZ = {'HR':'Hrvatska','BE':'Belgium','GB':'United Kingdom','DE':'Germany','FR':'France','US':'USA','BG':'Bulgaria','IE':'Ireland','RS':'Serbia','LT':'Lithuania','JP':'Japan','CA':'Canada','EE':'Estonia','AT':'Austria'}
x = json.load(open('data/croai_istrazivanje_izlaz.json'))
url = {r['croai_id']: r for r in json.load(open(f'{S}/provjera_url.json'))}
oib = json.load(open(f'{S}/provjera_oib.json'))
FORM = re.compile(r'\b(d\.?o\.?o\.?|j\.?d\.?o\.?o\.?|d\.?d\.?|gmbh|ltd|inc|llc|udruga|obrt)\b', re.I)
core = lambda s: re.sub(r'[^a-z0-9]', '', FORM.sub('', n(s)))
pl = places.Places(); out = []
for o in x:
    r = {'croai_id': o['croai_id'], 'ime': o['ime'], 'tip': o.get('tip'), 'drzava': o.get('drzava'), 'pouzdanost_agy': o.get('pouzdanost')}
    if not o.get('adresa'): r['razina'] = 'nema adrese'; out.append(r); continue
    hr = (o.get('drzava') or 'HR') == 'HR'
    mj = o.get('mjesto') or ''
    q = ', '.join(p for p in (o['adresa'], f"{o.get('postanski_broj') or ''} {mj}".strip(), DRZ.get(o.get('drzava'), o.get('drzava') or '')) if p)
    g = next((h for h in pl.search(q, hr_only=hr) if (mj and n(mj.split(' ')[0]) in n(h['address'])) or (o.get('postanski_broj') and o['postanski_broj'] in (h['address'] or ''))), None)
    r['adresa'] = q
    if not g: r['razina'] = 'adresa se ne geokodira'; out.append(r); continue
    r.update(lat=round(g['lat'], 6), lng=round(g['lng'], 6), g_adresa=g['address'])
    # identitet: Google po imenu blizu adrese
    names = {o['ime'], o.get('pravni_naziv') or ''} - {''}
    best = None
    for nm in names:
        for h in pl.search(f"{FORM.sub('', nm).strip(' ,.')} {mj}", hr_only=hr):
            sim = difflib.SequenceMatcher(None, core(nm), core(h['name'])).ratio()
            d = places.haversine_m(g['lat'], g['lng'], h['lat'], h['lng'])
            if sim >= 0.7 and d <= 500 and (not best or sim > best[0]): best = (sim, d, h['name'], h['maps_url'])
    u = url.get(o['croai_id'], {}).get('urls', [])
    ov = oib.get(o['croai_id'], {})
    r['na_stranici'] = any(v['adresa_na_stranici'] for v in u)
    r['sudreg_sjediste'] = ov.get('adresa_ista') is True
    r['oib_sumnjiv'] = bool(o.get('oib')) and (not ov.get('checksum', True) or (ov.get('u_sudregu') is False and re.search(r'd\.o\.o|d\.d\.', o.get('pravni_naziv') or '', re.I) is not None))
    if best: r.update(google_ime=best[2], google_m=round(best[1]), google_maps=best[3])
    r['razina'] = ('A: adresa na izvoru' if r['na_stranici'] else 'B: sudreg sjedište' if r['sudreg_sjediste']
                   else 'C: Google ime na adresi' if best else 'D: nepotvrđeno')
    out.append(r)
json.dump(out, open(f'{S}/geo_tier.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('Places novih', pl.calls, 'keš', pl.cache_hits)
print(Counter(r['razina'] for r in out))
print('oib sumnjiv', [r['ime'] for r in out if r.get('oib_sumnjiv')])
