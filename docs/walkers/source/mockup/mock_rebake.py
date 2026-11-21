# mock_rebake.py - renders for the walker re-bake mockup (2026-11-21): the walk at 8, 12 and 16 frames, and the damage
# states in the first look ('old') and in the tank damage style ('new'). The owner chose 12 frames and the tank style; both
# are in walker_lib.py now. A third, smokier variant was shown and turned down (its pictures stay on the mockup page).
#
#   blender -b --python mock_rebake.py -- walk   --out <dir>     whole Kodiak, 4 directions, every walk phase the three
#                                                                frame counts need (24 per direction), at the bake size (@4x)
#   blender -b --python mock_rebake.py -- damage --out <dir>     all five walkers, direction 2, intact / damaged / burning /
#                                                                wreck, old look and new look, at twice the bake size
#
# Files: walk/d{dd}_p{kk}.png (phase = kk / 48), damage/{kind}_{old|new}_s{state}.png, and meta.json with the numbers the
# mockup page needs. Renders skip files that already exist.
import sys, os, json, math, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.dirname(HERE), os.path.join(HERE, '..', '..', '..', 'tanks', 'source')]
import walker_lib as WL

WALK_DIRS = [28, 0, 4, 20]            # 28 = side view (moves right on screen), 0 = lower-right, 4 = towards the camera, 20 = away
PHASE_DEN = 48                        # 8, 12 and 16 all divide 48
COUNTS = [8, 12, 16]
DMG_DIR = 2
DMG_MUL = 2                           # damage pictures at twice the bake size, for a close look

def phases():
    return sorted({PHASE_DEN // n * f for n in COUNTS for f in range(n)})

def shot(path, **kw):
    if os.path.exists(path): return 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    WL.shoot(path, zc=WL.BK_ZC, **kw); return 1

def walk(out):
    WL.build('kodiak'); print('device', WL.setup_render(48)); n = 0; t = time.time()
    for d in WALK_DIRS:
        for k in phases():
            n += shot(os.path.join(out, 'walk', 'd%02d_p%02d.png' % (d, k)), W=WL.BK_W, H=WL.BK_H, a=WL.BK_A, legs=d, torso=d,
                      layer='all+shadow', phase=k / PHASE_DEN, mode='beauty')
            print('walk', d, k, round(time.time() - t), flush=True)
    return n

def damage(out):
    n = 0; t = time.time(); m = DMG_MUL
    for style in ('old', 'new'):
        WL.DAMAGE_LOOK = 'old' if style == 'old' else 'tank'
        for kind in WL.KINDS:
            WL.build(kind); WL.setup_render(64)
            for s in (0, 1, 2, 3):
                if s == 0 and style != 'old': continue          # intact is the same in both looks
                name = '%s_%s_s%d.png' % (kind, 'old' if s == 0 else style, s)
                n += shot(os.path.join(out, 'damage', name), W=WL.BK_W * m, H=WL.BK_H * m, a=WL.BK_A * m, legs=DMG_DIR, torso=DMG_DIR,
                          layer='all+shadow', dmg=s, mode='beauty')
                print('damage', style, kind, s, round(time.time() - t), flush=True)
    WL.DAMAGE_LOOK = 'tank'
    return n

def meta(out):
    cyc = 2 * WL.STRIDE / WL.DUTY                                 # metres the body moves in one walk cycle
    json.dump({'walkDirs': WALK_DIRS, 'phaseDen': PHASE_DEN, 'counts': COUNTS, 'phases': phases(), 'frame': [WL.BK_W, WL.BK_H],
               'anchor': list(WL.BK_ANCHOR), 'pxPerMetre4x': WL.BK_A, 'cycleMetres': cyc, 'kinds': WL.KINDS, 'damageDir': DMG_DIR,
               'damageMul': DMG_MUL}, open(os.path.join(out, 'meta.json'), 'w'), indent=1)

if __name__ == '__main__':
    av = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    what = av[0] if av else 'walk'
    out = av[av.index("--out") + 1] if "--out" in av else os.path.join(HERE, "..", "bake_mockup")
    os.makedirs(out, exist_ok=True); meta(out)
    print('rendered', walk(out) if what == 'walk' else damage(out))
