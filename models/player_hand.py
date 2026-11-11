"""
Your own hands, as you see them: a real hand built in 3D, posed, and then
drawn the way the room draws everything of yours: flat pale shapes with an ink
line round them. The room shows the pictures (it does not load a model), so
the hands keep the look of a drawing but have the bones of a hand under them.

Three poses:

    pencil  the hand that writes: holding a pencil (the pencil itself is a real
            thing in the room). Two pictures of one sheet, 512 by 1536: the
            whole hand with the forearm in its sleeve, and only the thumb and
            the end of the first finger, which lie over the pencil.
    thumb   the hand that holds a page up by its lower corner, seen from its
            thumb side: the thumb lies on the page, the fingers are behind it.
            Two pictures of one sheet, 512 by 1536: the whole hand (the room
            leaves it out wherever the page is), and only the thumb, which
            lies over the page.
    die     the hand that holds the die: palm up, cupped round it, in six
            stages from closed to flung open (DIE_OPEN). Two pictures of one
            sheet for each, 512 by 512: the palm, and the ends of the fingers
            and thumb, which lie over the die.

Two steps:

    blender --background --python models/player_hand.py
        builds each pose and renders its pictures into models/render/.

    python models/player_hand.py
        (plain Python with Pillow) cuts the pictures down to a few colours and
        writes them into src/room/handsheets.ts, which src/room/drawnhands.ts
        and src/room/hand.ts show.

It can also be run from a running Blender (it clears the scene first).

One unit here is one pixel of the sheet, and the eye looks straight down on
it. A hand is built in its own space (x toward the little finger, y toward the
fingertips, z out of the back of the hand), then turned and laid on the sheet
so that the point the room places it by lands where the room expects it.
"""
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow")
RENDER = os.path.join(ROOT, "models", "render")
SHEETS = os.path.join(ROOT, "src", "room", "handsheets.ts")

# How much finer than the sheet the pictures are rendered.
SCALE = 2
# The writing hand: where finger and thumb pinch, on its sheet (drawnhands.ts places the hand by this point), and the pencil's lean.
ANCHOR = (202.4, 242.3)
PENCIL_LEAN = -5.0
# The hand that holds a page: where the pad of its thumb is (drawnhands.ts places the hand by this point).
THUMB_ANCHOR = (250.0, 278.0)
# The hand with the die: the hollow of the palm, where the die lies (hand.ts), how big the die is on the sheet, and
# how far open the hand is in each of its pictures (0 cupped round the die, 1 flung open).
HOLLOW = (250.0, 300.0)
DIE_R = 55.0
DIE_OPEN = (0.0, 0.125, 0.25, 0.5, 0.75, 1.0)

PALE, SHADE, INK, NAIL = "#efe4c6", "#cbbd9b", "#0a0705", "#f8f1de"
LINE = 5.5

try:
    import bpy
except ImportError:
    bpy = None


# The die hand is twelve pictures: each a little smaller than it was rendered, so that they are not too much to hold.
DIE_PX = 768


