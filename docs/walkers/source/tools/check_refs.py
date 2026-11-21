# check_refs.py - reference renders for the pack check, in the real team colour: the whole walker in one piece, and each
# layer (legs, upper) on its own.
#   blender -b --python tools/check_refs.py -- [--out check_refs] [--kinds kodiak] [--dirs 2] [--poses s,3,9] [--states 0,1,2]
# Then: python tools/check_pack.py <sheets dir> <check_refs dir>
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import walker_lib as WL
av = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opt = lambda n, d: av[av.index(n) + 1] if n in av else d
out = os.path.abspath(opt('--out', os.path.join(os.path.dirname(HERE), 'check_refs'))); os.makedirs(out, exist_ok=True)
cases = []
for k in opt('--kinds', 'kodiak').split(','):
    WL.build(k, WL.TEAMS['green']); WL.setup_render(48)
    for d in [int(x) for x in opt('--dirs', '2').split(',')]:
        for p in opt('--poses', 's,3,9').split(','):
            for s in [int(x) for x in opt('--states', '0,1,2').split(',')]:
                name = '%s_d%02d_%s_s%d.png' % (k, d, p, s)
                for layer in ('all', 'legs', 'upper'):
                    WL.shoot(os.path.join(out, name if layer == 'all' else layer + '_' + name), WL.BK_W, WL.BK_H, WL.BK_A, legs=d, torso=d,
                             layer=layer, dmg=s, mode='beauty', phase=None if p == 's' else int(p) / WL.WALK_FRAMES, zc=WL.BK_ZC)
                cases.append({'file': name, 'kind': k, 'dir': d, 'pose': p, 'state': s, 'team': 'green'})
json.dump(cases, open(os.path.join(out, 'cases.json'), 'w'), indent=1)
