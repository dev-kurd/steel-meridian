#!/usr/bin/env python3
"""Pack the baked tank sprites (@4x PNG frames from bake_tanks.py) into WebP sheets + tanks.json for @4x, @2x and @1x.
usage: pack_tanks.py <bake dir> <out dir> [--tracks overlay|full]
Same sheet format as the Walkers (tools/pack.py in StateOfWar-Walkers): sheets with a team mask hold the base sprites in the top half
and the mask in the bottom half (R = paint, G = team lights).

--tracks overlay (default): for each hull direction and state the sheet holds the whole hull once (track frame 0) and, for track frames
1..3, only the pixels that differ (the moving links and wheels). The game draws the hull, then that small overlay on top.
--tracks full: the whole hull is stored for every track frame (about three times the hull pixels)."""
import os, sys, json, re
import numpy as np
from PIL import Image
args = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC, OUT = args[0], args[1]
TRACKS = 'full' if '--tracks' in sys.argv and sys.argv[sys.argv.index('--tracks') + 1] == 'full' else 'overlay'
os.makedirs(OUT, exist_ok=True)
T = json.load(open(os.path.join(SRC, 'tables.json')))
PAGE_W, PAGE_H, PAD = 4096, 2048, 2
RES = {'4x': 1, '2x': 2, '1x': 4}                      # divisor from the @4x frame
GAIN = float(T.get('bake', {}).get('maskGain', 1.0))      # the B renders were made at this brightness (see bake_tanks.py)
PAINT_Y, LIGHT_Y = 0.165, 0.475                      # average brightness (linear) of the six team paints and of their lights
DIFF = 7 / 255.0                                       # a pixel belongs to the track overlay if it differs from frame 0 by more than this
def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def read(p): return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
def fade(h, w, m=26.0):
    def f(n): v = np.clip(np.minimum(np.arange(n), n - 1 - np.arange(n)) / m, 0, 1); return v * v * (3 - 2 * v)
    return f(h)[:, None] * f(w)[None, :]