def pack():
    """Plain Python: the rendered pictures, in a few colours, as a module the room imports."""
    import base64
    import io

    import numpy as np
    from PIL import Image

    def url(name, size=None):
        im = Image.open(os.path.join(RENDER, f"player_hand_{name}.png")).convert("RGBA")
        # Only the piece that lies in front has a cut edge, with colour kept unseen past it (see render).
        cut = name.endswith("front")
        if size and cut:
            # Colour and alpha made smaller apart, or the unseen colour would be lost with the alpha over it.
            rgb = im.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
            im = Image.merge("RGBA", (*rgb.split(), im.getchannel("A").resize((size, size), Image.Resampling.LANCZOS)))
        elif size:
            im = im.resize((size, size), Image.Resampling.LANCZOS)
        q = im.quantize(colors=64, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        # Cutting down to a few colours turns everything unseen black. The colour past the cut edge is put back: each
        # such pixel gets the nearest of the picture's colours, with no alpha.
        src = np.array(im)
        band = (src[..., 3] == 0) & (src[..., :3].sum(axis=2) > 24) if cut else np.zeros(src.shape[:2], bool)
        if band.any():
            pal = np.array(q.getpalette("RGBA"), dtype=np.int32).reshape(-1, 4)
            solid = pal[pal[:, 3] > 200][:, :3]
            px = src[band][:, :3].astype(np.int32)
            near = np.argmin(((px[:, None, :] - solid[None, :, :]) ** 2).sum(axis=2), axis=1)
            idx = np.array(q)
            slot = {}
            for j in sorted(set(near.tolist())):
                slot[j] = len(pal)
                pal = np.vstack([pal, [*solid[j], 0]])
            idx[band] = [slot[j] for j in near.tolist()]
            q = Image.fromarray(idx.astype(np.uint8), "P")
            q.putpalette(pal.astype(np.uint8).tobytes(), "RGBA")
        buf = io.BytesIO()
        q.save(buf, format="PNG", optimize=True)
        print(name, im.size, len(buf.getvalue()), "bytes")
        return f'"data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"'

    die = ",\n".join(f"    {{ back: {url(f'die{i}_back', DIE_PX)}, front: {url(f'die{i}_front', DIE_PX)} }}" for i in range(len(DIE_OPEN)))
    text = (
        "/**\n"
        " * Your hands, rendered from a 3D hand by models/player_hand.py (do not edit: run that again).\n"
        " *\n"
        " * `back` and `front` are the writing hand: the whole hand and its sleeve, and the thumb and the end of the first\n"
        " * finger, which lie over what the hand holds. `thumb` is the hand that holds a page up by its corner: the whole\n"
        " * hand, and its thumb, which lies over the page. All four are pictures of a sheet three times as tall as it is\n"
        " * wide. `die` is the hand with the die in it, on a square\n"
        " * sheet, once for each stage in DIE_OPEN (0 cupped round the die, 1 flung open): the palm, and the ends of the\n"
        " * fingers and thumb, which lie over the die.\n"
        " */\n"
        "export const HAND_SHEETS = {\n"
        f"  back: {url('back')},\n"
        f"  front: {url('front')},\n"
        f"  thumb: {{ back: {url('thumb_back')}, front: {url('thumb_front')} }},\n"
        f"  die: [\n{die},\n  ],\n"
        "} as const;\n\n"
        "/** How far open the hand is in each picture of `die`. */\n"
        f"export const DIE_OPEN = [{', '.join(str(o) for o in DIE_OPEN)}] as const;\n"
    )
    with open(SHEETS, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote", SHEETS)


if bpy is None:
    pack()
    sys.exit(0)

import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector as V  # noqa: E402


def hull(spheres, seg=20):
    """A closed shape wrapped round some balls."""
    tmp = bmesh.new()
    for c, r in spheres:
        bmesh.ops.create_uvsphere(tmp, u_segments=seg, v_segments=seg // 2, radius=r, matrix=Matrix.Translation(V(c)))
    pts = [v.co.copy() for v in tmp.verts]
    tmp.free()
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    dead = [g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.delete(bm, geom=list(set(dead)), context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def add(group, spheres):
    piece = hull(spheres)
    me = bpy.data.meshes.new("piece")
    piece.to_mesh(me)
    piece.free()
    group.from_mesh(me)
    bpy.data.meshes.remove(me)


def chain(joints):
    """A finger: a run of joints (centre, radius), each stretch wrapped round its two ends."""
    g = bmesh.new()
    for a, b in zip(joints, joints[1:]):
        add(g, [a, b])
    return g


def finger(base, lengths, flex, spread):
    """Joint centres of a finger that bends toward the palm, which way its pad faces, and which way it points."""
    s = math.radians(spread)
    u = V((math.sin(s), math.cos(s), 0))
    z = V((0, 0, 1))
    pts = [V(base)]
    phi = 0.0
    for length, f in zip(lengths, flex):
        phi += math.radians(f)
        pts.append(pts[-1] + (u * math.cos(phi) - z * math.sin(phi)) * length)
    return pts, -u * math.sin(phi) - z * math.cos(phi), u * math.cos(phi) - z * math.sin(phi)


def reach(base, target, lengths, pole):
    """Joint centres of a chain from base to target, every joint bent the same, bowed toward the pole."""
    base, target = V(base), V(target)
    e1 = (target - base).normalized()
    e2 = (V(pole) - e1 * V(pole).dot(e1)).normalized()
    dist = min((target - base).length, sum(lengths) * 0.999)

    def end(beta):
        x = y = 0.0
        pts = [(0.0, 0.0)]
        for i, length in enumerate(lengths):
            x += length * math.cos(-i * beta)
            y += length * math.sin(-i * beta)
            pts.append((x, y))
        return pts

    lo, hi = 0.0, 2.2
    for _ in range(50):
        mid = (lo + hi) / 2
        ex, ey = end(mid)[-1]
        if math.hypot(ex, ey) > dist:
            lo = mid
        else:
            hi = mid
    pts = end((lo + hi) / 2)
    a0 = -math.atan2(pts[-1][1], pts[-1][0])
    return [base + e1 * (x * math.cos(a0) - y * math.sin(a0)) + e2 * (x * math.sin(a0) + y * math.cos(a0)) for x, y in pts]


def tube(points, radius, n=48):
    """A round sleeve along a path that lies flat on the sheet."""
    bm = bmesh.new()
    rings = []
    up = V((0, 0, 1))
    for i, p in enumerate(points):
        t = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        side = t.cross(up).normalized()
        top = side.cross(t).normalized()
        rings.append([bm.verts.new(p + (side * math.cos(a) + top * math.sin(a)) * radius) for a in [2 * math.pi * k / n for k in range(n)]])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new([r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]])
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def nail(tip, r, d, dorsal):
    """A flat oval on the back of a fingertip that points along d."""
    d = d.normalized()
    dorsal = (dorsal - d * dorsal.dot(d)).normalized()
    side = d.cross(dorsal).normalized()
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1.0)
    rot = Matrix((d, side, dorsal)).transposed().to_4x4()
    size = Matrix.Diagonal((r * 0.82, r * 0.66, r * 0.30, 1))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(V(tip) + d * (r * 0.08) + dorsal * (r * 0.80)) @ rot @ size, verts=list(bm.verts))
    return bm


def quad(pts):
    """A flat four-cornered sheet."""
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in pts])
    return bm


