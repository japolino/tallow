"""
Tallow's shared art pipeline (docs/ART.md, part 2). Every model script imports this.

  palette()            the shared palette image (models/palette.png), made if missing
  mat(role)            the one material for a role: palette x baked vertex colour, roughness/metal by role
  paint(obj, ...)      UV each face onto its role's ramp in the palette (shadow/base/edge/highlight by facing)
  wobble(bm, ...)      a hand-made unevenness of a few millimetres
  finish(obj, bevel)   applied transforms, then Bevel (angle-limited, 2 segments) and Weighted Normal
  bake(objs)           apply the stack, bake AO (Cycles) and edge wear into COLOR_0
  render(objs, out)    the judge's views: three-quarter, side, top, under a warm key and cool fill
  export(objs, path)   GLB, +Y up, transforms applied, vertex colours on, no cameras or lights

Blender's axes: +Z up, the front faces -Y (it faces +Z in the room after export). Metres. Origin: base centre.
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow"), "models")
ROOT = os.path.dirname(HERE)
PALETTE_PNG = os.path.join(HERE, "palette.png")

# Each family: shadow, base, worn edge, highlight (sRGB). One row of the palette each.
FAMILIES = [
    ("soot", ["0E0B09", "16110E", "2A211B", "3D3128"]),
    ("oak_dark", ["24160D", "3A2416", "52341F", "6A452A"]),
    ("oak_mid", ["4A2F1A", "6B4527", "8A5A33", "A87244"]),
    ("oak_light", ["6E4A2B", "9C6B3F", "B98950", "D4A867"]),
    ("wax", ["B5A27E", "E3D3AE", "EEE2C4", "F5ECD6"]),
    ("parchment", ["9A7E55", "C9A877", "DABE90", "E6CFA6"]),
    ("leather", ["3A130E", "5A1F18", "7A3225", "94452F"]),
    ("brass", ["5E4619", "9A7832", "BC9748", "D6B76A"]),
    ("pewter", ["55575B", "838588", "A2A5A8", "BFC2C4"]),
    ("ember", ["7A2E10", "C2541E", "D9733A", "E89452"]),
    ("moss", ["10190F", "1C2A22", "2C3E32", "3F5444"]),
    ("ink", ["121B2E", "1F2E4A", "2E4166", "3F5683"]),
    ("night", ["141922", "202838", "303B50", "434F66"]),
    ("bone", ["9E8E6C", "D8C9A4", "E6DABD", "F0E7D1"]),
    ("iron", ["26272B", "3A3B40", "55575C", "717378"]),
    ("glass", ["1E2C26", "34483F", "5A7266", "8AA294"]),
]
ROW = {name: i for i, (name, _) in enumerate(FAMILIES)}
GRID = 16  # 16 x 16 swatches
SW = 16  # pixels a swatch

# Material roles: (palette family, roughness, metalness). Several roles may share a family.
ROLES = {
    "wood": ("oak_mid", 0.72, 0.0),
    "wood_dark": ("oak_dark", 0.8, 0.0),
    "wood_light": ("oak_light", 0.68, 0.0),
    "soot": ("soot", 0.9, 0.0),
    "wax": ("wax", 0.6, 0.0),
    "paper": ("parchment", 0.9, 0.0),
    "leather": ("leather", 0.62, 0.0),
    "brass": ("brass", 0.55, 1.0),
    "pewter": ("pewter", 0.6, 1.0),
    "iron": ("iron", 0.6, 1.0),
    "ember": ("ember", 0.55, 0.0),
    "felt": ("moss", 0.95, 0.0),
    "paper_edge": ("parchment", 0.9, 0.0),
    "bottle": ("glass", 0.22, 0.0),
    "wool": ("leather", 0.95, 0.0),
    "wool_dark": ("ink", 0.95, 0.0),
    "wool_light": ("parchment", 0.95, 0.0),
    "ink": ("ink", 0.6, 0.0),
    "bone": ("bone", 0.62, 0.0),
    "glass": ("glass", 0.3, 0.0),
    "cloth": ("soot", 0.95, 0.0),
    "rope": ("oak_light", 0.9, 0.0),
}


def hex_rgb(h):
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def palette():
    """The palette image (made from FAMILIES, written to models/palette.png, packed so the GLB carries it)."""
    img = bpy.data.images.get("palette")
    if img:
        return img
    size = GRID * SW
    img = bpy.data.images.new("palette", size, size, alpha=False)
    px = [0.0] * (size * size * 4)
    for row, (_, tones) in enumerate(FAMILIES):
        for col in range(GRID):
            rgb = hex_rgb(tones[min(col, 3)])
            for y in range(SW):
                yy = size - 1 - (row * SW + y)  # row 0 at the top
                for x in range(SW):
                    i = (yy * size + col * SW + x) * 4
                    px[i : i + 4] = [*rgb, 1.0]
    img.pixels = px
    img.filepath_raw = PALETTE_PNG
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def uv_of(family, tone):
    """The middle of a swatch, in UV space (V up)."""
    return ((min(tone, 3) + 0.5) / GRID, 1 - (ROW[family] + 0.5) / GRID)


def mat(role):
    """One shared material per role: palette (nearest) x the baked vertex colour."""
    m = bpy.data.materials.get(role)
    if m:
        return m
    family, rough, metal = ROLES[role]
    m = bpy.data.materials.new(role)
    m["family"] = family
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = palette()
    tex.interpolation = "Closest"
    col = nt.nodes.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(col.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    return m


def clear():
    """Empty the scene and its orphans (models, materials, images except the palette are made again)."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.armatures, bpy.data.actions):
        for b in list(coll):
            coll.remove(b)
    for img in list(bpy.data.images):
        if img.name != "palette":
            bpy.data.images.remove(img)