def down(a, k):
    """Average k x k blocks (a is premultiplied, linear light)."""
    if k == 1: return a
    h, w = a.shape[:2]; return a.reshape(h // k, k, w // k, k, -1).mean(axis=(1, 3))
def clean_shadow(al):
    return np.clip((al - 10 / 255) / (1 - 10 / 255), 0, 1) * fade(*al.shape)          # drop the faint haze, fade out at the frame edge
def dilate(m):
    p = np.pad(m, 1); return p[:-2, :-2] | p[:-2, 1:-1] | p[:-2, 2:] | p[1:-1, :-2] | p[1:-1, 1:-1] | p[1:-1, 2:] | p[2:, :-2] | p[2:, 1:-1] | p[2:, 2:]

def variants(kind, A, B=None, keep=None):
    """A, B: float RGBA arrays. kind: 'sprite' | 'shadow' | 'wreck' (a sprite with its soft ground shadow in it).
    keep: bool matte; pixels outside it are dropped (track overlays). -> {res: (base RGBA uint8, mask RGB uint8 or None)}"""
    out = {}
    if kind == 'shadow':
        al = clean_shadow(A[..., 3])
        for r, k in RES.items():
            a = down(al[..., None], k)[..., 0]
            out[r] = (np.dstack([np.zeros(a.shape + (3,), np.uint8), np.round(a * 255).astype(np.uint8)]), None)
        return out
    al = A[..., 3].copy(); al[al < 3 / 255] = 0                           # drop stray near-invisible pixels so sprites trim tightly
    if kind == 'wreck':
        soft = al < 0.98; al[soft] = clean_shadow(al)[soft]
    if keep is not None: al = al * keep
    lin = s2l(A[..., :3]) * al[..., None]                                  # premultiplied linear
    if B is not None:
        Bl = s2l(B[..., :3]) * al[..., None]
        m = np.clip(Bl[..., :2] - lin[..., :2], 0, None) / GAIN            # R = paint shading, G = team-light glow (premultiplied linear)
        over = np.clip(m - al[..., None], 0, None); m = m - over          # the part brighter than a mask can hold (paint highlights) goes
        lin = lin + over[..., 0:1] * PAINT_Y + over[..., 1:2] * LIGHT_Y    # into the base sprite as plain white light of the same brightness
    for r, k in RES.items():
        a = down(al[..., None], k)[..., 0]; c = down(lin, k); safe = np.maximum(a, 1e-6)[..., None]
        base = np.dstack([l2s(c / safe), a]); base[a <= 0] = 0
        mask = None
        if B is not None:
            mm = down(m, k) / safe; mask = np.dstack([l2s(mm), np.zeros_like(a)]); mask[a <= 0] = 0
            mask = np.round(mask * 255).astype(np.uint8)
        out[r] = (np.round(base * 255).astype(np.uint8), mask)
    return out
def trim(img):
    al = img[..., 3] > 0
    if not al.any(): return 0, 0, 1, 1
    ys = np.where(al.any(axis=1))[0]; xs = np.where(al.any(axis=0))[0]
    return int(xs[0]), int(ys[0]), int(xs[-1] - xs[0] + 1), int(ys[-1] - ys[0] + 1)

# ---- what was baked
models = sorted(k for k in T if '_' in k and 'frames4x' in T[k])           # e.g. heavy_panzer
sizes = [s for s in ('light', 'medium', 'heavy') if any(m.startswith(s + '_') for m in models)]
weapons = sorted({m.split('_', 1)[1] for m in models})
FR = int(T['track']['frames'])
groups = {}; count = {'sprites': 0, 'overlay_px': 0, 'full_px': 0}
def put(key, group, kind, anchor, A, B=None, keep=None):
    for r, (base, mask) in variants(kind, A, B, keep).items():
        x, y, w, h = trim(base)
        groups.setdefault((group, r), []).append((key, base[y:y + h, x:x + w], None if mask is None else mask[y:y + h, x:x + w], x, y, anchor))
    count['sprites'] += 1
def ex(*p): return os.path.exists(os.path.join(SRC, *p))
def rd(*p): return read(os.path.join(SRC, *p))

for size in sizes:
    hull_anchor = T[[m for m in models if m.startswith(size + '_')][0]]['anchors4x']
    for s in range(3):
        grp = 'tank-hull' if s == 0 else 'tank-hull-dmg'
        for d in range(32):
            b = lambda f, m: ('hull', size, 's%d' % s, 'd%02d_f%d_%s.png' % (d, f, m))
            have = [f for f in range(FR) if ex(*b(f, 'A')) and ex(*b(f, 'B'))]
            if 0 not in have: continue
            A0, B0 = rd(*b(0, 'A')), rd(*b(0, 'B'))
            put('hull/%s/s%d/d%02d/f0' % (size, s, d), grp, 'sprite', hull_anchor['hull'], A0, B0)
            rest = [(f, rd(*b(f, 'A')), rd(*b(f, 'B'))) for f in have if f > 0]
            if TRACKS == 'full':
                for f, A, B in rest: put('hull/%s/s%d/d%02d/f%d' % (size, s, d, f), grp, 'sprite', hull_anchor['hull'], A, B)
            elif rest:
                matte = np.zeros(A0.shape[:2], bool)
                for f, A, B in rest: matte |= (np.abs(A - A0).max(axis=2) > DIFF) | (np.abs(B - B0).max(axis=2) > DIFF)
                matte = dilate(matte); count['overlay_px'] += int(matte.sum()) * len(rest); count['full_px'] += int((A0[..., 3] > 0).sum()) * len(rest)
                for f, A, B in rest: put('hull/%s/s%d/d%02d/f%d' % (size, s, d, f), grp, 'sprite', hull_anchor['hull'], A, B, keep=matte)
    for d in range(32):
        if ex('shadow', 'hull', size, 'd%02d.png' % d): put('shadow/hull/%s/d%02d' % (size, d), 'tank-common', 'shadow', hull_anchor['shadow_hull'], rd('shadow', 'hull', size, 'd%02d.png' % d))
    for wp in weapons:
        m = '%s_%s' % (size, wp)
        if m not in T: continue
        an = T[m]['anchors4x']
        for s in range(3):
            for d in range(32):
                b = ('turret', size, wp, 's%d' % s, 'd%02d_' % d)
                if ex(*b[:-1], b[-1] + 'A.png') and ex(*b[:-1], b[-1] + 'B.png'):
                    put('turret/%s/%s/s%d/d%02d' % (size, wp, s, d), 'tank-%s' % wp if s == 0 else 'tank-%s-dmg' % wp, 'sprite', an['turret'],
                        rd(*b[:-1], b[-1] + 'A.png'), rd(*b[:-1], b[-1] + 'B.png'))
        for d in range(32):
            if ex('shadow', 'turret', size, wp, 'd%02d.png' % d): put('shadow/turret/%s/%s/d%02d' % (size, wp, d), 'tank-common', 'shadow', an['shadow_turret'], rd('shadow', 'turret', size, wp, 'd%02d.png' % d))
            if ex('wreck', size, wp, 'd%02d.png' % d): put('wreck/%s/%s/d%02d' % (size, wp, d), 'tank-common', 'wreck', an['wreck'], rd('wreck', size, wp, 'd%02d.png' % d))
    print(size, count['sprites'], 'sprites so far', flush=True)

manifest = {'version': 1, 'unit': 'tank', 'sizes': sizes, 'weapons': weapons, 'directions': 32, 'states': ['intact', 'damaged', 'burning'],
            'resolutions': {r: {'scale': 4 // k} for r, k in RES.items()}, 'sheets': {}, 'frames': {r: {} for r in RES},
            'track': dict(T['track'], mode=TRACKS), 'models': {},
            'note': 'frames[res][key] = [sheet index, x, y, w, h, anchorX, anchorY]. Draw so that (x + anchorX, y + anchorY) lands on the sprite position. '
                    'Sheets with mask: the mask for a frame is at the same x and y + maskOffsetY. '
                    'Team colour (linear light): out = toSRGB(toLinear(base) + toLinear(mask.r) * toLinear(paint) + toLinear(mask.g) * toLinear(light)). '
                    'One tank: shadow/hull and shadow/turret (blend the two with max), then hull/<size>/s<state>/d<dd>/f0, then if the track frame f is '
                    '1..3 and track.mode is "overlay" draw hull/.../f<f> on top at the same position (with mode "full" draw f<f> instead of f0), then '
                    'turret/<size>/<weapon>/s<state>/d<dd> at hull position + models[<size>_<weapon>].turretPivot1x[hull dir] * scale. '
                    'The turret shadow goes at hull position + turretGround1x[hull dir] * scale. muzzles1x[turret dir] are from the turret position, '
                    'firePoints1x[hull dir] from the hull position. wreck/<size>/<weapon>/d<dd> exists for even directions only and replaces everything.'}
for m in models:
    manifest['models'][m] = {k: T[m][k] for k in ('turretPivot1x', 'turretGround1x', 'muzzles1x', 'firePoints1x', 'data')}
total = 0; by_group = {}
for (group, r), sprites in sorted(groups.items()):
    k = RES[r]; has_mask = sprites[0][2] is not None
    sprites.sort(key=lambda s: (-s[1].shape[0], -s[1].shape[1]))
    def new_page(): return {'x': PAD, 'y': PAD, 'row_h': 0, 'place': [], 'w': 0, 'h': 0}
    pages = []; cur = new_page()
    for key, base, mask, tx, ty, an in sprites:
        h, w = base.shape[:2]
        if cur['x'] + w + PAD > PAGE_W: cur['x'] = PAD; cur['y'] += cur['row_h'] + PAD; cur['row_h'] = 0
        if cur['y'] + h + PAD > PAGE_H: pages.append(cur); cur = new_page()
        cur['place'].append((key, base, mask, tx, ty, an, cur['x'], cur['y']))
        cur['w'] = max(cur['w'], cur['x'] + w + PAD); cur['h'] = max(cur['h'], cur['y'] + h + PAD)
        cur['x'] += w + PAD; cur['row_h'] = max(cur['row_h'], h)
    pages.append(cur)
    for pi, pg in enumerate(pages):
        Wd = pg['w']; Hh = pg['h']
        sheet = np.zeros((Hh * (2 if has_mask else 1), Wd, 4), np.uint8)
        name = '%s@%s%s.webp' % (group, r, '' if len(pages) == 1 else '-%d' % pi)
        sid = len(manifest['sheets'].setdefault(r, []))
        for key, base, mask, tx, ty, an, x, y in pg['place']:
            h, w = base.shape[:2]; sheet[y:y + h, x:x + w] = base
            if has_mask:
                sheet[Hh + y:Hh + y + h, x:x + w, :3] = mask[..., :3]; sheet[Hh + y:Hh + y + h, x:x + w, 3] = base[..., 3]
            manifest['frames'][r][key] = [sid, x, y, w, h, round(an[0] / k - tx, 2), round(an[1] / k - ty, 2)]
        Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, name), 'WEBP', lossless=True, quality=100, method=4, exact=True)
        size = os.path.getsize(os.path.join(OUT, name)); total += size; by_group[(group, r)] = by_group.get((group, r), 0) + size
        manifest['sheets'][r].append({'file': name, 'group': group, 'w': Wd, 'h': sheet.shape[0], 'mask': has_mask, 'maskOffsetY': Hh if has_mask else 0})
        print('%-34s %4dx%-4d %4d sprites %8.1f KB' % (name, Wd, sheet.shape[0], len(pg['place']), size / 1024))
json.dump(manifest, open(os.path.join(OUT, 'tanks.json'), 'w'), separators=(',', ':'))
if count['full_px']: print('track overlays hold %.0f%% of the hull pixels they replace' % (100.0 * count['overlay_px'] / count['full_px']))
for r in RES: print('@%s total %.2f MB' % (r, sum(v for (g, rr), v in by_group.items() if rr == r) / 1e6))
print('total %.2f MB in %d sheets (%s tracks); manifest %.0f KB' % (total / 1e6, sum(len(v) for v in manifest['sheets'].values()), TRACKS, os.path.getsize(os.path.join(OUT, 'tanks.json')) / 1024))