def ball(centre, r):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r, matrix=Matrix.Translation(V(centre)))
    return bm


def lin(h):
    """A colour as written in the room (#rrggbb), as Blender wants it."""
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def flat(name, col):
    """One colour, whatever the light."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lin(col)
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def hole(name):
    """Nothing: whatever lies behind it is left out of the picture."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    ho = nt.nodes.new("ShaderNodeHoldout")
    nt.links.new(ho.outputs[0], out.inputs["Surface"])
    return m


def toon(name, light, dark, edge=0.32):
    """Two colours: one where the light falls, one where it does not, with a hard line between."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    dif = nt.nodes.new("ShaderNodeBsdfDiffuse")
    dif.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = lin(dark)
    ramp.color_ramp.elements[1].position = edge
    ramp.color_ramp.elements[1].color = lin(light)
    nt.links.new(dif.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


# ---- the hand's own measures ----
FAT = 1.18
KNUCKLE = {"index": (-45, 178, 0), "middle": (-11, 186, 0), "ring": (24, 178, -2), "pinky": (54, 160, -6)}
LENGTHS = {"index": (72, 44, 36), "middle": (80, 48, 38), "ring": (74, 44, 36), "pinky": (58, 34, 31)}
RADII = {k: tuple(r * FAT for r in v) for k, v in {"index": (20, 17, 15.5, 13.5), "middle": (21, 18, 16, 14), "ring": (20, 17, 15, 13), "pinky": (18, 15, 13.5, 11.5)}.items()}
THUMB_R = tuple(r * FAT for r in (24, 22, 19, 16))
THUMB_L = (64, 54, 46)
CMC = V((-46, 58, -24))
FINGERS = ("index", "middle", "ring", "pinky")


def fingers(flex, spread):
    joints, pads, dirs = {}, {}, {}
    for name in FINGERS:
        pts, pad, d = finger(KNUCKLE[name], LENGTHS[name], flex[name], spread[name])
        joints[name] = list(zip(pts, RADII[name]))
        pads[name] = pad
        dirs[name] = d
    return joints, pads, dirs


def palm(thumb_pts):
    """The hand without its fingers: the palm, the ball of the thumb, the web, and the wrist."""
    body = bmesh.new()
    # The palm, wrapped round the knuckles, the two sides of the wrist and the root of the thumb.
    add(body, [(KNUCKLE["index"], 21 * FAT), (KNUCKLE["middle"], 22 * FAT), (KNUCKLE["ring"], 21 * FAT), (KNUCKLE["pinky"], 19 * FAT), ((-38, 8, -8), 24), ((38, 6, -10), 24), (tuple(CMC), 24), ((52, 70, -14), 22)])
    # The ball of the thumb: its first bone lies inside the hand.
    add(body, [(tuple(CMC), 25), (tuple(thumb_pts[1]), THUMB_R[1] * 1.04), ((-38, 8, -8), 24), ((-30, 104, -12), 17)])
    # The web between thumb and first finger.
    add(body, [(tuple(thumb_pts[1]), 13), (KNUCKLE["index"], 13), ((-42, 112, -6), 13), (tuple(CMC), 14)])
    # The wrist, going into the sleeve.
    add(body, [((-38, 8, -8), 24), ((38, 6, -10), 24), ((-32, -30, -6), 26), ((32, -30, -8), 26)])
    return body


class Stage:
    """An empty scene with the eye above a sheet of w by h, the light, the colours and the ink."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for c in list(bpy.data.collections):
            bpy.data.collections.remove(c)
        for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.materials):
            for b in list(coll):
                if b.users == 0:
                    coll.remove(b)
        sc = self.sc = bpy.context.scene

        def coll(name, parent=None):
            c = bpy.data.collections.new(name)
            (parent or sc.collection).children.link(c)
            return c

        drawn = coll("drawn")
        self.colls = {"hand": coll("hand", drawn), "nails": coll("nails", drawn), "sleeve": coll("sleeve"), "mask": coll("mask"), "page": coll("page"), "guide": coll("guide")}
        self.mats = {"skin": toon("skin", PALE, SHADE), "nail": flat("nail", NAIL), "cloth": flat("cloth", INK), "white": flat("white", "#ffffff"), "hole": hole("hole")}

        # The eye, straight above the sheet, and one light from the upper left with no cast shadows.
        cam_d = bpy.data.cameras.new("eye")
        cam_d.type = "ORTHO"
        cam_d.ortho_scale = max(w, h)
        cam_d.clip_start = 1
        cam_d.clip_end = 6000
        cam = bpy.data.objects.new("eye", cam_d)
        sc.collection.objects.link(cam)
        cam.location = (0, 0, 2500)
        sc.camera = cam
        ld = bpy.data.lights.new("key", "SUN")
        ld.energy = 3.0
        ld.use_shadow = False
        lo = bpy.data.objects.new("key", ld)
        sc.collection.objects.link(lo)
        lo.rotation_euler = (math.radians(38), math.radians(-28), 0)

        sc.render.resolution_x = w
        sc.render.resolution_y = h
        sc.render.resolution_percentage = SCALE * 100
        sc.render.film_transparent = True
        sc.view_settings.view_transform = "Standard"
        try:
            sc.view_settings.look = "None"
        except TypeError:
            pass
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_mode = "RGBA"

        # Ink round every shape; a pale line round the dark sleeve.
        sc.render.use_freestyle = True
        sc.render.line_thickness_mode = "ABSOLUTE"
        sc.render.line_thickness = 1.0
        vl = bpy.context.view_layer
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        for ls in list(fs.linesets):
            fs.linesets.remove(ls)
        fs.use_smoothness = True

        def lineset(name, where, col, width):
            ls = fs.linesets.new(name)
            for k in ("select_silhouette", "select_border", "select_contour", "select_external_contour"):
                setattr(ls, k, True)
            for k in ("select_crease", "select_edge_mark", "select_suggestive_contour", "select_ridge_valley", "select_material_boundary"):
                setattr(ls, k, False)
            ls.select_by_collection = True
            ls.collection = where
            ls.collection_negation = "INCLUSIVE"
            ls.linestyle.color = lin(col)[:3]
            ls.linestyle.thickness = width
            ls.linestyle.thickness_position = "CENTER"
            ls.linestyle.caps = "ROUND"

        lineset("ink", drawn, INK, LINE)
        lineset("cuff", self.colls["sleeve"], PALE, 4.0)

    def at(self, px, py):
        """A point of the sheet, as the scene has it."""
        return V((px - self.w / 2, self.h / 2 - py, 0))

    def make(self, name, bm, where, mat, world, remesh=True):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        self.colls[where].objects.link(ob)
        ob.matrix_world = world
        if remesh:
            # One smooth skin over the wrapped shapes.
            mod = ob.modifiers.new("remesh", "REMESH")
            mod.mode = "VOXEL"
            mod.voxel_size = 2.0
            mod.use_smooth_shade = True
            s = ob.modifiers.new("smooth", "SMOOTH")
            s.factor = 0.6
            s.iterations = 14
            dg = bpy.context.evaluated_depsgraph_get()
            done = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
            ob.modifiers.clear()
            ob.data = done
            bpy.data.meshes.remove(me)
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.data.materials.append(self.mats[mat])
        return ob

    def sleeve(self, path, r):
        self.make("sleeve", tube(path, r), "sleeve", "cloth", Matrix.Identity(4), remesh=False)

    def sleeve_down(self, m, r):
        """The sleeve leaves the wrist the way the forearm points, then falls straight off the bottom of the sheet."""
        w, h = self.w, self.h
        cuff = m @ V((0, -46, -7))
        d = m.to_3x3() @ V((0, -1, 0))
        d.z = 0
        d.normalize()
        x_end = max(-w / 2 + r + 12, min(w / 2 - r - 12, cuff.x + d.x * 60))
        s = (x_end - cuff.x) / d.x if abs(d.x) > 0.05 and (x_end - cuff.x) / d.x > 5 else 40
        p1 = V((x_end, cuff.y + d.y * s, cuff.z))
        p2 = V((x_end, p1.y - 160, cuff.z))
        path = [cuff] + [cuff * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + p2 * u * u for u in [i / 24 for i in range(1, 25)]]
        path.append(V((x_end, -h / 2 - 130, cuff.z)))
        self.sleeve(path, r)