def new_object(name, bm, roles):
    """A mesh object from a bmesh, with one material slot per role (face.material_index follows `roles`)."""
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    ca = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    for d in ca.data:
        d.color = (1, 1, 1, 1)
    me.color_attributes.active_color = ca
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    for r in roles:
        me.materials.append(mat(r))
    return o


# --------------------------------------------------------------- shaping helpers


def lathe(bm, profile, segs=16, mat_index=0, z0=0.0, squash=1.0, at=(0.0, 0.0)):
    """A turned form from a profile [(r, z), ...] bottom to top: bmesh spin of the edge chain.
    Points with r == 0 close at the axis. Returns (new verts, new faces)."""
    old_v, old_f = set(bm.verts), set(bm.faces)
    verts = [bm.verts.new((max(r, 0.0), 0.0, z + z0)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segs, use_merge=True)
    new_v = [v for v in bm.verts if v not in old_v]
    bmesh.ops.remove_doubles(bm, verts=new_v, dist=1e-6)
    new_v = [v for v in bm.verts if v not in old_v]
    for v in new_v:
        v.co.y *= squash
        v.co.x += at[0]
        v.co.y += at[1]
    new_f = [f for f in bm.faces if f not in old_f]
    for f in new_f:
        f.material_index = mat_index
    return new_v, new_f


def tube(bm, points, radius, segs=8, mat_index=0, cap=True, squash=1.0, closed=False):
    """Sweep a ring along a path (rings oriented by the path's tangent, then bridged): handles, quills, chains,
    hoops. `radius` may be a number or a function of t in 0..1. Returns the new faces."""
    old_f = set(bm.faces)
    pts = [Vector(p) for p in points]
    rings = []
    prev_side = None
    for i, p in enumerate(pts):
        t = i / max(1, len(pts) - 1)
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        fwd = (b - a).normalized()
        ref = Vector((0, 0, 1)) if abs(fwd.z) < 0.9 else Vector((1, 0, 0))
        side = fwd.cross(ref).normalized() if prev_side is None else (prev_side - fwd * prev_side.dot(fwd)).normalized()
        prev_side = side
        up = side.cross(fwd).normalized()
        r = radius(t) if callable(radius) else radius
        ring = [bm.verts.new(p + (side * math.cos(k / segs * math.tau) + up * squash * math.sin(k / segs * math.tau)) * r) for k in range(segs)]
        rings.append(ring)
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for r0, r1 in pairs:
        for k in range(segs):
            bm.faces.new((r0[k], r0[(k + 1) % segs], r1[(k + 1) % segs], r1[k]))
    if cap and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    new_f = [f for f in bm.faces if f not in old_f]
    for f in new_f:
        f.material_index = mat_index
    return new_f


def box(bm, size, at=(0, 0, 0), mat_index=0):
    """A box with its base at at.z (for starting meshes only; shape it afterwards)."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res["verts"]
    for v in vs:
        v.co = Vector((v.co.x * size[0] + at[0], v.co.y * size[1] + at[1], (v.co.z + 0.5) * size[2] + at[2]))
    faces = list({f for v in vs for f in v.link_faces})
    for f in faces:
        f.material_index = mat_index
    return vs, faces


def wobble(bm, amount=0.0015, scale=18.0, seed=0, verts=None, lift=0.0):
    """Push each vertex a little along a smooth noise field: the unevenness of a thing made by hand."""
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.93))
    for v in verts if verts is not None else bm.verts:
        p = v.co * scale + off
        d = noise.noise_vector(p)
        v.co += Vector((d.x, d.y, d.z * (1.0 if lift else 0.6))) * amount


def lean(bm, angle=0.02, axis="X", verts=None):
    """Tilt by shear, keeping the base where it is."""
    for v in verts if verts is not None else bm.verts:
        if axis == "X":
            v.co.x += v.co.z * math.tan(angle)
        else:
            v.co.y += v.co.z * math.tan(angle)


def faces_where(bm, test):
    return [f for f in bm.faces if test(f)]


# --------------------------------------------------------------- finishing


def apply_transforms(o):
    """Bake rotation and scale into the mesh (headless-safe), keep the location."""
    loc = o.matrix_basis.to_translation()
    rs = o.matrix_basis.copy()
    rs.translation = (0, 0, 0)
    o.data.transform(rs)
    o.matrix_basis.identity()
    o.location = loc


def finish(o, bevel=0.0015, segments=2, angle=30.0, weighted=True, subsurf=0):
    """The non-destructive stack: Bevel (angle-limited) > [Subsurf] > Weighted Normal. Transforms applied first."""
    apply_transforms(o)
    o["bevel_w"] = bevel
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segments
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(angle)
        b.harden_normals = True
        b.miter_outer = "MITER_ARC"
    if subsurf:
        s = o.modifiers.new("subsurf", "SUBSURF")
        s.levels = s.render_levels = subsurf
    if weighted:
        try:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
        except Exception:
            for p in o.data.polygons:
                p.use_smooth = True
        w = o.modifiers.new("weighted", "WEIGHTED_NORMAL")
        w.keep_sharp = True
        w.weight = 50
    return o


def apply_stack(o):
    """Apply every modifier (only for baking and export)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = o.data
    o.modifiers.clear()
    o.data = me
    me.name = old.name
    if old.users == 0:
        bpy.data.meshes.remove(old)


def paint(o, tone_bias=0.0, noise_amt=0.0, seed=1, tones=None, edge=0.07):
    """UV every face onto the palette swatch of its material's family. Tone 1 (base) by default, with a little
    noise so the ramp looks painted; faces on worn convex edges (mean vertex convexity above `edge`) take tone 2,
    faces in creases or facing down tone 0. `tones` may fix a tone per material index ({index: tone})."""
    me = o.data
    if o.get("noise") is not None:
        noise_amt = float(o["noise"])
    if tones is None and o.get("tones"):
        tones = {int(k): int(v) for k, v in o["tones"].items()}
    uv = me.uv_layers.get("UVMap") or me.uv_layers.new(name="UVMap")
    rnd = random.Random(seed)
    cur = _curvature(me)
    narrow = 2.5 * float(o.get("bevel_w", 0.0015) or 0.0015) + 1e-4
    for p in me.polygons:
        m = me.materials[p.material_index] if me.materials else None
        fam = (m.get("family") if m else None) or "oak_mid"
        if tones and p.material_index in tones:
            t = tones[p.material_index]
        else:
            # a face is a worn edge only if all its corners are convex (a bevel strip), a crease only if all are
            # concave: a big face that merely touches an edge keeps its base tone
            cmin = min(cur[i] for i in p.vertices)
            cmax = max(cur[i] for i in p.vertices)
            c = cmin if cmin > 0 else (cmax if cmax < 0 else 0.0)
            vs = [me.vertices[i].co for i in p.vertices]
            short = min((vs[i] - vs[i - 1]).length for i in range(len(vs)))
            if c > 0 and short > narrow:
                c = 0.0  # a broad face is never an edge, whatever its corners touch
            t = 1.0 + tone_bias + rnd.uniform(-noise_amt, noise_amt)
            if c > edge * 2.5:
                t = 3.0 if rnd.random() < 0.5 else 2.0
            elif c > edge:
                t = 2.0
            elif c < -edge or p.normal.z < -0.5:
                t = 0.0
        t = int(round(max(0, min(3, t))))
        u, v = uv_of(fam, t)
        for li in p.loop_indices:
            uv.data[li].uv = (u, v)


def _curvature(me):
    """Per-vertex convexity: + for edges that stick out, - for creases, about -1..1."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    cur = [0.0] * len(bm.verts)
    for v in bm.verts:
        if not v.link_edges:
            continue
        n = v.normal
        acc = 0.0
        for e in v.link_edges:
            d = e.other_vert(v).co - v.co
            ln = d.length
            if ln > 1e-9:
                acc += n.dot(d / ln)
        cur[v.index] = -acc / len(v.link_edges)
    bm.free()
    return cur


def densify(o, max_edge):
    """Cut long edges on flat stretches so a vertex-colour bake has points to land on (no triangle banding)."""
    if not max_edge:
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for _ in range(3):
        long = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True, smooth=0.0)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(o.data)
    bm.free()


def bake(objs, ao_samples=64, ao_distance=0.03, ground=True, wear=0.4, cavity=0.55, floor=0.18, max_edge=None, apply=True):
    """Apply each stack, then bake AO (Cycles, to vertex colours) and edge wear into the colour attribute 'Col'.
    Final colour = (floor + (1 - floor) * ao) * (1 - cavity * crease) * (1 - wear + wear * edge).
    `max_edge` (metres, or {object name: metres}) cuts long edges first so the bake has somewhere to land.
    `apply=False` leaves each object's stack alone (a skinned mesh keeps its armature; bake it at rest)."""
    scene = bpy.context.scene
    for o in objs if apply else ():
        densify(o, o.get("max_edge") or (max_edge.get(o.name) if isinstance(max_edge, dict) else max_edge))
        apply_stack(o)
    plane = None
    if ground:
        bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -0.0002))
        plane = bpy.context.object
    old_engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = ao_samples
    scene.cycles.device = "CPU"
    scene.render.bake.margin = 0
    scene.world = scene.world or bpy.data.worlds.new("World")
    scene.world.light_settings.distance = ao_distance
    for o in objs:
        me = o.data
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        ca = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        scene.world.light_settings.distance = max(ao_distance, min(0.18, 0.22 * max(o.dimensions)))
        try:
            bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        except Exception as e:  # no Cycles: curvature only
            print("tallow: AO bake failed:", e)
            for d in ca.data:
                d.color = (1, 1, 1, 1)
        cur = _curvature(me)
        for li, loop in enumerate(me.loops):
            ao = ca.data[li].color[0]
            c = cur[loop.vertex_index]
            edge = max(0.0, min(1.0, c * 6.0))
            crease = max(0.0, min(1.0, -c * 6.0))
            k = (floor + (1 - floor) * ao) * (1 - cavity * crease) * (1 - wear + wear * edge)
            k = max(0.05, min(1.0, k))
            ca.data[li].color = (k, k, k, 1.0)
    if plane:
        bpy.data.objects.remove(plane, do_unlink=True)
    scene.render.engine = old_engine


