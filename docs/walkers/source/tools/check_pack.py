#!/usr/bin/env python3
"""The pack check: rebuild walkers from the packed sheets the way the game will (legs, then the upper body with its walk offset,
team colour added in linear light) and compare them with whole renders from check_refs.py.
usage: check_pack.py <sheets dir> <check_refs dir> [out.jpg]
Prints mean differences on the walker (0..255) per case and writes a picture: whole render | from the sheets | difference x4.
- legs, upper: each layer against the same layer rendered alone in the real team colour. This tests the team mask and the pack;
  expect about 1 to 3 (test bake of 2026-11-21: 0.6 to 2.7; the 2026-11-19 sheets: 2.2 and 3.5), above about 6 means a fault.
- whole: the rebuilt walker against the walker rendered in one piece. The layers are lit one at a time, so the upper body's
  shade on the legs is missing in the sheets: about 4 to 8 is normal, above about 12 means a fault."""
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose as C
SHEETS, REFS = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(SHEETS)), 'check_pack.jpg')
pack = C.Pack(SHEETS); man = json.load(open(os.path.join(SHEETS, 'walkers.json')))
F = man['resolutions']['4x']['frame']; pos = man['resolutions']['4x']['anchor']
rows = []; worst = 0; worst_layer = 0
def rd(name): return np.asarray(Image.open(os.path.join(REFS, name)).convert('RGBA')).astype(np.float32) / 255
def cmp(ref, key, at, team):
    g = C.ground(F, F); a = ref[..., 3:4]; want = g * (1 - a) + C.s2l(ref[..., :3]) * a
    got = C.ground(F, F); pack.draw(got, '4x', key, at, team)
    return float(np.abs(C.l2s(want) * 255 - C.l2s(got) * 255)[ref[..., 3] > 0.5].mean())
for c in json.load(open(os.path.join(REFS, 'cases.json'))):
    ref = np.asarray(Image.open(os.path.join(REFS, c['file'])).convert('RGBA')).astype(np.float32) / 255
    g = C.ground(F, F); a = ref[..., 3:4]; want = g * (1 - a) + C.s2l(ref[..., :3]) * a
    got = C.ground(F, F); d2 = '%02d' % c['dir']
    off = (0, 0) if c['pose'] == 's' else pack.walk['upperOffset1x'][str(c['dir'])][int(c['pose'])]
    pack.draw(got, '4x', 'legs/s%d/d%s/%s' % (c['state'], d2, c['pose']), pos, c['team'])
    pack.draw(got, '4x', '%s/s%d/d%s' % (c['kind'], c['state'], d2), (pos[0] + off[0] * 4, pos[1] + off[1] * 4), c['team'])
    w8, g8 = C.l2s(want) * 255, C.l2s(got) * 255; diff = np.abs(w8 - g8); on = ref[..., 3] > 0.5
    mean = float(diff[on].mean()); worst = max(worst, mean)
    ml = cmp(rd('legs_' + c['file']), 'legs/s%d/d%s/%s' % (c['state'], d2, c['pose']), pos, c['team'])
    mu = cmp(rd('upper_' + c['file']), '%s/s%d/d%s' % (c['kind'], c['state'], d2), pos, c['team'])
    worst_layer = max(worst_layer, ml, mu)
    print('%-28s legs %.1f  upper %.1f  whole %.1f' % (c['file'], ml, mu, mean))
    rows.append(np.hstack([w8, g8, np.clip(diff * 4, 0, 255)]))
Image.fromarray(np.vstack(rows).astype(np.uint8)).save(OUT, quality=90)
print('worst layer %.1f, worst whole %.1f (of 255) -> %s' % (worst_layer, worst, OUT))
