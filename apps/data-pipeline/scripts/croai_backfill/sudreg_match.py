"""Spoji nerazriješene CroAI subjekte sa sudregom: domena e-maila == web, ili jedinstveno ime."""
import json, re, sys, importlib.util
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, '.')
spec = importlib.util.spec_from_file_location("s34", "scripts/34_fetch_croai.py")
s34 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s34)
D = Path('data/raw/sudreg')
L = lambda t: (json.loads(l) for l in open(D / f'{t}.jsonl'))
sub = {r['mbs']: r for r in L('subjekti')}
ime = {r['mbs']: r['ime'] for r in L('tvrtke')}
skr = {r['mbs']: r['ime'] for r in L('skracene_tvrtke')}
sje = {r['mbs']: r for r in L('sjedista')}
GENERIC = {'gmail.com','yahoo.com','hotmail.com','outlook.com','net.hr','t-com.hr','inet.hr','email.t-com.hr','zg.t-com.hr','icloud.com','live.com','gmx.net','gmx.de','xnet.hr','optinet.hr','kvatroinfo.hr'}
by_dom = defaultdict(set)
for r in L('email_adrese'):
    a = (r.get('adresa') or '').lower().strip()
    if '@' in a:
        dom = a.split('@')[1]
        if dom not in GENERIC: by_dom[dom].add(r['mbs'])
FORM = re.compile(r'\b(d\.?\s?o\.?\s?o\.?|j\.?\s?d\.?\s?o\.?\s?o\.?|d\.?\s?d\.?|obrt|udruga|zadruga|k\.?d\.?|j\.?t\.?d\.?)\b.*$', re.I)
by_name = defaultdict(set)
for m, n in list(skr.items()) + list(ime.items()):
    k = s34.core(FORM.sub('', n).strip(' ,.-'))
    if k: by_name[k].add(m)
ulaz = json.load(open('data/croai_istrazivanje_ulaz.json'))
out = []
for e in ulaz:
    host = s34.host_of(e.get('croai_web') or '')
    doms = {host, host.split('.', 1)[1] if host.count('.') > 1 else host} if host else set()
    m_dom = set().union(*(by_dom.get(d, set()) for d in doms)) if doms else set()
    m_ime = by_name.get(s34.core(e['ime']), set())
    m_ime = {m for m in m_ime if sub.get(m, {}).get('status') == 1} or m_ime
    if len(m_dom) == 1: mbs, how = next(iter(m_dom)), 'sudreg: e-mail domena'
    elif m_dom & m_ime and len(m_dom & m_ime) == 1: mbs, how = next(iter(m_dom & m_ime)), 'sudreg: e-mail domena + ime'
    elif len(m_ime) == 1 and len(s34.core(e['ime']).replace('-', '')) >= 6: mbs, how = next(iter(m_ime)), 'sudreg: ime'
    elif len(m_ime) == 1: mbs, how = next(iter(m_ime)), 'sudreg: kratko ime (provjeri)'
    else:
        out.append({**e, 'sudreg': None, 'sudreg_kandidata': len(m_dom) + len(m_ime)}); continue
    s, a = sub.get(mbs, {}), sje.get(mbs, {})
    out.append({**e, 'sudreg': {
        'nacin': how, 'mbs': mbs, 'oib': str(s.get('oib', '')).zfill(11), 'aktivan': s.get('status') == 1,
        'tvrtka': ime.get(mbs), 'skracena': skr.get(mbs),
        'ulica': a.get('ulica'), 'broj': f"{a.get('kucni_broj','')}{a.get('kucni_podbroj','') or ''}".strip(),
        'naselje': a.get('naziv_naselja'), 'opcina': a.get('naziv_opcine')}})
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter((o['sudreg'] or {}).get('nacin', 'nema') for o in out))
for o in out:
    if o['sudreg']: r = o['sudreg']; print(f"{o['ime'][:24]:<24} {r['nacin'][8:24]:<16} {('' if r['aktivan'] else '[NEAKT] ')+(r['skracena'] or r['tvrtka'] or '')[:40]:<48} {r['ulica']} {r['broj']}, {r['naselje']}")
