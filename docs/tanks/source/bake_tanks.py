# bake_tanks.py - bakes the tank models to sprite frames (PNG at @4x) for packing into sheets.
#
# Run it with Blender 5.3, without the window (bake_panzer.bat does this):
#     blender.exe -b --python bake_tanks.py
#     blender.exe -b --python bake_tanks.py -- --sizes heavy --only hull,turret        (options go after the "--")
# or inside Blender (Scripting tab, Python console; the window is busy until it ends):
#     exec(open(r"C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks\bake_tanks.py").read()); bake_all()
#
# Finished files are skipped, so a stopped bake can simply be started again. Output: bake/ (frames), bake/tables.json, bake/progress.txt,
# and bake/BAKE_DONE when everything asked for is there.
#
#   hull/<size>/s<state>/d<dd>_f<frame>_<A|B>.png     32 directions x 4 track frames x 3 states (0 intact, 1 damaged, 2 burning)
#   turret/<size>/<weapon>/s<state>/d<dd>_<A|B>.png   32 directions x 3 states
#   shadow/hull/<size>/d<dd>.png                      ground shadow of the hull
#   shadow/turret/<size>/<weapon>/d<dd>.png           ground shadow of the turret (it stands at its real height)
#   wreck/<size>/<weapon>/d<dd>.png                   16 directions (0, 2, .. 30): charred hull + turret askew + its shadow, no team colour
# A = everything that is not team coloured, B = paint red and team lights green at MASK_GAIN brightness; (B - A) / MASK_GAIN is the team mask.
# B is rendered dark (as bright as a real paint) so paint highlights are not cut off at 1.0 and light bouncing between painted parts
# is as strong as in the real colours; the packer moves the part of the mask above 1.0 into the base sprite.
# The hull and the turret are rendered separately, each with a stand-in for the other (tank_lib.turret_proxies), never moved from their real place.
import sys, os, json, time, math
HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r"C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Tanks"
if HERE not in sys.path: sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
import sow_common as W, tank_lib as TL

MUL = 4
A4 = W.PX_PER_UNIT_1X * W.M2U * MUL          # px per metre at @4x (the Walkers' bake scale: 38.798)
TRACK_FRAMES = 4
MASK_GAIN = 0.2                               # brightness of the red paint and green lights in the B renders (about a real paint's brightness)
SAMPLES, SHADOW_SAMPLES = 48, 32
STATES = (0, 1, 2)
WRECK_DIRS = tuple(range(0, 32, 2))
SUN_REACH = 0.75                              # how far a shadow reaches sideways per metre of height (sun direction), plus its soft edge
FIRE_PTS = lambda d: [(-d.L * 0.345, 0.0, d.H + 1.3 * TL.K), (d.L * 0.12, d.uw * 0.3, d.H), (-d.L * 0.38, -d.uw * 0.55, d.H)]   # where smoke and flames sit (Blender axes)

def _r16(v): return int(math.ceil(v / 16.0) * 16)
def frame(r, top, pad=6):
    """Frame for something that can face any direction: r = its largest horizontal reach from the anchor (m), top = its height above it (m).
    Returns (W, H, zc) for sow_common.setup_camera; the anchor lands at (W / 2, H / 2 + zc * A4 * 4 / 3)."""
    hw = r * math.sqrt(2) * A4; up = top * A4 * 4 / 3 + hw / 2; dn = hw / 2
    Wd = _r16(2 * hw + 2 * pad); Hd = _r16(up + dn + 2 * pad); ay = round(pad + up + (Hd - (up + dn + 2 * pad)) / 2)   # anchor on a whole pixel
    return Wd, Hd, (ay - Hd / 2) / (A4 * 4 / 3)
def anchor(fr): return [fr[0] / 2.0, fr[1] / 2.0 + fr[2] * A4 * 4 / 3]

def _reach(coll, origin):
    """Largest horizontal distance from origin and the highest point above it, over a collection's meshes."""
    bpy.context.view_layer.update(); r = 0.0; top = 0.0
    for ob in coll.objects:
        if ob.type != 'MESH' or ob.get('catcher') or ob.get('proxy'): continue
        M = ob.matrix_world
        for v in ob.data.vertices:
            p = M @ v.co; r = max(r, math.hypot(p.x - origin[0], p.y - origin[1])); top = max(top, p.z - origin[2])
    return r, top

def frames_for(T):
    """Frame sizes for one tank, measured from the model so every direction fits."""
    d = T.d; T.root.location = (0, 0, 0); T.set_dirs(0, 0)
    hr, ht = _reach(T.hullc, (0, 0, 0)); tr, tt = _reach(T.turc, (d.pvx, 0, d.pz))
    wr = max(hr, abs(d.pvx) + 0.15 + tr)
    return {'hull': frame(hr, ht), 'turret': frame(tr, tt), 'shadow_hull': frame(hr + ht * SUN_REACH + 0.2, 0.0),
            'shadow_turret': frame(tr + (d.pz + tt) * SUN_REACH + 0.2, 0.0), 'wreck': frame(wr + (d.pz + tt) * SUN_REACH + 0.2, d.pz + tt)}

