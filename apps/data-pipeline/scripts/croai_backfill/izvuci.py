"""Za nerazriješene CroAI subjekte izvuci lokacijske tragove iz keširanih webova."""
import csv, json, re, html, importlib.util, sys
from pathlib import Path
sys.path.insert(0, '.')
spec = importlib.util.spec_from_file_location("s34", "scripts/34_fetch_croai.py")
s34 = importlib.util.module_from_spec(spec); spec.loader.exec_module(s34)
WEB = Path('data/raw/croai/web')
rows = list(csv.DictReader(open('data/croai_kandidati.csv')))
MAPS = [re.compile(p) for p in (r'!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)', r'[?&](?:q|ll|center)=(-?\d+\.\d{3,}),\s*(-?\d+\.\d{3,})', r'@(-?\d+\.\d{4,}),(-?\d+\.\d{4,}),\d+z')]
HR_ADR = re.compile(r'([A-ZČĆŽŠĐ][\wčćžšđ.\- ]{2,40}?\s\d{1,3}[a-zA-Z]?)\s*,?\s*(?:HR-)?(\d{5})\s+([A-ZČĆŽŠĐ][\wčćžšđ\- ]{2,25})')
def text(p):
    t = re.sub(r'<script(?![^>]*ld\+json)[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', p)
    return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t)))
out = []
for r in rows:
    host = s34.host_of(r['croai_web'] or '')
    d = WEB / host if host else None
    pages = [f.read_text(errors='ignore') for f in sorted(d.glob('*.html'))] if d and d.exists() else []
    coords, ld, adr = None, None, None
    for p in pages:
        for rx in MAPS:
            m = rx.search(p)
            if m and not coords:
                a, b = float(m.group(1)), float(m.group(2))
                coords = (b, a) if rx is MAPS[0] else (a, b)  # (lat,lng)
        m = re.search(r'"streetAddress"\s*:\s*"([^"]+)"[\s\S]{0,300}?"addressLocality"\s*:\s*"([^"]+)"', p) or \
            re.search(r'"addressLocality"\s*:\s*"([^"]+)"[\s\S]{0,300}?"streetAddress"\s*:\s*"([^"]+)"', p)
        if m and not ld: ld = ', '.join(m.groups())
        m = HR_ADR.search(text(p))
        if m and not adr: adr = f"{m.group(1).strip()}, {m.group(2)} {m.group(3).strip()}"
    out.append({**r, 'stranica': len(pages), 'web_coords': f"{coords[0]:.6f},{coords[1]:.6f}" if coords else '',
                'web_jsonld': ld or '', 'web_adresa': adr or ''})
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('ukupno', len(out), '| bez stranica u kešu', sum(1 for o in out if not o['stranica']))
print('maps koordinate', sum(1 for o in out if o['web_coords']), '| json-ld', sum(1 for o in out if o['web_jsonld']), '| HR adresa', sum(1 for o in out if o['web_adresa']))
print('bilo što', sum(1 for o in out if o['web_coords'] or o['web_jsonld'] or o['web_adresa']))
