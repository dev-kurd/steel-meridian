# build_tanks.py - builds the tank models and saves one .blend per tank.
# Run inside Blender 5.3 (Scripting tab:  exec(open(r"<this folder>\build_tanks.py").read())  ) or with Blender's Python module:
#   python build_tanks.py            -> all sizes
#   python build_tanks.py heavy      -> one size
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
if HERE not in sys.path: sys.path.insert(0, HERE)
import importlib, sow_common, tank_lib
importlib.reload(sow_common); importlib.reload(tank_lib)
import tank_lib as TL

def build_all(sizes=None, weapon='panzer', team='#33d17a'):
    out = {}
    for size in (sizes or TL.SIZES):
        T = TL.build_model(size, weapon, team)
        path = TL.save_blend(T, os.path.join(HERE, 'blend', f'tank_{size}_{weapon}.blend'))
        out[f'{size}_{weapon}'] = TL.tank_data(T); print('SAVED', path, out[f'{size}_{weapon}']['split_plane_check_mm'], flush=True)
    with open(os.path.join(HERE, 'tank_data.json'), 'w') as f: json.dump(out, f, indent=1)
    return out

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a in TL.SIZES]
    build_all(args or None)
