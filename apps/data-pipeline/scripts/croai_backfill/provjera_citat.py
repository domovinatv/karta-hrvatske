import json, re, sys, html, difflib
from concurrent.futures import ThreadPoolExecutor
import httpx
sys.path.insert(0, '.')
from src.normalize import strip_diacritics as sd
H = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Accept-Language': 'hr,en'}
norm = lambda t: re.sub(r'[^a-z0-9]+', ' ', sd(html.unescape(t).lower())).strip()
def page(u):
    try:
        r = httpx.get(u, headers=H, timeout=25, follow_redirects=True)
        t = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', r.text)
        return r.status_code, norm(re.sub(r'<[^>]+>', ' ', t))
    except Exception as e: return type(e).__name__, ''
def check(o):
    urls = [u for u in (o.get('izvor_url'), o.get('drugi_izvor_url')) if u]
    c = norm(o.get('citat') or '')
    best = {'croai_id': o['croai_id'], 'ok': False, 'match': 0}
    for u in urls:
        st, t = page(u)
        if not t or not c: continue
        m = difflib.SequenceMatcher(None, t, c, autojunk=False).find_longest_match(0, len(t), 0, len(c))
        ul = norm(o.get('adresa') or '') ; key = [w for w in ul.split() if len(w) >= 4 and not w.isdigit()][:2]
        street_ok = all(w in t for w in key) if key else norm(o.get('mjesto') or '') in t
        ok = m.size >= min(40, int(len(c) * 0.6)) and street_ok
        if m.size > best['match']: best.update(url=u, status=st, match=m.size, citat_len=len(c), street_ok=street_ok, ok=ok)
        if ok: break
    return best
x = json.load(open('data/croai_istrazivanje2_izlaz.json'))
with ThreadPoolExecutor(8) as ex: res = list(ex.map(check, x))
json.dump(res, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
by = {o['croai_id']: o for o in x}
print('citat potvrđen', sum(r['ok'] for r in res), '/', len(res))
for r in res:
    if not r['ok']:
        o = by[r['croai_id']]; print(f"  ✗ {o['ime'][:26]:<26} {o.get('razina_lokacije'):<6} {str(r.get('status')):<5} match {r['match']}/{r.get('citat_len','?')} ulica {r.get('street_ok')} | {(o.get('izvor_url') or '')[:60]}")
