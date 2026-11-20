# tank_lib.py - State of War Game tanks: procedural Blender model (Blender 5.3). Three chassis (Light, Medium, Heavy) + Panzer turret.
# Mockup round 1 approved 2026-11-19. Colours, base materials, mesh helpers, world, camera and render setup come from sow_common.py.
# Axes: +X forward, Z up, metres. The game's y axis is Blender's -Y. Sizes follow tank-types.md (1.0 = 64 model units, 28 units = 1 m).
import bpy, bmesh, math, os, json
from types import SimpleNamespace as NS
from mathutils import Vector, Matrix
import sow_common as W
from sow_common import S, m_box, m_prism, m_cyl, lin, hex2rgb, add, empty

def use_backend(mod):
    """Build on another module's scene state instead of sow_common's (walker_lib, to put tanks in a scene with a walker)."""
    g = globals(); g['W'] = mod
    for n in ('S', 'm_box', 'm_prism', 'm_cyl', 'lin', 'hex2rgb', 'add', 'empty'): g[n] = getattr(mod, n)
    S.tanks = []

K = 1.0 / W.M2U          # metres per model unit
UNIT = 64.0
SIZES = ['light', 'medium', 'heavy']
RAW = {'light': (1.0, 0.7, 0.35, 4, 0), 'medium': (1.3, 0.9, 0.45, 5, 1), 'heavy': (1.6, 1.15, 0.55, 6, 1)}
PANZER = {'light': (1, 0.52, 0.028, 0.24), 'medium': (2, 0.54, 0.029, 0.25), 'heavy': (3, 0.62, 0.031, 0.26)}
BARREL_FAT = 1.18        # barrels a little thicker than the vector model so they read at game size
PITCH = 2.5 * K          # track link pitch
S.tanks = []

def dims(size):
    l, w, h, nw, pods = RAW[size]
    L, Wd, H = l * UNIT * K, w * UNIT * K, h * UNIT * K
    tw = Wd * (0.2 if size == 'heavy' else 0.22); th = H * 0.6; hw = Wd / 2 - tw
    podr = H * (0.165 if size == 'heavy' else 0.15)
    uw = Wd / 2 - 0.5 * K if size == 'light' else Wd / 2 - 2 * podr - 1.0 * K
    podz = th + H * 0.11 + podr
    podtop = podz + podr if pods else 0.0
    pz = max(H + 1.6 * K, podtop + 1.4 * K)
    return NS(size=size, L=L, W=Wd, H=H, tw=tw, th=th, hw=hw, uw=uw, podr=podr, podz=podz, pz=pz, pvx=-L * 0.06, nw=nw, pods=pods)

# ------------------------------------------------------------------ materials added to the walker set
def extra_materials():
    m = S.mats; up = S.paint_srgb
    m['paintp'] = W.make_metal('paintp', lin(up), 0.5, 0.42, 'paint', 1.0)                  # thin painted plates (no rounded-edge rub)
    m['rubber'] = W.make_metal('rubber', lin(hex2rgb('#1a1d21')), 0.0, 0.82, 'steel', 0.05)
    m['track'] = W.make_metal('track', lin(hex2rgb('#4d555e')), 0.85, 0.5, 'steel', 1.0)
    m['olive'] = W.make_metal('olive', lin(hex2rgb('#596142')), 0.1, 0.6, 'steel', 0.8)
    m['canvas'] = W.make_metal('canvas', lin(hex2rgb('#7d7458')), 0.0, 0.85, 'steel', 0.3)
    m['glass'] = W.make_metal('glass', lin(hex2rgb('#1f4450')), 0.7, 0.1, 'steel', 0.05)
    m['lamp'] = W.make_glow('lamp', lin(hex2rgb('#fff0c4')), 1.5)
    m['tail'] = W.make_glow('tail', lin(hex2rgb('#ff3626')), 1.8)

