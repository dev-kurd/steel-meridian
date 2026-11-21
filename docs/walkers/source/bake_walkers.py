# bake_walkers.py - the walker bake, run from the command line (replaces the Blender listener jobs of 2026-11-19).
#
#   blender -b --python bake_walkers.py -- [--out bake] [--only legs,upper,legshadow,extras,wreck] [--kinds kodiak,cougar]
#                                           [--dirs 2,10] [--states 0,1,2]
#
# Everything is rendered by default: 32 directions, 12 walk frames + standing, 3 states, all five walkers = 4,232 renders.
# Renders skip files that already exist, so a bake can be stopped and started again. Files and layers: see ../README.md.
# Team mask: every legs and upper frame is rendered twice, A (paint black, lights off) and B (paint red, lights green at
# walker_lib.MASK_GAIN brightness); tools/pack.py turns the pair into the mask.
import sys, os, json, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import walker_lib as WL

def opt(av, name, default):
    return av[av.index(name) + 1] if name in av else default

def main(av):
    out = os.path.abspath(opt(av, '--out', os.path.join(HERE, 'bake')))
    only = opt(av, '--only', 'legs,upper,legshadow,extras,wreck').split(',')
    kinds = opt(av, '--kinds', ','.join(WL.KINDS)).split(',')
    dirs = [int(d) for d in opt(av, '--dirs', '').split(',') if d] or list(range(32))
    states = tuple(int(s) for s in opt(av, '--states', '0,1,2').split(','))
    wdirs = [d for d in range(0, 32, 4) if d in dirs] or dirs[:1]                # wrecks: 8 directions
    os.makedirs(out, exist_ok=True)
    json.dump(WL.bake_tables(), open(os.path.join(out, 'tables.json'), 'w'))
    t0 = time.time(); total = 0
    def step(name, fn, samples):
        nonlocal total
        t = time.time(); print('device', WL.setup_render(samples)); n = fn(); total += n
        print('== %-22s %5d renders %7.1f s (total %d, %.0f min)' % (name, n, time.time() - t, total, (time.time() - t0) / 60), flush=True)
    if 'legs' in only or 'legshadow' in only:
        WL.build(kinds[0])                                                        # the legs are the same for all five walkers
        if 'legs' in only: step('legs', lambda: WL.bake_legs(out, dirs, states), 48)
        if 'legshadow' in only: step('legs shadow', lambda: WL.bake_leg_shadows(out, dirs), 32)
    for k in kinds:
        if not ({'upper', 'extras', 'wreck'} & set(only)): break
        WL.build(k)
        if 'upper' in only: step('upper ' + k, lambda: WL.bake_upper(out, k, dirs, states), 48)
        if 'wreck' in only: step('wreck ' + k, lambda: WL.bake_wrecks(out, k, wdirs), 48)
        if 'extras' in only: step('shadows ' + k, lambda: WL.bake_extras(out, k, dirs), 32)
    print('done: %d renders in %.1f min -> %s' % (total, (time.time() - t0) / 60, out))

if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
