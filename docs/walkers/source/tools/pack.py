#!/usr/bin/env python3
"""Pack the baked walker sprites (@4x PNG frames) into WebP sheets + walkers.json for @4x, @2x and @1x.
usage: pack.py <bake dir> <out dir>
Sheets with a team mask hold the base sprites in the top half and the mask in the bottom half (R = paint, G = team lights)."""
import os, sys, json, math, re
import numpy as np
from PIL import Image
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
KINDS = ['kodiak', 'cougar', 'gatling', 'avenger', 'achilles']
FRAME = 384; ANCHOR = (192.0, 264.0); PAGE_W, PAGE_H, PAD = 4096, 2048, 2
RES = {'4x': 1, '2x': 2, '1x': 4}                      # divisor from the @4x frame
def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def read(p): return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
_fy = np.clip(np.minimum(np.arange(FRAME), FRAME - 1 - np.arange(FRAME)) / 26.0, 0, 1); _fy = _fy * _fy * (3 - 2 * _fy)
FADE = _fy[:, None] * _fy[None, :]
def down(a, k):
    """Average k x k blocks (a is premultiplied, linear light)."""
    if k == 1: return a
    h, w = a.shape[:2]; return a.reshape(h // k, k, w // k, k, -1).mean(axis=(1, 3))
def clean_shadow(al):
    al = np.clip((al - 10 / 255) / (1 - 10 / 255), 0, 1) * FADE          # drop the faint haze, fade out at the frame edge
    return al
def variants(kind, pa, pb=None):
    """-> {res: (base RGBA uint8, mask RGB uint8 or None)}; kind: 'sprite' | 'shadow' | 'wreck'."""
    A = read(pa); out = {}
    if kind == 'shadow':
        al = clean_shadow(A[..., 3])
        for r, k in RES.items():
            a = down(al[..., None], k)[..., 0]
            out[r] = (np.dstack([np.zeros(a.shape + (3,), np.uint8), np.round(a * 255).astype(np.uint8)]), None)
        return out
    al = A[..., 3].copy()
    if kind == 'wreck':
        soft = al < 0.98; al[soft] = clean_shadow(al)[soft]
    lin = s2l(A[..., :3]) * al[..., None]                                  # premultiplied linear
    if pb:
        B = read(pb); Bl = s2l(B[..., :3]) * al[..., None]
        m = np.clip(Bl[..., :2] - lin[..., :2], 0, None)                   # R = paint shading, G = team-light glow (premultiplied linear)
    for r, k in RES.items():
        a = down(al[..., None], k)[..., 0]; c = down(lin, k); safe = np.maximum(a, 1e-6)[..., None]
        base = np.dstack([l2s(c / safe), a]); base[a <= 0] = 0
        mask = None
        if pb:
            mm = down(m, k) / safe; mask = np.dstack([l2s(mm), np.zeros_like(a)]); mask[a <= 0] = 0
            mask = np.round(mask * 255).astype(np.uint8)
        out[r] = (np.round(base * 255).astype(np.uint8), mask)
    return out
def trim(img):
    al = img[..., 3] > 0
    if not al.any(): return 0, 0, 1, 1
    ys = np.where(al.any(axis=1))[0]; xs = np.where(al.any(axis=0))[0]
    return int(xs[0]), int(ys[0]), int(xs[-1] - xs[0] + 1), int(ys[-1] - ys[0] + 1)

# ---- collect the sprite list: (key, group, kind, path A, path B)
items = []
def add(key, group, kind, pa, pb=None):
    if os.path.exists(pa) and (pb is None or os.path.exists(pb)): items.append((key, group, kind, pa, pb))
POSES = ['s'] + [str(i) for i in range(8)]
for s in range(3):
    for d in range(32):
        for p in POSES:
            b = os.path.join(SRC, 'legs', 's%d' % s, 'd%02d_%s_' % (d, p))
            add('legs/s%d/d%02d/%s' % (s, d, p), 'walker-legs' if s == 0 else 'walker-legs-dmg', 'sprite', b + 'A.png', b + 'B.png')
        for k in KINDS:
            b = os.path.join(SRC, k, 's%d' % s, 'd%02d_' % d)
            add('%s/s%d/d%02d' % (k, s, d), 'walker-%s' % k if s == 0 else 'walker-%s-dmg' % k, 'sprite', b + 'A.png', b + 'B.png')
for d in range(32):
    for p in POSES: add('shadow/legs/d%02d/%s' % (d, p), 'walker-common', 'shadow', os.path.join(SRC, 'legs', 'shadow', 'd%02d_%s.png' % (d, p)))
    for k in KINDS:
        add('shadow/%s/d%02d' % (k, d), 'walker-common', 'shadow', os.path.join(SRC, k, 'shadow', 'd%02d.png' % d))
        add('shadow_upper/%s/d%02d' % (k, d), 'walker-common', 'shadow', os.path.join(SRC, k, 'shadow_upper', 'd%02d.png' % d))
        add('wreck/%s/d%02d' % (k, d), 'walker-common', 'wreck', os.path.join(SRC, k, 'wreck', 'd%02d.png' % d))
print(len(items), 'sprites found')

# ---- process, then pack per (group, resolution) on shelves
groups = {}
for n, (key, group, kind, pa, pb) in enumerate(items):
    for r, (base, mask) in variants(kind, pa, pb).items():
        x, y, w, h = trim(base)
        groups.setdefault((group, r), []).append((key, base[y:y + h, x:x + w], None if mask is None else mask[y:y + h, x:x + w], x, y))
    if n % 400 == 0: print(' ', n, flush=True)
manifest = {'version': 1, 'unit': 'walker', 'kinds': KINDS, 'directions': 32, 'poses': POSES,
            'states': ['intact', 'damaged', 'burning'], 'resolutions': {}, 'sheets': {}, 'frames': {r: {} for r in RES},
            'note': 'frames[res][key] = [sheet index, x, y, w, h, anchorX, anchorY]. Draw so that (x + anchorX, y + anchorY) lands on the unit position. '
                    'Sheets with mask: the mask for a frame is at the same x and y + maskOffsetY. '
                    'Team colour (linear light): out = toSRGB(toLinear(base) + toLinear(mask.r) * toLinear(paint) + toLinear(mask.g) * toLinear(light)).'}
total = 0
for (group, r), sprites in sorted(groups.items()):
    k = RES[r]; has_mask = sprites[0][2] is not None
    sprites.sort(key=lambda s: (-s[1].shape[0], -s[1].shape[1]))
    pages = []; cur = None
    def new_page():
        return {'x': PAD, 'y': PAD, 'row_h': 0, 'place': [], 'w': 0, 'h': 0}
    cur = new_page()
    for key, base, mask, tx, ty in sprites:
        h, w = base.shape[:2]
        if cur['x'] + w + PAD > PAGE_W: cur['x'] = PAD; cur['y'] += cur['row_h'] + PAD; cur['row_h'] = 0
        if cur['y'] + h + PAD > PAGE_H: pages.append(cur); cur = new_page()
        cur['place'].append((key, base, mask, tx, ty, cur['x'], cur['y']))
        cur['w'] = max(cur['w'], cur['x'] + w + PAD); cur['h'] = max(cur['h'], cur['y'] + h + PAD)
        cur['x'] += w + PAD; cur['row_h'] = max(cur['row_h'], h)
    pages.append(cur)
    for pi, pg in enumerate(pages):
        W = pg['w']; Hh = pg['h']
        sheet = np.zeros((Hh * (2 if has_mask else 1), W, 4), np.uint8)
        name = '%s@%s%s.webp' % (group, r, '' if len(pages) == 1 else '-%d' % pi)
        sid = len(manifest['sheets'].setdefault(r, []))
        for key, base, mask, tx, ty, x, y in pg['place']:
            h, w = base.shape[:2]; sheet[y:y + h, x:x + w] = base
            if has_mask:
                sheet[Hh + y:Hh + y + h, x:x + w, :3] = mask[..., :3]; sheet[Hh + y:Hh + y + h, x:x + w, 3] = base[..., 3]
            manifest['frames'][r][key] = [sid, x, y, w, h, round(ANCHOR[0] / k - tx, 2), round(ANCHOR[1] / k - ty, 2)]
        Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, name), 'WEBP', lossless=True, quality=100, method=4, exact=True)
        size = os.path.getsize(os.path.join(OUT, name)); total += size
        manifest['sheets'][r].append({'file': name, 'group': group, 'w': W, 'h': sheet.shape[0], 'mask': has_mask, 'maskOffsetY': Hh if has_mask else 0})
        print('%-34s %4dx%-4d %4d sprites %7.1f KB' % (name, W, sheet.shape[0], len(pg['place']), size / 1024))
tb = os.path.join(SRC, 'tables.json')
if os.path.exists(tb):
    t = json.load(open(tb)); manifest['walk'] = {'frames': t['walk_frames'], 'travelGameUnitsPerFrame': round(t['travel_game_units'], 4),
        'travelModelUnitsPerFrame': round(t['travel_model_units'], 4), 'upperOffset1x': t['upper_offset_1x']}
for r, k in RES.items(): manifest['resolutions'][r] = {'scale': 4 // k, 'frame': FRAME // k, 'anchor': [ANCHOR[0] / k, ANCHOR[1] / k]}
json.dump(manifest, open(os.path.join(OUT, 'walkers.json'), 'w'), separators=(',', ':'))
print('total %.1f MB in %d sheets; manifest %.0f KB' % (total / 1e6, sum(len(v) for v in manifest['sheets'].values()), os.path.getsize(os.path.join(OUT, 'walkers.json')) / 1024))
