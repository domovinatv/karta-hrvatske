import json, re, sys, html
from concurrent.futures import ThreadPoolExecutor
import httpx
sys.path.insert(0, '.')
from src.normalize import strip_diacritics as sd
x = json.load(open('data/croai_istrazivanje_izlaz.json'))
H = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Accept-Language': 'hr,en'}
def norm(t): return re.sub(r'\s+', ' ', sd(html.unescape(re.sub(r'<[^>]+>', ' ', t)).lower()))
def get(u):
    try:
        r = httpx.get(u, headers=H, timeout=20, follow_redirects=True); return r.status_code, norm(r.text)
    except Exception as e: return type(e).__name__, ''
def check(o):
    out = {'croai_id': o['croai_id']}
    if not o.get('adresa'): return out
    urls = [u for u in (o.get('izvor_url'), o.get('drugi_izvor_url')) if u]
    adr = sd(o['adresa'].lower())
    words = [w for w in re.findall(r'[a-z]{4,}', adr) if w not in ('ulica','cesta','avenija','street','road','floor','trg','obala','house')]
    nums = re.findall(r'\d+', adr)[:1]
    out['urls'] = []
    for u in urls:
        st, t = get(u)
        w_ok = bool(words) and all(w in t for w in words[:2])
        n_ok = not nums or re.search(r'\b' + nums[0] + r'\b', t) is not None
        oib_ok = bool(o.get('oib')) and o['oib'] in t
        out['urls'].append({'url': u, 'status': st, 'adresa_na_stranici': w_ok and n_ok, 'ulica': w_ok, 'oib_na_stranici': oib_ok, 'len': len(t)})
    return out
with ThreadPoolExecutor(8) as ex: res = list(ex.map(check, x))
json.dump(res, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
from collections import Counter
s = Counter()
for r in res:
    if 'urls' not in r: s['bez adrese'] += 1; continue
    a = any(u['adresa_na_stranici'] for u in r['urls']); ul = any(u['ulica'] for u in r['urls'])
    dead = all(u['status'] != 200 or u['len'] < 500 for u in r['urls'])
    s['adresa potvrđena' if a else 'samo ulica' if ul else 'stranica nedostupna/JS' if dead else 'adrese NEMA na stranici'] += 1
print(s)