def _px(x, y, z):
    """Blender point (m) -> sprite offset in @1x px (x right, y down) from the anchor."""
    a = A4 / MUL; return [round(a * (x + y), 3), round(a * ((x - y) / 2 - z * 4 / 3), 3)]
def _rot(p, ang): c, s = math.cos(ang), math.sin(ang); return (p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2])

def tables_for(T, fr):
    d = T.d; t = {'frames4x': {k: [v[0], v[1]] for k, v in fr.items()}, 'anchors4x': {k: [round(c, 3) for c in anchor(v)] for k, v in fr.items()}}
    t['turretPivot1x'] = [_px(*_rot((d.pvx, 0, d.pz), -h * math.tau / 32)) for h in range(32)]          # turret sprite position, from the hull position
    t['turretGround1x'] = [_px(*_rot((d.pvx, 0, 0), -h * math.tau / 32)) for h in range(32)]            # turret shadow position
    t['muzzles1x'] = [[_px(*_rot(m, -td * math.tau / 32)) for m in T.muzzles] for td in range(32)]        # from the turret sprite position
    t['firePoints1x'] = [[_px(*_rot(p, -h * math.tau / 32)) for p in FIRE_PTS(d)] for h in range(32)]     # from the hull position
    t['data'] = TL.tank_data(T)
    return t

class Bake:
    def __init__(self, out, sizes, weapon, only, dirs, states, frames, samples, gpu, team):
        self.out = out; self.sizes = sizes; self.weapon = weapon; self.only = only; self.dirs = dirs; self.states = states
        self.frames = frames; self.samples = samples; self.gpu = gpu; self.team = team
        self.n = 0; self.skipped = 0; self.t0 = time.time(); self.mode = None; self.device = '?'
        os.makedirs(out, exist_ok=True)
    def total(self):
        nd = len(self.dirs); n = 0
        for _ in self.sizes:
            if 'hull' in self.only: n += nd * len(self.frames) * len(self.states) * 2
            if 'turret' in self.only: n += nd * len(self.states) * 2
            if 'shadow' in self.only: n += nd * 2
            if 'wreck' in self.only: n += len([w for w in WRECK_DIRS if w in self.dirs])
        return n
    def note(self, msg=''):
        done = self.n + self.skipped; tot = self.total(); dt = time.time() - self.t0
        eta = (tot - done) * (dt / self.n) if self.n else 0
        line = '%d / %d sprites (%d rendered now, %d already there) - %.1f s each - about %d min left %s' % (done, tot, self.n, self.skipped, dt / max(1, self.n), eta / 60, msg)
        with open(os.path.join(self.out, 'progress.txt'), 'w') as f: f.write(line + '\n' + time.ctime() + '\ndevice: ' + self.device + '\n')
        print('BAKE', line, '[%s]' % self.device, flush=True)
    def scene(self, size, samples):
        T = TL.build_model(size, self.weapon, self.team)
        self.device = W.setup_render(samples, gpu=self.gpu, outline=True); TL.fix_outline(); self.mode = None
        return T
    def set_mode(self, mode):
        if mode != self.mode: W.set_mask_mode(mode, MASK_GAIN); self.mode = mode
    def shoot(self, rel, fr, layer, at=(0.0, 0.0, 0.0)):
        """at: the world point (m) that lands on the frame's anchor. The camera moves, never the tank: the paint's dust depends on real height."""
        path = os.path.join(self.out, rel)
        if os.path.exists(path): self.skipped += 1; return
        os.makedirs(os.path.dirname(path), exist_ok=True)
        W.setup_camera(fr[0], fr[1], A4, fr[2]); W.S.rig['cam'].location += Vector(at)
        TL.set_layer(layer); W.render(path); self.n += 1
        if self.n % 20 == 0 or self.n == 1: self.note()
    def run(self):
        print('BAKE starting: %d sprites wanted, output folder %s' % (self.total(), self.out), flush=True)
        tables = {}
        tb = os.path.join(self.out, 'tables.json')
        if os.path.exists(tb): tables = json.load(open(tb))
        for size in self.sizes:
            T = self.scene(size, self.samples); d = T.d; wp = self.weapon; fr = frames_for(T)
            tables['%s_%s' % (size, wp)] = tables_for(T, fr)
            tables['track'] = {'frames': TRACK_FRAMES, 'travelModelUnitsPerFrame': round(TL.PITCH * W.M2U / TRACK_FRAMES, 4),
                               'travelGameUnitsPerFrame': round(TL.PITCH * W.M2U * 0.4 / TRACK_FRAMES, 4)}
            tables['bake'] = {'pxPerMetre4x': A4, 'maskGain': MASK_GAIN, 'directions': 32, 'states': ['intact', 'damaged', 'burning'], 'wreckDirections': list(WRECK_DIRS)}
            json.dump(tables, open(tb, 'w'), indent=1)
            if 'hull' in self.only:
                T.root.location = (0, 0, 0)
                for dmg in self.states:
                    TL.apply_damage(dmg)
                    for mode in ('A', 'B'):                      # mode outermost: changing the paint colour forces a slow shader update
                        self.set_mode(mode)
                        for dd in self.dirs:
                            T.set_dirs(dd, dd)
                            for f in self.frames:
                                TL.set_track_frame(T, f, TRACK_FRAMES)
                                self.shoot('hull/%s/s%d/d%02d_f%d_%s.png' % (size, dmg, dd, f, mode), fr['hull'], 'hull')
                TL.set_track_frame(T, 0, TRACK_FRAMES)
            if 'turret' in self.only:
                T.root.location = (0, 0, 0)
                for dmg in self.states:
                    TL.apply_damage(dmg)
                    for mode in ('A', 'B'):
                        self.set_mode(mode)
                        for dd in self.dirs:
                            T.set_dirs(0, dd)                    # the turret pivot lands on the anchor
                            self.shoot('turret/%s/%s/s%d/d%02d_%s.png' % (size, wp, dmg, dd, mode), fr['turret'], 'turret', at=(d.pvx, 0, d.pz))
            if 'wreck' in self.only:
                T.root.location = (0, 0, 0); TL.apply_damage(3); self.set_mode('A')
                for dd in WRECK_DIRS:
                    if dd not in self.dirs: continue
                    T.set_dirs(dd, dd, wreck=True)
                    self.shoot('wreck/%s/%s/d%02d.png' % (size, wp, dd), fr['wreck'], 'all+shadow')
            if 'shadow' in self.only:
                bpy.context.scene.cycles.samples = SHADOW_SAMPLES
                TL.apply_damage(0); self.set_mode('beauty'); T.root.location = (0, 0, 0)
                for dd in self.dirs:
                    T.set_dirs(dd, dd); self.shoot('shadow/hull/%s/d%02d.png' % (size, dd), fr['shadow_hull'], 'shadow_hull')
                for dd in self.dirs:                             # the turret at its real height, the point under its pivot on the anchor
                    T.set_dirs(0, dd); self.shoot('shadow/turret/%s/%s/d%02d.png' % (size, wp, dd), fr['shadow_turret'], 'shadow_turret', at=(d.pvx, 0, 0))
            self.note('(%s done)' % size)
        full = self.dirs == list(range(32)) and set(self.only) == {'hull', 'turret', 'shadow', 'wreck'} and list(self.states) == list(STATES)
        if full:
            with open(os.path.join(self.out, 'BAKE_DONE_' + '_'.join(self.sizes) + '_' + self.weapon), 'w') as f: f.write(time.ctime())
            if list(self.sizes) == list(TL.SIZES):
                with open(os.path.join(self.out, 'BAKE_DONE'), 'w') as f: f.write(time.ctime())
        self.note('FINISHED in %.0f min' % ((time.time() - self.t0) / 60))

