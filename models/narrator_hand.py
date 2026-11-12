"""
The narrator's hand: long, gaunt, resting palm down on the table with the
fingertips touching the wood. One hand is modelled; the room mirrors it for
the other.

Run it either way:
    blender --background --python models/narrator_hand.py
or from a running Blender (it clears the scene first).

Run alone, writes models/narrator_hand.glb beside this script for a look (the room does not load it: narrator_arm.py
builds the shipped hand from this sculpt).

How it is made: each finger is grown from a stick figure of its bones (every
joint has a thickness, a skin is wrapped round the sticks), the palm and the
wrist are soft blocks, and then everything is fused into one surface, so the
fingers run into the palm with webbing between them. Joints are thicker than
the bone between them, which is what makes the hand bony.

Blender's axes here: +Z up, fingers point along -Y (toward the player). The
origin is on the table top under the wrist. The thumb is on the -X side.
"""
import os

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow")
OUT = os.path.join(ROOT, "models", "narrator_hand.glb")
TARGET_TRIS = 14000
# How far the finished hand was lowered to sit on the table (set by build(); models/narrator_arm.py needs it
# to know where the joints ended up).
LOWERED = 0.0

# Each finger: where its knuckle sits, how long it is, how far it splays sideways.
#          x,      y,      length, splay
FINGERS = [
    (-0.030, -0.092, 1.0, -0.2),    # first finger
    (-0.009, -0.100, 1.13, -0.05),  # middle
    (0.012, -0.096, 1.05, 0.09),    # ring
    (0.031, -0.084, 0.84, 0.26),    # little
]

# Along one finger from the knuckle: (step forward, height above the table, thickness).
# It rises over the first joint, then comes down onto its tip.
JOINTS = [
    (0.0, 0.0310, 0.0120),   # knuckle
    (0.023, 0.0345, 0.0060),
    (0.023, 0.0350, 0.0098),  # first joint
    (0.017, 0.0290, 0.0052),
    (0.017, 0.0222, 0.0082),  # second joint
    (0.014, 0.0132, 0.0048),
    (0.011, 0.0070, 0.0042),  # the pad of the fingertip
    (0.006, 0.0048, 0.0020),
]

THUMB = [
    ((-0.030, -0.030, 0.021), 0.0128),
    ((-0.047, -0.056, 0.020), 0.0082),
    ((-0.058, -0.078, 0.019), 0.0102),  # the joint
    ((-0.066, -0.098, 0.014), 0.0066),
    ((-0.071, -0.116, 0.0080), 0.0056),
    ((-0.073, -0.126, 0.0058), 0.0030),
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
        sv.radius = (r, r * 0.94)
        sv.use_root = i == 0
    sub = o.modifiers.new("Round", "SUBSURF")
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=skin.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)
    return o


def lump(name, at, size):
    """A soft block: a cube rounded right off."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.object
    o.name = name
    o.scale = size
    sub = o.modifiers.new("Round", "SUBSURF")
    sub.levels = 3
    bpy.ops.object.modifier_apply(modifier=sub.name)
    return o


def build():
    global LOWERED
    parts = []
    for n, (x, ky, length, splay) in enumerate(FINGERS):
        pts = []
        y, xx = ky, x
        # Start at the wrist: the long bone behind each knuckle is part of the finger, and the four of them
        # fan out across the back of the hand with only thin flesh between.
        pts.append(((x * 0.42, 0.012, 0.027), 0.0100))
        pts.append(((x * 0.78, ky * 0.52, 0.0285), 0.0068))
        for step, z, r in JOINTS:
            y -= step * length
            xx += splay * step * length
            pts.append(((xx, y, z), r))
        parts.append(stick(f"finger{n}", pts))
    parts.append(stick("thumb", THUMB))
    # The back of the hand: broad at the knuckles, narrowing to the wrist, with the tendons' ridge down the middle.
    # Kept thin, so the knuckles and the long bones behind them stand out of it and a fist has a flat back.
    parts.append(lump("palm", (0.001, -0.058, 0.023), (0.076, 0.09, 0.026)))
    parts.append(lump("heel", (-0.008, -0.016, 0.022), (0.06, 0.075, 0.03)))
    parts.append(lump("wrist", (0.0, 0.05, 0.026), (0.066, 0.2, 0.04)))

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
    calm.iterations = 2
    bpy.ops.object.modifier_apply(modifier=calm.name)
    # Sit the lowest point exactly on the table.
    low = min(v.co.z for v in o.data.vertices)
    LOWERED = low
    for v in o.data.vertices:
        v.co.z -= low
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