def build_pencil():
    """The hand that writes."""
    st = Stage(512, 1536)
    flex = {"index": (48, 52, 18), "middle": (60, 70, 30), "ring": (72, 86, 36), "pinky": (78, 88, 36)}
    joints, pads, dirs = fingers(flex, {"index": -6, "middle": 0, "ring": 4, "pinky": 9})

    # The pencil lies under the pad of the first finger and against the thumb side of its knuckle.
    rp = 7.0
    i_tip, i_r = joints["index"][-1]
    a = i_tip + pads["index"] * (i_r + rp - 3)
    b = V(KNUCKLE["index"]) + V((-(RADII["index"][0] + rp + 1), -16, 4))
    axis = (b - a).normalized()  # from the point toward the other end
    grip = a - axis * 4

    # The thumb comes up from the wrist and presses the pencil from its own side.
    q = V((-1.0, 0.05, -0.55))
    q = (q - axis * q.dot(axis)).normalized()
    tr = THUMB_R
    thumb_pts = reach(CMC, grip + axis * 12 + q * (tr[3] + rp - 5), THUMB_L, V((-1, 0.5, 0.2)))
    joints["thumb"] = list(zip(thumb_pts, tr))

    # Rolled onto its little-finger edge, and turned until the pencil lies as the room holds it.
    m = Matrix.Rotation(math.radians(54), 4, "Y")
    ax = m.to_3x3() @ axis
    m = Matrix.Rotation(math.radians(PENCIL_LEAN) - math.atan2(ax.y, ax.x), 4, "Z") @ m
    g = m @ grip
    m = Matrix.Translation(V((ANCHOR[0] - st.w / 2 - g.x, st.h / 2 - ANCHOR[1] - g.y, 300 - g.z))) @ m

    st.make("body", palm(thumb_pts), "hand", "skin", m)
    for name in FINGERS:
        st.make(name, chain(joints[name]), "hand", "skin", m)
    st.make("thumb", chain(joints["thumb"][1:]), "hand", "skin", m)
    st.make("nail_index", nail(i_tip, i_r, dirs["index"], -pads["index"]), "nails", "nail", m, remesh=False)
    st.make("nail_thumb", nail(thumb_pts[3], tr[3], thumb_pts[3] - thumb_pts[2], q), "nails", "nail", m, remesh=False)
    # What lies over the pencil: the thumb and the end of the first finger.
    st.make("m_thumb", chain(joints["thumb"][1:]), "mask", "white", m, remesh=False)
    st.make("m_index", chain(joints["index"][1:]), "mask", "white", m, remesh=False)
    st.sleeve_down(m, 44)
    return st