def tris(objs):
    n = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
    return n


def thin(o, target):
    """Decimate (collapse) a mesh to about `target` triangles; vertex groups come along, interpolated."""
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n > target:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        dec = o.modifiers.new("Thin", "DECIMATE")
        dec.ratio = target / n
        bpy.ops.object.modifier_apply(modifier=dec.name)
    return o


def normal_bake(high, low, material, size=512, extrusion=0.002, distance=0.006):
    """Unwrap `low`, bake `high`'s surface into a tangent-space normal map on it (Cycles, selected to active), and wire
    the map into `material` so the glTF exporter writes it as the normal texture."""
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    uv = low.data.uv_layers.get("UVMap") or low.data.uv_layers.new(name="UVMap")
    low.data.uv_layers.active = uv
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(f"{low.name}_normal", size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    material.use_nodes = True
    nt = material.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
    nt.nodes.active = tex
    scene = bpy.context.scene
    old = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.cycles.device = "CPU"
    bk = scene.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = extrusion
    bk.max_ray_distance = distance
    bk.margin = 4
    bk.normal_space = "TANGENT"
    high.hide_render = False
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type="NORMAL")
    bk.use_selected_to_active = False
    scene.render.engine = old
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    img.pack()
    return img


# --------------------------------------------------------------- judge renders