def bake_all(sizes=None, weapon='panzer', only=('hull', 'turret', 'shadow', 'wreck'), dirs=None, states=STATES, frames=None, samples=SAMPLES,
             gpu=True, team='#33d17a', out=None):
    out = os.path.abspath(out) if out else os.path.join(HERE, 'bake')     # Blender resolves a relative render path differently from Python
    b = Bake(out, list(sizes or TL.SIZES), weapon, list(only), list(dirs if dirs is not None else range(32)),
             list(states), list(frames if frames is not None else range(TRACK_FRAMES)), samples, gpu, team)
    b.run(); return b

def _cli(argv):
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--sizes', default=''); p.add_argument('--weapon', default='panzer'); p.add_argument('--only', default='hull,turret,shadow,wreck')
    p.add_argument('--dirs', default=''); p.add_argument('--states', default='0,1,2'); p.add_argument('--frames', default='')
    p.add_argument('--samples', type=int, default=SAMPLES); p.add_argument('--cpu', action='store_true'); p.add_argument('--out', default='')
    a = p.parse_args(argv)
    ints = lambda s: [int(x) for x in s.split(',') if x != '']
    bake_all(sizes=[s for s in a.sizes.split(',') if s] or None, weapon=a.weapon, only=[s for s in a.only.split(',') if s], dirs=ints(a.dirs) or None,
             states=ints(a.states), frames=ints(a.frames) or None, samples=a.samples, gpu=not a.cpu, out=a.out or None)

if __name__ == '__main__' and ('-b' in sys.argv or '--background' in sys.argv or not hasattr(bpy.app, 'binary_path') or not bpy.app.binary_path or os.environ.get('SOW_BAKE_CLI')):
    _cli(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
