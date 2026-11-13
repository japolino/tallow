"""
The narrator's hand: long and lean, resting palm down on the table with the
fingertips touching the wood. One hand is modelled; the room mirrors it for
the other.

Run it either way:
    blender --background --python models/narrator_hand.py
or from a running Blender (it clears the scene first).

Run alone, writes models/narrator_hand.glb beside this script for a look (the room does not load it: narrator_arm.py
builds the shipped hand from this sculpt).

How it is made: the wrist and the palm are one lofted block, flat across the
back and across the palm, wide at the knuckles and narrow at the wrist. Each
finger is grown from a stick figure of its bones (every joint has a thickness,
a skin is wrapped round the sticks) and sits against its neighbours at the
knuckle, the way fingers do. The thumb comes off the side of the palm out of a
pad of muscle. Then everything is fused into one surface. The joints are only a
little thicker than the bone between them: a lean hand, not a string of beads.
Each fingertip carries a nail, a low plate the room paints darker (NAILS).

Blender's axes here: +Z up, fingers point along -Y (toward the player). The
origin is on the table top under the wrist. The thumb is on the -X side.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow")
OUT = os.path.join(ROOT, "models", "narrator_hand.glb")
TARGET_TRIS = 14000
# How far the finished hand was lowered to sit on the table (set by build(); models/narrator_arm.py needs it
# to know where the joints ended up).
LOWERED = 0.0
# The nails, once built: (centre, the way the nail faces, the way the finger points, half its length, half its
# width), in the finished hand's space. models/narrator_arm.py paints the skin inside them.
NAILS = []

# Each finger: where its knuckle sits, how long it is, how far it splays sideways.
#          x,      y,      length, splay
FINGERS = [
    (-0.0300, -0.0920, 0.98, -0.12),  # first finger
    (-0.0090, -0.0990, 1.08, -0.03),  # middle
    (0.0120, -0.0955, 1.00, 0.07),    # ring
    (0.0310, -0.0850, 0.80, 0.20),    # little
]
# How thick each finger is, against the middle one.
THICK = [1.03, 1.05, 1.0, 0.89]

# Along one finger from the knuckle: (step forward, height above the table, thickness).
# It rises a little over the first joint, then comes down onto its tip. models/narrator_arm.py reads the joints
# out of this list by place: the knuckle is row 0, the first joint row 2, the second row 4, the tip row 7.
JOINTS = [
    (0.0, 0.0290, 0.0104),    # knuckle
    (0.022, 0.0312, 0.0086),
    (0.022, 0.0306, 0.0092),  # first joint
    (0.014, 0.0252, 0.0077),
    (0.014, 0.0188, 0.0081),  # second joint
    (0.011, 0.0128, 0.0070),
    (0.008, 0.0088, 0.0066),  # the pad of the fingertip
    (0.005, 0.0070, 0.0044),
]

# The thumb: the joint at the wrist, the long bone, the knuckle, the joint, the pad, the tip. Rows 0, 2, 3 and 5 are
# the joints narrator_arm.py reads.
THUMB = [
    ((-0.0250, -0.0120, 0.0205), 0.0125),
    ((-0.0400, -0.0340, 0.0195), 0.0106),
    ((-0.0520, -0.0560, 0.0180), 0.0106),  # the knuckle
    ((-0.0610, -0.0840, 0.0142), 0.0090),  # the joint
    ((-0.0655, -0.1040, 0.0090), 0.0078),
    ((-0.0668, -0.1130, 0.0074), 0.0050),
]

# The wrist and the palm, from the forearm (inside the sleeve) to the knuckles: where each section is along the
# hand, its middle (x, z), how wide and how thick it is, and how square (2 is an ellipse; more is boxier).
PALM = [
    (0.160, 0.0000, 0.0240, 0.064, 0.046, 2.4),
    (0.100, 0.0000, 0.0232, 0.058, 0.040, 2.4),
    (0.050, 0.0000, 0.0222, 0.053, 0.032, 2.6),
    (0.022, -0.0005, 0.0214, 0.055, 0.029, 2.8),   # the wrist
    (-0.008, -0.0020, 0.0206, 0.066, 0.029, 3.0),  # the heel of the hand
    (-0.045, -0.0010, 0.0214, 0.077, 0.027, 3.2),
    (-0.078, 0.0005, 0.0222, 0.081, 0.024, 3.2),
    (-0.094, 0.0005, 0.0226, 0.078, 0.021, 3.0),   # under the knuckles
    (-0.101, 0.0005, 0.0228, 0.070, 0.016, 2.6),
]


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def stick(name, points):
    """A chain of joints, each (position, thickness), wrapped in a skin."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([p for p, _ in points], [(i, i + 1) for i in range(len(points) - 1)], [])
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    skin = o.modifiers.new("Skin", "SKIN")
    for i, sv in enumerate(me.skin_vertices[0].data):
        r = points[i][1]
        sv.radius = (r, r * 0.92)
        sv.use_root = i == 0
    sub = o.modifiers.new("Round", "SUBSURF")
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=skin.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    return o