def build_thumb():
    """The hand that holds a page up by its lower corner: seen from its thumb side, the fingers lying flat behind the page."""
    st = Stage(512, 1536)
    size = 1.12
    # The fingers are nearly straight, flat against the back of the page: a fist here would stand out beside the page
    # as broad as the hand is deep, and the hand would look like a mitten.
    flex = {"index": (22, 26, 14), "middle": (26, 30, 16), "ring": (30, 34, 18), "pinky": (34, 36, 18)}
    joints, pads, dirs = fingers(flex, {"index": -2, "middle": 0, "ring": 2, "pinky": 4})

    # The thumb lies along the first finger and presses the page against its side.
    (p1, r1), (p2, r2) = joints["index"][1], joints["index"][2]
    tr = THUMB_R
    press = V((1, 0, 0))
    spot = p1.lerp(p2, 0.35) + V((-(r1 + tr[3] + 11), 6, 4))
    thumb_pts = reach(CMC, spot, THUMB_L, V((-1, 0.2, 0.3)))
    joints["thumb"] = list(zip(thumb_pts, tr))

    # Turned so that the eye is on the thumb's side of the hand, a little toward its back; the thumb points up and to the left.
    m = Matrix.Rotation(math.radians(24), 4, "Z") @ Matrix.Rotation(math.radians(72), 4, "Y") @ Matrix.Scale(size, 4)
    # The room puts the page's corner under the last bone of the thumb, so the whole of its pad lies on the page.
    pad = m @ thumb_pts[2].lerp(thumb_pts[3], 0.35)
    to = st.at(*THUMB_ANCHOR)
    m = Matrix.Translation(V((to.x - pad.x, to.y - pad.y, 300 - pad.z))) @ m

    st.make("body", palm(thumb_pts), "hand", "skin", m)
    for name in FINGERS:
        st.make(name, chain(joints[name]), "hand", "skin", m)
    st.make("thumb", chain(joints["thumb"][1:]), "hand", "skin", m)
    st.make("nail_thumb", nail(thumb_pts[3], tr[3], thumb_pts[3] - thumb_pts[2], -press), "nails", "nail", m, remesh=False)

    # What lies over the page: the whole thumb, from the wrist end of it. The rest of the hand is behind the page, and
    # the room leaves it out wherever the page is (drawnhands.ts), so the picture need not know where the page ends.
    st.make("m_thumb", chain(joints["thumb"]), "mask", "white", m, remesh=False)
    st.sleeve_down(m, 37 * size)
    return st


