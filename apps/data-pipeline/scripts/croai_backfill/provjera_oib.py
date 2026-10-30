import json, sys, difflib, importlib.util, re
from pathlib import Path
sys.path.insert(0, '.'); sys.path.insert(0, 'scripts')
spec = importlib.util.spec_from_file_location("s34", "scripts/34_fetch_croai.py")
s34 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s34)
from src.normalize import strip_diacritics as sd
D = Path('data/raw/sudreg'); L = lambda t: (json.loads(l) for l in open(D / f'{t}.jsonl'))
by_oib = {str(r['oib']).zfill(11): r for r in L('subjekti') if r.get('oib')}
ime = {r['mbs']: r['ime'] for r in L('tvrtke')}; sje = {r['mbs']: r for r in L('sjedista')}
x = json.load(open('data/croai_istrazivanje_izlaz.json'))
res = {}
for o in x:
    oib = (o.get('oib') or '').strip()
    if not oib: continue
    r = {'checksum': s34.oib_ok(oib)}
    s = by_oib.get(oib)
    if s:
        n = ime.get(s['mbs'], ''); a = sje.get(s['mbs'], {})
        r['sudreg_naziv'] = n; r['aktivan'] = s.get('status') == 1
        r['sim'] = round(difflib.SequenceMatcher(None, sd(n.lower()), sd((o.get('pravni_naziv') or '').lower())).ratio(), 2)
        r['sudreg_adresa'] = f"{a.get('ulica')} {a.get('kucni_broj','')}, {a.get('naziv_naselja')}"
        ul = sd((a.get('ulica') or '').lower()); ad = sd((o.get('adresa') or '').lower())
        key = [w for w in re.findall(r'\w{4,}', ul) if w not in ('ulica','cesta','trg')]
        r['adresa_ista'] = bool(key) and any(w in ad for w in key)
    else:
        r['u_sudregu'] = False
    res[o['croai_id']] = r
json.dump(res, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('OIB-a', len(res), '| checksum loš', sum(not r['checksum'] for r in res.values()),
      '| nije u sudregu', sum(r.get('u_sudregu') is False for r in res.values()))
print('naziv sim<0.6', [(cid, r['sudreg_naziv'][:30]) for cid, r in res.items() if r.get('sim', 1) < 0.6])
print('neaktivan', [cid for cid, r in res.items() if r.get('aktivan') is False])
print('adresa != sudreg sjedište', sum(1 for r in res.values() if r.get('adresa_ista') is False))
