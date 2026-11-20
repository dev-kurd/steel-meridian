#!/usr/bin/env python3
"""Rebuild tanks from the packed sheets exactly the way the game shader will (used to check the pack).
usage as a script: compose_tanks.py <sheets dir> <out.jpg>   -> a contact sheet of what was packed"""
import json, os, sys, colorsys
import numpy as np
from PIL import Image
def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def _lum(rgb): r, g, b = [float(s2l(np.array(c))) for c in rgb]; return 0.2126 * r + 0.7152 * g + 0.0722 * b
def paint_of(T):                 # the team paint rule of the style guide (VectorEngine.paintOf)
    h, l0, s0 = colorsys.rgb_to_hls(*T); hd = h * 360
    purple = 255 <= hd <= 320; red = hd >= 335 or hd <= 15
    s = max(0.42, min(0.5, s0)) if purple else max(0.46, min(0.52, s0)) if red else max(0.6, min(0.82, s0))
    target = _lum(colorsys.hls_to_rgb(146 / 360, 0.4, 0.65)) * (1.25 if purple else 0.9 if red else 1)
    lo, hi = 0.3, (0.64 if purple else 0.5 if red else 0.56)
    for _ in range(18):
        m = (lo + hi) / 2
        if _lum(colorsys.hls_to_rgb(h, m, s)) < target: lo = m
        else: hi = m
    return colorsys.hls_to_rgb(h, (lo + hi) / 2, s)
def unit_paint(team):            # units: the team paint with saturation x0.5 and lightness x0.9
    h, l, s = colorsys.rgb_to_hls(*paint_of(hexrgb(team))); return np.array(colorsys.hls_to_rgb(h, l * 0.9, s * 0.5))
def light_col(team): return unit_paint(team) * 0.5 + 0.5
TEAMS = {'green': '#33d17a', 'blue': '#3b82f6', 'red': '#e5484d', 'orange': '#f5a524', 'purple': '#a855f7', 'cyan': '#22d3ee'}

