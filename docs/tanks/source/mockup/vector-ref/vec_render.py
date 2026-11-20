# Renders the approved vector tank (the old design) at the 3D camera's scale, to lay under or beside a 3D render.
#   python vec_render.py <size> <hull dir> <turret dir> <px per metre> <width> <height> <out.png>
# Needs Node.js and rsvg-convert. vu.js = the vector engine and tank models cut from the tanks viewer page.
import sys, json, subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__))
from PIL import Image
def render(size, d, td, a, W, H, out, team='#33d17a', dmg=0, zc=0.45, typ='panzer'):
    S = a / (28 * 0.8660254); tmp = os.path.join(HERE, f'tmp_{size}_{d}_{td}_{dmg}')
    r = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'vec.cjs'), size, typ, str(d), str(td), str(S), tmp, team, str(dmg)]).decode().strip().split('\n')[-1])
    cx, cy = W / 2, H / 2 + zc * a * 4 / 3
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for layer in ('shadow', 'hull', 'turret'):
        png = f'{tmp}_{layer}.png'
        subprocess.check_call(['rsvg-convert', f'{tmp}_{layer}.svg', '-o', png])
        L = Image.open(png).convert('RGBA'); ax, ay = r[layer]
        ox, oy = (r['pivot'] if layer == 'turret' else (0, 0))
        px, py = int(round(cx + ox - ax)), int(round(cy + oy - ay))
        big = Image.new('RGBA', (W, H), (0, 0, 0, 0)); big.paste(L, (px, py)); im.alpha_composite(big)
    im.save(out); return out
if __name__ == '__main__':
    a = sys.argv
    render(a[1], int(a[2]), int(a[3]), float(a[4]), int(a[5]), int(a[6]), a[7])
