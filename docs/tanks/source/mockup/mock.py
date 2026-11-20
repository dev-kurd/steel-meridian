# Mockup round 1 renders (the pictures on the design canvas boards).
#   python mock.py <job>                        with the bpy module (pip install bpy==5.3.0), or
#   blender -b --python mock.py -- <job>        with Blender
# Jobs: family, pairs, size, dirs, damage, damage2, mask, tracks, close, turn, maskcheck, check  (read the code below for each)
# Output: PNG files in ./out (or the folder in SOW_MOCK_OUT). Finished files are skipped. Set SOW_GPU=1 to render on the GPU.
# The 'size' job puts a Walker beside the tanks and needs walker_lib.py (repo: docs/walkers/source, PC: StateOfWar-Walkers).
import sys, time, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.dirname(HERE), os.path.join(HERE, '..', '..', '..', 'walkers', 'source'), os.path.join(HERE, '..', '..', 'StateOfWar-Walkers')):
    if os.path.isdir(_p) and _p not in sys.path: sys.path.append(os.path.abspath(_p))
import bpy, math
import sow_common as W, tank_lib as TL
OUT = os.environ.get('SOW_MOCK_OUT', os.path.join(HERE, 'out')); os.makedirs(OUT, exist_ok=True)
GPU = bool(os.environ.get('SOW_GPU'))
A4 = W.PX_PER_UNIT_1X * W.M2U * 4      # px per metre at @4x (bake scale)
def rs(smp):
    W.setup_render(smp, gpu=GPU, outline=True)
    if not GPU: bpy.context.scene.render.threads_mode = 'FIXED'; bpy.context.scene.render.threads = 2      # the cloud workspace has 2 cores
    TL.fix_outline()
def shot(name, Wd, Hd, a, zc=0.45):
    p = f'{OUT}/{name}.png'
    if os.path.exists(p): return
    W.setup_camera(Wd, Hd, a, zc); t = time.time(); W.render(p); print('RENDER', name, round(time.time() - t, 1), flush=True)
job = (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])[0]
if job == 'family':
    TL.new_scene(); ts = [TL.Tank('light', loc=(-3.25, -3.25, 0)), TL.Tank('medium', loc=(-0.75, -0.75, 0)), TL.Tank('heavy', loc=(2.45, 2.45, 0))]
    rs(32); TL.set_layer('all+shadow')
    for t in ts: t.set_dirs(1, 0)
    TL.apply_damage(0); shot('family', 1840, 700, 92.0, 0.5)
elif job == 'pairs':
    for size, a in (('light', 120.0), ('medium', 100.0), ('heavy', 82.0)):
        TL.new_scene(); T = TL.Tank(size); rs(24); TL.set_layer('all+shadow'); T.set_dirs(0, 0); TL.apply_damage(0)
        shot(f'pair_{size}', 640, 480, a)
elif job == 'size':
    import walker_lib as WL
    W = WL; TL.use_backend(WL)
    W.build('kodiak'); TL.add_to_walker_scene()
    for n in ('legs_dir', 'upper_dir'): W.S.rig[n].location = (-4.75, -4.75, 0)
    ts = [TL.Tank('heavy', loc=(-1.75, -1.75, 0)), TL.Tank('medium', loc=(1.9, 1.9, 0)), TL.Tank('light', loc=(4.9, 4.9, 0))]
    rs(48); W.set_layer('all+shadow'); TL.set_layer('all+shadow')
    W.set_dirs(1, 1, 0.0)
    for n in ('legs_dir', 'upper_dir'): W.S.rig[n].location = (-4.75, -4.75, 0)
    W.S.rig['upper'].location = (0, 0, W.U_LIFT)
    for t in ts: t.set_dirs(1, 0)
    TL.apply_damage(0)
    shot('size4x', 1040, 330, A4, 1.2)
