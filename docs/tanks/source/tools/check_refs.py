# Renders whole tanks (hull + turret + shadow in one picture) to compare with tanks rebuilt from the packed sheets.
# Step 1 of the pack check; step 2 is check_pack.py.
#
#   blender -b --python tools/check_refs.py -- [--out check_refs] [--sizes light,medium,heavy] [--weapon panzer] [--samples 48] [--cpu]
#           [--cases hull:turret:frame:state:team,...]      default: 5:0:2:0:green,12:27:1:0:blue,21:9:3:2:red
#   (in a cloud workspace with the bpy module:  python tools/check_refs.py -- ...)
#
# Writes <out>/<size>_<weapon>_h<hull>_t<turret>_f<frame>_s<state>_<team>.png and <out>/refs.json.
import sys, os, json, argparse
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path: sys.path.insert(0, HERE)
import bpy
import bake_tanks as BT
TL, W = BT.TL, BT.W

def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument('--out', default=os.path.join(HERE, 'check_refs')); p.add_argument('--sizes', default='light,medium,heavy'); p.add_argument('--weapon', default='panzer')
    p.add_argument('--cases', default='5:0:2:0:green,12:27:1:0:blue,21:9:3:2:red'); p.add_argument('--samples', type=int, default=BT.SAMPLES); p.add_argument('--cpu', action='store_true')
    a = p.parse_args(argv); a.out = os.path.abspath(a.out); os.makedirs(a.out, exist_ok=True); refs = []   # absolute: Blender resolves a relative path differently
    cases = [c.split(':') for c in a.cases.split(',') if c]
    for size in [s for s in a.sizes.split(',') if s]:
        for team in sorted(set(c[4] for c in cases)):
            T = TL.build_model(size, a.weapon, W.TEAMS[team]); dev = W.setup_render(a.samples, gpu=not a.cpu, outline=True); TL.fix_outline()
            fr = BT.frames_for(T)['wreck']; W.set_mask_mode('beauty'); T.root.location = (0, 0, 0)
            for hd, td, f, s, tm in cases:
                if tm != team: continue
                hd, td, f, s = int(hd), int(td), int(f), int(s)
                TL.apply_damage(s); TL.set_track_frame(T, f, BT.TRACK_FRAMES); T.set_dirs(hd, td)
                W.setup_camera(fr[0], fr[1], BT.A4, fr[2]); TL.set_layer('all+shadow')
                name = '%s_%s_h%02d_t%02d_f%d_s%d_%s.png' % (size, a.weapon, hd, td, f, s, team)
                W.render(os.path.join(a.out, name))
                refs.append({'file': name, 'size': size, 'weapon': a.weapon, 'hull': hd, 'turret': td, 'frame': f, 'state': s, 'team': team,
                             'frame4x': [fr[0], fr[1]], 'anchor4x': BT.anchor(fr)})
                print('REF', name, '[%s]' % dev, flush=True)
    json.dump(refs, open(os.path.join(a.out, 'refs.json'), 'w'), indent=1)
    print('REF done:', len(refs), 'renders in', a.out, flush=True)

if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