def _look_at(cam, target):
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = -lo
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def render(objs, out_prefix, size=640, views=("three_quarter", "side", "top"), table=True):
    """Render the judge's views of `objs` (hiding everything else) under one warm key and a cool fill on dark.
    Returns the image paths."""
    scene = bpy.context.scene
    hidden = [o for o in scene.objects if o not in objs and o.type == "MESH"]
    for o in hidden:
        o.hide_render = True
    lo, hi = bounds(objs)
    ctr = (lo + hi) / 2
    rad = max((hi - lo).length / 2, 0.02)
    made = []
    extras = []
    if table:
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=rad * 6)
        uvl = bm.loops.layers.uv.new("UVMap")
        for f in bm.faces:
            for l in f.loops:
                l[uvl].uv = uv_of("oak_dark", 1)
        t = new_object("judge_table", bm, ["wood_dark"])
        t.location = (ctr.x, ctr.y, lo.z - 0.0005)
        extras.append(t)
    key = bpy.data.lights.new("judge_key", "POINT")
    key.color = (1.0, 0.62, 0.32)
    key.energy = 5.0 * (rad / 0.1) ** 2
    key.shadow_soft_size = rad * 0.3
    ko = bpy.data.objects.new("judge_key", key)
    ko.location = ctr + Vector((-rad * 2.2, -rad * 2.0, rad * 1.2))
    fill = bpy.data.lights.new("judge_fill", "AREA")
    fill.color = (0.45, 0.55, 0.85)
    fill.energy = 1.2 * (rad / 0.1) ** 2
    fill.size = rad * 3
    fo = bpy.data.objects.new("judge_fill", fill)
    fo.location = ctr + Vector((rad * 3, rad * 2.5, rad * 2.5))
    rim = bpy.data.lights.new("judge_rim", "POINT")
    rim.color = (1.0, 0.7, 0.4)
    rim.energy = 2.0 * (rad / 0.1) ** 2
    ro = bpy.data.objects.new("judge_rim", rim)
    ro.location = ctr + Vector((rad * 1.5, rad * 3.0, rad * 1.8))
    for x in (ko, fo, ro):
        scene.collection.objects.link(x)
        extras.append(x)
    _look_at(fo, ctr)
    for name, colr, at, sz in (("judge_warm", (3.0, 1.7, 0.7), (-2, -3, 1.5), (3, 2)), ("judge_cool", (0.25, 0.3, 0.5), (3, 2, 2.5), (4, 1))):
        cb = bmesh.new()
        bmesh.ops.create_grid(cb, x_segments=1, y_segments=1, size=0.5)
        for v in cb.verts:
            v.co.x *= sz[0]
            v.co.y *= sz[1]
        cm = bpy.data.meshes.new(name)
        cb.to_mesh(cm)
        cb.free()
        em = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        em.use_nodes = True
        nt = em.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL":
                nt.nodes.remove(n)
        e = nt.nodes.new("ShaderNodeEmission")
        e.inputs[0].default_value = (*colr, 1)
        e.inputs[1].default_value = 0.6
        nt.links.new(e.outputs[0], next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL").inputs[0])
        cm.materials.append(em)
        co = bpy.data.objects.new(name, cm)
        k = rad / 0.12
        co.location = ctr + Vector(at) * k
        co.scale = (k, k, k)
        _look_at(co, ctr)
        co.rotation_euler.rotate_axis("X", math.pi)
        co.visible_camera = False
        co.visible_shadow = False
        scene.collection.objects.link(co)
        extras.append(co)
    cam_d = bpy.data.cameras.new("judge_cam")
    cam_d.lens = 70
    cam_d.clip_start = rad * 0.05
    cam_d.clip_end = rad * 100
    cam = bpy.data.objects.new("judge_cam", cam_d)
    scene.collection.objects.link(cam)
    extras.append(cam)
    scene.camera = cam
    w = scene.world or bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    bg = next((n for n in w.node_tree.nodes if n.type == "BACKGROUND"), None)
    if bg:
        bg.inputs[0].default_value = (0.03, 0.022, 0.016, 1)
        bg.inputs[1].default_value = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    dirs = {"three_quarter": (-0.75, -1.0, 0.65), "side": (-1.0, 0.0, 0.18), "top": (0.0, -0.25, 1.0), "front": (0.0, -1.0, 0.25), "seat": (0.0, -1.0, 0.42)}
    dist = rad / math.tan(math.radians(14.5)) * 1.05
    for v in views:
        d = Vector(dirs[v]).normalized()
        cam.location = ctr + d * dist
        _look_at(cam, ctr)
        path = f"{out_prefix}-{v}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        made.append(path)
    for x in extras:
        bpy.data.objects.remove(x, do_unlink=True)
    for o in hidden:
        o.hide_render = False
    return made


# --------------------------------------------------------------- export


def export(objs, path, animations=False, tangents=False, quantize=True):  # noqa: C901
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=tangents,
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_animations=animations,
    )
    if quantize:
        quantize_glb(path)
    print(f"tallow: wrote {path} ({os.path.getsize(path) // 1024} KB, {tris(objs)} tris)")


