import json, sys
sys.path.insert(0, '.')
from src import places
from src.normalize import strip_diacritics
n = lambda s: strip_diacritics((s or '').lower())
SKIP = {'EDIT code school', 'Calimero Network'}
m = [o for o in json.load(open(sys.argv[1])) if o['sudreg'] and o['ime'] not in SKIP]
pl = places.Places(); ov = json.load(open('data/croai_overrides.json')); bad = []
for o in m:
    r = o['sudreg']; adr = f"{r['ulica']} {r['broj']}, {r['naselje']}"
    hit = next((h for h in pl.search(adr + ', Hrvatska') if n(r['naselje'].split(' - ')[0]) in n(h['address'])), None)
    if not hit: bad.append((o['ime'], adr)); continue
    ov[o['croai_id']] = {"_ime": o['ime'], "oib": r['oib'], "lat": round(hit['lat'], 6), "lng": round(hit['lng'], 6),
        "adresa_override": adr, "izvor": f"{r['nacin']} → {r['skracena'] or r['tvrtka']}; geokod Google po sudreg sjedištu, 2026-10-30"}
json.dump(dict(sorted(ov.items(), key=lambda kv: int(kv[0]))), open('data/croai_overrides.json', 'w'), ensure_ascii=False, indent=2)
print('overrides', len(ov), '| bez geokoda', bad)
