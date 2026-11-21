#!/usr/bin/env python3
"""Rebuild walkers from the packed sheets exactly the way the game shader will (used to check the pack)."""
import json, os, colorsys
import numpy as np
from PIL import Image
def s2l(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def l2s(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
def hexrgb(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
def _lum(rgb): r, g, b = [float(s2l(np.array(c))) for c in rgb]; return 0.2126 * r + 0.7152 * g + 0.0722 * b
def paint_of(T):                 # the team paint rule of the style guide (VectorEngine.paintOf), as in walker_lib.paint_of
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
def unit_paint(team):            # units: the team paint with saturation x0.5 and lightness x0.9 (2026-11-21: paint_of was missing here)
    h, l, s = colorsys.rgb_to_hls(*paint_of(tuple(hexrgb(team)))); return np.array(colorsys.hls_to_rgb(h, l * 0.9, s * 0.5))
def light_col(team): return unit_paint(team) * 0.5 + 0.5
TEAMS = {'green': '#33d17a', 'blue': '#3b82f6', 'red': '#e5484d', 'orange': '#f5a524', 'purple': '#a855f7', 'cyan': '#22d3ee'}

class Pack:
    def __init__(self, *dirs):
        self.frames = {}; self.sheets = {}; self.walk = None; self._img = {}
        for d in dirs:
            m = json.load(open(os.path.join(d, 'walkers.json'))); self.walk = m['walk']
            for res, fr in m['frames'].items():
                for k, v in fr.items(): self.frames[(res, k)] = (d, m['sheets'][res][v[0]], v[1:])
    def img(self, d, f):
        p = os.path.join(d, f)
        if p not in self._img: self._img[p] = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255
        return self._img[p]
    def has(self, res, key): return (res, key) in self.frames
    def draw(self, canvas, res, key, pos, team='blue', opacity=1.0):
        """canvas: float RGB linear-light array (modified in place); pos = unit position in px."""
        d, sh, (x, y, w, h, ax, ay) = self.frames[(res, key)]
        S = self.img(d, sh['file']); b = S[y:y + h, x:x + w]
        lin = s2l(b[..., :3]); a = b[..., 3:4] * opacity
        if sh['mask']:
            m = S[y + sh['maskOffsetY']:y + sh['maskOffsetY'] + h, x:x + w]
            lin = lin + s2l(m[..., 0:1]) * s2l(unit_paint(TEAMS[team])) + s2l(m[..., 1:2]) * s2l(light_col(TEAMS[team]))
        x0 = int(round(pos[0] - ax)); y0 = int(round(pos[1] - ay))
        H, W = canvas.shape[:2]; cx0, cy0 = max(x0, 0), max(y0, 0); cx1, cy1 = min(x0 + w, W), min(y0 + h, H)
        if cx1 <= cx0 or cy1 <= cy0: return
        sl = (slice(cy0 - y0, cy1 - y0), slice(cx0 - x0, cx1 - x0))
        dst = canvas[cy0:cy1, cx0:cx1]; dst[:] = dst * (1 - a[sl]) + lin[sl] * a[sl]
    def walker(self, canvas, res, kind, pos, legs_dir, torso_dir=None, pose='s', state=0, team='blue', shadow_opacity=0.55):
        torso_dir = legs_dir if torso_dir is None else torso_dir; mul = {'1x': 1, '2x': 2, '4x': 4}[res]
        off = (0, 0) if pose == 's' else self.walk['upperOffset1x'][str(legs_dir)][int(pose)]
        up = (pos[0] + off[0] * mul, pos[1] + off[1] * mul)
        if pose == 's' and legs_dir == torso_dir and self.has(res, 'shadow/%s/d%02d' % (kind, legs_dir)):
            self.draw(canvas, res, 'shadow/%s/d%02d' % (kind, legs_dir), pos, opacity=shadow_opacity)
        else:
            self.draw(canvas, res, 'shadow/legs/d%02d/%s' % (legs_dir, pose), pos, opacity=shadow_opacity)
            self.draw(canvas, res, 'shadow_upper/%s/d%02d' % (kind, torso_dir), up, opacity=shadow_opacity)
        if self.has(res, 'legs/s%d/d%02d/%s' % (state, legs_dir, pose)):
            self.draw(canvas, res, 'legs/s%d/d%02d/%s' % (state, legs_dir, pose), pos, team)
        self.draw(canvas, res, '%s/s%d/d%02d' % (kind, state, torso_dir), up, team)

def ground(w, h, col='#7d7259'):
    return np.ones((h, w, 3), np.float32) * s2l(hexrgb(col)).astype(np.float32)
def save(canvas, path, q=92):
    Image.fromarray(np.round(l2s(canvas) * 255).astype(np.uint8)).save(path, quality=q)