def build_die(o):
    """The hand with the die in it: palm up. o is how far it has let go: 0 cupped round the die, 1 flung open."""
    st = Stage(512, 512)
    size = 1.15
    rd = DIE_R / size
    # Where the die lies, in the hand's own space: in the hollow of the palm.
    die = V((4, 130, -(22 + rd)))

    def mix(a, b):
        return tuple(x + (y - x) * o for x, y in zip(a, b))

    cup = {"index": (55, 80, 45), "middle": (55, 85, 45), "ring": (58, 85, 45), "pinky": (62, 85, 45)}
    flex = {k: mix(cup[k], (-8, 6, 4)) for k in FINGERS}
    wide = {"index": -14, "middle": -3, "ring": 8, "pinky": 20}
    near = {"index": -5, "middle": 0, "ring": 4, "pinky": 9}
    spread = {k: near[k] + (wide[k] - near[k]) * o for k in FINGERS}
    joints, pads, dirs = fingers(flex, spread)

    # The thumb closes on the die from its own side; let go, it swings out.
    tr = THUMB_R
    on = die + V((-0.8, -0.2, -0.55)).normalized() * (rd + tr[3] - 3)
    out = CMC + V((-0.85, 0.5, -0.1)).normalized() * 160
    thumb_pts = reach(CMC, on.lerp(out, o), THUMB_L, V((-1, 0.2, -0.3)))
    joints["thumb"] = list(zip(thumb_pts, tr))

    body = palm(thumb_pts)
    # The heel of the hand on the little finger's side.
    add(body, [((40, 30, -16), 22), ((50, 112, -16), 18)])

    # Palm up, the fingers a little toward the eye, the whole hand leaning to the left; the die lands on the hollow.
    m = Matrix.Rotation(math.radians(12), 4, "Z") @ Matrix.Rotation(math.radians(-18), 4, "X") @ Matrix.Rotation(math.radians(180), 4, "Y") @ Matrix.Scale(size, 4)
    d = m @ die
    to = st.at(*HOLLOW)
    m = Matrix.Translation(V((to.x - d.x, to.y - d.y, 300 - d.z))) @ m

    st.make("body", body, "hand", "skin", m)
    for name in FINGERS:
        st.make(name, chain(joints[name]), "hand", "skin", m)
        # The nails show only while the fingers are folded right over: as they lift, they turn away.
        if o < 0.1:
            tip, r = joints[name][-1]
            st.make(f"nail_{name}", nail(tip, r, dirs[name], -pads[name]), "nails", "nail", m, remesh=False)
        # What lies over the die: each finger from its second joint on.
        st.make(f"m_{name}", chain(joints[name][1:]), "mask", "white", m, remesh=False)
    st.make("thumb", chain(joints["thumb"][1:]), "hand", "skin", m)
    if o < 0.1:
        back = (thumb_pts[3] - die).normalized()
        st.make("nail_thumb", nail(thumb_pts[3], tr[3], thumb_pts[3] - thumb_pts[2], back), "nails", "nail", m, remesh=False)
    st.make("m_thumb", chain(joints["thumb"][2:]), "mask", "white", m, remesh=False)
    # The die itself is a real thing in the room; here it only shows where it will be.
    st.make("die", ball(die, rd), "guide", "white", m, remesh=False).hide_render = True

    # The sleeve goes off the lower right corner of the sheet.
    cuff = m @ V((0, -46, -7))
    fore = m.to_3x3() @ V((0, -1, 0))
    fore.z = 0
    fore.normalize()
    end = V((st.w / 2 + 150, -st.h / 2 - 190, cuff.z))
    mid = cuff + fore * 110
    st.sleeve([cuff * (1 - u) ** 2 + mid * 2 * u * (1 - u) + end * u * u for u in [i / 24 for i in range(25)]], 62 * size)
    return st


