# sow_common.py - State of War Game: code shared by every 3D unit model (walkers, tanks) for Blender 5.3.
# Colour rules, materials (wear + damage shader, glows), mesh helpers, world and lights, camera (the game's 2:1 view), render setup.
# Extracted from walker_lib.py (the version with md5 2f2f0ee42681f45e7d33b6bb65db62be) on 2026-11-19. One change: reset_scene makes
# only the 'env' collection (walker_lib made the walkers' 'legs' and 'upper' collections there too).
# Axes: +X forward, Z up, metres. The game's y axis is Blender's -Y.
import bpy, bmesh, math, os, colorsys
from mathutils import Vector, Matrix

M2U = 28.0                 # model units (tank svg units) per metre
PX_PER_UNIT_1X = 0.34641   # sprite px per svg unit of (x - y) at @1x  (0.4 * 0.866)
STRETCH = 0.5 / (0.75 / math.sqrt(2 + 0.5625))   # 1.0672: vertical stretch of a true ortho view along (1,1,0.75) to get the game's 2:1 view
TEAMS = {'green': '#33d17a', 'blue': '#3b82f6', 'red': '#e5484d', 'orange': '#f5a524', 'purple': '#a855f7', 'cyan': '#22d3ee'}
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
class S: pass
S.mats = {}; S.rig = {}; S.outline = True
def reset_scene():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections): bpy.data.collections.remove(coll)
    for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.node_groups):
        for d in list(blk):
            try: blk.remove(d)
            except Exception: pass
    S.mats = {}; S.rig = {}
    sc = bpy.context.scene
    S.env = bpy.data.collections.new('env'); sc.collection.children.link(S.env)        # each unit model adds its own layer collections
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
def set_damage(d):
    for mat in S.mats.values():
        n = mat.node_tree.nodes.get('DMG')
        if n: n.outputs[0].default_value = float(d)
def set_mask_mode(mode, gain=1.0):
    """'beauty': real colours. 'A': paint black, team lights off. 'B': paint pure red albedo, team lights pure green.
    B - A = the team mask (R = paint shading, G = light glow); A = everything that is not team coloured.
    gain < 1 renders B darker (red = gain, green = gain) so highlights brighter than 1.0 are not cut off in an 8-bit file;
    the packer divides the mask by the same gain."""
    up = S.paint_srgb
    for mat in S.mats.values():
        role = mat.get('role'); nt = mat.node_tree; base = nt.nodes.get('BASE')
        if role == 'paint':
            sh = mat.get('shade', 1.0)
            c = lin(tuple(x * sh for x in up)) if mode == 'beauty' else (0, 0, 0) if mode == 'A' else (sh * gain, 0, 0)
            base.outputs[0].default_value = (*c, 1)
        elif role == 'light':
            c = lin(S.glow_srgb) if mode == 'beauty' else (0, 0, 0) if mode == 'A' else (0, gain, 0)
            base.outputs[0].default_value = (*c, 1)
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
