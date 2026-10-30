import json, sys, re
sys.path.insert(0, '.')
from src import places
from src.normalize import strip_diacritics as sd
S = sys.argv[1]
n = lambda s: sd((s or '').lower())
DRZ = {'HR':'Hrvatska','BE':'Belgium','GB':'United Kingdom','DE':'Germany','FR':'France','US':'USA','AT':'Austria','RS':'Serbia','SI':'Slovenia'}
BRISAN = {'44409125570': '19.11.2025.', '29598595344': '27.1.2025.', '11407307685': '24.6.2025.'}
x = json.load(open('data/croai_istrazivanje2_izlaz.json'))
cit = {r['croai_id']: r for r in json.load(open(f'{S}/provjera_citat.json'))}
pl = places.Places(); ov = json.load(open('data/croai_overrides.json')); fail = []
TIP = {'dogadjaj':'mjesto održavanja','ured':'ured','sjediste':'sjedište','institucija':'institucija','zajednica':'mjesto okupljanja','nepoznato':'lokacija'}
for o in x:
    hr = (o.get('drzava') or 'HR') == 'HR'; mj = o.get('mjesto') or ''
    zemlja = DRZ.get(o.get('drzava'), o.get('drzava') or '')
    grad = o.get('razina_lokacije') == 'grad' or not o.get('adresa')
    if o['ime'] == 'Dani komunikacija': grad = False; q = 'Hotel Lone, Rovinj'
    elif grad: q = f"{mj}, {zemlja}"
    else: q = ', '.join(p for p in (o['adresa'], f"{o.get('postanski_broj') or ''} {mj}".strip(), zemlja) if p)
    ok_city = lambda h: n(mj.split(' ')[0]) in n(h['address']) or (mj == 'Bruxelles' and 'brussel' in n(h['address']))
    g = next((h for h in pl.search(q, hr_only=hr) if ok_city(h)), None)
    if not g: fail.append((o['ime'], q)); continue
    if grad:
        adr = f"{mj}{', ' + o['drzava'] if not hr else ''}"
    elif o['ime'] == 'Dani komunikacija':
        adr = re.sub(r',\s*(Hrvatska|Croatia)$', '', g['address'])
    else:
        adr = ', '.join(p for p in (o['adresa'], f"{o.get('postanski_broj') or ''} {mj}".strip(), None if hr else o['drzava']) if p)
    if o.get('naziv_mjesta') and not grad: adr = f"{o['naziv_mjesta']}, {adr}"
    c = cit.get(o['croai_id'], {})
    izvor = f"{TIP.get(o.get('tip'), 'lokacija')}{' (razina grada)' if grad else ''}: {c.get('url') or o.get('izvor_url')} (Antigravity/Gemini, 2. krug, citat {'potvrđen' if c.get('ok') else 'ručno pregledan'}), 2026-10-30"
    e = {"_ime": o['ime']}
    oib = (o.get('oib') or '').strip()
    if o['ime'] == 'Keymon Ventures': oib = '76660797479'
    if re.fullmatch(r'\d{11}', oib): e['oib'] = oib
    if oib in BRISAN: izvor += f"; društvo brisano iz sudskog registra {BRISAN[oib]}"
    e.update(lat=round(g['lat'], 6), lng=round(g['lng'], 6), adresa_override=adr, izvor=izvor)
    ov[o['croai_id']] = e
# OIB iz Registra udruga za subjekte koji su već na karti (zadrži njihovu točku)
feats = {str(f['properties']['id']): f for f in json.load(open('data/hr_croai.geojson'))['features']}
for nm, oib in (('CVCA - Hrvatska Private equity i Venture capital Asocijacija', None), ('The geek gathering', None), ('LUMEN by eStudent', None)):
    pass
for m in json.load(open(f'{S}/udruge_match.json')):
    if m['kind'] != 'na karti bez OIB-a' or m['ime'] not in ('CVCA - Hrvatska Private equity i Venture capital Asocijacija', 'The geek gathering', 'LUMEN by eStudent') or m['croai_id'] in ov: continue
    f = feats[m['croai_id']]; lng, lat = f['geometry']['coordinates']
    ov[m['croai_id']] = {"_ime": m['ime'], "oib": m['oib'], "lat": lat, "lng": lng,
        "adresa_override": f['properties'].get('adresa') or m['sjediste'],
        "izvor": f"OIB: Registar udruga ({m['naziv'][:60]}, domena weba); točka Google Maps po imenu i webu, 2026-10-30",
        "google_maps": f['properties'].get('google_maps')}
json.dump(dict(sorted(ov.items(), key=lambda kv: int(kv[0]))), open('data/croai_overrides.json', 'w'), ensure_ascii=False, indent=2)
print('overrides', len(ov), '| Places novih', pl.calls, '| neuspjeli', fail)