elif job == 'dirs':
    TL.new_scene(); T = TL.Tank('heavy'); rs(24); TL.apply_damage(0)
    for d in range(0, 32, 4):
        T.set_dirs(d, d); TL.set_layer('all+shadow'); shot(f'dir_{d:02d}', 520, 400, A4 * 1.25, 0.5)
    T.set_dirs(2, 11); TL.set_layer('all+shadow'); shot('aim_a', 520, 400, A4 * 1.25, 0.5)
    T.set_dirs(30, 21); TL.set_layer('all+shadow'); shot('aim_b', 520, 400, A4 * 1.25, 0.5)
    T.set_dirs(2, 5)
    for layer in ('all+shadow', 'hull', 'turret', 'shadow'):
        TL.set_layer(layer); shot('layer_' + layer.replace('+', '_'), 520, 400, A4 * 1.5, 0.5)
elif job == 'damage':
    TL.new_scene(); T = TL.Tank('heavy'); rs(24); TL.set_layer('all+shadow'); T.set_dirs(1, 3)
    for dmg in (0, 1, 2, 3):
        TL.apply_damage(dmg); TL.set_layer('all+shadow'); shot(f'dmg_{dmg}', 560, 440, 70.0, 0.95)
elif job == 'mask':
    TL.new_scene(); T = TL.Tank('medium'); rs(32); TL.set_layer('all+shadow'); T.set_dirs(1, 0); TL.apply_damage(0)
    for mode in ('A', 'B', 'beauty'):
        W.set_mask_mode(mode); shot(f'mask_{mode}', 520, 400, 92.0, 0.45)
elif job == 'tracks':
    TL.new_scene(); T = TL.Tank('heavy'); rs(20); TL.set_layer('all+shadow'); T.set_dirs(28, 28); TL.apply_damage(0)
    for f in range(4):
        TL.set_track_frame(T, f); shot(f'track_{f}', 560, 260, 150.0, -0.15)
elif job == 'close':
    TL.new_scene(); T = TL.Tank('heavy', loc=(-2.65, 0, 0)); rs(32); TL.set_layer('all+shadow'); T.set_dirs(0, 0); TL.apply_damage(0)
    shot('close_brake', 640, 480, 330.0, 1.62)
    TL.new_scene(); T = TL.Tank('light'); rs(32); TL.set_layer('all+shadow'); T.set_dirs(13, 15); TL.apply_damage(0)
    shot('close_light', 640, 480, 200.0, 0.55)
    TL.new_scene(); T = TL.Tank('medium'); rs(32); TL.set_layer('all+shadow'); T.set_dirs(31, 2); TL.apply_damage(0)
    shot('close_medium', 640, 480, 165.0, 0.75)
elif job == 'damage2':
    for size, a in (('light', 104.0), ('medium', 84.0)):
        TL.new_scene(); T = TL.Tank(size); rs(24); TL.set_layer('all+shadow'); T.set_dirs(1, 3)
        for dmg in (1, 2):
            TL.apply_damage(dmg); TL.set_layer('all+shadow'); shot(f'dmg_{size}_{dmg}', 560, 440, a, 0.95 * 70 / a)
elif job == 'turn':
    for size, a, fw, fh in (('light', 60.0, 260, 200), ('medium', 48.0, 260, 200), ('heavy', 39.0, 260, 200)):
        TL.new_scene(); T = TL.Tank(size); rs(12); TL.apply_damage(0)
        for d in range(32):
            T.set_dirs(d, d); TL.set_layer('all+shadow'); shot(f'turn_{size}_{d:02d}', fw, fh, a, 0.45)
elif job == 'maskcheck':
    for team, hx in (('blue', '#3b82f6'), ('red', '#e5484d')):
        TL.new_scene(hx); T = TL.Tank('medium'); rs(32); TL.set_layer('all+shadow'); T.set_dirs(1, 0); TL.apply_damage(0)
        W.set_mask_mode('beauty'); shot(f'real_{team}', 520, 400, 92.0, 0.45)
elif job == 'check':
    for size in TL.SIZES:
        TL.new_scene(); T = TL.Tank(size); print('SPLIT', size, TL.split_check(T), 'objects', len(bpy.data.objects), 'pivot z (units)', round(T.d.pz * 28, 2))
print('DONE', job, flush=True)
