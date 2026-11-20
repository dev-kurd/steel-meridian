# walker_lib.py - State of War Game walkers: procedural Blender model + sprite renderer (Blender 5.3)
# One shared body (legs layer + upper layer) and five weapon modules. Game view: 2:1 dimetric.
# Axes: +X forward, Z up. The game's y axis is Blender's -Y (the game uses a left-handed ground plane).
import bpy, bmesh, math, os, colorsys
from mathutils import Vector, Matrix

M2U = 28.0                 # model units (tank svg units) per metre
PX_PER_UNIT_1X = 0.34641   # sprite px per svg unit of (x - y) at @1x  (0.4 * 0.866)
STRETCH = 0.5 / (0.75 / math.sqrt(2 + 0.5625))   # 1.0672: vertical stretch of a true ortho view along (1,1,0.75) to get the game's 2:1 view
KINDS = ['kodiak', 'cougar', 'gatling', 'avenger', 'achilles']
TEAMS = {'green': '#33d17a', 'blue': '#3b82f6', 'red': '#e5484d', 'orange': '#f5a524', 'purple': '#a855f7', 'cyan': '#22d3ee'}

# ------------------------------------------------------------------ colour (same rules as VectorUnit.paintOf / unitPaint)
def hex2rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def s2l(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def l2s(c): return 12.92 * c if c <= 0.0031308 else 1.055 * (max(c, 0) ** (1 / 2.4)) - 0.055
def lin(rgb): return tuple(s2l(c) for c in rgb)
def lum(rgb): r, g, b = lin(rgb); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def hsl(h, s, l): r, g, b = colorsys.hls_to_rgb(h, l, s); return (r, g, b)
def to_hsl(rgb): h, l, s = colorsys.rgb_to_hls(*rgb); return h, s, l
def paint_of(T):
    h, s0, _ = to_hsl(T); hd = h * 360
    purple = 255 <= hd <= 320; red = hd >= 335 or hd <= 15
    s = max(0.42, min(0.5, s0)) if purple else max(0.46, min(0.52, s0)) if red else max(0.6, min(0.82, s0))
    target = lum(hsl(146 / 360, 0.65, 0.4)) * (1.25 if purple else 0.9 if red else 1)
    lo, hi = 0.3, (0.64 if purple else 0.5 if red else 0.56)
    for _ in range(18):
        m = (lo + hi) / 2
        if lum(hsl(h, s, m)) < target: lo = m
        else: hi = m
    return hsl(h, s, (lo + hi) / 2)
def unit_paint(T):
    h, s, l = to_hsl(paint_of(T)); return hsl(h, s * 0.5, l * 0.9)
def mixc(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

# ------------------------------------------------------------------ scene state
class S: pass
S.mats = {}; S.legs = None; S.upper = None; S.rig = {}; S.kind = None

def reset_scene():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections): bpy.data.collections.remove(coll)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.node_groups):
        for d in list(blk):
            try: blk.remove(d)
            except Exception: pass
    S.mats = {}; S.rig = {}
    sc = bpy.context.scene
    S.legs = bpy.data.collections.new('legs'); S.upper = bpy.data.collections.new('upper'); S.env = bpy.data.collections.new('env')
    for c in (S.legs, S.upper, S.env): sc.collection.children.link(c)

# ------------------------------------------------------------------ materials
def _nt(mat):
    try: mat.use_nodes = True
    except Exception: pass
    nt = mat.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    return nt

