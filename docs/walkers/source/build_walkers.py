# build_walkers.py - builds the walker models from walker_lib.py and saves one .blend scene per walker in blend/.
#   blender -b --python build_walkers.py -- [kodiak cougar gatling avenger achilles]      (no name -> all five)
# Each scene is ready to render: the game's camera, light and outline, transparent film, standing pose, direction 0, intact.
# The damage look, walk and mask settings are the ones in walker_lib.py at the time of the build, so rebuild after changing it.
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
if HERE not in sys.path: sys.path.insert(0, HERE)
import bpy
import walker_lib as WL

def save(kind, team='#33d17a', samples=64):
    WL.build(kind, team); WL.setup_render(samples, gpu=True, outline=True)
    bpy.context.scene.cycles.device = 'GPU'              # Blender falls back to the CPU where no GPU is set up
    WL.setup_camera(1000, 1000, 160.0, 1.6)
    bob = WL.pose_legs(None); WL.apply_damage(0); WL.set_dirs(0, 0, bob); WL.set_mask_mode('beauty'); WL.set_layer('all+shadow')
    sc = bpy.context.scene
    sc['sow_walker'] = '%s; walk frames %d; damage look %s; mask gain %s' % (kind, WL.WALK_FRAMES, WL.DAMAGE_LOOK, WL.MASK_GAIN)
    path = os.path.join(HERE, 'blend', 'walker_%s.blend' % kind); os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print('SAVED', path, flush=True); return path

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in WL.KINDS] or WL.KINDS
    for k in names: save(k)