def pixels(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(img)
    return a


def render(back_name, front_name=None):
    """Render the scene to models/render/player_hand_<back_name>.png, and (if asked) the part under the masks as a second picture."""
    sc = bpy.context.scene
    os.makedirs(RENDER, exist_ok=True)
    back = os.path.join(RENDER, f"player_hand_{back_name}.png")
    masks = [o for o in bpy.data.objects if o.name.startswith("m_")]
    rest = [o for o in bpy.data.objects if o.type == "MESH" and o not in masks]
    hidden = {o: o.hide_render for o in rest}

    for o in masks:
        o.hide_render = True
    sc.render.filepath = back
    bpy.ops.render.render(write_still=True)
    if not front_name:
        print("rendered", back)
        return

    # The same sheet with only the masks on it says where the front picture is.
    mask = os.path.join(RENDER, "player_hand_mask.png")
    front = os.path.join(RENDER, f"player_hand_{front_name}.png")
    for o in masks:
        o.hide_render = False
    for o in rest:
        o.hide_render = True
    sc.render.use_freestyle = False
    sc.render.filepath = mask
    bpy.ops.render.render(write_still=True)
    sc.render.use_freestyle = True
    for o in rest:
        o.hide_render = hidden[o]
    for o in masks:
        o.hide_render = True

    def grown(a, n):
        for _ in range(n):
            g = a.copy()
            g[1:, :] |= a[:-1, :]
            g[:-1, :] |= a[1:, :]
            g[:, 1:] |= a[:, :-1]
            g[:, :-1] |= a[:, 1:]
            a = g
        return a

    whole = pixels(back)
    # Grown by half an ink line, so the line round the finger comes with it.
    over = grown(pixels(mask)[..., 3] > 0.5, int(round(LINE / 2 * SCALE)))
    # The colour is kept a little way past where the piece ends, unseen: if it went to black there, the piece would
    # show a dark line round its cut edge whenever it is drawn smaller than it is, or between two pixels.
    near = grown(over, 3 * SCALE)
    whole[~near] = 0
    whole[near & ~over, 3] = 0
    out = bpy.data.images.new("front", whole.shape[1], whole.shape[0], alpha=True)
    out.alpha_mode = "STRAIGHT"
    out.pixels = whole.ravel().tolist()
    out.filepath_raw = front
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    os.remove(mask)
    print("rendered", back, front)


def main():
    build_pencil()
    render("back", "front")
    build_thumb()
    render("thumb_back", "thumb_front")
    for i, o in enumerate(DIE_OPEN):
        build_die(o)
        render(f"die{i}_back", f"die{i}_front")


if not globals().get("TALLOW_HOLD"):
    main()