def _mix_rgb(nt, fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend; n.clamp_factor = True
    for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if hasattr(v, 'links') or hasattr(v, 'is_output'): nt.links.new(v, sock)
        else: sock.default_value = v if not isinstance(v, tuple) else (*v, 1.0) if len(v) == 3 else v
    return n.outputs[2]
def _math(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    for sock, v in ((n.inputs[0], a), (n.inputs[1], b)):
        if v is None: continue
        if hasattr(v, 'is_output'): nt.links.new(v, sock)
        else: sock.default_value = v
    return n.outputs[0]
def _ramp(nt, v, p0, p1):
    n = nt.nodes.new('ShaderNodeMapRange'); n.clamp = True; n.interpolation_type = 'SMOOTHSTEP'
    nt.links.new(v, n.inputs[0]); n.inputs[1].default_value = p0; n.inputs[2].default_value = p1
    return n.outputs[0]
def _noise(nt, vec, scale, detail=3.0, rough=0.55):
    n = nt.nodes.new('ShaderNodeTexNoise'); nt.links.new(vec, n.inputs['Vector'])
    n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
    return n.outputs[0]

CHAR = (0.014, 0.011, 0.009)

def make_metal(name, color, metallic, rough, role='steel', wear=1.0, coat=0.0, round_edges=0.0):
    """Armour / metal material with edge wear, cavity grime, soot and damage driven by the DMG value (0..3).
    role: 'paint' (team mask R), 'steel' (not in the mask). color is linear rgb."""
    mat = bpy.data.materials.new(name); nt = _nt(mat)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    dmg = nt.nodes.new('ShaderNodeValue'); dmg.name = 'DMG'; dmg.outputs[0].default_value = 0.0
    col = nt.nodes.new('ShaderNodeRGB'); col.name = 'BASE'; col.outputs[0].default_value = (*color, 1)
    tc = nt.nodes.new('ShaderNodeTexCoord'); P = tc.outputs['Object']
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    bev = nt.nodes.new('ShaderNodeBevel'); bev.samples = 6; bev.inputs['Radius'].default_value = 0.035
    nt.links.new(bev.outputs[0], bsdf.inputs['Normal'])
    # edge mask. Sharp edges: where the bevel-rounded normal leaves the shading normal. Rounded armour edges (thick parts only):
    # ambient occlusion measured inside the part, which rises toward convex edges.
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
    # a few scattered chips on flat areas, more with damage
    spots = _math(nt, 'MULTIPLY', _ramp(nt, nfine, 0.7, 0.74), _ramp(nt, nmid, 0.55, 0.68))
    spots = _math(nt, 'MULTIPLY', spots, _math(nt, 'ADD', 0.6 * wear, _math(nt, 'MULTIPLY', dmg.outputs[0], 0.5)), clamp=True)
    chips = _math(nt, 'MAXIMUM', chips, spots)
    dings = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', _ramp(nt, nfine, 0.6, 0.64), _ramp(nt, nmid, 0.5, 0.58)), _ramp(nt, dmg.outputs[0], 0.2, 1.2))
    chips = _math(nt, 'MAXIMUM', chips, dings)
    # cavity grime from ambient occlusion
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 8; ao.inputs['Distance'].default_value = 0.34
    cav = _math(nt, 'SUBTRACT', 1.0, _ramp(nt, ao.outputs['AO'], 0.12, 0.8))
    cav = _math(nt, 'MULTIPLY', cav, _math(nt, 'ADD', 0.55, _math(nt, 'MULTIPLY', nmid, 0.6)), clamp=True)
    # large tonal variation so big plates are not flat
    c0 = _mix_rgb(nt, _math(nt, 'MULTIPLY', _ramp(nt, nbig, 0.35, 0.8), 0.42 * wear), col.outputs[0], (0.02, 0.02, 0.02, 1))
    # rain / oil streaks running down the plates
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (7.0, 7.0, 0.45); nt.links.new(P, mp.inputs['Vector'])
    streak = _math(nt, 'MULTIPLY', _ramp(nt, _noise(nt, mp.outputs[0], 1.0, 3.0, 0.6), 0.5, 0.75), 0.3 * wear)
    c0 = _mix_rgb(nt, streak, c0, (0.06, 0.05, 0.04, 1))
    c1 = _mix_rgb(nt, _math(nt, 'MULTIPLY', cav, 0.92), c0, (0.02, 0.018, 0.016, 1))
    sepz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sepz.inputs[0])
    dust = _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', 1.0, _ramp(nt, sepz.outputs['Z'], 0.02, 0.7)), _math(nt, 'ADD', 0.35, _math(nt, 'MULTIPLY', nmid, 0.9)), clamp=True)
    c1 = _mix_rgb(nt, _math(nt, 'MULTIPLY', dust, 0.5), c1, (0.105, 0.08, 0.052, 1))
    # soot / burns: grows with damage; wreck = almost everything charred
    soot_t = _math(nt, 'SUBTRACT', 0.685, _math(nt, 'MULTIPLY', dmg.outputs[0], 0.055))      # threshold drops as dmg rises: bigger burns
    nsoot = _noise(nt, P, 3.1, 4.0, 0.62)
    soot = _ramp(nt, _math(nt, 'SUBTRACT', nsoot, soot_t), -0.035, 0.08)
    soot = _math(nt, 'MULTIPLY', soot, _ramp(nt, dmg.outputs[0], 0.2, 1.0))
    wreck = _ramp(nt, dmg.outputs[0], 2.4, 3.0)
    soot = _math(nt, 'MAXIMUM', soot, _math(nt, 'MULTIPLY', wreck, _math(nt, 'ADD', 0.9, _math(nt, 'MULTIPLY', nbig, 0.14)), clamp=True))
    c2 = _mix_rgb(nt, soot, c1, (*CHAR, 1))
    bare = (0.56, 0.59, 0.63, 1) if role == 'paint' else (0.74, 0.76, 0.8, 1)
    chips_live = _math(nt, 'MULTIPLY', chips, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', soot, 0.85)))
    if soft is not None:      # paint rubbed thin and lighter toward the rounded edges
        c2 = _mix_rgb(nt, _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', soft, 0.4 * wear), _math(nt, 'SUBTRACT', 1.0, soot)), c2, (0.55, 0.57, 0.55, 1), 'SCREEN')
    c3 = _mix_rgb(nt, chips_live, c2, bare)
    nt.links.new(c3, bsdf.inputs['Base Color'])
    met = _math(nt, 'ADD', metallic, _math(nt, 'MULTIPLY', chips_live, 1.0 - metallic))
    nt.links.new(met, bsdf.inputs['Metallic'])
    r = _math(nt, 'ADD', rough, _math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', nbig, 0.5), 0.14))
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', soot, 0.4))
    r = _math(nt, 'ADD', r, _math(nt, 'MULTIPLY', dust, 0.3))
    met = _math(nt, 'MULTIPLY', met, _math(nt, 'SUBTRACT', 1.0, _math(nt, 'MULTIPLY', dust, 0.6)))
    nt.links.new(met, bsdf.inputs['Metallic'])
    r = _math(nt, 'SUBTRACT', r, _math(nt, 'MULTIPLY', chips_live, 0.1), clamp=True)
    nt.links.new(r, bsdf.inputs['Roughness'])
    if coat: bsdf.inputs['Coat Weight'].default_value = coat; bsdf.inputs['Coat Roughness'].default_value = 0.25
    # burning: glowing edges of the burn patches (off on a wreck)
    band = _math(nt, 'MULTIPLY', _ramp(nt, _math(nt, 'SUBTRACT', nsoot, soot_t), 0.015, 0.03),
                 _math(nt, 'SUBTRACT', 1.0, _ramp(nt, _math(nt, 'SUBTRACT', nsoot, soot_t), 0.035, 0.06)))
    burn = _math(nt, 'MULTIPLY', band, _math(nt, 'MULTIPLY', _ramp(nt, dmg.outputs[0], 1.5, 2.0), _math(nt, 'SUBTRACT', 1.0, wreck)))
    burn = _math(nt, 'MULTIPLY', burn, _ramp(nt, nbig, 0.5, 0.62))
    bsdf.inputs['Emission Color'].default_value = (1.0, 0.26, 0.03, 1)
    nt.links.new(_math(nt, 'MULTIPLY', burn, 5.0), bsdf.inputs['Emission Strength'])
    mat['role'] = role; mat['shade'] = 1.0
    return mat

def make_glow(name, color, strength, role='fixed'):
    mat = bpy.data.materials.new(name); nt = _nt(mat)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    dmg = nt.nodes.new('ShaderNodeValue'); dmg.name = 'DMG'
    col = nt.nodes.new('ShaderNodeRGB'); col.name = 'BASE'; col.outputs[0].default_value = (*color, 1)
    off = _ramp(nt, dmg.outputs[0], 2.4, 3.0)                                      # glows go dark on a wreck
    bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
    nt.links.new(col.outputs[0], bsdf.inputs['Emission Color'])
    nt.links.new(_math(nt, 'MULTIPLY', _math(nt, 'SUBTRACT', 1.0, off), strength), bsdf.inputs['Emission Strength'])
    bsdf.inputs['Roughness'].default_value = 0.25
    mat['role'] = role; mat['strength'] = strength
    return mat

def make_materials(team_hex='#33d17a', scheme='paint'):
    T = hex2rgb(team_hex); up = unit_paint(T); S.team = team_hex; S.scheme = scheme
    S.paint_srgb = up; S.glow_srgb = mixc(up, (1, 1, 1), 0.5)
    m = S.mats
    m['paint'] = make_metal('paint', lin(up), 0.5, 0.42, 'paint', 1.0, round_edges=0.085)
    m['paint2'] = make_metal('paint2', lin(tuple(c * 0.8 for c in up)), 0.5, 0.46, 'paint', 0.9); m['paint2']['shade'] = 0.8
    if scheme == 'steel':
        m['paint'] = make_metal('paint', lin(hex2rgb('#98a2ad')), 0.85, 0.38, 'steel', 1.0, round_edges=0.085)
        m['paint2'] = make_metal('paint2', lin(up), 0.5, 0.44, 'paint', 0.9); m['paint2']['shade'] = 1.0
    m['steel'] = make_metal('steel', lin(hex2rgb('#6f7a87')), 0.9, 0.4, 'steel', 0.9)
    m['dark'] = make_metal('dark', lin(hex2rgb('#3a424c')), 0.8, 0.42, 'steel', 0.7)
    m['black'] = make_metal('black', lin(hex2rgb('#15181d')), 0.3, 0.6, 'steel', 0.3)
    m['bright'] = make_metal('bright', lin(hex2rgb('#c3cbd3')), 0.95, 0.24, 'steel', 0.5)
    m['copper'] = make_metal('copper', lin(hex2rgb('#b06a34')), 0.9, 0.34, 'steel', 0.6)
    m['white'] = make_metal('white', lin(hex2rgb('#c9cdd0')), 0.1, 0.45, 'steel', 0.8)
    m['emblem'] = make_metal('emblem', lin(hex2rgb('#d9dfe4')), 0.1, 0.5, 'steel', 1.0)
    m['red'] = make_metal('red', lin(hex2rgb('#b23324')), 0.1, 0.4, 'steel', 0.8)
    m['glow'] = make_glow('glow', lin(S.glow_srgb), 1.0, 'light')
    m['plasma'] = make_glow('plasma', lin(hex2rgb('#2f7cff')), 3.2)
    m['plasma_core'] = make_glow('plasma_core', lin(hex2rgb('#a8d0ff')), 2.2)
    m['magma'] = make_glow('magma', lin(hex2rgb('#ff4e08')), 3.2)
    m['magma_core'] = make_glow('magma_core', lin(hex2rgb('#ffbf55')), 2.2)
    return m

def set_damage(d):
    for mat in S.mats.values():
        n = mat.node_tree.nodes.get('DMG')
        if n: n.outputs[0].default_value = float(d)

def set_mask_mode(mode):
    """'beauty': real colours. 'A': paint black, team lights off. 'B': paint pure red albedo, team lights pure green.
    B - A = the team mask (R = paint shading, G = light glow); A = everything that is not team coloured."""
    up = S.paint_srgb
    for mat in S.mats.values():
        role = mat.get('role'); nt = mat.node_tree; base = nt.nodes.get('BASE')
        if role == 'paint':
            sh = mat.get('shade', 1.0)
            c = lin(tuple(x * sh for x in up)) if mode == 'beauty' else (0, 0, 0) if mode == 'A' else (sh, 0, 0)
            base.outputs[0].default_value = (*c, 1)
        elif role == 'light':
            c = lin(S.glow_srgb) if mode == 'beauty' else (0, 0, 0) if mode == 'A' else (0, 1, 0)
            base.outputs[0].default_value = (*c, 1)

# ------------------------------------------------------------------ mesh helpers
def _finish(bm, name, sharp=38.0):
    bm.normal_update()
    for f in bm.faces: f.smooth = True
    lim = math.radians(sharp)
    for e in bm.edges:
        if len(e.link_faces) == 2: e.smooth = e.calc_face_angle(0.0) < lim
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return me
def _bevel(bm, w, seg=3):
    if w > 0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=w, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)

def _zclamp(bm, zc):
    # keep only the slice zc[0]..zc[1] of the shape (a thin band that follows the surface: a panel seam)
    if zc:
        for z, n in ((zc[0], (0, 0, -1)), (zc[1], (0, 0, 1))):
            g = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=g, dist=1e-6, plane_co=(0, 0, z), plane_no=n, clear_outer=True, clear_inner=False)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

def m_box(name, sx, sy, sz, bevel=0.03, seg=3, shape=None, zclamp=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
        if shape: v.co = Vector(shape(v.co))
    _bevel(bm, bevel, seg); _zclamp(bm, zclamp)
    return _finish(bm, name)

def m_prism(name, pts, y0, y1, bevel=0.03, seg=3, shape=None, zclamp=None):
    """Profile in (x, z), extruded along y."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts]; b = [bm.verts.new((x, y1, z)) for x, z in pts]
    bm.faces.new(a); bm.faces.new(list(reversed(b))); n = len(pts)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new([a[j], a[i], b[i], b[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if shape:
        for v in bm.verts: v.co = Vector(shape(v.co))
    _bevel(bm, bevel, seg); _zclamp(bm, zclamp)
    return _finish(bm, name)

def m_cyl(name, r, length, axis='X', seg=32, bevel=0.012, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=length)
    if bevel > 0:
        rim = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 1.0]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
    if axis == 'X': bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.pi / 2, 4, 'Y'), verts=bm.verts[:])
    elif axis == 'Y': bmesh.ops.transform(bm, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'), verts=bm.verts[:])
    return _finish(bm, name, 50.0)

def m_sq(name, rx, ry, rz, e1=0.6, e2=0.6, nu=48, nv=24, zmin=None, zmax=None):
    """Superellipsoid (rounded-box dome). zmin / zmax flatten it (in local units)."""
    def sp(w, m, fn):
        c = fn(w); return math.copysign(abs(c) ** m, c)
    bm = bmesh.new(); rings = []
    for j in range(1, nv):
        v = -math.pi / 2 + math.pi * j / nv; ring = []
        for i in range(nu):
            u = -math.pi + 2 * math.pi * i / nu
            x = rx * sp(v, e1, math.cos) * sp(u, e2, math.cos); y = ry * sp(v, e1, math.cos) * sp(u, e2, math.sin); z = rz * sp(v, e1, math.sin)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    bot = bm.verts.new((0, 0, -rz)); top = bm.verts.new((0, 0, rz))
    for j in range(len(rings) - 1):
        for i in range(nu):
            k = (i + 1) % nu; bm.faces.new([rings[j][i], rings[j][k], rings[j + 1][k], rings[j + 1][i]])
    for i in range(nu):
        k = (i + 1) % nu; bm.faces.new([bot, rings[0][k], rings[0][i]]); bm.faces.new([top, rings[-1][i], rings[-1][k]])
    for v in bm.verts:
        if zmin is not None and v.co.z < zmin: v.co.z = zmin
        if zmax is not None and v.co.z > zmax: v.co.z = zmax
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish(bm, name, 40.0)

def add(name, mesh, mat, parent, loc=(0, 0, 0), rot=(0, 0, 0), coll=None, wn=True):
    ob = bpy.data.objects.new(name, mesh); ob.location = loc; ob.rotation_euler = rot
    mesh.materials.append(S.mats[mat] if isinstance(mat, str) else mat)
    (coll or S.cur).objects.link(ob); ob.parent = parent
    if wn:
        md = ob.modifiers.new('wn', 'WEIGHTED_NORMAL'); md.keep_sharp = True; md.weight = 100
    return ob
def empty(name, parent, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(name, None); ob.location = loc; ob.empty_display_size = 0.15
    S.cur.objects.link(ob); ob.parent = parent
    return ob
def bolts(name, mat, parent, c, r, n, axis, rr=0.02, h=0.02, phase=0.0):
    """Ring of bolts around centre c (ring radius r) on a face whose normal is `axis` ('X' or 'Y', sign in h)."""
    for i in range(n):
        if r == 0 and rr == 0: break
        a = phase + i / n * math.tau
        if axis == 'Y': loc = (c[0] + math.cos(a) * r, c[1], c[2] + math.sin(a) * r)
        else: loc = (c[0], c[1] + math.cos(a) * r, c[2] + math.sin(a) * r)
        add(f'{name}{i}', m_cyl(name, rr, abs(h), axis, 10, 0.004), mat, parent, loc, wn=False)

# ------------------------------------------------------------------ legs layer
HIP_Y, HIP_Z = 0.54, 1.62
ANKLE_Y, ANKLE_Z = 0.74, 0.32
L1, L2 = 0.74, 0.76
STRIDE = 0.32          # half step length (m)
WALK_FRAMES = 8
WAIST_Z = 1.95
U_LIFT = WAIST_Z - 1.72   # the upper body is authored with its waist at z = 1.72 and lifted to WAIST_Z

def seam(name, parent, size, loc, rot=(0, 0, 0)):
    return add(name, m_box('seam', size[0], size[1], size[2], 0.0), 'black', parent, loc, rot, wn=False)

def build_legs():
    S.cur = S.legs
    root = empty('legs_dir', None); S.rig['legs_dir'] = root
    pel = empty('pelvis', root); S.rig['pelvis'] = pel
    add('pelvis_block', m_box('pb', 0.74, 0.56, 0.46, 0.08), 'dark', pel, (-0.03, 0, 1.62))
    add('pelvis_belly', m_prism('pbl', [(-0.32, 1.36), (0.28, 1.36), (0.4, 1.52), (0.34, 1.72), (-0.38, 1.72)], -0.2, 0.2, 0.05), 'steel', pel)
    add('cod', m_prism('cod', [(0.33, 1.38), (0.47, 1.47), (0.49, 1.74), (0.33, 1.8)], -0.17, 0.17, 0.035), 'steel', pel)
    seam('cod_seam', pel, (0.02, 0.012, 0.3), (0.488, 0, 1.6))
    add('waist_ring', m_cyl('wr', 0.42, 0.08, 'Z', 40, 0.015), 'steel', pel, (0, 0, WAIST_Z - 0.105))
    add('waist_top', m_cyl('wt', 0.36, 0.065, 'Z', 40, 0.012), 'dark', pel, (0, 0, WAIST_Z - 0.033))
    bolts('wb', 'bright', pel, (0, 0, 0), 0, 0, 'Y')
    for s in (-1, 1):
        add(f'hip_axle{s}', m_cyl('ha', 0.17, 0.3, 'Y', 32, 0.02), 'dark', pel, (0, s * 0.4, HIP_Z))
        # thigh (limb space: pivot at the hip, limb runs along -Z)
        th = empty(f'thigh{s}', root); S.rig[f'thigh{s}'] = th
        add(f'thigh_core{s}', m_box('tc', 0.24, 0.24, L1, 0.03), 'dark', th, (0, 0, -L1 / 2))
        add(f'hip_shell{s}', m_cyl('hs', 0.28, 0.44, 'Y', 40, 0.07), 'paint', th, (0.0, s * 0.02, 0.0))
        add(f'hip_cap{s}', m_cyl('hc', 0.2, 0.05, 'Y', 32, 0.012), 'steel', th, (0.0, s * 0.255, 0.0))
        add(f'hip_capc{s}', m_cyl('hcc', 0.09, 0.03, 'Y', 20, 0.008), 'black', th, (0.0, s * 0.285, 0.0))
        bolts(f'hpb{s}', 'bright', th, (0.0, s * 0.28, 0.0), 0.15, 8, 'Y', 0.018, 0.014)
        def tshape(co):
            t = max(0.0, min(1.0, (0.33 - co.z) / 0.66)); k = 1 - 0.18 * t
            return (co.x * k, co.y * k, co.z)
        add(f'thigh_armor{s}', m_box('ta', 0.62, 0.48, 0.66, 0.12, 4, tshape), 'paint', th, (0.09, s * 0.02, -0.42))
        add(f'thigh_seam{s}', m_box('tas', 0.628, 0.488, 0.66, 0.12, 4, tshape, zclamp=(-0.2, -0.186)), 'black', th, (0.09, s * 0.02, -0.42), wn=False)
        add(f'thigh_plate{s}', m_box('tp', 0.06, 0.3, 0.3, 0.02), 'paint2', th, (0.4, s * 0.02, -0.34), (0, math.radians(4), 0))
        add(f'thigh_side{s}', m_box('tsd', 0.3, 0.03, 0.3, 0.012), 'steel', th, (0.09, s * 0.262, -0.46))
        for bx, bz in ((-0.03, -0.35), (0.21, -0.35), (-0.03, -0.57), (0.21, -0.57)):
            bolts(f'tsb{s}{bx}{bz}', 'bright', th, (bx, s * 0.279, bz), 0.0, 1, 'Y', 0.02, 0.014)
        # shin (pivot at the knee)
        sh = empty(f'shin{s}', root); S.rig[f'shin{s}'] = sh
        add(f'knee_axle{s}', m_cyl('ka', 0.19, 0.56, 'Y', 32, 0.02), 'dark', sh)
        for o in (-1, 1):
            add(f'knee_disc{s}{o}', m_cyl('kd', 0.26, 0.06, 'Y', 40, 0.016), 'steel', sh, (0, o * 0.3, 0))
            add(f'knee_hub{s}{o}', m_cyl('kh', 0.115, 0.03, 'Y', 24, 0.008), 'black', sh, (0, o * 0.338, 0))
            bolts(f'kb{s}{o}', 'bright', sh, (0, o * 0.333, 0), 0.19, 8, 'Y', 0.021, 0.016)
        add(f'knee_cap{s}', m_box('kc', 0.16, 0.36, 0.3, 0.07, 4), 'paint2', sh, (0.2, 0, -0.02))
        add(f'shin_core{s}', m_box('sc', 0.22, 0.24, L2, 0.03), 'dark', sh, (0, 0, -L2 / 2))
        def gshape(co):
            t = max(0.0, min(1.0, (-0.08 - co.z) / 0.62)); k = 1 + 0.18 * t
            return (co.x, co.y * k, co.z)
        sprof = [(-0.2, -0.14), (0.2, -0.14), (0.34, -0.36), (0.32, -0.74), (-0.23, -0.74), (-0.28, -0.38)]
        add(f'shin_armor{s}', m_prism('sa', sprof, -0.23, 0.23, 0.09, 4, gshape), 'paint', sh)
        sprof2 = [(x * 1.012, z) for x, z in sprof]
        add(f'shin_seam{s}', m_prism('sas', sprof2, -0.233, 0.233, 0.09, 4, gshape, zclamp=(-0.52, -0.506)), 'black', sh, wn=False)
        add(f'shin_ridge{s}', m_prism('sr', [(0.28, -0.26), (0.39, -0.37), (0.375, -0.48), (0.28, -0.5)], -0.1, 0.1, 0.02), 'paint2', sh)
        add(f'calf_piston{s}', m_cyl('cp', 0.055, 0.46, 'Z', 16, 0.01), 'bright', sh, (-0.33, 0, -0.33))
        add(f'calf_sleeve{s}', m_cyl('cs', 0.08, 0.22, 'Z', 16, 0.012), 'dark', sh, (-0.33, 0, -0.5))
        # foot (pivot at the ankle, level with the ground)
        ft = empty(f'foot{s}', root); S.rig[f'foot{s}'] = ft
        add(f'ankle_axle{s}', m_cyl('aa', 0.14, 0.54, 'Y', 28, 0.02), 'dark', ft)
        for o in (-1, 1):
            add(f'ankle_disc{s}{o}', m_cyl('ad', 0.19, 0.055, 'Y', 32, 0.012), 'steel', ft, (0, o * 0.285, 0))
            add(f'ankle_hub{s}{o}', m_cyl('ah', 0.08, 0.03, 'Y', 20, 0.008), 'black', ft, (0, o * 0.32, 0))
        add(f'foot_body{s}', m_prism('fb', [(-0.26, -0.32), (0.26, -0.32), (0.3, -0.18), (0.14, -0.04), (-0.16, -0.04), (-0.3, -0.18)], -0.25, 0.25, 0.04), 'dark', ft)
        add(f'instep{s}', m_box('ins', 0.36, 0.46, 0.1, 0.035), 'steel', ft, (0.23, 0, -0.1), (0, math.radians(38), 0))
        for o in (-1, 1):
            toe = add(f'toe{s}{o}', m_prism('toe', [(0.2, -0.32), (0.74, -0.32), (0.81, -0.25), (0.6, -0.11), (0.2, -0.08)], -0.115, 0.115, 0.045), 'paint', ft, (0, o * 0.155, 0), (0, 0, math.radians(o * 9)))
            add(f'toe_tip{s}{o}', m_prism('tt', [(0.7, -0.32), (0.86, -0.32), (0.88, -0.27), (0.77, -0.19)], -0.1, 0.1, 0.015), 'steel', toe)
        add(f'heel{s}', m_prism('heel', [(-0.2, -0.32), (-0.54, -0.32), (-0.6, -0.25), (-0.44, -0.13), (-0.2, -0.11)], -0.13, 0.13, 0.03), 'steel', ft)

def _aim(e, origin, target):
    z = (Vector(origin) - Vector(target)).normalized(); x = Vector((0, 1, 0)).cross(z).normalized(); y = z.cross(x)
    M = Matrix((x, y, z)).transposed().to_4x4(); M.translation = Vector(origin); e.matrix_local = M

DUTY = 0.56            # share of the cycle a foot is on the ground (> 0.5: both feet are down between steps, which reads as heavy)
STEP_LIFT = 0.24
TRAVEL = 2 * STRIDE / (DUTY * WALK_FRAMES)     # metres the body moves per walk frame (the game moves the unit by this much per frame)

def leg_state(p):
    """Foot of one leg at cycle position p (0..1): (ankle x offset, lift, foot pitch; + = toes down)."""
    p %= 1.0
    if p < DUTY: return STRIDE * (1 - 2 * p / DUTY), 0.0, 0.0        # stance: the planted foot moves back under the body at constant speed
    t = (p - DUTY) / (1 - DUTY); e = t * t * (3 - 2 * t)
    lift = STEP_LIFT * math.sin(math.pi * min(1.0, t * 1.08)) ** 0.85
    return -STRIDE + 2 * STRIDE * e, max(0.0, lift), 0.34 * math.sin(math.tau * t) * (1 - 0.35 * t)   # toes drop at lift-off, heel leads into the landing

def body_state(phase):
    """Pelvis motion: (bob up/down, sway left/right) in metres. Lowest when both feet are down, shifted over the standing leg."""
    if phase is None: return 0.0, 0.0
    bob = -0.04 * math.cos(2 * math.tau * (phase - (DUTY - 0.5) / 2)) - 0.012
    sway = 0.055 * math.cos(math.tau * (phase - DUTY / 2))
    return bob, sway

def pose_legs(phase=None, crouch=0.0):
    """phase None = standing. Otherwise 0..1 through the walk cycle. Returns the body bob (m) for the upper layer."""
    bob, sway = body_state(phase)
    bob -= crouch
    S.rig['pelvis'].location = (0, sway, bob); S.sway = sway
    for s in (-1, 1):
        dx, lift, pitch = (0.0, 0.0, 0.0) if phase is None else leg_state(phase + (0.0 if s > 0 else 0.5))
        H = Vector((0.0, s * HIP_Y + sway, HIP_Z + bob)); A = Vector((0.04 + dx, s * ANKLE_Y, ANKLE_Z + lift))
        v = A - H; d = min(v.length, L1 + L2 - 1e-4); u = v.normalized()
        a = (L1 * L1 - L2 * L2 + d * d) / (2 * d); h = math.sqrt(max(0.0, L1 * L1 - a * a))
        f = Vector((1, 0, 0)); p = (f - u * f.dot(u)).normalized()        # the knee bends forward
        K = H + u * a + p * h
        _aim(S.rig[f'thigh{s}'], H, K); _aim(S.rig[f'shin{s}'], K, A)
        S.rig[f'foot{s}'].matrix_local = Matrix.Translation(A) @ Matrix.Rotation(math.radians(s * 5), 4, 'Z') @ Matrix.Rotation(pitch, 4, 'Y')
    return bob

# ------------------------------------------------------------------ upper layer: torso + shoulders (authored with the waist at z = 1.72)
CAB_W = 0.7
ARM_Y, ARM_Z = CAB_W + 0.44, 2.07
def build_torso(kind):
    S.cur = S.upper
    root = empty('upper_dir', None); S.rig['upper_dir'] = root
    up = empty('upper', root, (0, 0, U_LIFT)); S.rig['upper'] = up
    add('collar', m_cyl('col', 0.38, 0.2, 'Z', 40, 0.02), 'dark', up, (0, 0, 1.82))
    add('collar_ring', m_cyl('colr', 0.44, 0.07, 'Z', 40, 0.015), 'steel', up, (0, 0, 1.765))
    tilt = empty('tilt', up); S.rig['tilt'] = tilt
    piv = Vector((0, 0, 1.9)); tilt.matrix_local = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(5), 4, 'Y') @ Matrix.Translation(-piv)
    def sm(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
    def cab(co):
        k = (1 - 0.24 * sm((co.x - 0.1) / 0.6)) * (1 - 0.13 * sm((co.z - 2.3) / 0.28)) * (1 - 0.12 * sm((2.05 - co.z) / 0.15))
        return (co.x, co.y * k, co.z)
    prof = [(-0.66, 1.90), (0.44, 1.90), (0.68, 2.04), (0.73, 2.30), (0.47, 2.56), (-0.5, 2.58), (-0.7, 2.42), (-0.7, 2.04)]
    add('cab', m_prism('cab', prof, -CAB_W, CAB_W, 0.08, 4, cab), 'paint', tilt)
    W = CAB_W
    for s in (-1, 1):
        seam(f'cab_seam_h{s}', tilt, (0.96, 0.012, 0.014), (-0.24, s * (W + 0.001), 2.3))
        seam(f'cab_seam_v{s}', tilt, (0.014, 0.012, 0.38), (-0.4, s * (W + 0.001), 2.11))
        add(f'strip_frame{s}', m_box('sf', 0.46, 0.02, 0.11, 0.008), 'black', tilt, (-0.08, s * (W + 0.002), 2.17))
        add(f'strip{s}', m_box('st', 0.4, 0.02, 0.05, 0.006), 'glow', tilt, (-0.08, s * (W + 0.009), 2.17), wn=False)
        add(f'side_panel{s}', m_box('sp', 0.2, 0.024, 0.28, 0.01), 'paint2', tilt, (-0.54, s * (W + 0.002), 2.13))
        for bz in (2.03, 2.23):
            bolts(f'spb{s}{bz}', 'bright', tilt, (-0.54, s * (W + 0.016), bz), 0.0, 1, 'Y', 0.02, 0.014)
        for i in range(7):
            bolts(f'csb{s}{i}', 'bright', tilt, (-0.28 + i * 0.1, s * (W + 0.006), 2.265), 0.0, 1, 'Y', 0.016, 0.012)
    gs = math.atan2(0.26, 0.26)          # slope of the upper front (glacis), from vertical
    add('glacis_plate', m_box('gp', 0.03, 0.66, 0.25, 0.012), 'paint2', tilt, (0.612, 0, 2.442), (0, -gs, 0))
    seam('glacis_seam', tilt, (0.036, 0.014, 0.26), (0.614, 0, 2.444), (0, -gs, 0))
    for by in (-0.28, 0.28):
        bolts(f'glb{by}', 'bright', tilt, (0.622, by, 2.452), 0.0, 1, 'X', 0.0, 0.0)
    # cockpit hatch with the visor
    add('hatch', m_prism('hatch', [(-0.26, 2.56), (0.44, 2.54), (0.33, 2.74), (-0.16, 2.75)], -0.34, 0.34, 0.045), 'paint2', tilt)
    vs = math.atan2(0.11, 0.20)
    add('visor_frame', m_box('vf', 0.03, 0.58, 0.14, 0.01), 'black', tilt, (0.392, 0, 2.64), (0, -vs, 0))
    add('visor', m_box('vz', 0.03, 0.5, 0.08, 0.008), 'glow', tilt, (0.403, 0, 2.642), (0, -vs, 0), wn=False)
    add('hatch_lid', m_cyl('hl', 0.16, 0.03, 'Z', 28, 0.01), 'steel', tilt, (-0.03, 0, 2.762))
    add('roof_vent', m_box('rv', 0.18, 0.56, 0.03, 0.008), 'black', tilt, (-0.47, 0, 2.588))
    for i in range(4):
        add(f'roof_slat{i}', m_box('rs', 0.02, 0.52, 0.02, 0.004), 'steel', tilt, (-0.53 + i * 0.04, 0, 2.606), (0, math.radians(20), 0), wn=False)
    bolts('hlb', 'bright', tilt, (-0.03, 0, 2.78), 0.0, 0, 'X')
    # chest vent grille (one side) and access plate (other side)
    fr = math.radians(-8.7)
    add('grille_box', m_box('gb', 0.05, 0.38, 0.2, 0.012), 'black', tilt, (0.692, 0.22, 2.17), (0, fr, 0))
    for i in range(5):
        add(f'slat{i}', m_box('sl', 0.035, 0.35, 0.018, 0.004), 'steel', tilt, (0.704 + 0.006 * i, 0.22, 2.098 + i * 0.036), (0, fr + math.radians(25), 0), wn=False)
    add('chest_plate', m_box('cpl', 0.03, 0.32, 0.18, 0.012), 'paint2', tilt, (0.697, -0.25, 2.17), (0, fr, 0))
    add('chest_lamp', m_cyl('cl', 0.05, 0.03, 'X', 20, 0.006), 'glow', tilt, (0.719, -0.25, 2.17), wn=False)
    add('chin', m_prism('chin', [(0.3, 1.9), (0.48, 1.9), (0.67, 2.02), (0.62, 2.06)], -0.4, 0.4, 0.02), 'steel', tilt)
    # engine pack
    add('pack', m_box('pack', 0.36, 1.06, 0.56, 0.06), 'steel', tilt, (-0.85, 0, 2.22))
    for i in range(4):
        add(f'fin{i}', m_box('fin', 0.05, 0.8, 0.035, 0.008), 'dark', tilt, (-1.035, 0, 2.06 + i * 0.1), wn=False)
    for s in (-1, 1):
        add(f'stack{s}', m_cyl('stk', 0.1, 0.3, 'Z', 24, 0.015), 'dark', tilt, (-0.86, s * 0.33, 2.62))
        add(f'stack_in{s}', m_cyl('stki', 0.07, 0.02, 'Z', 20, 0.0), 'black', tilt, (-0.86, s * 0.33, 2.772), wn=False)
    if kind != 'avenger':
        add('antenna_base', m_cyl('ab', 0.05, 0.06, 'Z', 16, 0.008), 'dark', tilt, (-0.4, -0.46, 2.6))
        add('antenna', m_cyl('an', 0.013, 0.5, 'Z', 8, 0.0), 'bright', tilt, (-0.4, -0.46, 2.86), wn=False)
    # shoulders: big rounded armour blocks with a steel rim, a seam band and a bolted joint disc
    SY, SZ = ARM_Y, 2.36
    def pshape(co):
        k = 1 - 0.14 * sm((co.z + 0.02) / 0.3)
        return (co.x * k, co.y * k, co.z)
    for s in (-1, 1):
        add(f'sh_axle{s}', m_cyl('sha', 0.2, 0.3, 'Y', 32, 0.02), 'dark', up, (-0.04, s * (CAB_W + 0.1), 2.32))
        add(f'pauldron{s}', m_box('pd', 0.94, 0.64, 0.56, 0.15, 5, pshape), 'paint', up, (-0.04, s * SY, SZ))
        add(f'pauldron_seam{s}', m_box('pds', 0.948, 0.648, 0.56, 0.15, 5, pshape, zclamp=(0.03, 0.044)), 'black', up, (-0.04, s * SY, SZ), wn=False)
        add(f'pauldron_rim{s}', m_box('pr', 1.0, 0.7, 0.13, 0.045, 3), 'steel', up, (-0.04, s * SY, SZ - 0.24))
        if kind != 'avenger': add(f'pauldron_top{s}', m_box('pt', 0.52, 0.34, 0.05, 0.02), 'paint2', up, (-0.04, s * SY, SZ + 0.285))
        for bx, by in ([] if kind == 'avenger' else ((-0.2, -0.11), (0.2, -0.11), (-0.2, 0.11), (0.2, 0.11))):
            add(f'ptb{s}{bx}{by}', m_cyl('ptb', 0.02, 0.014, 'Z', 10, 0.004), 'bright', up, (-0.04 + bx, s * SY + by, SZ + 0.315), wn=False)
        if s > 0:
            add('pauldron_band', m_box('pdb', 0.946, 0.646, 0.56, 0.15, 5, pshape, zclamp=(-0.15, -0.085)), 'emblem', up, (-0.04, s * SY, SZ), wn=False)
        for bx in (-0.36, -0.12, 0.12, 0.36):
            bolts(f'prb{s}{bx}', 'bright', up, (-0.04 + bx, s * (SY + 0.352), SZ - 0.24), 0.0, 1, 'Y', 0.02, 0.014)
        add(f'sh_disc{s}', m_cyl('sd', 0.17, 0.05, 'Y', 32, 0.012), 'steel', up, (-0.04, s * (SY + 0.33), SZ - 0.03))
        add(f'sh_hub{s}', m_cyl('shh', 0.08, 0.03, 'Y', 20, 0.008), 'black', up, (-0.04, s * (SY + 0.36), SZ - 0.03))
        bolts(f'shb{s}', 'bright', up, (-0.04, s * (SY + 0.355), SZ - 0.03), 0.13, 6, 'Y', 0.017, 0.014)
        add(f'upper_arm{s}', m_box('ua', 0.3, 0.3, 0.3, 0.04), 'dark', up, (0.0, s * SY, 2.02))
    return up

# ------------------------------------------------------------------ weapon modules (upper layer; nothing below WAIST_Z)


def w_kodiak(up):
    """Two big plasma cannons: armoured housing, long boxy barrel with glowing plasma cells, glowing muzzle."""
    for s in (-1, 1):
        y = s * ARM_Y
        add(f'k_house{s}', m_box('kh', 0.92, 0.44, 0.5, 0.06), 'steel', up, (0.12, y, ARM_Z))
        add(f'k_house_top{s}', m_box('kht', 0.7, 0.36, 0.09, 0.03), 'paint2', up, (0.1, y, ARM_Z + 0.27))
        add(f'k_breech{s}', m_box('kb', 0.2, 0.36, 0.42, 0.04), 'dark', up, (-0.42, y, ARM_Z))
        add(f'k_barrel{s}', m_box('kbr', 1.02, 0.3, 0.36, 0.035), 'steel', up, (1.05, y, ARM_Z))
        add(f'k_rail{s}', m_box('krl', 0.86, 0.16, 0.06, 0.02), 'paint2', up, (1.0, y, ARM_Z + 0.2))
        for o in (-1, 1):
            add(f'k_cellf{s}{o}', m_box('kcf', 0.74, 0.02, 0.17, 0.008), 'black', up, (1.02, y + o * 0.152, ARM_Z))
            add(f'k_cell{s}{o}', m_box('kc', 0.68, 0.02, 0.1, 0.006), 'plasma', up, (1.02, y + o * 0.158, ARM_Z), wn=False)
            for i in range(5):
                add(f'k_rib{s}{o}{i}', m_box('krb', 0.035, 0.03, 0.15, 0.006), 'dark', up, (0.74 + i * 0.14, y + o * 0.162, ARM_Z), wn=False)
        add(f'k_muzzle{s}', m_box('km', 0.2, 0.36, 0.42, 0.04), 'dark', up, (1.64, y, ARM_Z))
        add(f'k_bore{s}', m_cyl('kbo', 0.115, 0.03, 'X', 28, 0.0), 'plasma', up, (1.735, y, ARM_Z), wn=False)
        add(f'k_core{s}', m_cyl('kco', 0.06, 0.032, 'X', 20, 0.0), 'plasma_core', up, (1.738, y, ARM_Z), wn=False)
    return [(1.75, s * ARM_Y, ARM_Z) for s in (-1, 1)]

def w_cougar(up):
    """Four long magma barrels: two stacked per arm, copper heat bands, glowing muzzles."""
    mz = []
    for s in (-1, 1):
        y = s * ARM_Y
        add(f'c_recv{s}', m_box('cr', 0.7, 0.38, 0.56, 0.06), 'steel', up, (0.02, y, ARM_Z + 0.01))
        add(f'c_recv_top{s}', m_box('crt', 0.56, 0.32, 0.08, 0.025), 'paint2', up, (0.0, y, ARM_Z + 0.31))
        add(f'c_back{s}', m_box('cb', 0.16, 0.3, 0.44, 0.03), 'dark', up, (-0.4, y, ARM_Z))
        for k, z in enumerate((ARM_Z + 0.15, ARM_Z - 0.15)):
            add(f'c_collar{s}{k}', m_cyl('cc', 0.13, 0.14, 'X', 28, 0.015), 'dark', up, (0.43, y, z))
            add(f'c_barrel{s}{k}', m_cyl('cbr', 0.085, 1.1, 'X', 28, 0.01), 'steel', up, (1.0, y, z))
            for i in range(4):
                add(f'c_band{s}{k}{i}', m_cyl('cbd', 0.105, 0.09, 'X', 28, 0.012), 'copper', up, (0.68 + i * 0.22, y, z))
            add(f'c_tip{s}{k}', m_cyl('ct', 0.12, 0.16, 'X', 28, 0.02), 'dark', up, (1.6, y, z))
            add(f'c_bore{s}{k}', m_cyl('cbo', 0.08, 0.03, 'X', 24, 0.0), 'magma', up, (1.675, y, z), wn=False)
            add(f'c_core{s}{k}', m_cyl('cco', 0.04, 0.032, 'X', 16, 0.0), 'magma_core', up, (1.678, y, z), wn=False)
            mz.append((1.7, y, z))
        add(f'c_brace{s}', m_box('cbrc', 0.07, 0.1, 0.42, 0.015), 'dark', up, (1.13, y, ARM_Z))
    return mz

def w_gatling(up, spin=0.0):
    """Two six-barrel rotary guns with a motor drum and an ammo box."""
    mz = []
    for s in (-1, 1):
        y = s * ARM_Y
        add(f'g_motor{s}', m_cyl('gm', 0.27, 0.62, 'X', 36, 0.04), 'steel', up, (0.0, y, ARM_Z))
        add(f'g_motor_band{s}', m_cyl('gmb', 0.288, 0.2, 'X', 36, 0.015), 'paint', up, (0.05, y, ARM_Z))
        add(f'g_rear{s}', m_cyl('gr', 0.2, 0.1, 'X', 28, 0.02), 'dark', up, (-0.36, y, ARM_Z))
        add(f'g_ammo{s}', m_box('ga', 0.42, 0.2, 0.34, 0.035), 'steel', up, (-0.05, y + s * 0.33, ARM_Z + 0.02))
        add(f'g_feed{s}', m_box('gf', 0.16, 0.14, 0.1, 0.02), 'dark', up, (0.02, y + s * 0.2, ARM_Z + 0.16))
        rot = empty(f'g_spin{s}', up, (0, y, ARM_Z)); rot.rotation_euler = (spin, 0, 0)
        add(f'g_shaft{s}', m_cyl('gs', 0.07, 1.1, 'X', 16, 0.01), 'dark', rot, (0.86, 0, 0))
        for i in range(6):
            a = i / 6 * math.tau
            add(f'g_brl{s}{i}', m_cyl('gb', 0.052, 1.14, 'X', 16, 0.008), 'dark', rot, (0.9, math.cos(a) * 0.15, math.sin(a) * 0.15))
            add(f'g_bore{s}{i}', m_cyl('gbo', 0.03, 0.01, 'X', 12, 0.0), 'black', rot, (1.472, math.cos(a) * 0.15, math.sin(a) * 0.15), wn=False)
        for x, r in ((0.36, 0.25), (0.86, 0.225), (1.36, 0.225)):
            add(f'g_clamp{s}{x}', m_cyl('gc', r, 0.08, 'X', 36, 0.015), 'steel', rot, (x, 0, 0))
        mz.append((1.5, y, ARM_Z))
    return mz

def w_avenger(up):
    """Anti-air: a twin missile launcher on each shoulder (four missiles), a radar dish on the roof, armoured arm stubs with a sensor lens."""
    tilt = S.rig['tilt']; SZ = 2.36
    for s in (-1, 1):
        add(f'a_stub{s}', m_box('as', 0.5, 0.34, 0.36, 0.06), 'paint', up, (0.08, s * ARM_Y, ARM_Z + 0.02))
        add(f'a_stub_cap{s}', m_box('asc', 0.1, 0.26, 0.28, 0.03), 'dark', up, (0.36, s * ARM_Y, ARM_Z + 0.02))
        add(f'a_lens{s}', m_cyl('al', 0.07, 0.03, 'X', 24, 0.0), 'glow', up, (0.415, s * ARM_Y, ARM_Z + 0.02), wn=False)
    mz = []
    for s in (-1, 1):
        y0 = s * ARM_Y
        add(f'a_base{s}', m_box('ab', 0.46, 0.4, 0.1, 0.03), 'dark', up, (-0.06, y0, SZ + 0.34))
        for o in (-1, 1):
            add(f'a_ear{s}{o}', m_box('ae', 0.2, 0.05, 0.2, 0.02), 'steel', up, (-0.1, y0 + o * 0.2, SZ + 0.46))
        rack = empty(f'a_rack{s}', up, (-0.1, y0, SZ + 0.5)); rack.rotation_euler = (0, -math.radians(34), 0)
        add(f'a_pivot{s}', m_cyl('apv', 0.07, 0.5, 'Y', 20, 0.012), 'dark', rack)
        add(f'a_cradle{s}', m_box('acr', 0.86, 0.4, 0.07, 0.02), 'steel', rack, (0.16, 0, 0.06))
        for x in (-0.14, 0.44):
            add(f'a_clamp{s}{x}', m_box('ac', 0.09, 0.5, 0.1, 0.02), 'dark', rack, (x, 0, 0.1))
        for o in (-1, 1):
            n = f'{s}{o}'; y = o * 0.135; z = 0.19
            add(f'a_body{n}', m_cyl('amb', 0.085, 1.3, 'X', 28, 0.012), 'white', rack, (0.3, y, z))
            add(f'a_band{n}', m_cyl('amd', 0.089, 0.08, 'X', 28, 0.006), 'paint2', rack, (0.72, y, z))
            add(f'a_nose{n}', m_cyl('amn', 0.085, 0.42, 'X', 28, 0.0, r2=0.008), 'red', rack, (1.16, y, z))
            add(f'a_tail{n}', m_cyl('amt', 0.065, 0.06, 'X', 24, 0.008), 'dark', rack, (-0.38, y, z))
            for k in range(4):
                a = math.pi / 4 + k * math.pi / 2
                add(f'a_fin{n}{k}', m_prism('afn', [(-0.34, 0.07), (-0.08, 0.07), (-0.18, 0.165), (-0.34, 0.165)], -0.009, 0.009, 0.0), 'dark', rack, (0.0, y, z), (a, 0, 0), wn=False)
            mz.append((1.36, y0 + y, SZ + 0.5))
    # radar dish on the rear of the roof (reads as "anti-air" at game size)
    add('r_base', m_cyl('rb', 0.13, 0.08, 'Z', 24, 0.015), 'dark', tilt, (-0.42, 0, 2.62))
    add('r_mast', m_cyl('rm', 0.045, 0.3, 'Z', 16, 0.008), 'steel', tilt, (-0.42, 0, 2.8))
    dish = empty('r_dish', tilt, (-0.42, 0, 2.98)); dish.rotation_euler = (0, -math.radians(28), 0); S.rig['radar'] = dish
    add('r_yoke', m_box('ry', 0.1, 0.3, 0.1, 0.02), 'dark', dish, (-0.05, 0, 0))
    add('r_bowl', m_cyl('rbw', 0.06, 0.13, 'X', 36, 0.0, r2=0.33), 'white', dish, (0.03, 0, 0))
    add('r_rim', m_cyl('rr', 0.34, 0.03, 'X', 36, 0.008), 'steel', dish, (0.1, 0, 0))
    add('r_face', m_cyl('rf', 0.315, 0.012, 'X', 36, 0.0), 'dark', dish, (0.112, 0, 0), wn=False)
    add('r_feed', m_cyl('rfd', 0.028, 0.2, 'X', 12, 0.004), 'steel', dish, (0.2, 0, 0))
    add('r_tip', m_cyl('rt', 0.045, 0.05, 'X', 16, 0.006), 'glow', dish, (0.31, 0, 0), wn=False)
    return mz

def w_achilles(up):
    """Close combat: armoured arms with fists and a large cleaver blade on each forearm."""
    for s in (-1, 1):
        y = s * (ARM_Y + 0.02)
        add(f'h_elbow{s}', m_cyl('he', 0.18, 0.42, 'Y', 28, 0.02), 'steel', up, (0.02, y, ARM_Z))
        add(f'h_fore{s}', m_box('hf', 0.8, 0.4, 0.4, 0.08, 4), 'paint', up, (0.46, y, ARM_Z - 0.01), (0, math.radians(3), 0))
        add(f'h_guard{s}', m_box('hg', 0.5, 0.44, 0.09, 0.03), 'steel', up, (0.4, y, ARM_Z + 0.2), (0, math.radians(3), 0))
        add(f'h_wrist{s}', m_cyl('hw', 0.14, 0.12, 'X', 24, 0.015), 'dark', up, (0.9, y, ARM_Z - 0.04))
        add(f'h_fist{s}', m_box('hfi', 0.3, 0.36, 0.34, 0.06, 4), 'steel', up, (1.1, y, ARM_Z - 0.05))
        for i in range(4):
            add(f'h_fing{s}{i}', m_box('hfg', 0.12, 0.075, 0.24, 0.025), 'dark', up, (1.25, y + (i - 1.5) * 0.088, ARM_Z - 0.08), wn=False)
        add(f'h_knuckle{s}', m_box('hk', 0.14, 0.38, 0.1, 0.03), 'paint2', up, (1.16, y, ARM_Z + 0.13))
        # blade: mounted on the outside of the forearm, leaning out so its flat shows from above
        bl = empty(f'h_blade_root{s}', up, (0.24, y + s * 0.3, ARM_Z + 0.04)); bl.rotation_euler = (s * math.radians(-10), 0, s * math.radians(5))
        bp = [(-0.34, 0.02), (-0.14, 0.2), (1.05, 0.2), (2.15, -0.03), (1.75, -0.17), (0.9, -0.24), (0.1, -0.24), (-0.26, -0.18)]
        add(f'h_blade{s}', m_prism('hb', bp, -0.035, 0.035, 0.022, 2), 'bright', bl)
        ep = [(2.15, -0.03), (1.75, -0.17), (0.9, -0.24), (0.1, -0.24), (-0.26, -0.18), (-0.24, -0.13), (0.1, -0.18), (0.9, -0.18), (1.72, -0.115), (2.0, -0.02)]
        add(f'h_edge{s}', m_prism('hbe', ep, -0.012, 0.012, 0.0), 'white', bl, wn=False)
        add(f'h_blade_spine{s}', m_prism('hbs', [(-0.3, 0.05), (-0.14, 0.2), (1.0, 0.2), (0.98, 0.1), (-0.1, 0.08)], -0.055, 0.055, 0.015), 'dark', bl)
        for bx in (0.1, 0.45, 0.8):
            bolts(f'hbb{s}{bx}', 'steel', bl, (bx, s * 0.06, 0.14), 0.0, 1, 'Y', 0.03, 0.02)
        add(f'h_blade_mount{s}', m_box('hbm', 0.56, 0.16, 0.22, 0.03), 'dark', up, (0.42, y + s * 0.2, ARM_Z + 0.02))
    return []

WEAPONS = {'kodiak': w_kodiak, 'cougar': w_cougar, 'gatling': w_gatling, 'avenger': w_avenger, 'achilles': w_achilles}

def build(kind='kodiak', team='#33d17a', spin=0.0, scheme='paint'):
    reset_scene(); make_materials(team, scheme); S.kind = kind
    build_legs(); up = build_torso(kind)
    S.muzzles = WEAPONS[kind](up) if kind != 'gatling' else w_gatling(up, spin)
    pose_legs(None); setup_world()

def set_dirs(legs=0, torso=None, bob=0.0, wreck=False):
    """Game directions 0..31 (11.25 deg each; 0 = +x = screen lower-right). The torso turns on its own."""
    torso = legs if torso is None else torso
    S.rig['legs_dir'].rotation_euler = (0, 0, -legs * math.tau / 32)
    S.rig['upper_dir'].rotation_euler = (0, 0, -torso * math.tau / 32)
    if not wreck: S.rig['upper'].location = (0, getattr(S, 'sway', 0.0), U_LIFT + bob)

# ------------------------------------------------------------------ world, light, camera, render
def setup_world():
    S.cur = S.env
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new('World'); sc.world = w
    try: w.use_nodes = True
    except Exception: pass
    nt = w.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Incoming'], sep.inputs[0])
    cr = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(_math(nt, 'ADD', _math(nt, 'MULTIPLY', sep.outputs['Z'], -0.5), 0.5), cr.inputs[0])
    e = cr.color_ramp.elements; e[0].position = 0.0; e[0].color = (0.05, 0.045, 0.04, 1); e[1].position = 1.0; e[1].color = (0.62, 0.72, 0.86, 1)
    m = cr.color_ramp.elements.new(0.47); m.color = (0.10, 0.09, 0.08, 1)
    m2 = cr.color_ramp.elements.new(0.56); m2.color = (0.8, 0.79, 0.77, 1)
    nt.links.new(cr.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 0.42; nt.links.new(bg.outputs[0], out.inputs[0])
    def sun(name, d, energy, color, angle):
        L = bpy.data.lights.new(name, 'SUN'); L.energy = energy; L.color = color; L.angle = math.radians(angle)
        ob = bpy.data.objects.new(name, L); S.env.objects.link(ob)
        ob.rotation_euler = Vector(d).normalized().to_track_quat('Z', 'Y').to_euler()
    sun('key', (0.35, -0.6, 1.0), 3.8, (1.0, 0.97, 0.92), 9)      # the game's light L = (0.35, 0.6, 1) in game axes: from the top-left
    sun('rim', (-0.7, 0.75, 0.35), 2.8, (0.75, 0.86, 1.0), 20)
    sun('fill', (1.0, 0.25, 0.25), 0.55, (1.0, 0.95, 0.9), 40)
    gp = bpy.data.meshes.new('ground'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30); bm.to_mesh(gp); bm.free()
    g = bpy.data.objects.new('ground', gp); S.env.objects.link(g); g.is_shadow_catcher = True; S.rig['ground'] = g
    gm = bpy.data.materials.new('ground_dark'); gnt = _nt(gm)       # dark earth: the shadow catcher bounces little light back up,
    go = gnt.nodes.new('ShaderNodeOutputMaterial'); gb = gnt.nodes.new('ShaderNodeBsdfPrincipled'); gnt.links.new(gb.outputs[0], go.inputs[0])
    gb.inputs['Base Color'].default_value = (0.1, 0.085, 0.065, 1); gb.inputs['Roughness'].default_value = 1.0   # so sprites with and without the shadow layer match
    gp.materials.append(gm)
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; co = bpy.data.objects.new('cam', cam); S.env.objects.link(co); sc.camera = co; S.rig['cam'] = co

def setup_render(samples=64, gpu=True, outline=True):
    sc = bpy.context.scene; S.outline = outline
    import addon_utils
    addon_utils.enable('cycles')
    sc.render.engine = 'CYCLES'; cy = sc.cycles
    dev = 'CPU'
    if gpu:
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for t in ('OPTIX', 'CUDA'):
                try:
                    prefs.compute_device_type = t; prefs.get_devices()
                    gp = [d for d in prefs.devices if d.type == t]
                    if gp:
                        for d in prefs.devices: d.use = d.type == t
                        dev = 'GPU'; break
                except Exception: pass
        except Exception: pass
    cy.device = dev; cy.samples = samples; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.02
    cy.use_denoising = True
    try: cy.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    cy.max_bounces = 4; cy.diffuse_bounces = 2; cy.glossy_bounces = 3; cy.transparent_max_bounces = 4
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
    sc.render.use_freestyle = bool(outline)
    if outline:
        vl = bpy.context.view_layer; fs = vl.freestyle_settings
        while len(fs.linesets): fs.linesets.remove(fs.linesets[0])
        ls = fs.linesets.new('outline'); ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
        ls.select_external_contour = True; ls.select_material_boundary = False
        fs.crease_angle = math.radians(128)
        ls.linestyle.color = (0.012, 0.015, 0.02); ls.linestyle.thickness = 1.0
        sc.render.line_thickness_mode = 'ABSOLUTE'
    return dev

def setup_camera(W, H, a, zc=1.6):
    """a = px per metre of (x - y) on screen (the game's ix scale). Origin lands at (W/2, H/2 + zc * a * 4/3)."""
    sc = bpy.context.scene; cam = S.rig['cam']
    sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    sc.render.pixel_aspect_x = STRETCH; sc.render.pixel_aspect_y = 1.0
    cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.ortho_scale = W / (a * math.sqrt(2))
    d = Vector((1, -1, 0.75)).normalized(); target = Vector((0, 0, zc))
    cam.location = target + d * 40; cam.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    cam.data.clip_start = 1; cam.data.clip_end = 100
    sc.render.line_thickness = max(0.9, a / 70.0)
    return (W / 2, H / 2 + zc * a * 4 / 3)

def project(p):
    """World point -> pixel (for checking the camera against the game's projection)."""
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    sc = bpy.context.scene; v = world_to_camera_view(sc, S.rig['cam'], Vector(p))
    return (v.x * sc.render.resolution_x, (1 - v.y) * sc.render.resolution_y)

def set_layer(layer='all'):
    """'all' | 'all+shadow' | 'legs' | 'upper' | 'shadow' (ground shadow of the whole walker) | 'shadow_legs' | 'shadow_upper'
    (ground shadow of one layer only). In the shadow layers the walker is invisible but still casts its shadow."""
    sc = bpy.context.scene
    for coll, name in ((S.legs, 'legs'), (S.upper, 'upper')):
        show = layer in ('all', 'all+shadow', name)
        cast = layer == 'shadow' or layer == 'shadow_' + name
        for ob in coll.objects:
            if ob.get('lost'): ob.hide_render = True; continue
            ob.hide_render = not (show or cast)
            ob.visible_camera = show
    S.rig['ground'].hide_render = not (layer.startswith('shadow') or layer == 'all+shadow')
    sc.render.use_freestyle = bool(S.outline) and not layer.startswith('shadow')

def render(path):
    sc = bpy.context.scene; sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path

def preview_ground(on=True):
    """For look-dev previews: a real tan ground instead of the shadow catcher, and an opaque film."""
    g = S.rig['ground']; g.is_shadow_catcher = not on
    if on and g.data.materials[0].name != 'ground_prev':
        g.data.materials.clear()
        gm = bpy.data.materials.new('ground_prev'); nt = _nt(gm)
        out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs[0], out.inputs[0])
        b.inputs['Base Color'].default_value = (0.19, 0.155, 0.11, 1); b.inputs['Roughness'].default_value = 0.95
        g.data.materials.append(gm)
    bpy.context.scene.render.film_transparent = not on

def preview(kind, dirs, tag, W=1000, H=1000, a=160.0, samples=96, team='#33d17a', dmg=0, phase=None, torso=None):
    build(kind, team); dev = setup_render(samples, gpu=True, outline=True); preview_ground(True)
    setup_camera(W, H, a, 1.6); set_layer('all+shadow'); set_damage(dmg)
    bob = pose_legs(phase)
    out = []
    for d in dirs:
        set_dirs(d, torso, bob)
        out.append(render(os.path.join(ROOT_OUT, '%s_%s_d%d.png' % (tag, kind, d))))
    return out


LOST_AT_BURNING = ['antenna', 'pauldron_top-1', 'glacis_plate', 'stack1', 'stack_in1', 'thigh_plate1', 'chest_plate', 'chest_lamp']

def apply_damage(d):
    """0 intact, 1 damaged, 2 burning (some parts lost), 3 wreck (collapsed, charred, all glows off)."""
    set_damage(d)
    for n in LOST_AT_BURNING:
        ob = bpy.data.objects.get(n)
        if ob: ob['lost'] = 1 if d >= 2 else 0
    up = S.rig['upper']; tilt_fix = S.rig['upper_dir']
    if d >= 3:
        pose_legs(None, crouch=0.78)
        for s in (-1, 1):                      # knees splay out as the legs fold
            S.rig[f'foot{s}'].matrix_local = S.rig[f'foot{s}'].matrix_local @ Matrix.Rotation(math.radians(s * 16), 4, 'Z')
        up.matrix_local = Matrix.Translation((0.1, 0.06, U_LIFT - 0.8)) @ Matrix.Rotation(math.radians(19), 4, 'Y') @ Matrix.Rotation(math.radians(-9), 4, 'X')
        return -0.78
    up.matrix_local = Matrix.Translation((0, 0, U_LIFT))
    return 0.0


def shoot(path, W, H, a, legs=0, torso=None, layer='all+shadow', phase=None, dmg=0, mode='beauty', zc=1.6):
    """One sprite. Returns the anchor pixel (where the ground point under the walker's centre lands) and the upper body's
    offset in px (x right, y down) for this walk frame: the upper sprite is baked once per direction and moved by this."""
    anchor = setup_camera(W, H, a, zc)
    bob = pose_legs(phase); apply_damage(dmg)
    set_dirs(legs, torso, bob, wreck=dmg >= 3); set_mask_mode(mode); set_layer(layer)
    sway = getattr(S, 'sway', 0.0); th = -legs * math.tau / 32
    wx, wy = -math.sin(th) * sway, math.cos(th) * sway           # sway is along the body's local Y; game y = -Blender y
    off = (a * (wx + wy), a * ((wx - wy) / 2 - bob * 4 / 3))
    if layer == 'upper':                                          # the upper sprite itself is always rendered without the walk offset
        S.rig['upper'].location = (0, 0, U_LIFT)
    render(path)
    return anchor, off


# ------------------------------------------------------------------ bake (approved 2026-11-19): every sprite at @4x, one fixed frame for all layers
BK_W, BK_H, BK_MUL = 384, 384, 4
BK_A = PX_PER_UNIT_1X * M2U * BK_MUL                 # px per metre at @4x
BK_ANCHOR = (BK_W / 2, 264.0)                        # where the ground point under the walker's centre lands, in every sprite
BK_ZC = (BK_ANCHOR[1] - BK_H / 2) / (BK_A * 4 / 3)
POSES = ['s'] + list(range(WALK_FRAMES))             # 's' = standing, then the walk frames

def _bk(path, **kw):
    if os.path.exists(path): return 0
    os.makedirs(os.path.dirname(path), exist_ok=True)
    shoot(path, BK_W, BK_H, BK_A, zc=BK_ZC, **kw); return 1

def bake_legs(out, dirs, states=(0, 1, 2)):
    n = 0
    for dmg in states:
        for mode in ('A', 'B'):          # mode outermost: changing the paint colour forces a slow shader update, changing the pose does not
            for d in dirs:
                for p in POSES:
                    n += _bk(os.path.join(out, 'legs', 's%d' % dmg, 'd%02d_%s_%s.png' % (d, p, mode)), legs=d, torso=d, layer='legs',
                             phase=None if p == 's' else p / WALK_FRAMES, dmg=dmg, mode=mode)
    return n

def bake_upper(out, kind, dirs, states=(0, 1, 2)):
    n = 0
    for dmg in states:
        for mode in ('A', 'B'):
            for d in dirs:
                n += _bk(os.path.join(out, kind, 's%d' % dmg, 'd%02d_%s.png' % (d, mode)), legs=d, torso=d, layer='upper', dmg=dmg, mode=mode)
    return n

def bake_extras(out, kind):
    """Per walker: the whole-walker ground shadow and the upper-body-only ground shadow for 32 directions, and the wreck in 8 directions."""
    n = 0
    for d in range(32):
        n += _bk(os.path.join(out, kind, 'shadow', 'd%02d.png' % d), legs=d, torso=d, layer='shadow')
    for d in range(32):
        n += _bk(os.path.join(out, kind, 'shadow_upper', 'd%02d.png' % d), legs=d, torso=d, layer='shadow_upper')
    for d in range(0, 32, 4):
        n += _bk(os.path.join(out, kind, 'wreck', 'd%02d.png' % d), legs=d, torso=d, layer='all+shadow', dmg=3, mode='A')
    return n

def bake_leg_shadows(out, dirs):
    """The legs-only ground shadow for every pose (shared by all five walkers)."""
    n = 0
    for d in dirs:
        for p in POSES:
            n += _bk(os.path.join(out, 'legs', 'shadow', 'd%02d_%s.png' % (d, p)), legs=d, torso=d, layer='shadow_legs', phase=None if p == 's' else p / WALK_FRAMES)
    return n

def bake_tables():
    """Per direction and walk frame: where the upper sprite goes relative to its standing position, in @1x px (x right, y down)."""
    a = PX_PER_UNIT_1X * M2U; t = {}
    for d in range(32):
        row = []; th = -d * math.tau / 32
        for f in range(WALK_FRAMES):
            bob, sway = body_state(f / WALK_FRAMES); wx, wy = -math.sin(th) * sway, math.cos(th) * sway
            row.append([round(a * (wx + wy), 3), round(a * ((wx - wy) / 2 - bob * 4 / 3), 3)])
        t[d] = row
    return {'upper_offset_1x': t, 'travel_m': TRAVEL, 'travel_model_units': TRAVEL * M2U, 'travel_game_units': TRAVEL * M2U * 0.4,
            'anchor_4x': list(BK_ANCHOR), 'frame_4x': [BK_W, BK_H], 'px_per_metre_4x': BK_A, 'walk_frames': WALK_FRAMES, 'directions': 32}