def solid(name, bm):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o


def loft(name, sections, around=28):
    """A closed shape through a row of cross-sections along y, each a rounded box (see PALM)."""
    bm = bmesh.new()
    rings = []
    for y, cx, cz, w, h, sq in sections:
        ring = []
        for j in range(around):
            a = j / around * math.tau
            c, s = math.cos(a), math.sin(a)
            x = cx + w / 2 * math.copysign(abs(c) ** (2 / sq), c)
            z = cz + h / 2 * math.copysign(abs(s) ** (2 / sq), s)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(around):
            k = (j + 1) % around
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return solid(name, bm)


def blob(name, at, size):
    """A soft, egg-shaped mass."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=0.5)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=at, verts=bm.verts)
    return solid(name, bm)


def nail(name, joint, tip, r, face=Vector((0, 0, 1)), wide=1.0):
    """
    A nail on the last bone of a finger, from `joint` to `tip`: a low plate on the side the nail faces. Returns the
    plate and its record for NAILS.
    """
    along = (tip - joint).normalized()
    out = (face - along * face.dot(along)).normalized()
    side = along.cross(out)
    length = (tip - joint).length
    half_l, half_w = length * 0.25, r * 0.66 * wide
    # Its middle: short of the tip, lying in the skin of the finger's back, so only its face stands out of it.
    centre = joint + along * (length * 0.5) + out * (r * 0.7)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(2 * half_w, 2 * half_l, 0.003), verts=bm.verts)
    m = Matrix((side, along, out)).transposed().to_4x4()
    m.translation = centre
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return solid(name, bm), (centre, out, along, half_l, half_w)


def build():
    global LOWERED
    NAILS.clear()
    parts, nails = [], []
    for n, (x, ky, length, splay) in enumerate(FINGERS):
        k = THICK[n]
        pts = []
        y, xx = ky, x
        # The long bone behind each knuckle starts at the wrist, inside the back of the hand: its tendon shows as a
        # low ridge, no more.
        pts.append(((x * 0.45, 0.010, 0.0300), 0.0050))
        pts.append(((x * 0.68, ky * 0.34, 0.0316), 0.0040))
        pts.append(((x * 0.88, ky * 0.7, 0.0318), 0.0042))
        for step, z, r in JOINTS:
            y -= step * length
            xx += splay * step * length
            pts.append(((xx, y, z), r * k))
        parts.append(stick(f"finger{n}", pts))
        plate, rec = nail(f"nail{n}", Vector(pts[-4][0]), Vector(pts[-1][0]), pts[-3][1])
        parts.append(plate)
        nails.append(rec)
    parts.append(stick("thumb", THUMB))
    # The thumb lies on its side: its nail faces up and away from the palm.
    plate, rec = nail("nail_thumb", Vector(THUMB[3][0]), Vector(THUMB[5][0]), THUMB[4][1], face=Vector((-0.55, 0, 0.84)), wide=1.08)
    parts.append(plate)
    nails.append(rec)
    parts.append(loft("palm", PALM))
    # The pad of muscle the thumb comes out of, and the lower pad on the little finger's side of the palm.
    parts.append(blob("thenar", (-0.0235, -0.036, 0.0165), (0.034, 0.062, 0.024)))
    parts.append(blob("heel_pad", (0.0215, -0.03, 0.0155), (0.026, 0.058, 0.02)))
    # The wrist bone on the little finger's side: a low rise where the sleeve's cuff stops short, not a knob.
    parts.append(blob("ulna", (0.0165, 0.027, 0.0298), (0.013, 0.02, 0.0075)))

    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = "hand"
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Fuse the overlapping parts into one skin.
    fuse = o.modifiers.new("Fuse", "REMESH")
    fuse.mode = "VOXEL"
    fuse.voxel_size = 0.0011
    bpy.ops.object.modifier_apply(modifier=fuse.name)
    calm = o.modifiers.new("Calm", "SMOOTH")
    calm.factor = 0.6
    calm.iterations = 3
    bpy.ops.object.modifier_apply(modifier=calm.name)
    # Sit the lowest point exactly on the table.
    low = min(v.co.z for v in o.data.vertices)
    LOWERED = low
    for v in o.data.vertices:
        v.co.z -= low
    for centre, out, along, half_l, half_w in nails:
        NAILS.append((centre - Vector((0, 0, low)), out, along, half_l, half_w))
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > TARGET_TRIS:
        dec = o.modifiers.new("Thin", "DECIMATE")
        dec.ratio = TARGET_TRIS / tris
        bpy.ops.object.modifier_apply(modifier=dec.name)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def export(o):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_materials="NONE", export_yup=True, export_texcoords=False)
    print(f"wrote {OUT}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} triangles, {os.path.getsize(OUT) // 1024} KB")


def main():
    clear()
    export(build())


# TALLOW_STEPS=1 only defines the steps, for running them one at a time from a live Blender.
if os.environ.get("TALLOW_STEPS") != "1":
    main()
