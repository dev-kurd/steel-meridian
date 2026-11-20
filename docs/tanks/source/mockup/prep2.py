# Turns the mock.py renders into the pictures used on the canvas boards (ground colour behind, crops, @2x/@1x copies, team recolours).
#   python prep2.py [renders folder] [output folder]        defaults: ./out and ./img
import sys, os, colorsys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
from compose import *
R = (sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out')).rstrip('/\\') + '/'
C = (sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'img')).rstrip('/\\') + '/'; os.makedirs(C, exist_ok=True)
on_ground(R + 'family.png', C + 'family.jpg', crop=(60, 0, 1800, 700))
for s in ('light', 'medium', 'heavy'): on_ground(R + f'pair_{s}.png', C + f'new_{s}.jpg')
for n in ('brake', 'light', 'medium'): on_ground(R + f'close_{n}.png', C + f'close_{n}.jpg', quality=92)
im = on_ground(R + 'size4x.png', C + 'size_4x.png'); a = s2l(np.asarray(im).astype(float) / 255)
def down(arr, k):
    h, w = arr.shape[0] // k * k, arr.shape[1] // k * k
    return arr[:h, :w].reshape(h // k, k, w // k, k, 3).mean((1, 3))
for k, n in ((2, '2x'), (4, '1x')): Image.fromarray((l2s(down(a, k)) * 255 + .5).astype(np.uint8)).save(C + f'size_{n}.png')
for i in range(4): on_ground(R + f'dmg_{i}.png', C + f'dmg_{i}.jpg')
def lum(rgb): r, g, b = [float(s2l(np.array(c))) for c in rgb]; return 0.2126 * r + 0.7152 * g + 0.0722 * b
def hsl(h, s, l): return colorsys.hls_to_rgb(h, l, s)
def to_hsl(rgb): h, l, s = colorsys.rgb_to_hls(*rgb); return h, s, l
def paint_of(T):
    h, s0, _ = to_hsl(T); hd = h * 360
    purple = 255 <= hd <= 320; red = hd >= 335 or hd <= 15
    s = max(0.42, min(0.5, s0)) if purple else max(0.46, min(0.52, s0)) if red else max(0.6, min(0.82, s0))
    target = lum(hsl(146 / 360, 0.65, 0.4)) * (1.25 if purple else 0.9 if red else 1)
    lo, hi = 0.3, (0.64 if purple else 0.5 if red else 0.56)
    for _ in range(18):
        m = (lo + hi) / 2
        if lum(hsl(h, s, m)) < target: lo = m
        else: hi = m
    return hsl(h, s, (lo + hi) / 2)
def unit_paint(T): h, s, l = to_hsl(paint_of(T)); return hsl(h, s * 0.5, l * 0.9)
TEAMS = {'green': '#33d17a', 'blue': '#3b82f6', 'red': '#e5484d', 'orange': '#f5a524', 'purple': '#a855f7', 'cyan': '#22d3ee'}
for name, hx in TEAMS.items():
    up = unit_paint(hex2rgb(hx)); glow = tuple(c + (1 - c) * 0.5 for c in up)
    t = recolor(R + 'mask_A.png', R + 'mask_B.png', up, glow); t.save(f'out/team2_{name}.png'); on_ground(f'out/team2_{name}.png', C + f'team_{name}.jpg')
    if name == 'green':
        ref = np.asarray(Image.open(R + 'mask_beauty.png').convert('RGBA')).astype(float); got = np.asarray(t).astype(float)
        m = ref[..., 3] > 200; d = np.abs(ref[..., :3] - got[..., :3])[m]
        print('MASK mean', round(d.mean(), 2), '99%', round(np.percentile(d, 99), 1))
on_ground(R + 'mask_A.png', C + 'team_base.jpg')
A = np.asarray(Image.open(R + 'mask_A.png').convert('RGBA')).astype(float) / 255; B = np.asarray(Image.open(R + 'mask_B.png').convert('RGBA')).astype(float) / 255
mk = np.clip(s2l(B[..., :3]) - s2l(A[..., :3]), 0, 1); mk[..., 2] = 0
Image.fromarray((np.dstack([l2s(mk), A[..., 3]]) * 255 + .5).astype(np.uint8), 'RGBA').save('out/team2_mask.png'); on_ground('out/team2_mask.png', C + 'team_mask.jpg', bg=(18, 20, 24))
for d in range(0, 32, 4): on_ground(R + f'dir_{d:02d}.png', C + f'dir_{d:02d}.jpg')
for k in 'ab': on_ground(R + f'aim_{k}.png', C + f'aim_{k}.jpg')
for n in ('layer_all_shadow', 'layer_hull', 'layer_turret', 'layer_shadow'): on_ground(R + n + '.png', C + n + '.jpg')
fr = [on_ground(R + f'track_{i}.png', f'out/c2_track{i}.png').crop((0, 60, 560, 250)) for i in range(4)]
fr[0].save(C + 'tracks.gif', save_all=True, append_images=fr[1:], duration=90, loop=0)
# review sheet
names = ['family.jpg', 'size_4x.png', 'new_light.jpg', 'new_heavy.jpg', 'dmg_2.jpg', 'team_blue.jpg', 'dir_12.jpg', 'dir_20.jpg', 'layer_hull.jpg', 'layer_turret.jpg', 'aim_a.jpg']
print(sorted(os.listdir(C)), len(os.listdir(C)))