def make_metal_t(name, color, metallic, rough, role='steel', wear=1.0, coat=0.0, round_edges=0.0, cracks=1.0, embers=1.0):
    """walker_lib.make_metal with the tanks' damage look: large black soot with a smoky tint round it, cracked plates,
    and only a few glowing embers. Identical to the Walkers' shader when DMG = 0."""
    _nt, _mix_rgb, _math, _ramp, _noise, CHAR = W._nt, W._mix_rgb, W._math, W._ramp, W._noise, W.CHAR
    mat = bpy.data.materials.new(name); nt = _nt(mat)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    dmg = nt.nodes.new('ShaderNodeValue'); dmg.name = 'DMG'; dmg.outputs[0].default_value = 0.0
    col = nt.nodes.new('ShaderNodeRGB'); col.name = 'BASE'; col.outputs[0].default_value = (*color, 1)
    tc = nt.nodes.new('ShaderNodeTexCoord'); P = tc.outputs['Object']
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    bev = nt.nodes.new('ShaderNodeBevel'); bev.samples = 6; bev.inputs['Radius'].default_value = 0.035
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    nt.links.new(bev.outputs[0], dot.inputs[0]); nt.links.new(geo.outputs['Normal'], dot.inputs[1])
    edge = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', 1.0, dot.outputs['Value']), 5.0, clamp=True)
    nfine = _noise(nt, P, 26.0, 4.0, 0.6); nmid = _noise(nt, P, 7.0, 3.0, 0.55); nbig = _noise(nt, P, 2.3, 2.0, 0.5)
    soft = None
    if round_edges > 0:
        aoi = nt.nodes.new('ShaderNodeAmbientOcclusion'); aoi.samples = 8; aoi.inside = True; aoi.only_local = True; aoi.inputs['Distance'].default_value = round_edges
        soft = _ramp(nt, _math(nt, 'SUBTRACT', 1.0, aoi.outputs['AO']), 0.05, 0.3)
        edge = _math(nt, 'MAXIMUM', edge, _math(nt, 'MULTIPLY', soft, 0.85))
    edge_n = _math(nt, 'MULTIPLY', edge, _math(nt, 'ADD', _math(nt, 'MULTIPLY', nmid, 0.9), 0.55))
    wear_amt = _math(nt, 'ADD', 0.9 * wear, _math(nt, 'MULTIPLY', dmg.outputs[0], 0.3))
    chips = _math(nt, 'MULTIPLY', _ramp(nt, edge_n, 0.42, 0.7), wear_amt, clamp=True)
    spots = _math(nt, 'MULTIPLY', _ramp(nt, nfine, 0.7, 0.74), _ramp(nt, nmid, 0.55, 0.68))
    spots = _math(nt, 'MULTIPLY', spots, _math(nt, 'ADD', 0.6 * wear, _math(nt, 'MULTIPLY', dmg.outputs[0], 0.5)), clamp=True)
    chips = _math(nt, 'MAXIMUM', chips, spots)
    dings = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', _ramp(nt, nfine, 0.6, 0.64), _ramp(nt, nmid, 0.5, 0.58)), _ramp(nt, dmg.outputs[0], 0.2, 1.2))
    chips = _math(nt, 'MAXIMUM', chips, _math(nt, 'MULTIPLY', dings, 0.6))
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 8; ao.inputs['Distance'].default_value = 0.34
    cav = _math(nt, 'SUBTRACT', 1.0, _ramp(nt, ao.outputs['AO'], 0.12, 0.8))
    cav = _math(nt, 'MULTIPLY', cav, _math(nt, 'ADD', 0.55, _math(nt, 'MULTIPLY', nmid, 0.6)), clamp=True)
    c0 = _mix_rgb(nt, _math(nt, 'MULTIPLY', _ramp(nt, nbig, 0.35, 0.8), 0.42 * wear), col.outputs[0], (0.02, 0.02, 0.02, 1))
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (7.0, 7.0, 0.45); nt.links.new(P, mp.inputs['Vector'])
    streak = _math(nt, 'MULTIPLY', _ramp(nt, _noise(nt, mp.outputs[0], 1.0, 3.0, 0.6), 0.5, 0.75), 0.3 * wear)
    c0 = _mix_rgb(nt, streak, c0, (0.06, 0.05, 0.04, 1))
    c1 = _mix_rgb(nt, _math(nt, 'MULTIPLY', cav, 0.92), c0, (0.02, 0.018, 0.016, 1))
    sepz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sepz.inputs[0])
    dust = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', 1.0, _ramp(nt, sepz.outputs['Z'], 0.02, 0.7)), _math(nt, 'ADD', 0.35, _math(nt, 'MULTIPLY', nmid, 0.9)), clamp=True)
    c1 = _mix_rgb(nt, _math(nt, 'MULTIPLY', dust, 0.5), c1, (0.105, 0.08, 0.052, 1))
    # ---- damage: black soot cores that grow with damage, a wide smoky tint round them, cracked plates
    D = dmg.outputs[0]; on = _ramp(nt, D, 0.2, 1.0); wreck = _ramp(nt, D, 2.4, 3.0)
    soot_t = _math(nt, 'SUBTRACT', _math(nt, 'SUBTRACT', 0.69, _math(nt, 'MULTIPLY', D, 0.055)), _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', D, D), 0.02))   # burning is much sootier than damaged
    nsoot = _noise(nt, P, 2.6, 4.0, 0.6)
    ds = _math(nt, 'SUBTRACT', nsoot, soot_t)
    soot = _math(nt, 'MULTIPLY', _ramp(nt, ds, -0.03, 0.07), on)
    halo = _math(nt, 'MULTIPLY', _ramp(nt, ds, -0.24, 0.02), on)
    soot = _math(nt, 'MAXIMUM', soot, _math(nt, 'MULTIPLY', wreck, _math(nt, 'ADD', 0.9, _math(nt, 'MULTIPLY', nbig, 0.14)), clamp=True))
    c2 = _mix_rgb(nt, _math(nt, 'MULTIPLY', halo, 0.66), c1, (0.04, 0.034, 0.03, 1))            # smoky tint
    c2 = _mix_rgb(nt, soot, c2, (*CHAR, 1))                                                    # black core
    vor = nt.nodes.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; nt.links.new(P, vor.inputs['Vector'])
    vor.inputs['Scale'].default_value = 3.4
    wob = nt.nodes.new('ShaderNodeVectorMath'); wob.operation = 'ADD'                           # wobble the cells a little so the cracks are not straight
    nw = nt.nodes.new('ShaderNodeTexNoise'); nt.links.new(P, nw.inputs['Vector']); nw.inputs['Scale'].default_value = 9.0
    sc = nt.nodes.new('ShaderNodeVectorMath'); sc.operation = 'SCALE'; nt.links.new(nw.outputs['Color'], sc.inputs[0]); sc.inputs['Scale'].default_value = 0.05
    nt.links.new(P, wob.inputs[0]); nt.links.new(sc.outputs[0], wob.inputs[1]); nt.links.new(wob.outputs[0], vor.inputs['Vector'])
    line = _math(nt, 'SUBTRACT', 1.0, _ramp(nt, vor.outputs['Distance'], 0.018, 0.05))          # 1 on a crack (wide enough to show at game size)
    lip = _math(nt, 'SUBTRACT', _math(nt, 'SUBTRACT', 1.0, _ramp(nt, vor.outputs['Distance'], 0.05, 0.1)), line, clamp=True)
    lip = _math(nt, 'MULTIPLY', lip, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MAXIMUM', soot, _math(nt, 'MULTIPLY', halo, 0.7)), clamp=True))   # no light lip on soot or on a wreck
    where = _math(nt, 'ADD', _math(nt, 'MULTIPLY', halo, 1.25), _math(nt, 'MULTIPLY', _ramp(nt, nbig, 0.45, 0.62), 0.6), clamp=True)
    where = _math(nt, 'MULTIPLY', where, _ramp(nt, D, 0.5, 1.7))
    where = _math(nt, 'MAXIMUM', where, _math(nt, 'MULTIPLY', wreck, 0.85))
    crack = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', line, where), cracks, clamp=True)
    c2 = _mix_rgb(nt, _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', lip, where), 0.3 * cracks), c2, (0.3, 0.31, 0.32, 1))   # paint worn thin beside a crack
    c2 = _mix_rgb(nt, crack, c2, (0.006, 0.005, 0.005, 1))
    bare = (0.56, 0.59, 0.63, 1) if role == 'paint' else (0.74, 0.76, 0.8, 1)
    chips_live = _math(nt, 'MULTIPLY', chips, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MAXIMUM', _math(nt, 'MULTIPLY', soot, 0.9), _math(nt, 'MULTIPLY', halo, 0.5))))
    chips_live = _math(nt, 'MULTIPLY', chips_live, _math(nt, 'SUBTRACT', 1.0, crack))
    if soft is not None:
        c2 = _mix_rgb(nt, _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', soft, 0.4 * wear), _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MAXIMUM', soot, halo))), c2, (0.55, 0.57, 0.55, 1), 'SCREEN')
    c3 = _mix_rgb(nt, chips_live, c2, bare)
    nt.links.new(c3, bsdf.inputs['Base Color'])
    met = _math(nt, 'ADD', metallic, _math(nt, 'MULTIPLY', chips_live, 1.0 - metallic))
    r = _math(nt, 'ADD', rough, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', nbig, 0.5), 0.14))
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', soot, 0.4))
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', halo, 0.22))
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', dust, 0.3))
    met = _math(nt, 'MULTIPLY', met, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', dust, 0.6)))
    met = _math(nt, 'MULTIPLY', met, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', halo, 0.5)))
    nt.links.new(met, bsdf.inputs['Metallic'])
    r = _math(nt, 'SUBTRACT', r, _math(nt, 'MULTIPLY', chips_live, 0.1), clamp=True)
    nt.links.new(r, bsdf.inputs['Roughness'])
    if coat: bsdf.inputs['Coat Weight'].default_value = coat; bsdf.inputs['Coat Roughness'].default_value = 0.25
    bump = nt.nodes.new('ShaderNodeBump'); bump.invert = True; bump.inputs['Strength'].default_value = 0.9; bump.inputs['Distance'].default_value = 0.02
    nt.links.new(crack, bump.inputs['Height']); nt.links.new(bev.outputs[0], bump.inputs['Normal']); nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    # a few glowing embers on the rim of some soot patches while burning (off on a wreck)
    band = _math(nt, 'MULTIPLY', _ramp(nt, ds, 0.012, 0.024), _math(nt, 'SUBTRACT', 1.0, _ramp(nt, ds, 0.028, 0.045)))
    burn = _math(nt, 'MULTIPLY', band, _math(nt, 'MULTIPLY', _ramp(nt, D, 1.5, 2.0), _math(nt, 'SUBTRACT', 1.0, wreck)))
    burn = _math(nt, 'MULTIPLY', burn, _math(nt, 'MULTIPLY', _ramp(nt, nbig, 0.6, 0.7), _ramp(nt, nmid, 0.45, 0.6)))
    bsdf.inputs['Emission Color'].default_value = (1.0, 0.24, 0.03, 1)
    nt.links.new(_math(nt, 'MULTIPLY', burn, 3.0 * embers), bsdf.inputs['Emission Strength'])
    mat['role'] = role; mat['shade'] = 1.0
    return mat

def tank_materials(team_hex='#33d17a'):
    """The tank material set (same names, colours and intact look as the Walkers' set, with the tanks' damage look)."""
    T = hex2rgb(team_hex); up = W.unit_paint(T); S.team = team_hex; S.scheme = 'paint'
    S.paint_srgb = up; S.glow_srgb = W.mixc(up, (1, 1, 1), 0.5)
    m = S.mats; MM = make_metal_t
    m['paint'] = MM('paint', lin(up), 0.5, 0.42, 'paint', 1.0, round_edges=0.085)
    m['paint2'] = MM('paint2', lin(tuple(c * 0.8 for c in up)), 0.5, 0.46, 'paint', 0.9); m['paint2']['shade'] = 0.8
    m['paintp'] = MM('paintp', lin(up), 0.5, 0.42, 'paint', 1.0)
    m['steel'] = MM('steel', lin(hex2rgb('#6f7a87')), 0.9, 0.4, 'steel', 0.9, cracks=0.3, embers=0.2)
    m['dark'] = MM('dark', lin(hex2rgb('#3a424c')), 0.8, 0.42, 'steel', 0.7, cracks=0.3, embers=0.2)
    m['black'] = MM('black', lin(hex2rgb('#15181d')), 0.3, 0.6, 'steel', 0.3, cracks=0.0, embers=0.0)
    m['bright'] = MM('bright', lin(hex2rgb('#c3cbd3')), 0.95, 0.24, 'steel', 0.5, cracks=0.0, embers=0.0)
    m['emblem'] = MM('emblem', lin(hex2rgb('#d9dfe4')), 0.1, 0.5, 'steel', 1.0, embers=0.0)
    m['rubber'] = MM('rubber', lin(hex2rgb('#1a1d21')), 0.0, 0.82, 'steel', 0.05, cracks=0.0, embers=0.0)
    m['track'] = MM('track', lin(hex2rgb('#4d555e')), 0.85, 0.5, 'steel', 1.0, cracks=0.0, embers=0.0)
    m['olive'] = MM('olive', lin(hex2rgb('#596142')), 0.1, 0.6, 'steel', 0.8, embers=0.3)
    m['canvas'] = MM('canvas', lin(hex2rgb('#7d7458')), 0.0, 0.85, 'steel', 0.3, cracks=0.0, embers=0.3)
    m['glass'] = MM('glass', lin(hex2rgb('#1f4450')), 0.7, 0.1, 'steel', 0.05, cracks=0.6, embers=0.0)
    m['glow'] = W.make_glow('glow', lin(S.glow_srgb), 1.0, 'light')
    m['lamp'] = W.make_glow('lamp', lin(hex2rgb('#fff0c4')), 1.5)
    m['tail'] = W.make_glow('tail', lin(hex2rgb('#ff3626')), 1.8)
    return m

# ------------------------------------------------------------------ small helpers (everything goes to the current collection S.cur)
def _tag(ob, lost):
    if lost: ob['lostat'] = lost
    return ob
def B(name, x0, x1, y0, y1, z0, z1, mat, par, bev=0.008, seg=2, rot=None, wn=True, lost=0):
    sx, sy, sz = abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)
    bev = min(bev, 0.42 * min(sx, sy, sz))
    return _tag(add(name, m_box(name, sx, sy, sz, bev, seg), mat, par, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), rot or (0, 0, 0), wn=wn), lost)
def BC(name, c, sx, sy, sz, mat, par, bev=0.008, seg=2, rot=None, wn=True, lost=0):
    bev = min(bev, 0.42 * min(sx, sy, sz))
    return _tag(add(name, m_box(name, sx, sy, sz, bev, seg), mat, par, c, rot or (0, 0, 0), wn=wn), lost)
def P(name, pts, y0, y1, mat, par, bev=0.015, seg=2, lost=0, loc=(0, 0, 0)):
    return _tag(add(name, m_prism(name, pts, y0, y1, bev, seg), mat, par, loc), lost)
def C(name, r, length, axis, c, mat, par, seg=28, bev=0.008, r2=None, rot=None, wn=True, lost=0):
    bev = min(bev, 0.4 * min(r, length, r2 if r2 else r))
    return _tag(add(name, m_cyl(name, r, length, axis, seg, bev, r2), mat, par, c, rot or (0, 0, 0), wn=wn), lost)

def m_loft(name, bot, z0, top, z1, bevel=0.03, seg=3):
    """Bottom plan (x, y) at z0 to top plan at z1 (same vertex count)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y, z0)) for x, y in bot]; b = [bm.verts.new((x, y, z1)) for x, y in top]
    bm.faces.new(a); bm.faces.new(list(reversed(b))); n = len(bot)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new([a[j], a[i], b[i], b[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    W._bevel(bm, bevel, seg)
    return W._finish(bm, name)

_studs = {}
def studs(name, pts, axis, par, rr=0.011, h=0.012, mat='bright'):
    """Bolt heads at pts (centres on the surface); one shared mesh per size. axis: 'X' | 'Y' | 'Z' or a rotation tuple (then built along Z)."""
    ax = axis if isinstance(axis, str) else 'Z'
    key = (round(rr, 4), round(h, 4), ax, mat)
    me = _studs.get(key)
    if me is None:
        me = m_cyl('stud', rr, h, ax, 8, min(0.003, rr * 0.3)); me.materials.append(S.mats[mat]); _studs[key] = me
    for i, p in enumerate(pts):
        ob = bpy.data.objects.new(f'{name}{i}', me); ob.location = p
        if not isinstance(axis, str): ob.rotation_euler = axis
        S.cur.objects.link(ob); ob.parent = par

def m_pipe(name, pts, r, seg=16):
    """A round pipe through pts (straight runs with ball joints), as one mesh."""
    bm = bmesh.new(); Pn = [Vector(p) for p in pts]
    for a, b in zip(Pn[:-1], Pn[1:]):
        d = b - a
        if d.length < 1e-6: continue
        M = Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=d.length, matrix=M)
    for p in Pn[1:-1]:
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r * 1.03, matrix=Matrix.Translation(p))
    return W._finish(bm, name, 50.0)

def pipe(name, pts, r, par, mat='steel', ends=(True, True), lost=0):
    """Pipe with a dark coupling at each end (ends = which ends get one)."""
    _tag(add(name, m_pipe(name, pts, r), mat, par, wn=False), lost)
    Pn = [Vector(p) for p in pts]
    for k, (a, b) in enumerate(((Pn[0], Pn[1]), (Pn[-1], Pn[-2]))):
        if not ends[k]: continue
        d = (b - a).normalized()
        _tag(add(f'{name}_c{k}', m_pipe('coupling', [a - d * r * 0.3, a + d * r * 1.3], r * 1.3, 14), 'dark', par, wn=False), lost)

def clamps(name, pts, axis, r, par, lost=0, zmax=None):
    """Pipe clamps: steel bands round an axis-aligned pipe at pts. zmax caps their top (deck pipes stay under the turret plane)."""
    t, w = 0.7 * K, r * 2.35
    for i, p in enumerate(pts):
        z0, z1 = p[2] - w / 2, p[2] + w / 2
        if zmax is not None: z1 = min(z1, zmax)
        sx, sy = (t, w) if axis == 'X' else (w, t)
        B(f'{name}{i}', p[0] - sx / 2, p[0] + sx / 2, p[1] - sy / 2, p[1] + sy / 2, z0, z1, 'dark', par, 0.003, 1, wn=False, lost=lost)

class Slope:
    """A sloped plate seen from the side: p0 = front-low (x, z), p1 = rear-high. Boxes laid on it use rot = (0, beta, 0)."""
    def __init__(s, p0, p1):
        s.p0 = Vector(p0); t = Vector(p1) - s.p0; s.len = t.length; s.t = t / s.len
        s.n = Vector((s.t.y, -s.t.x)); s.beta = math.atan2(s.t.y, -s.t.x); s.rot = (0, s.beta, 0)
    def at(s, f, y, off=0.0):
        p = s.p0 + s.t * (s.len * f) + s.n * off; return (p.x, y, p.y)

def strip(name, c, sx, sy, sz, par, rot=None, axis='Y'):
    """Team light strip: black frame with a glowing bar. axis = the thin direction."""
    f = 0.006
    if axis == 'Y':
        BC(name + '_f', c, sx, 0.012, sz, 'black', par, 0.003, 1, rot, wn=False)
        BC(name, c, sx - 2 * f - 0.01, 0.02, sz * 0.5, 'glow', par, 0.002, 1, rot, wn=False)
    elif axis == 'X':
        BC(name + '_f', c, 0.012, sy, sz, 'black', par, 0.003, 1, rot, wn=False)
        BC(name, c, 0.02, sy - 2 * f - 0.01, sz * 0.5, 'glow', par, 0.002, 1, rot, wn=False)
    else:
        BC(name + '_f', c, sx, sy, 0.012, 'black', par, 0.003, 1, rot, wn=False)
        gx, gy = (sx * 0.5, sy - 2 * f - 0.01) if sx < sy else (sx - 2 * f - 0.01, sy * 0.5)
        BC(name, c, gx, gy, 0.02, 'glow', par, 0.002, 1, rot, wn=False)

def grille(name, x0, x1, y0, y1, z, n, par, h=0.03):
    """Engine grille on a flat deck: frame, dark tray and tilted slats running across (along y)."""
    B(name + '_fr', x0, x1, y0, y1, z, z + h, 'dark', par, 0.008)
    B(name + '_tr', x0 + 0.02, x1 - 0.02, y0 + 0.02, y1 - 0.02, z + h - 0.006, z + h + 0.002, 'black', par, 0.0, wn=False)
    for i in range(n):
        x = x0 + 0.03 + (x1 - x0 - 0.06) * (i + 0.5) / n
        BC(f'{name}_s{i}', (x, (y0 + y1) / 2, z + h + 0.001), (x1 - x0 - 0.06) / n * 0.62, (y1 - y0) - 0.05, 0.008, 'steel', par, 0.002, 1, (0, math.radians(20), 0), wn=False)
    studs(name + '_b', [(x, y, z + h) for x in (x0 + 0.012, x1 - 0.012) for y in (y0 + 0.012, y1 - 0.012)], 'Z', par, 0.008, 0.01)

# ------------------------------------------------------------------ running gear
def track_layout(d):
    bt = max(1.1 * K, d.th * 0.11); ih = d.th - 2 * bt
    Rs, Ri = ih * 0.44, ih * 0.40
    xs, zs = d.L / 2 - bt - Rs, d.th - bt - Rs
    xi, zi = -d.L / 2 + bt + Ri, d.th - bt - Ri
    n = d.nw; gap = 0.5 * K
    xa, xb = xi + Ri * 0.55, xs - Rs * 0.55
    Rw = min(ih * 0.43, (xb - xa) / n / 2 - gap / 2)
    wh = [(xa + Rw + (xb - xa - 2 * Rw) * (i / (n - 1)), bt + Rw) for i in range(n)]
    return NS(bt=bt, ih=ih, Rs=Rs, Ri=Ri, xs=xs, zs=zs, xi=xi, zi=zi, Rw=Rw, wheels=wh)

def _hull2(pts):
    p = sorted(set(pts))
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for q in p:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 1e-12: lo.pop()
        lo.append(q)
    for q in reversed(p):
        while len(up) >= 2 and cr(up[-2], up[-1], q) <= 1e-12: up.pop()
        up.append(q)
    return lo[:-1] + up[:-1]          # counter-clockwise

def loop_path(lay):
    """Centre line of the belt: clockwise in (x, z), so the top run goes rear -> front."""
    pts = []
    for cx, cz, r in [(lay.xs, lay.zs, lay.Rs), (lay.xi, lay.zi, lay.Ri)] + [(x, z, lay.Rw) for x, z in lay.wheels]:
        rr = r + lay.bt * 0.5
        for i in range(120):
            a = i / 120 * math.tau; pts.append((cx + math.cos(a) * rr, cz + math.sin(a) * rr))
    h = _hull2(pts); h.reverse()
    return h

def track_mesh(d, lay, side, phase=0.0):
    """All links of one track as one mesh. phase 0..1 moves the links by one pitch (the track animation)."""
    path = loop_path(lay); n = len(path)
    seg = [(Vector(path[i]), Vector(path[(i + 1) % n])) for i in range(n)]
    lens = [(b - a).length for a, b in seg]; total = sum(lens)
    cnt = max(8, round(total / PITCH)); p = total / cnt
    y = side * (d.W / 2 - d.tw / 2); bt = lay.bt; tw = d.tw
    bm = bmesh.new()
    pieces = [(0.84 * p, tw * 0.98, 0.5 * bt, 0.0, 0.0), (0.26 * p, tw * 0.9, 0.34 * bt, 0.0, 0.4 * bt), (0.3 * p, tw * 0.1, 0.5 * bt, 0.0, -0.42 * bt),
              (0.5 * p, tw * 0.16, 0.22 * bt, 0.34 * p, 0.3 * bt)]
    cum = [0.0]
    for l in lens: cum.append(cum[-1] + l)
    import bisect
    for kk in range(cnt):
        s = ((kk + phase) * p) % total
        i = min(n - 1, bisect.bisect_right(cum, s) - 1)
        a, b = seg[i]; t = (b - a) / lens[i]; q = a + t * (s - cum[i])
        T = Matrix(((t.x, 0, -t.y, q.x), (0, 1, 0, y), (t.y, 0, t.x, q.y), (0, 0, 0, 1)))
        for sx, sy, sz, ox, oz in pieces:
            bmesh.ops.create_cube(bm, size=1.0, matrix=T @ Matrix.Translation((ox, 0, oz)) @ Matrix.Diagonal((sx, sy, sz, 1.0)))
    bm.normal_update()
    me = bpy.data.meshes.new('track'); bm.to_mesh(me); bm.free()
    return me

def wheel(name, kind, cx, cz, R, d, side, par):
    yc = side * (d.W / 2 - d.tw / 2); piv = empty(name, par, (cx, yc, cz))
    wd = d.tw * 0.3
    for o in (-1, 1):
        yo = side * o * d.tw * 0.2
        if kind == 'road': C(name + '_t', R, wd, 'Y', (0, yo, 0), 'rubber', piv, 36, 0.012)
        elif kind == 'idler': C(name + '_t', R, wd, 'Y', (0, yo, 0), 'steel', piv, 36, 0.01)
        else:
            C(name + '_t', R * 0.8, wd, 'Y', (0, yo, 0), 'dark', piv, 32, 0.008)
            for i in range(11):
                a = i / 11 * math.tau
                BC(f'{name}_th{o}{i}', (math.cos(a) * R * 0.9, yo, math.sin(a) * R * 0.9), R * 0.3, wd * 0.8, R * 0.2, 'steel', piv, 0.006, 1, (0, -a, 0), wn=False)
    yf = side * (d.tw * 0.2 + wd / 2)           # outer face
    sg = side
    if kind == 'road':
        C(name + '_rim', R * 0.74, 0.014, 'Y', (0, yf, 0), 'paintp', piv, 32, 0.004)
        C(name + '_dish', R * 0.52, 0.012, 'Y', (0, yf + sg * 0.004, 0), 'paint2', piv, 28, 0.003)
    elif kind == 'idler':
        C(name + '_rim', R * 0.78, 0.012, 'Y', (0, yf, 0), 'dark', piv, 32, 0.004)
        for i in range(6):
            a = i / 6 * math.tau + 0.3
            C(f'{name}_hole{i}', R * 0.13, 0.012, 'Y', (math.cos(a) * R * 0.52, yf + sg * 0.003, math.sin(a) * R * 0.52), 'black', piv, 12, 0.0, wn=False)
    else:
        C(name + '_rim', R * 0.62, 0.016, 'Y', (0, yf, 0), 'steel', piv, 32, 0.004)
    C(name + '_hub', R * 0.3, 0.03, 'Y', (0, yf + sg * 0.012, 0), 'steel', piv, 20, 0.006)
    C(name + '_cap', R * 0.14, 0.02, 'Y', (0, yf + sg * 0.026, 0), 'dark', piv, 14, 0.004)
    nb = 8 if kind == 'sprocket' else 6
    rb = R * (0.47 if kind == 'sprocket' else 0.42)
    studs(name + '_b', [(math.cos(i / nb * math.tau) * rb, yf + sg * 0.008, math.sin(i / nb * math.tau) * rb) for i in range(nb)], 'Y', piv, max(0.006, R * 0.06), 0.012)
    return piv

def running_gear(T):
    d = T.d; lay = T.lay; hull = T.hull
    for s in (-1, 1):
        ob = bpy.data.objects.new(f'track{s}', track_mesh(d, lay, s)); ob.data.materials.append(S.mats['track'])
        S.cur.objects.link(ob); ob.parent = hull; T.tracks[s] = ob
        T.wheels.append(wheel(f'sprocket{s}', 'sprocket', lay.xs, lay.zs, lay.Rs, d, s, hull))
        T.wheels.append(wheel(f'idler{s}', 'idler', lay.xi, lay.zi, lay.Ri * 0.97, d, s, hull))
        for i, (x, z) in enumerate(lay.wheels):
            T.wheels.append(wheel(f'road{s}_{i}', 'road', x, z, lay.Rw * 0.97, d, s, hull))
        yc = s * (d.W / 2 - d.tw / 2); rr = min(1.2 * K, lay.ih * 0.13)
        for i in range(3):
            x = lay.xi + (lay.xs - lay.xi) * (0.25 + i * 0.25)
            C(f'roller{s}{i}', rr, d.tw * 0.5, 'Y', (x, yc, d.th - lay.bt * 1.1 - rr), 'steel', hull, 14, 0.004)

def set_track_frame(T, frame, frames=4):
    """Track animation: links move one pitch over `frames` frames; wheels turn to match."""
    ph = (frame % frames) / frames
    for s in (-1, 1):
        old = T.tracks[s].data; T.tracks[s].data = track_mesh(T.d, T.lay, s, ph); T.tracks[s].data.materials.append(S.mats['track'])
        bpy.data.meshes.remove(old)
    for w in T.wheels:
        R = T.lay.Rs if 'sprocket' in w.name else T.lay.Ri if 'idler' in w.name else T.lay.Rw
        w.rotation_euler = (0, ph * PITCH / R, 0)

# ------------------------------------------------------------------ hull
def build_hull(T):
    d = T.d; size = d.size; hull = T.hull
    L, Wd, H, tw, th, hw, uw = d.L, d.W, d.H, d.tw, d.th, d.hw, d.uw
    heavy, light, medium = size == 'heavy', size == 'light', size == 'medium'
    running_gear(T)
    # lower hull (between the tracks) and upper hull
    P('lower_hull', [(-L * 0.47, th * 0.3), (L * 0.36, th * 0.3), (L * 0.47, th * 0.72), (L * 0.47, th), (-L * 0.5, th), (-L * 0.5, th * 0.6)], -hw, hw, 'paint', hull, 0.02, 2)
    up = [(-L * 0.5, th), (L * 0.47, th), (L * 0.47, th + H * 0.07), (L * 0.24, H), (-L * 0.42, H), (-L * 0.5, H * 0.86)]
    P('upper_hull', up, -uw, uw, 'paint', hull, 0.028, 3)
    gl = Slope((L * 0.47, th + H * 0.07), (L * 0.24, H))            # the glacis
    nose_z0, nose_z1 = th, th + H * 0.07
    # ---- glacis: vents, team light bar, bolt row, tow hooks
    for k in range(3):
        y = (k - 1) * uw * 0.26
        BC(f'gvent{k}', gl.at(0.6, y, 0.002), gl.len * 0.4, uw * 0.2, 0.012, 'black', hull, 0.003, 1, gl.rot, wn=False)
        for j in range(4):
            BC(f'gslat{k}{j}', gl.at(0.46 + j * 0.095, y, 0.008), gl.len * 0.05, uw * 0.17, 0.008, 'steel', hull, 0.002, 1, (0, gl.beta - math.radians(22), 0), wn=False)
    strip('gbar', gl.at(0.17, 0, 0.003), gl.len * 0.085, uw * 0.8, 0.0, hull, gl.rot, axis='Z')
    studs('gbolt', [gl.at(0.05, (j / 8 - 0.5) * 2 * uw * 0.9, 0.0) for j in range(9)], gl.rot, hull, 0.009, 0.012)
    B('nose_band', L * 0.47 - 0.004, L * 0.47 + 0.012, -uw * 0.94, uw * 0.94, th + 0.012, nose_z1 - 0.004, 'paint2', hull, 0.004)
    for s in (-1, 1):
        B(f'hook{s}', L * 0.47, L * 0.5, s * hw * 0.6 - 1.2 * K, s * hw * 0.6 + 1.2 * K, th * 0.76, th * 0.94, 'dark', hull, 0.01)
        C(f'shackle{s}', 0.9 * K, 2.8 * K, 'Y', (L * 0.5 + 0.2 * K, s * hw * 0.6, th * 0.85), 'steel', hull, 12, 0.004)
    if light:                                   # the Light has no fenders: headlights sit on the glacis corners
        for s in (-1, 1):
            BC(f'lamp_box{s}', gl.at(0.2, s * uw * 0.8, 0.012), gl.len * 0.2, uw * 0.2, 0.03, 'dark', hull, 0.008, 2, gl.rot, lost=2 if s < 0 else 0)
            BC(f'lamp{s}', gl.at(0.2, s * uw * 0.8, 0.03), gl.len * 0.11, uw * 0.12, 0.008, 'lamp', hull, 0.002, 1, gl.rot, wn=False, lost=2 if s < 0 else 0)
    # ---- deck: seams, bolt rows, driver hatch
    for f in (0.3, 0.7):
        x = -L * 0.42 + (L * 0.66) * f
        B(f'dseam{f}', x - 0.005, x + 0.005, -uw * 0.96, uw * 0.96, H - 0.004, H + 0.0025, 'black', hull, 0.0, wn=False)
    for s in (-1, 1):
        studs(f'dbolt{s}', [(-L * 0.4 + L * 0.62 * j / 11, s * (uw - 0.03), H) for j in range(12)], 'Z', hull, 0.008, 0.01)
    hy0, hy1 = uw * 0.12, uw * 0.5                    # game y -0.5..-0.12 uw
    B('hatch_deck', L * 0.145, L * 0.225, hy0, hy1, H, H + 0.8 * K, 'paintp', hull, 0.008)
    C('hatch_lid', (hy1 - hy0) * 0.36, 0.5 * K, 'Z', (L * 0.185, (hy0 + hy1) / 2, H + 1.0 * K), 'paint2', hull, 24, 0.005)
    B('hatch_handle', L * 0.175, L * 0.195, (hy0 + hy1) / 2 - 0.2 * K, (hy0 + hy1) / 2 + 0.2 * K, H + 1.15 * K, H + 1.5 * K, 'bright', hull, 0.003, wn=False)
    B('hatch_hinge', L * 0.14, L * 0.15, hy0 + 0.6 * K, hy1 - 0.6 * K, H + 0.5 * K, H + 1.1 * K, 'dark', hull, 0.003, wn=False)
    for j, y in enumerate((hy0 + 0.9 * K, hy1 - 0.9 * K)):
        B(f'peri{j}', L * 0.228, L * 0.228 + 1.3 * K, y - 0.8 * K, y + 0.8 * K, H, H + 1.0 * K, 'dark', hull, 0.004)
        B(f'peri_g{j}', L * 0.228 + 1.25 * K, L * 0.228 + 1.4 * K, y - 0.6 * K, y + 0.6 * K, H + 0.3 * K, H + 0.85 * K, 'glass', hull, 0.0, wn=False)
    # ---- engine deck
    if not heavy:
        grille('grille', -L * 0.42, -L * 0.27, -uw * 0.55, uw * 0.55, H, 7 if light else 9, hull, 1.0 * K)
        for s in (-1, 1):
            C(f'fuelcap{s}', 1.3 * K, 0.6 * K, 'Z', (-L * 0.345, s * uw * 0.76, H + 0.3 * K), 'steel', hull, 16, 0.004)
            C(f'fuelcap_t{s}', 0.6 * K, 0.4 * K, 'Z', (-L * 0.345, s * uw * 0.76, H + 0.7 * K), 'dark', hull, 10, 0.003)
    else:
        for s in (-1, 1):
            r = uw * 0.32; cx, cy = -L * 0.34, s * uw * 0.5
            C(f'turb{s}', r, 1.6 * K, 'Z', (cx, cy, H + 0.8 * K), 'dark', hull, 40, 0.012)
            C(f'turb_well{s}', r * 0.88, 0.01, 'Z', (cx, cy, H + 1.6 * K), 'black', hull, 36, 0.0, wn=False)
            for i in range(9):
                a = i / 9 * math.tau
                BC(f'turb_bl{s}{i}', (cx + math.cos(a) * r * 0.52, cy + math.sin(a) * r * 0.52, H + 1.62 * K + 0.008), r * 0.58, r * 0.2, 0.008, 'steel', hull, 0.002, 1, (math.radians(22), 0, a), wn=False)
            C(f'turb_hub{s}', r * 0.24, 0.8 * K, 'Z', (cx, cy, H + 1.9 * K), 'dark', hull, 20, 0.006)
            C(f'turb_glow{s}', r * 0.12, 0.3 * K, 'Z', (cx, cy, H + 2.35 * K), 'glow', hull, 16, 0.0, wn=False)
            studs(f'turb_b{s}', [(cx + math.cos(i / 12 * math.tau) * r * 0.94, cy + math.sin(i / 12 * math.tau) * r * 0.94, H + 1.6 * K) for i in range(12)], 'Z', hull, 0.009, 0.01)
        B('eng_spine', -L * 0.44, -L * 0.25, -uw * 0.08, uw * 0.08, H, H + 1.2 * K, 'paintp', hull, 0.01)
    # ---- rear plate
    for s in (-1, 1):
        y = s * uw * 0.55
        C(f'exh_shroud{s}', H * 0.085, L * 0.022, 'X', (-L * 0.5 - L * 0.008, y, H * 0.73), 'dark', hull, 20, 0.006)
        C(f'exhaust{s}', H * 0.065, L * 0.05, 'X', (-L * 0.525, y, H * 0.73), 'steel', hull, 20, 0.005)
        C(f'exh_bore{s}', H * 0.045, 0.006, 'X', (-L * 0.55 - 0.001, y, H * 0.73), 'black', hull, 16, 0.0, wn=False)
        ty = s * uw * 0.88
        B(f'tail_f{s}', -L * 0.5 - 0.008, -L * 0.5 + 0.004, ty - 1.5 * K, ty + 1.5 * K, th + (H * 0.86 - th) * 0.42, th + (H * 0.86 - th) * 0.82, 'black', hull, 0.003, wn=False)
        B(f'tail{s}', -L * 0.5 - 0.013, -L * 0.5, ty - 1.0 * K, ty + 1.0 * K, th + (H * 0.86 - th) * 0.5, th + (H * 0.86 - th) * 0.74, 'tail', hull, 0.002, wn=False)
    if not light: B('rear_panel', -L * 0.5 - 0.008, -L * 0.5 + 0.004, -uw * 0.3, uw * 0.3, th + (H * 0.86 - th) * 0.2, th + (H * 0.86 - th) * 0.85, 'paint2', hull, 0.005)
    if not light: studs('rpb', [(-L * 0.5 - 0.008, sy * uw * 0.25, th + (H * 0.86 - th) * f) for sy in (-1, 1) for f in (0.3, 0.75)], 'X', hull, 0.008, 0.01)
    B('hitch', -L * 0.5 - 1.6 * K, -L * 0.5, -1.3 * K, 1.3 * K, th * 0.64, th * 0.9, 'dark', hull, 0.008)
    if light:
        for s in (-1, 1):
            lost = 2 if s > 0 else 0
            cy = s * uw * 0.24
            B(f'can{s}', -L * 0.55, -L * 0.5, cy - 2.6 * K, cy + 2.6 * K, th + H * 0.02, th + H * 0.3, 'olive', hull, 0.012, 3, lost=lost)
            B(f'can_x{s}', -L * 0.55 - 0.004, -L * 0.55 + 0.004, cy - 0.35 * K, cy + 0.35 * K, th + H * 0.05, th + H * 0.27, 'black', hull, 0.0, wn=False, lost=lost)
            C(f'can_cap{s}', 0.6 * K, 0.6 * K, 'Z', (-L * 0.525, cy - 1.5 * K, th + H * 0.3 + 0.2 * K), 'dark', hull, 10, 0.003, lost=lost)
        # side skirts: seams, light strip, grab rail
        for s in (-1, 1):
            for f in (-0.22, 0.02, 0.24):
                B(f'sseam{s}{f}', L * f - 0.005, L * f + 0.005, s * uw - 0.004, s * uw + 0.003, th + 0.02, H - 0.03, 'black', hull, 0.0, wn=False)
            strip(f'sstrip{s}', (-L * 0.1, s * (uw + 0.002), th + (H - th) * 0.52), L * 0.5, 0, (H - th) * 0.2, hull)
            studs(f'sbolt{s}', [(-L * 0.46 + L * 0.66 * j / 10, s * uw, H - 0.03) for j in range(11)], 'Y', hull, 0.008, 0.012)
            for f in (-0.34, 0.12):
                B(f'grab{s}{f}', L * f - 2.2 * K, L * f + 2.2 * K, s * uw - 0.004, s * uw + 0.016, th + (H - th) * 0.24, th + (H - th) * 0.24 + 0.014, 'bright', hull, 0.004, wn=False)
            B(f'skirt{s}', -L * 0.47, L * 0.44, s * uw - 0.006, s * uw + 0.01, th - 0.045, th + 0.03, 'paint2', hull, 0.005)
    # ---- fenders (Medium, Heavy): plate over each track, mud flap, light strip, bolts, headlight, pods
    if not light:
        for s in (-1, 1):
            y0, y1 = s * uw, s * (Wd / 2 + 0.6 * K)
            ya, yb = min(y0, y1), max(y0, y1)
            P(f'fender{s}', [(-L * 0.48, th), (L * 0.47, th), (L * 0.47, th + H * 0.04), (L * 0.42, th + H * 0.09), (-L * 0.48, th + H * 0.09)], ya, yb, 'paintp', hull, 0.01, 2)
            ft = th + H * 0.09; fe = s * (Wd / 2 + 0.6 * K)
            strip(f'fstrip{s}', (-L * 0.04, fe + s * 0.002, th + H * 0.045), L * 0.44, 0, H * 0.05, hull)
            studs(f'fbolt{s}', [(-L * 0.46 + L * 0.86 * j / 11, fe, th + H * 0.075) for j in range(12)], 'Y', hull, 0.007, 0.01)
            P(f'flap{s}', [(-L * 0.48, th + 0.01), (-L * 0.48 - 0.012, th + 0.01), (-L * 0.5 - 0.02, th * 0.55), (-L * 0.5 - 0.008, th * 0.55)], ya + 0.015, yb - 0.015, 'black', hull, 0.003, 1)
            # headlight cluster on the fender front
            hx = L * 0.4; hyc = s * (uw + (Wd / 2 - uw) * 0.55)
            B(f'lamp_box{s}', hx - 1.5 * K, hx + 0.9 * K, hyc - 2.0 * K, hyc + 2.0 * K, ft - 0.01, ft + 1.9 * K, 'dark', hull, 0.008, lost=2 if s < 0 else 0)
            C(f'lamp{s}', 0.75 * K, 0.5 * K, 'X', (hx + 0.95 * K, hyc, ft + 1.0 * K), 'lamp', hull, 16, 0.0, wn=False, lost=2 if s < 0 else 0)
            # stowage box behind the lamp (Medium only: the Heavy's pod nose is there)
            if medium:
                B(f'stow{s}', L * 0.24, L * 0.375, hyc - 2.4 * K, hyc + 2.4 * K, ft - 0.005, ft + 2.3 * K, 'paintp', hull, 0.012, 3)
                B(f'stow_lid{s}', L * 0.24 - 0.005, L * 0.375 + 0.005, hyc - 2.5 * K, hyc + 2.5 * K, ft + 2.2 * K, ft + 2.6 * K, 'paint2', hull, 0.005)
                B(f'stow_latch{s}', L * 0.3, L * 0.315, hyc + s * 2.4 * K - 0.006, hyc + s * 2.4 * K + 0.006, ft + 1.2 * K, ft + 2.3 * K, 'bright', hull, 0.002, wn=False)
            # pod
            r = d.podr; cy = s * (Wd / 2 - r - 0.5 * K); cz = d.podz; x0, x1 = -L * 0.36, L * 0.2
            for j, fx in enumerate((0.18, 0.78)):
                xx = x0 + (x1 - x0) * fx
                B(f'saddle{s}{j}', xx - 1.2 * K, xx + 1.2 * K, cy - r * 0.8, cy + r * 0.8, ft - 0.004, cz - r * 0.55, 'dark', hull, 0.006)
            C(f'pod{s}', r, x1 - x0, 'X', ((x0 + x1) / 2, cy, cz), 'paint', hull, 36, 0.025)
            if medium:
                for j, bx0 in enumerate((-L * 0.25, L * 0.06)):
                    C(f'pod_band{s}{j}', r * 1.06, 2.4 * K, 'X', (bx0 + 1.2 * K, cy, cz), 'steel', hull, 36, 0.005)
                C(f'pod_cap{s}', r * 0.72, 0.5 * K, 'X', (x1 + 0.15 * K, cy, cz), 'steel', hull, 28, 0.005)
                studs(f'pod_b{s}', [(x1 + 0.4 * K, cy + math.cos(i / 8 * math.tau) * r * 0.56, cz + math.sin(i / 8 * math.tau) * r * 0.56) for i in range(8)], 'X', hull, 0.008, 0.01)
                C(f'pod_core{s}', r * 0.3, 0.3 * K, 'X', (x1 + 0.45 * K, cy, cz), 'glow', hull, 16, 0.0, wn=False)
                C(f'pod_rear{s}', r * 0.7, 0.5 * K, 'X', (x0 - 0.15 * K, cy, cz), 'dark', hull, 24, 0.005)
            else:      # Heavy power cells: cooling fins at the rear, two glowing seams between dark joints, armoured nose cap
                for j in range(5):
                    C(f'pod_fin{s}{j}', r * 1.08, 1.0 * K, 'X', (-L * 0.355 + j * 1.9 * K + 0.5 * K, cy, cz), 'dark', hull, 36, 0.004)
                for j, sx in enumerate((-L * 0.16, L * 0.03)):
                    C(f'pod_j{s}{j}', r * 1.05, 4.0 * K, 'X', (sx + 2.0 * K, cy, cz), 'black', hull, 36, 0.004)
                    C(f'pod_glow{s}{j}', r * 1.065, 1.2 * K, 'X', (sx + 2.0 * K, cy, cz), 'glow', hull, 36, 0.0, wn=False)
                C(f'pod_nose{s}', r * 0.7, L * 0.035, 'X', (L * 0.2175, cy, cz), 'dark', hull, 28, 0.012)
                C(f'pod_nring{s}', r * 0.78, 0.9 * K, 'X', (L * 0.2 + 0.45 * K, cy, cz), 'steel', hull, 28, 0.004)
                studs(f'pod_b{s}', [(L * 0.235, cy + math.cos(i / 6 * math.tau) * r * 0.5, cz + math.sin(i / 6 * math.tau) * r * 0.5) for i in range(6)], 'X', hull, 0.009, 0.01)
                C(f'pod_core{s}', r * 0.26, 0.3 * K, 'X', (L * 0.235 + 0.1 * K, cy, cz), 'glow', hull, 16, 0.0, wn=False)
                C(f'pod_rear{s}', r * 0.74, 0.5 * K, 'X', (x0 - 0.15 * K, cy, cz), 'dark', hull, 24, 0.005)
                C(f'pod_rglow{s}', r * 0.4, 0.2 * K, 'X', (x0 - 0.42 * K, cy, cz), 'glow', hull, 16, 0.0, wn=False)
    # ---- Heavy front: applique armour, sensor lenses, star emblem
    if heavy:
        for s in (-1, 1):
            BC(f'applique{s}', gl.at(0.38, s * uw * 0.71, 0.006), gl.len * 0.26, uw * 0.42, 0.02, 'paint2', hull, 0.006, 2, gl.rot)
            studs(f'app_b{s}', [gl.at(f, s * uw * yy, 0.016) for f in (0.29, 0.47) for yy in (0.55, 0.87)], gl.rot, hull, 0.009, 0.01)
            BC(f'sensor_f{s}', gl.at(0.73, s * uw * 0.72, 0.004), gl.len * 0.2, uw * 0.2, 0.016, 'black', hull, 0.005, 2, gl.rot)
            BC(f'sensor{s}', gl.at(0.73, s * uw * 0.72, 0.012), gl.len * 0.1, uw * 0.1, 0.012, 'glow', hull, 0.003, 1, gl.rot, wn=False)
        sy0, sy1 = -uw * 0.78, -uw * 0.1               # game y 0.1..0.78 uw
        B('star_plate', L * 0.125, L * 0.228, sy0, sy1, H, H + 0.45 * K, 'paintp', hull, 0.005)
        cx, cy = L * 0.1765, (sy0 + sy1) / 2; rs = min(L * 0.103, sy1 - sy0) * 0.46
        pts = [(cx + math.cos(i * math.pi / 5) * (rs if i % 2 == 0 else rs * 0.41), cy + math.sin(i * math.pi / 5) * (rs if i % 2 == 0 else rs * 0.41)) for i in range(10)]
        add('star', m_loft('star', pts, H + 0.45 * K, pts, H + 0.45 * K + 0.008, 0.0), 'emblem', hull, wn=False)
    # ---- pipes and extra detail (round 1 notes; pipes made thick enough to read at game size)
    rp = 1.2 * K; sink = 0.3 * K; zcap = d.pz - 0.05 * K
    cd = Vector((-L * 0.08, -H * 0.14)); cn = Vector((cd.y, -cd.x)).normalized()          # rear chamfer and its outward normal
    for s in (-1, 1):                                                                   # exhaust pipes: deck -> down the rear -> exhaust
        ym = s * uw * (0.5 if heavy else 0.62)
        a = Vector((-L * 0.42, H)) + cn * sink; b = Vector((-L * 0.5, H * 0.86)) + cn * sink
        pts = [(a.x, ym, a.y), (b.x, s * uw * 0.55, b.y), (-L * 0.5 - sink - 0.1 * K, s * uw * 0.55, H * 0.73 + H * 0.06)]
        pts = ([(-L * 0.3, ym, H - 0.6 * K), (-L * 0.3, ym, H + sink)] if not heavy else [(a.x + 0.3 * K, ym, a.y - 1.2 * K)]) + pts
        pipe(f'manifold{s}', pts, rp, hull, 'steel', (False, False))
    if light:
        for s in (-1, 1):
            zz = th + (H - th) * 0.76; rr = 1.3 * K; ys = s * (uw + rr * 0.75)           # pipe along each side skirt
            pipe(f'side_pipe{s}', [(-L * 0.42, ys, zz), (L * 0.16, ys, zz), (L * 0.16, s * (uw - 0.6 * K), zz)], rr, hull, 'steel', (True, False))
            clamps(f'side_cl{s}', [(L * f, ys, zz) for f in (-0.28, -0.08, 0.1)], 'X', rr, hull)
    else:
        for s in (-1, 1):
            r = d.podr; cy = s * (Wd / 2 - r - 0.5 * K); cz = d.podz; rr = 1.1 * K        # feed pipes: pod -> hull
            ca, sa = math.cos(math.radians(40)), math.sin(math.radians(40))
            zt2 = min(max(H + rr + 0.05 * K, cz + r * ca + 0.8 * K), d.pz - rr - 0.1 * K); yh = s * (uw - 2.2 * K)
            for j, fx in enumerate((-0.2, 0.12)):
                x = L * fx
                pipe(f'feed{s}{j}', [(x, cy - s * r * sa * 0.8, cz + r * ca * 0.8), (x, cy - s * (r * sa + 0.4 * K), zt2), (x, yh, zt2), (x, yh, H - 0.6 * K)], rr, hull, 'steel', (False, False))
                clamps(f'feed_cl{s}{j}', [(x, (cy - s * (r * sa + 0.4 * K) + yh) / 2, zt2)], 'Y', rr, hull, zmax=zcap)
            ft = th + H * 0.09; hx = L * 0.4; hyc = s * (uw + (Wd / 2 - uw) * 0.55)       # headlight cable
            pipe(f'lamp_cable{s}', [(hx - 0.3 * K, hyc - s * 1.9 * K, ft + 0.9 * K), (hx - 0.3 * K, s * (uw - 0.1 * K), ft + 0.9 * K)], 0.7 * K, hull, 'black', (False, False), lost=2 if s < 0 else 0)
    if medium:                                                                          # spare track links on the glacis
        for s in (-1, 1):
            for j, f in enumerate((0.42, 0.6, 0.78)):
                BC(f'spare{s}{j}', gl.at(f, s * uw * 0.74, 0.012), gl.len * 0.15, uw * 0.3, 0.024, 'track', hull, 0.004, 1, gl.rot)
                BC(f'spare_g{s}{j}', gl.at(f, s * uw * 0.74, 0.028), gl.len * 0.05, uw * 0.27, 0.012, 'track', hull, 0.002, 1, gl.rot, wn=False)
            BC(f'spare_bar{s}', gl.at(0.6, s * uw * 0.74, 0.03), gl.len * 0.5, uw * 0.035, 0.012, 'steel', hull, 0.003, 1, gl.rot, wn=False)
    if heavy:                                                                           # coolant lines: turbines -> deck block
        for s in (-1, 1):
            for j, dy in enumerate((-1.5 * K, 1.5 * K)):
                y = s * uw * 0.5 + dy
                pipe(f'coolant{s}{j}', [(-L * 0.34 + uw * 0.3, y, H + 1.2 * K), (d.pvx - uw * 0.72 * 0.62, y, H + 1.2 * K)], 1.1 * K, hull, 'steel', (True, True))
    # ---- turret seat
    if heavy:
        Rs = uw * 0.72; oc = [(d.pvx + math.cos((k + 0.5) / 8 * math.tau) * Rs * 1.1, math.sin((k + 0.5) / 8 * math.tau) * Rs) for k in range(8)]
        cx = sum(p[0] for p in oc) / 8
        top = [(cx + (x - cx) * 0.9, y * 0.9) for x, y in oc]
        add('turret_deck', m_loft('tdeck', oc, H, top, d.pz, 0.012, 2), 'paint', hull)
        hgt = d.pz - H; ym = Rs * math.sin(math.radians(67.5)); tilt = math.atan2(ym * 0.1, hgt)
        for s in (-1, 1):
            strip(f'deck_strip{s}', (d.pvx, s * (ym * 0.95 + 0.003), H + hgt * 0.5), Rs * 0.62, 0, hgt * 0.5, hull, (s * tilt, 0, 0))
            for e in (-1, 1):
                xm = d.pvx + e * Rs * 1.1 * math.cos(math.radians(22.5)) * 0.95
                for k in range(4):
                    BC(f'deck_vent{s}{e}{k}', (xm + e * 0.003, s * (0.06 + k * 0.05) * Rs, H + hgt * 0.5), 0.012, Rs * 0.035, hgt * 0.5, 'black', hull, 0.002, 1, (0, -e * tilt, 0), wn=False)
        studs('deck_b', [(d.pvx + math.cos(i / 16 * math.tau) * Rs * 0.93, math.sin(i / 16 * math.tau) * Rs * 0.85, d.pz - 0.003) for i in range(16)], 'Z', hull, 0.009, 0.004)
    else:
        Rc = min(L * 0.19, uw - 0.3 * K)
        C('collar', Rc, d.pz - H, 'Z', (d.pvx, 0, (H + d.pz) / 2), 'steel', hull, 44, 0.008)
        C('collar_base', Rc * 1.1, 0.5 * K, 'Z', (d.pvx, 0, H + 0.25 * K), 'dark', hull, 44, 0.004)
        studs('collar_b', [(d.pvx + math.cos(i / 16 * math.tau) * Rc * 1.03, math.sin(i / 16 * math.tau) * Rc * 1.03, H + 0.5 * K) for i in range(16)], 'Z', hull, 0.007, 0.008)

# ------------------------------------------------------------------ Panzer turret (turret-local: pivot at the origin, z = 0 is the split plane)
def turret_proxies(T, disc_r, drum_r, drum_h):
    """Stand-ins used only while the hull and the turret are baked as separate sprites. The camera never sees them and they get no outline.
    - 'deck_proxy' (turret layer): a dark disc at deck height. It blocks and bounces light the way the hull under the turret does
      (without it the turret would be lit from below and come out too bright).
    - 'turret_proxy' (hull layer): a plain round drum where the turret stands. It shades the deck the same for every turret direction,
      so the hull sprite is right whichever way the turret points."""
    def plain(name, v):
        m = bpy.data.materials.new(name); nt = W._nt(m); o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(b.outputs[0], o.inputs[0]); b.inputs['Base Color'].default_value = (v, v, v, 1); b.inputs['Roughness'].default_value = 1.0; return m
    nf = bpy.data.collections.get('no_outline')
    if nf is None:
        nf = bpy.data.collections.new('no_outline'); bpy.context.scene.collection.children.link(nf)
    grey = plain('proxy_grey', 0.16)
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=40, radius=disc_r); me = bpy.data.meshes.new('deck_proxy'); bm.to_mesh(me); bm.free()
    me.materials.append(grey)
    cat = bpy.data.objects.new('deck_proxy', me); T.turc.objects.link(cat); cat.parent = T.tdir; cat.location = (0, 0, -0.002)
    cat['catcher'] = 1; T.catcher = cat
    gap = 0.1                                                         # the drum floats a little so the deck under its rim is shaded, not black
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=drum_r, radius2=drum_r, depth=drum_h - gap); me = bpy.data.meshes.new('turret_proxy'); bm.to_mesh(me); bm.free()
    me.materials.append(grey)
    drum = bpy.data.objects.new('turret_proxy', me); T.hullc.objects.link(drum); drum.parent = T.tdir; drum.location = (0, 0, gap + (drum_h - gap) / 2)
    drum['proxy'] = 1; T.proxy = drum
    for ob in (cat, drum):
        ob.hide_render = True; ob.hide_viewport = True; ob.visible_camera = False; nf.objects.link(ob)

def build_panzer(T):
    d = T.d; size = d.size; tur = T.tur; L, H = d.L, d.H
    nb, blen, brad, tR = PANZER[size]
    heavy, light = size == 'heavy', size == 'light'
    R = L * tR; tH = H * (0.5 if heavy else 0.55); z0 = 1.0 * K; zt = z0 + tH
    T.R = R; T.tH = zt
    mW = R * (0.36 + 0.16 * (nb - 1)); fw = max(0.34, mW / R + 0.06)
    plan = [(1.0 * R, fw * R), (0.42 * R, 0.78 * R), (-0.72 * R, 0.78 * R), (-1.0 * R, 0.42 * R), (-1.0 * R, -0.42 * R), (-0.72 * R, -0.78 * R), (0.42 * R, -0.78 * R), (1.0 * R, -fw * R)]
    cx = sum(p[0] for p in plan) / 8
    top = [(cx + (x - cx) * 0.8 - R * 0.06, y * 0.8) for x, y in plan]
    C('ring', R * 0.74, z0, 'Z', (0, 0, z0 / 2), 'dark', tur, 44, 0.004)
    add('turret_body', m_loft('tbody', plan, z0, top, zt, 0.03, 3), 'paint', tur)
    def wall(f):           # x of the front face and y of the side face at height fraction f
        return R - (R - top[0][0]) * f, 0.78 * R - (0.78 - 0.624) * R * f
    tilt = math.atan2(0.156 * R, tH)
    # sides: light strip, bolt row, lifting eye
    for s in (-1, 1):
        _, wy = wall(0.5)
        strip(f'tstrip{s}', (-0.17 * R, s * (wy + 0.003), z0 + tH * 0.5), R * 0.72, 0, tH * 0.2, tur, (s * tilt, 0, 0))
        _, wy = wall(0.12)
        studs(f'tbolt{s}', [(-0.62 * R + 0.96 * R * j / 7, s * (wy + 0.002), z0 + tH * 0.12) for j in range(8)], (-s * (math.pi / 2 - tilt), 0, 0), tur, 0.009, 0.012)
    B('roof_seam', -0.26 * R - 0.005, -0.26 * R + 0.005, -0.6 * R, 0.6 * R, zt - 0.004, zt + 0.0025, 'black', tur, 0.0, wn=False)
    # commander's cupola (game y +0.28 R -> Blender -0.28 R)
    hx, hy, hr = -R * 0.35, -R * 0.28, R * 0.25
    C('cupola_base', hr * 1.12, 0.6 * K, 'Z', (hx, hy, zt + 0.3 * K), 'dark', tur, 32, 0.004)
    C('cupola', hr, 1.6 * K, 'Z', (hx, hy, zt + 0.8 * K), 'paint', tur, 32, 0.012)
    C('cupola_lid', hr * 0.74, 0.45 * K, 'Z', (hx, hy, zt + 1.75 * K), 'paint2', tur, 28, 0.005)
    BC('cupola_handle', (hx, hy, zt + 2.1 * K), hr * 0.7, 0.35 * K, 0.35 * K, 'bright', tur, 0.003, 1, wn=False)
    BC('cupola_hinge', (hx - hr * 0.8, hy, zt + 1.7 * K), 0.7 * K, hr * 0.8, 0.6 * K, 'dark', tur, 0.003, 1, wn=False)
    for i, a in enumerate((-70, -25, 20, 65)):
        a = math.radians(a)
        BC(f'cup_slit{i}', (hx + math.cos(a) * hr * 1.0, hy + math.sin(a) * hr * 1.0, zt + 1.05 * K), 0.012, hr * 0.42, 0.55 * K, 'glass', tur, 0.002, 1, (0, 0, a), wn=False)
    # roof machine gun beside the cupola (game y +0.44 R)
    my = -R * 0.44
    B('mg_mount', R * 0.0, R * 0.16, my - R * 0.07, my + R * 0.07, zt, zt + 2.0 * K, 'dark', tur, 0.006)
    mgx, mgz = R * 0.16, zt + 1.4 * K
    C('mg_barrel', 0.5 * K, R * 0.5, 'X', (mgx + R * 0.25, my, mgz), 'black', tur, 12, 0.003)
    C('mg_shroud', 0.75 * K, R * 0.2, 'X', (mgx + R * 0.1, my, mgz), 'dark', tur, 12, 0.003)
    # vision blocks along the roof front
    for i, yy in enumerate((-0.3, 0, 0.3)):
        B(f'vision{i}', R * 0.42, R * 0.56, yy * R - 1.6 * K, yy * R + 1.6 * K, zt, zt + 1.2 * K, 'dark', tur, 0.005)
        B(f'vision_g{i}', R * 0.56 - 0.002, R * 0.56 + 0.004, yy * R - 1.25 * K, yy * R + 1.25 * K, zt + 0.3 * K, zt + 1.0 * K, 'glass', tur, 0.0, wn=False)
    # sensor box (Medium, Heavy): game y -0.58..-0.26 R -> Blender +0.26..+0.58 R
    if not light:
        B('sensor', -R * 0.62, -R * 0.24, R * 0.26, R * 0.58, zt, zt + 3.2 * K, 'steel', tur, 0.012, 3)
        B('sensor_f', -R * 0.24 - 0.002, -R * 0.24 + 0.006, R * 0.3, R * 0.54, zt + 0.7 * K, zt + 2.7 * K, 'black', tur, 0.003, wn=False)
        B('sensor_lens', -R * 0.24, -R * 0.24 + 0.011, R * 0.34, R * 0.5, zt + 1.1 * K, zt + 2.3 * K, 'glow', tur, 0.002, wn=False)
        studs('sensor_b', [(-R * 0.6 + j * R * 0.11, R * 0.42, zt + 3.2 * K) for j in range(4)], 'Z', tur, 0.008, 0.008)
    # smoke launchers on the turret sides
    for s in (-1, 1):
        _, wy = wall(0.6)
        ya = wy - 0.01; yb = wy + 3.2 * K
        y0, y1 = (ya, yb) if s > 0 else (-yb, -ya)
        lost = 2 if s > 0 else 0
        B(f'smoke_block{s}', R * 0.1, R * 0.36, y0, y1, z0 + tH * 0.42, z0 + tH * 0.8, 'steel', tur, 0.008, lost=lost)
        for k in range(3):
            yy = s * (ya + 0.7 * K + k * 1.05 * K)
            C(f'smoke{s}{k}', 0.6 * K, R * 0.17, 'X', (R * 0.43, yy, z0 + tH * 0.66), 'dark', tur, 12, 0.003, rot=(0, math.radians(-14), 0), lost=lost)
            C(f'smoke_bore{s}{k}', 0.4 * K, 0.006, 'X', (R * 0.43 + R * 0.085 * math.cos(math.radians(14)), yy, z0 + tH * 0.66 + R * 0.085 * math.sin(math.radians(14))), 'black', tur, 10, 0.0, rot=(0, math.radians(-14), 0), wn=False, lost=lost)
    # cheek armour on the front diagonals (Medium, Heavy)
    if not light:
        a0 = Vector((1.0 * R, fw * R)); a1 = Vector((0.42 * R, 0.78 * R)); t = (a1 - a0).normalized(); nrm = Vector((t.y, -t.x))
        mid = (a0 + a1) / 2; ang = math.atan2(t.y, t.x)
        mx = cx + (mid.x - cx) * 0.908 - R * 0.0276 + nrm.x * 0.008; my2 = mid.y * 0.908 + nrm.y * 0.008      # the wall at 46% height
        for s in (-1, 1):
            BC(f'cheek{s}', (mx, s * my2, z0 + tH * 0.46), (a1 - a0).length * 0.74, 0.024, tH * 0.58, 'paint2', tur, 0.008, 2, (-s * tilt * 0.9, 0, s * ang))
    # rear stowage basket with a tarp roll and boxes (Medium, Heavy)
    if not light:
        bx0, bx1, by, bz0, bz1 = -R * 1.34, -R * 0.99, R * 0.6, z0 + tH * 0.15, z0 + tH * 0.7
        B('basket_floor', bx0, bx1, -by, by, bz0, bz0 + 0.5 * K, 'dark', tur, 0.005)
        for zz in (bz0 + (bz1 - bz0) * 0.5, bz1):
            B(f'rail_b{zz:.3f}', bx0 - 0.012, bx0 + 0.012, -by, by, zz - 0.012, zz + 0.012, 'steel', tur, 0.004)
            for s in (-1, 1):
                B(f'rail_s{s}{zz:.3f}', bx0, bx1, s * by - 0.012, s * by + 0.012, zz - 0.012, zz + 0.012, 'steel', tur, 0.004)
        for j in range(5):
            yy = -by + 2 * by * j / 4
            B(f'rail_p{j}', bx0 - 0.011, bx0 + 0.011, yy - 0.011, yy + 0.011, bz0, bz1, 'steel', tur, 0.003)
        B('ammo_box0', bx0 + 0.02, bx1 - 0.02, -by * 0.9, -by * 0.25, bz0 + 0.5 * K, bz1 - 0.02, 'olive', tur, 0.008)
        B('ammo_box1', bx0 + 0.03, bx1 - 0.02, by * 0.3, by * 0.88, bz0 + 0.5 * K, bz0 + (bz1 - bz0) * 0.7, 'olive', tur, 0.008)
        C('tarp', 1.8 * K, by * 1.5, 'Y', ((bx0 + bx1) / 2, 0, bz1 + 1.5 * K), 'canvas', tur, 20, 0.02, lost=2)
        for j in (-1, 1):
            C(f'tarp_strap{j}', 1.9 * K, 0.5 * K, 'Y', ((bx0 + bx1) / 2, j * by * 0.45, bz1 + 1.5 * K), 'black', tur, 20, 0.0, lost=2)
    # antenna (game y +0.535 R)
    ax, ay = -R * 0.76, -R * 0.52
    C('antenna_base', 1.2 * K, 1.4 * K, 'Z', (ax + R * 0.12, ay, zt + 0.7 * K), 'dark', tur, 14, 0.005)
    C('antenna_stub', 0.4 * K, H * 0.22, 'Z', (ax + R * 0.12, ay, zt + 1.4 * K + H * 0.11), 'black', tur, 8, 0.0, wn=False)
    C('antenna', 0.36 * K, H * 0.4, 'Z', (ax + R * 0.12, ay, zt + 1.4 * K + H * 0.42), 'black', tur, 8, 0.0, wn=False, lost=2)
    # mantlet and barrels
    mz0, mz1 = z0 + tH * 0.15, z0 + tH * 0.88
    fx = lambda z: R - (R - top[0][0]) * ((z - z0) / tH) - 0.004
    P('mantlet', [(fx(mz0), mz0), (R * 1.13, mz0 + 1.5 * K), (R * 1.13, mz1 - 1.5 * K), (fx(mz1), mz1)], -mW, mW, 'steel', tur, 0.014, 2)
    studs('mant_b', [(R * 1.13, (j / 5 - 0.5) * 2 * mW * 0.86, zz) for j in range(6) for zz in (mz0 + 2.3 * K, mz1 - 2.3 * K)], 'X', tur, 0.009, 0.012)
    bl = L * blen; br = L * brad * BARREL_FAT; bz = z0 + tH * 0.52
    muzzles = []
    for i in range(nb):
        by = 0.0 if nb == 1 else -mW * 0.72 + i * (2 * mW * 0.72) / (nb - 1)
        x0 = R * 1.13; x1 = x0 + bl; lb = bl * 0.105; xm = x1 - lb; mr = br * 1.24; mh = mr * 0.86
        # barrel: one collar at the mantlet and a plain, slightly tapered tube
        C(f'collar{i}', br * 1.45, bl * 0.07, 'X', (x0 + bl * 0.035, by, bz), 'steel', tur, 28, 0.01)
        xa = x0 + bl * 0.07 - 0.01
        C(f'tube{i}', br * 1.05, xm - xa + 0.01, 'X', ((xa + xm + 0.01) / 2, by, bz), 'steel', tur, 28, 0.0, r2=br * 0.95)
        # muzzle brake: neck ring, small body with two side ports and top vents, bolted face ring, bore
        C(f'brake_neck{i}', br * 1.2, lb * 0.16, 'X', (xm, by, bz), 'steel', tur, 24, 0.004)
        B(f'brake{i}', xm + lb * 0.08, x1, by - mr, by + mr, bz - mh, bz + mh, 'dark', tur, 0.016, 3)
        for j, f in enumerate((0.36, 0.72)):
            xx = xm + lb * f
            B(f'brake_v{i}{j}', xx - lb * 0.11, xx + lb * 0.11, by - mr - 0.003, by + mr + 0.003, bz - mh * 0.5, bz + mh * 0.5, 'black', tur, 0.0, wn=False)
            B(f'brake_t{i}{j}', xx - lb * 0.06, xx + lb * 0.06, by - mr * 0.55, by + mr * 0.55, bz + mh - 0.004, bz + mh + 0.003, 'black', tur, 0.0, wn=False)
        for sd in (-1, 1):
            B(f'brake_lip{i}{sd}', xm + lb * 0.5, xm + lb * 0.58, by + sd * mr - 0.005, by + sd * mr + 0.005, bz - mh * 0.62, bz + mh * 0.62, 'steel', tur, 0.002, wn=False)
        C(f'brake_face{i}', br * 1.0, 0.012, 'X', (x1 + 0.003, by, bz), 'steel', tur, 24, 0.003)
        C(f'bore{i}', br * 0.72, 0.008, 'X', (x1 + 0.007, by, bz), 'black', tur, 20, 0.0, wn=False)
        studs(f'brake_b{i}', [(x1, by + sy * mr * 0.76, bz + sz * mh * 0.72) for sy in (-1, 1) for sz in (-1, 1)], 'X', tur, 0.007, 0.008)
        muzzles.append((x1 + 0.5 * K, by, bz))
    # hydraulic lines from the mantlet to the roof
    ml = [0.5 * mW, -0.5 * mW] if nb != 2 else [0.0]
    mtop = lambda x: mz1 - 1.5 * K * (x - fx(mz1)) / (R * 1.13 - fx(mz1))
    for j, yy in enumerate(ml):
        rr = 0.9 * K
        pipe(f'hyd{j}', [(R * 1.0, yy, mtop(R * 1.0) - 0.5 * K), (R * 1.0, yy, mtop(R * 1.0) + rr + 0.3 * K), (R * 0.76, yy, zt + rr * 0.8), (R * 0.66, yy, zt + rr * 0.8), (R * 0.66, yy, zt - 0.4 * K)], rr, tur, 'steel', (True, False))
    if not light:
        # cable from the sensor box to the cupola, and bolted armour tiles on the upper turret sides
        pipe('sensor_cable', [(-R * 0.43, R * 0.27, zt + 0.6 * K), (-R * 0.43, R * 0.0, zt + 0.6 * K)], 0.8 * K, tur, 'black', (False, False))
        _, wy = wall(0.81)
        for s in (-1, 1):
            for j in range(3):
                xc = -R * 0.47 + j * R * 0.19
                BC(f'tile{s}{j}', (xc, s * (wy + 0.005), z0 + tH * 0.81), R * 0.17, 0.016, tH * 0.24, 'paint2', tur, 0.005, 2, (s * tilt, 0, 0))
                studs(f'tile_b{s}{j}', [(xc + e * R * 0.055, s * (wy + 0.013), z0 + tH * 0.81) for e in (-1, 1)], (-s * (math.pi / 2 - tilt), 0, 0), tur, 0.007, 0.01)
    if nb != 2: C('coax', 0.5 * K, 1.2 * K, 'X', (R * 1.13 + 0.5 * K, mW * 0.62 if nb == 1 else mW * 0.36, mz1 - 2.4 * K if nb == 1 else bz + br * 2.6), 'black', tur, 10, 0.002)
    turret_proxies(T, R * 1.9, R * 1.0, zt)
    return muzzles

# ------------------------------------------------------------------ tank assembly, directions, layers, damage
class Tank:
    def __init__(self, size, weapon='panzer', name=None, loc=(0, 0, 0)):
        self.size = size; self.weapon = weapon; self.d = dims(size); self.name = name or size; self.lay = track_layout(self.d)
        self.tracks = {}; self.wheels = []
        sc = bpy.context.scene
        self.hullc = bpy.data.collections.new(self.name + '_hull'); self.turc = bpy.data.collections.new(f'{self.name}_{weapon}_turret')
        sc.collection.children.link(self.hullc); sc.collection.children.link(self.turc)
        S.cur = self.hullc
        self.root = empty(self.name + '_root', None, loc)
        self.hull = empty('hull_dir', self.root)
        build_hull(self)
        S.cur = self.turc
        self.tdir = empty('turret_dir', self.root, (self.d.pvx, 0, self.d.pz))
        self.tur = empty('turret', self.tdir)
        self.muzzles = build_panzer(self)
        self.hdir = 0; self.tdirn = 0
        S.tanks.append(self)

    def set_dirs(self, hull=0, turret=None, wreck=False):
        turret = hull if turret is None else turret; self.hdir, self.tdirn = hull, turret
        a = -hull * math.tau / 32; b = -turret * math.tau / 32; d = self.d
        self.hull.rotation_euler = (0, 0, a)
        self.tdir.location = (d.pvx * math.cos(a), d.pvx * math.sin(a), d.pz)
        self.tdir.rotation_euler = (0, 0, b)
        if wreck:
            self.tur.matrix_local = Matrix.Translation((-0.11, 0.07, -0.02)) @ Matrix.Rotation(-0.42, 4, 'Z') @ Matrix.Rotation(math.radians(5), 4, 'X') @ Matrix.Rotation(math.radians(-3), 4, 'Y')
        else:
            self.tur.matrix_local = Matrix.Identity(4)

def new_scene(team='#33d17a'):
    for ls in bpy.context.view_layer.freestyle_settings.linesets: ls.collection = None      # drop the link to a collection that is about to go
    W.reset_scene(); tank_materials(team); _studs.clear(); W.setup_world(); S.tanks = []

def add_to_walker_scene():
    """Call after walker_lib.build(...): adds the tank materials so tanks can stand in the same scene as a walker."""
    _studs.clear(); extra_materials(); S.tanks = []

def set_layer(layer='all'):
    """'all' | 'all+shadow' | 'hull' | 'turret' (each with a stand-in for the other, see turret_proxies) | 'shadow' | 'shadow_hull' | 'shadow_turret'."""
    sc = bpy.context.scene
    for t in S.tanks:
        for coll, name in ((t.hullc, 'hull'), (t.turc, 'turret')):
            show = layer in ('all', 'all+shadow', name)
            cast = layer == 'shadow' or layer == 'shadow_' + name
            for ob in coll.objects:
                if ob.get('catcher'): ob.hide_render = layer != 'turret'; ob.visible_camera = False; continue      # stand-ins, see turret_proxies
                if ob.get('proxy'): ob.hide_render = layer != 'hull'; ob.visible_camera = False; continue
                if ob.get('lost'): ob.hide_render = True; continue
                ob.hide_render = not (show or cast)
                ob.visible_camera = show
    # the ground stays in every render so the light it bounces up is the same in each layer; in the hull and turret layers the camera does not see it
    g = S.rig['ground']; g.hide_render = False
    g.visible_camera = g.is_shadow_catcher = layer.startswith('shadow') or layer == 'all+shadow'    # otherwise just dark earth the camera does not see
    sc.render.use_freestyle = bool(S.outline) and not layer.startswith('shadow')

def apply_damage(dmg):
    """0 intact, 1 damaged, 2 burning (some parts lost), 3 wreck (charred, turret knocked askew, all glows off)."""
    W.set_damage(dmg)
    for t in S.tanks:
        for coll in (t.hullc, t.turc):
            for ob in coll.objects:
                la = ob.get('lostat')
                if la: ob['lost'] = 1 if dmg >= la else 0
        t.set_dirs(t.hdir, t.tdirn, wreck=dmg >= 3)

def split_check(T):
    """Hull entirely below the turret pivot plane, turret entirely above it. Returns (hull top - plane, turret bottom - plane) in mm."""
    bpy.context.view_layer.update()
    hi, lo = -1e9, 1e9
    for ob in T.hullc.objects:
        if ob.type != 'MESH' or ob.get('proxy'): continue
        for v in ob.data.vertices: hi = max(hi, (ob.matrix_world @ v.co).z)
    for ob in T.turc.objects:
        if ob.type != 'MESH' or ob.get('catcher') or ob.get('proxy'): continue
        for v in ob.data.vertices: lo = min(lo, (ob.matrix_world @ v.co).z)
    pz = T.root.location.z + T.d.pz
    return round((hi - pz) * 1000, 2), round((lo - pz) * 1000, 2)

def fix_outline():
    """Call after walker_lib.setup_render: objects in the 'no_outline' collection (the bake stand-ins) get no Freestyle line."""
    nf = bpy.data.collections.get('no_outline')
    if nf is None or not S.outline: return
    ls = bpy.context.view_layer.freestyle_settings.linesets[0]
    ls.select_by_collection = True; ls.collection = nf; ls.collection_negation = 'EXCLUSIVE'

# ------------------------------------------------------------------ the model as files
VIEW_A = {'light': 150.0, 'medium': 125.0, 'heavy': 100.0}       # px per metre for the saved scene's camera (960 x 720)

def tank_data(T):
    """Numbers the game and later tools need, in metres (model units = metres x 28). Turret values are turret-local (pivot at the origin)."""
    d = T.d
    return {'size': T.size, 'weapon': T.weapon, 'model_units_per_metre': W.M2U, 'hull_length': round(d.L, 4), 'hull_width': round(d.W, 4),
            'hull_height': round(d.H, 4), 'turret_pivot': [round(d.pvx, 4), 0.0, round(d.pz, 4)], 'turret_radius': round(T.R, 4),
            'muzzles': [[round(c, 4) for c in m] for m in T.muzzles], 'track_pitch': round(PITCH, 4), 'track_frames': 4, 'directions': 32,
            'split_plane_check_mm': list(split_check(T)), 'objects': len(T.hullc.objects) + len(T.turc.objects)}

def build_model(size, weapon='panzer', team='#33d17a'):
    """A fresh scene with one tank: collections <size>_hull and <size>_<weapon>_turret, plus env (lights, ground, camera)."""
    new_scene(team); return Tank(size, weapon)

def save_blend(T, path, samples=64):
    """Save the scene as a .blend ready to render: game camera, Walkers' light and outline, transparent film."""
    W.setup_render(samples, gpu=True, outline=True); fix_outline()
    sc = bpy.context.scene
    sc.cycles.device = 'GPU'                                         # used where the PC has a GPU set up; Blender falls back to CPU otherwise
    W.setup_camera(960, 720, VIEW_A[T.size], 0.5); set_layer('all+shadow'); T.set_dirs(0, 0); apply_damage(0)
    sc['sow_tank'] = json.dumps(tank_data(T))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    return path
