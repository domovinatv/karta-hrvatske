import csv, json, sys, importlib.util, re
from collections import defaultdict
csv.field_size_limit(10**9)
sys.path.insert(0, '.')
spec = importlib.util.spec_from_file_location("s34", "scripts/34_fetch_croai.py"); s34 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s34)
def host(u):
    try: return s34.host_of(u)
    except ValueError: return ''
GENERIC = {'gmail.com','yahoo.com','hotmail.com','outlook.com','net.hr','t-com.hr','inet.hr','icloud.com','live.com','gmx.net','xnet.hr','optinet.hr','facebook.com','instagram.com'}
idx = defaultdict(list)
for f, oibk in (('udruge', 'OIB'), ('zaklade', 'OIB_ZAKLADE')):
    for r in csv.DictReader(open(f'data/raw/datagovhr/{f}.csv', encoding='utf-8-sig')):
        doms = set()
        w = host(r.get('WEB_STRANICA') or '')
        if w: doms.add(w)
        for m in re.findall(r'@([\w.-]+)', (r.get('MAIL') or '').lower()):
            if m not in GENERIC: doms.add(m)
        for d in doms: idx[d].append({'reg': f, 'oib': r.get(oibk), 'naziv': r['NAZIV'], 'status': r.get('STATUS'), 'sjediste': r.get('SJEDISTE')})
print('domena u registrima', len(idx))
rep = {e['croai_id']: e for e in json.load(open('data/croai_report.json'))['nerazrijeseno']}
feats = json.load(open('data/hr_croai.geojson'))['features']
tests = [(e['croai_id'], e['name'], e.get('website'), 'nerazriješen') for e in rep.values()] + \
        [(str(f['properties']['id']), f['properties']['name'], f['properties']['website'], 'na karti bez OIB-a') for f in feats if not f['properties'].get('oib')]
out = []
for cid, name, web, kind in tests:
    h = host(web or '')
    hits = idx.get(h) or (idx.get(h.split('.', 1)[1]) if h.count('.') > 1 else None)
    if hits:
        x = hits[0]; out.append({'croai_id': cid, 'ime': name, 'kind': kind, **x, 'n': len(hits)})
        print(f"{kind:18} {name[:26]:<26} → [{x['reg'][:3]}] {x['naziv'][:45]:<45} | {x['status']} | {(x['sjediste'] or '')[:60]}" + (f"  (+{len(hits)-1})" if len(hits) > 1 else ''))
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
