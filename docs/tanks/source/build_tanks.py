# build_tanks.py - builds the tank models and saves one .blend per tank.
# Run inside Blender 5.3 (Scripting tab:  exec(open(r"<this folder>uild_tanks.py").read())  ), with Blender's Python module, or:
#   blender -b --python build_tanks.py -- [size ...] [weapon ...]
#   (no size -> all three sizes; no weapon -> panzer)      e.g.  -- artillery antiair flamer special      -- heavy flamer
# tank_data.json keeps the tanks that are not rebuilt.
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
if HERE not in sys.path: sys.path.insert(0, HERE)
import importlib, sow_common, tank_lib
importlib.reload(sow_common); importlib.reload(tank_lib)
import tank_lib as TL

def build_all(sizes=None, weapons=None, team='#33d17a'):
    jp = os.path.join(HERE, 'tank_data.json'); out = {}
    if os.path.exists(jp):
        with open(jp) as f: out = json.load(f)
    for weapon in (weapons or ['panzer']):
        for size in (sizes or TL.SIZES):
            T = TL.build_model(size, weapon, team)
            path = TL.save_blend(T, os.path.join(HERE, 'blend', f'tank_{size}_{weapon}.blend'))
            out[f'{size}_{weapon}'] = TL.tank_data(T); print('SAVED', path, out[f'{size}_{weapon}']['split_plane_check_mm'], flush=True)
    with open(jp, 'w') as f: json.dump(out, f, indent=1)
    return out

if __name__ == '__main__':
    build_all([a for a in sys.argv[1:] if a in TL.SIZES] or None, [a for a in sys.argv[1:] if a in TL.WEAPONS] or None)