def quantize_glb(path, positions=True):
    """Shrink a GLB's vertex data in place with KHR_mesh_quantization, which three.js's GLTFLoader reads as it is:
    normals to int8, palette UVs to uint16, vertex colours to uint8, and (for meshes that are not skinned) positions to
    int16, the mesh's node carrying the offset and the uniform scale that put them back. A prop placed by room.ts is
    therefore put inside a carrier group rather than moved itself."""
    import json
    import struct

    import numpy as np

    data = open(path, "rb").read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    j = json.loads(data[20:20 + jlen])
    bin0 = 20 + jlen + 8
    blen = struct.unpack_from("<I", data, 20 + jlen)[0]
    raw = data[bin0:bin0 + blen]
    views, accs = j["bufferViews"], j["accessors"]
    users = {}
    for i, a in enumerate(accs):
        users.setdefault(a.get("bufferView"), []).append(i)
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    dtype = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}

    def read(ai):
        a = accs[ai]
        v = views[a["bufferView"]]
        n = width[a["type"]]
        dt = np.dtype(dtype[a["componentType"]])
        stride = v.get("byteStride", n * dt.itemsize)
        buf = np.frombuffer(raw, np.uint8, a["count"] * stride, v.get("byteOffset", 0) + a.get("byteOffset", 0))
        return buf.reshape(a["count"], stride)[:, : n * dt.itemsize].copy().view(dt).reshape(a["count"], n)

    new = {}  # bufferView -> (bytes, stride)

    def put(ai, arr, ctype, pad_to):
        a = accs[ai]
        n = arr.shape[1]
        out = np.zeros((arr.shape[0], pad_to), arr.dtype)
        out[:, :n] = arr
        new[a["bufferView"]] = (out.tobytes(), pad_to * arr.dtype.itemsize if pad_to != n else None)
        a["componentType"] = ctype
        a["normalized"] = True
        a.pop("byteOffset", None)

    owner = {}
    for ni, node in enumerate(j.get("nodes", [])):
        if "mesh" in node:
            owner.setdefault(node["mesh"], []).append(ni)
    for mi, mesh in enumerate(j["meshes"]):
        nodes = owner.get(mi, [])
        movable = positions and len(nodes) == 1 and not any(k in j["nodes"][nodes[0]] for k in ("skin", "matrix", "rotation", "scale", "translation"))
        prims = mesh["primitives"]
        if movable:
            pos = [read(p["attributes"]["POSITION"]) for p in prims]
            lo = np.min([q.min(0) for q in pos], 0)
            hi = np.max([q.max(0) for q in pos], 0)
            c = (lo + hi) / 2
            h = float(max((hi - lo).max() / 2, 1e-6)) * 1.0001
            node = j["nodes"][nodes[0]]
            node["translation"] = [float(x) for x in c]
            node["scale"] = [h, h, h]
        for k, p in enumerate(prims):
            at = p["attributes"]
            if any(len(users.get(accs[ai].get("bufferView"), [])) != 1 for ai in at.values()):
                continue
            if movable:
                ai = at["POSITION"]
                q = np.clip(np.round((read(ai) - c) / h * 32767), -32767, 32767).astype(np.int16)
                put(ai, q, 5122, 4)
                accs[ai]["min"] = [int(x) for x in q.min(0)]
                accs[ai]["max"] = [int(x) for x in q.max(0)]
            if "NORMAL" in at and accs[at["NORMAL"]]["componentType"] == 5126:
                put(at["NORMAL"], np.clip(np.round(read(at["NORMAL"]) * 127), -127, 127).astype(np.int8), 5120, 4)
            uvk = "TEXCOORD_0"
            if uvk in at and accs[at[uvk]]["componentType"] == 5126:
                uv = read(at[uvk])
                if uv.min() >= 0 and uv.max() <= 1:
                    put(at[uvk], np.round(uv * 65535).astype(np.uint16), 5123, 2)
            ck = "COLOR_0"
            if ck in at:
                col = read(at[ck]).astype(np.float64)
                ct = accs[at[ck]]["componentType"]
                scale = {5126: 1.0, 5123: 65535.0, 5121: 255.0}[ct]
                if ct != 5121:
                    put(at[ck], np.round(col / scale * 255).astype(np.uint8), 5121, col.shape[1])
            # Skin weights as normalized bytes. Each vertex's four must still add up to exactly 255, so the rounding
            # error goes onto its heaviest weight.
            wk = "WEIGHTS_0"
            if wk in at and accs[at[wk]]["componentType"] == 5126:
                w = read(at[wk]).astype(np.float64)
                w /= np.maximum(w.sum(1, keepdims=True), 1e-9)
                q = np.floor(w * 255 + 0.5).astype(np.int32)
                top = q.argmax(1)
                q[np.arange(len(q)), top] += 255 - q.sum(1)
                put(at[wk], np.clip(q, 0, 255).astype(np.uint8), 5121, 4)
    # Animation: drop every channel that only ever holds its node's rest value (scale 1, a bone's own offset) - the
    # mixer then leaves that property alone, which is the same thing - and pack rotations into int16.
    rest = {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]}
    for an in j.get("animations", []):
        keep = []
        for ch in an["channels"]:
            smp = an["samplers"][ch["sampler"]]
            node = j["nodes"][ch["target"]["node"]]
            path_ = ch["target"]["path"]
            if path_ in rest and "matrix" not in node:
                vals = read(smp["output"])
                r = np.array(node.get(path_, rest[path_]), np.float64)
                if np.abs(vals - r).max() < 1e-5:
                    continue
            keep.append(ch)
        used = sorted({ch["sampler"] for ch in keep})
        remap = {old_i: new_i for new_i, old_i in enumerate(used)}
        an["samplers"] = [an["samplers"][i] for i in used]
        for ch in keep:
            ch["sampler"] = remap[ch["sampler"]]
        an["channels"] = keep
        for ch in keep:
            smp = an["samplers"][ch["sampler"]]
            ai = smp["output"]
            if ch["target"]["path"] == "rotation" and accs[ai]["componentType"] == 5126 and len(users.get(accs[ai]["bufferView"], [])) == 1 and accs[ai]["bufferView"] not in new:
                q = read(ai)
                put(ai, np.clip(np.round(q * 32767), -32767, 32767).astype(np.int16), 5122, 4)
                accs[ai].pop("min", None)
                accs[ai].pop("max", None)
    # Leave out the accessors nothing refers to any more, and the views only they used.
    used_a = set()
    for m in j["meshes"]:
        for pr in m["primitives"]:
            used_a |= set(pr["attributes"].values())
            if "indices" in pr:
                used_a.add(pr["indices"])
            for t in pr.get("targets", []):
                used_a |= set(t.values())
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            used_a.add(sk["inverseBindMatrices"])
    for an in j.get("animations", []):
        for smp in an["samplers"]:
            used_a |= {smp["input"], smp["output"]}
    amap = {o: n for n, o in enumerate(sorted(used_a))}
    for m in j["meshes"]:
        for pr in m["primitives"]:
            pr["attributes"] = {k: amap[v] for k, v in pr["attributes"].items()}
            if "indices" in pr:
                pr["indices"] = amap[pr["indices"]]
            if "targets" in pr:
                pr["targets"] = [{k: amap[v] for k, v in t.items()} for t in pr["targets"]]
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = amap[sk["inverseBindMatrices"]]
    for an in j.get("animations", []):
        for smp in an["samplers"]:
            smp["input"], smp["output"] = amap[smp["input"]], amap[smp["output"]]
    accs[:] = [accs[o] for o in sorted(used_a)]
    used_v = {a["bufferView"] for a in accs if "bufferView" in a} | {im["bufferView"] for im in j.get("images", []) if "bufferView" in im}
    vmap = {o: n for n, o in enumerate(sorted(used_v))}
    for a in accs:
        if "bufferView" in a:
            a["bufferView"] = vmap[a["bufferView"]]
    for im in j.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = vmap[im["bufferView"]]
    new = {vmap[k]: v for k, v in new.items() if k in vmap}
    old_views = views
    views = [old_views[o] for o in sorted(used_v)]
    j["bufferViews"] = views
    # Rebuild the binary chunk, every view 4-byte aligned.
    out = bytearray()
    for vi, v in enumerate(views):
        while len(out) % 4:
            out.append(0)
        if vi in new:
            b, stride = new[vi]
            v.pop("byteStride", None)
            if stride:
                v["byteStride"] = stride
        else:
            b = raw[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
        v["byteOffset"] = len(out)
        v["byteLength"] = len(b)
        out += b
    while len(out) % 4:
        out.append(0)
    j["buffers"][0]["byteLength"] = len(out)
    for k in ("extensionsUsed", "extensionsRequired"):
        j[k] = sorted(set(j.get(k, [])) | {"KHR_mesh_quantization"})
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(out), 0x004E4942) + bytes(out))