class Pack:
    def __init__(self, d):
        self.dir = d; self.m = json.load(open(os.path.join(d, 'tanks.json'))); self._img = {}
    def img(self, f):
        if f not in self._img: self._img[f] = np.asarray(Image.open(os.path.join(self.dir, f)).convert('RGBA')).astype(np.float32) / 255
        return self._img[f]
    def has(self, res, key): return key in self.m['frames'][res]
    def sprite(self, res, key, team):
        sid, x, y, w, h, ax, ay = self.m['frames'][res][key]; sh = self.m['sheets'][res][sid]
        S = self.img(sh['file']); b = S[y:y + h, x:x + w]; lin = s2l(b[..., :3]); a = b[..., 3:4]
        if sh['mask']:
            m = S[y + sh['maskOffsetY']:y + sh['maskOffsetY'] + h, x:x + w]
            lin = lin + s2l(m[..., 0:1]) * s2l(unit_paint(TEAMS[team])) + s2l(m[..., 1:2]) * s2l(light_col(TEAMS[team]))
        return lin, a, ax, ay
    def _clip(self, canvas, pos, w, h, ax, ay):
        x0 = int(round(pos[0] - ax)); y0 = int(round(pos[1] - ay)); H, W = canvas.shape[:2]
        cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
        if cx1 <= cx0 or cy1 <= cy0: return None
        return (slice(cy0, cy1), slice(cx0, cx1)), (slice(cy0 - y0, cy1 - y0), slice(cx0 - x0, cx1 - x0))
    def draw(self, canvas, res, key, pos, team='green', opacity=1.0):
        lin, a, ax, ay = self.sprite(res, key, team); c = self._clip(canvas, pos, lin.shape[1], lin.shape[0], ax, ay)
        if c: dst = canvas[c[0]]; al = a[c[1]] * opacity; dst[:] = dst * (1 - al) + lin[c[1]] * al
    def shadows(self, canvas, res, keys_pos, opacity=1.0):
        """Several shadow sprites of one unit, blended with max so they do not darken twice."""
        cov = np.zeros(canvas.shape[:2] + (1,), np.float32)
        for key, pos in keys_pos:
            if not self.has(res, key): continue
            lin, a, ax, ay = self.sprite(res, key, 'green'); c = self._clip(canvas, pos, lin.shape[1], lin.shape[0], ax, ay)
            if c: cov[c[0]] = np.maximum(cov[c[0]], a[c[1]])
        canvas *= (1 - cov * opacity)
    def tank(self, canvas, res, size, weapon, pos, hull_dir, turret_dir=None, frame=0, state=0, team='green'):
        turret_dir = hull_dir if turret_dir is None else turret_dir; mul = self.m['resolutions'][res]['scale']; md = self.m['models']['%s_%s' % (size, weapon)]
        tp = (pos[0] + md['turretPivot1x'][hull_dir][0] * mul, pos[1] + md['turretPivot1x'][hull_dir][1] * mul)
        tg = (pos[0] + md['turretGround1x'][hull_dir][0] * mul, pos[1] + md['turretGround1x'][hull_dir][1] * mul)
        self.shadows(canvas, res, [('shadow/hull/%s/d%02d' % (size, hull_dir), pos), ('shadow/turret/%s/%s/d%02d' % (size, weapon, turret_dir), tg)])
        hk = 'hull/%s/s%d/d%02d/f' % (size, state, hull_dir)
        if self.m['track']['mode'] == 'full' and frame: self.draw(canvas, res, hk + str(frame), pos, team)
        else:
            self.draw(canvas, res, hk + '0', pos, team)
            if frame and self.has(res, hk + str(frame)): self.draw(canvas, res, hk + str(frame), pos, team)
        self.draw(canvas, res, 'turret/%s/%s/s%d/d%02d' % (size, weapon, state, turret_dir), tp, team)
    def wreck(self, canvas, res, size, weapon, pos, d): self.draw(canvas, res, 'wreck/%s/%s/d%02d' % (size, weapon, d - d % 2), pos)

def ground(w, h, col='#7e7462'): return np.ones((h, w, 3), np.float32) * s2l(np.array(hexrgb(col))).astype(np.float32)
def save(canvas, path, q=92): Image.fromarray(np.round(l2s(canvas) * 255).astype(np.uint8)).save(path, quality=q)

if __name__ == '__main__':
    P = Pack(sys.argv[1]); m = P.m; res = '4x'; cell = (460, 330)
    teams = list(TEAMS); rows = []
    for size in m['sizes']:
        for wp in m['weapons']:
            if '%s_%s' % (size, wp) not in m['models']: continue
            dirs = sorted({int(k.split('/')[3][1:]) for k in m['frames'][res] if k.startswith('hull/%s/s0/' % size)})
            rows.append((size, wp, dirs))
    n = max(len(r[2]) for r in rows); n = min(n, 8)
    cv = ground(cell[0] * n, cell[1] * len(rows) * 2)
    for ri, (size, wp, dirs) in enumerate(rows):
        pick = dirs[::max(1, len(dirs) // n)][:n]
        for ci, d in enumerate(pick):
            P.tank(cv, res, size, wp, (ci * cell[0] + cell[0] / 2, ri * 2 * cell[1] + cell[1] * 0.62), d, (d + 5 * ci) % 32 if (d + 5 * ci) % 32 in dirs else d, frame=ci % 4, state=0, team=teams[ci % 6])
            st = 1 + ci % 2
            if P.has(res, 'hull/%s/s%d/d%02d/f0' % (size, st, d)): P.tank(cv, res, size, wp, (ci * cell[0] + cell[0] / 2, (ri * 2 + 1) * cell[1] + cell[1] * 0.62), d, d, frame=0, state=st, team=teams[(ci + 3) % 6])
    save(cv, sys.argv[2]); print('wrote', sys.argv[2])
