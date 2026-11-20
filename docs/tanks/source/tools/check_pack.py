# Step 2 of the pack check: rebuild each reference tank from the packed sheets and compare it with the whole render.
#
#   python tools/check_pack.py <sheets dir> <refs dir (from check_refs.py)> [out.jpg]
#
# Needs numpy and Pillow. Prints, per tank: the mean difference on the tank's pixels (of 255), the 95% value and the signed mean
# (plus = the sheet-built tank is brighter). Writes a side-by-side picture: whole render | built from the sheets | difference x4.
# What to expect (Heavy test, 2026-11-20): mean 6-9, signed +2 to +5; most of it is sub-pixel edges and the barrels' shadow on the
# hull, which is not baked. A mean above about 12, or a clear colour shift over a whole part, means something is wrong.
import sys, os, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose_tanks as C

def main(sheets, refs_dir, out=None):
    P = C.Pack(sheets); refs = json.load(open(os.path.join(refs_dir, 'refs.json'))); rows = []; worst = 0.0
    for r in refs:
        ref = np.asarray(Image.open(os.path.join(refs_dir, r['file'])).convert('RGBA')).astype(np.float32) / 255
        H, W = ref.shape[:2]; a = ref[..., 3:4]
        R = C.ground(W, H) * (1 - a) + C.s2l(ref[..., :3]) * a
        cv = C.ground(W, H)
        P.tank(cv, '4x', r['size'], r['weapon'], tuple(r['anchor4x']), r['hull'], r['turret'], frame=r['frame'], state=r['state'], team=r['team'])
        d = (C.l2s(cv) - C.l2s(R)) * 255; m = ref[..., 3] > 0.99; ad = np.abs(d[m]); worst = max(worst, float(ad.mean()))
        print('%-44s tank px: mean %5.2f  95%% %5.1f  signed %s' % (r['file'], ad.mean(), np.percentile(ad, 95), np.round(d[m].mean(axis=0), 1)))
        ys, xs = np.where(ref[..., 3] > 0.02); pad = 12
        box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + pad), min(H, ys.max() + pad))
        tiles = [Image.fromarray(np.round(C.l2s(x) * 255).astype(np.uint8)).crop(box) for x in (R, cv)]
        tiles.append(Image.fromarray(np.clip(np.abs(d).max(axis=2) * 4, 0, 255).astype(np.uint8)).convert('RGB').crop(box)); rows.append(tiles)
    print('worst mean %.2f' % worst)
    if out and rows:
        w = max(t.width for row in rows for t in row); h = max(t.height for row in rows for t in row)
        S = Image.new('RGB', (w * 3 + 40, (h + 10) * len(rows) + 10), (20, 23, 29))
        for i, row in enumerate(rows):
            for j, t in enumerate(row): S.paste(t, (10 + j * (w + 10), 10 + i * (h + 10)))
        S.save(out, quality=90); print('wrote', out)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
