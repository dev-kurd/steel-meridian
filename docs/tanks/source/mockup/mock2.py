# Mockup round 2 renders: Artillery, Anti-Air, Flamer and Special on the three hulls (the pictures on the design canvas boards).
#   blender -b --python mock2.py -- <job> [weapon ...]
# Jobs: check (build every tank, print the split-plane check), family, single, dirs, damage, layers, teams, close, panzer (the approved set, for comparison)
# Output: PNG files in ./out2 (or the folder in SOW_MOCK_OUT). Finished files are skipped. Renders on the GPU unless SOW_CPU is set.
import sys, time, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import bpy
import sow_common as W, tank_lib as TL
OUT = os.environ.get('SOW_MOCK_OUT', os.path.join(HERE, 'out2')); os.makedirs(OUT, exist_ok=True)
GPU = not os.environ.get('SOW_CPU')
A4 = W.PX_PER_UNIT_1X * W.M2U * 4                      # px per metre at @4x (the bake scale)
TEAMS = {'green': '#33d17a', 'blue': '#3b82f6', 'red': '#e5484d', 'orange': '#f5a524', 'purple': '#a855f7', 'cyan': '#22d3ee'}
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
job = argv[0]; WEAPONS = argv[1:] or ['artillery', 'antiair', 'flamer', 'special']
def rs(smp):
    dev = W.setup_render(smp, gpu=GPU, outline=True); TL.fix_outline(); return dev
def shot(name, Wd, Hd, a, zc=0.45):
    p = os.path.join(OUT, name + '.png')
    if os.path.exists(p): return
    W.setup_camera(Wd, Hd, a, zc); t = time.time(); W.render(p); print('RENDER', name, round(time.time() - t, 1), flush=True)
def trio(weapon, team='#33d17a'):
    """Light, Medium and Heavy of one weapon in a row, as on the round 1 family board."""
    TL.new_scene(team)
    return [TL.Tank('light', weapon, name='light', loc=(-3.25, -3.25, 0)), TL.Tank('medium', weapon, name='medium', loc=(-0.75, -0.75, 0)), TL.Tank('heavy', weapon, name='heavy', loc=(2.45, 2.45, 0))]

if job == 'check':
    for wp in WEAPONS:
        for size in TL.SIZES:
            TL.new_scene(); T = TL.Tank(size, wp)
            print('CHECK', wp, size, 'split mm', TL.split_check(T), 'objects', len(T.turc.objects), 'muzzles', [[round(c, 2) for c in m] for m in T.muzzles], flush=True)
elif job == 'family':
    for wp in WEAPONS:
        ts = trio(wp); rs(48); TL.set_layer('all+shadow')
        for t in ts: t.set_dirs(1, 0)
        TL.apply_damage(0); shot(f'family_{wp}', 2000, 900, 92.0, 1.25)
elif job == 'single':                                   # every tank on its own, larger, two views
    for wp in WEAPONS:
        for size, a in (('light', 150.0), ('medium', 122.0), ('heavy', 100.0)):
            TL.new_scene(); T = TL.Tank(size, wp); rs(48); TL.apply_damage(0); TL.set_layer('all+shadow'); a *= 0.86 if wp == 'flamer' else 1.0
            T.set_dirs(1, 1); shot(f'single_{wp}_{size}_front', 760, 820, a, 1.5)
            T.set_dirs(13, 15); shot(f'single_{wp}_{size}_back', 760, 820, a, 1.5)
elif job == 'dirs':                                     # 8 directions at the game's @4x size, turret along the hull, plus two aim poses
    for wp in WEAPONS:
        for size in TL.SIZES:
            TL.new_scene(); T = TL.Tank(size, wp); rs(32); TL.apply_damage(0); TL.set_layer('all+shadow')
            for d in range(0, 32, 4):
                T.set_dirs(d, d); shot(f'dir_{wp}_{size}_{d:02d}', 420, 440, A4, 1.5)
            T.set_dirs(2, 11); shot(f'aim_{wp}_{size}_a', 420, 440, A4, 1.5)
            T.set_dirs(30, 21); shot(f'aim_{wp}_{size}_b', 420, 440, A4, 1.5)
elif job == 'damage':
    for wp in WEAPONS:
        for size, a in (('light', 104.0), ('medium', 84.0), ('heavy', 70.0)):
            TL.new_scene(); T = TL.Tank(size, wp); rs(32); T.set_dirs(1, 3)
            for dmg in (0, 1, 2, 3):
                TL.apply_damage(dmg); TL.set_layer('all+shadow'); shot(f'dmg_{wp}_{size}_{dmg}', 560, 470, a, 1.05 * 70 / a)
elif job == 'layers':
    for wp in WEAPONS:
        TL.new_scene(); T = TL.Tank('heavy', wp); rs(32); TL.apply_damage(0); T.set_dirs(2, 5)
        for layer in ('all+shadow', 'hull', 'turret', 'shadow'):
            TL.set_layer(layer); shot(f'layer_{wp}_' + layer.replace('+', '_'), 520, 500, A4 * 1.5, 1.3)
elif job == 'teams':                                    # real renders in each team colour (Medium)
    for wp in WEAPONS:
        for team, hx in TEAMS.items():
            TL.new_scene(hx); T = TL.Tank('medium', wp); rs(32); TL.apply_damage(0); TL.set_layer('all+shadow'); T.set_dirs(1, 0)
            shot(f'team_{wp}_{team}', 520, 480, 92.0, 1.3)
elif job == 'panzer':
    ts = trio('panzer'); rs(48); TL.set_layer('all+shadow')
    for t in ts: t.set_dirs(1, 0)
    TL.apply_damage(0); shot('family_panzer', 2000, 900, 92.0, 1.25)
print('DONE', job, flush=True)
