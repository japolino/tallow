"""
The narrator's hood: thick cloth round a hollow that takes no light. It has
a brim with real thickness that hangs over the brow, a soft peak along the
top, folds down the back, and sides that fall and spread onto the shoulders.

Run it either way:
    blender --background --python models/narrator_hood.py
or from a running Blender (it clears the scene first).

Writes assets/models/narrator_hood.glb next to this repo's root.

Blender's axes here: +Z up, the figure faces -Y (toward the player), so that
after export (+Y up) it faces +Z in the room. The origin is the middle of the
head, which is where src/room/narrator.ts hangs the model. Lengths are metres.

The outside of the cloth carries the material "cloth"; the inside carries
"void", which the room draws as flat black whatever the light is doing.
"""
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow"), "models"))
import style  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow")
OUT = os.path.join(ROOT, "assets", "models", "narrator_hood.glb")

AROUND = 40
THICK = 0.024
TARGET_TRIS = 4000  # docs/ART.md: the hood's budget

# The hood from the side, brim first: (how far back from the middle of the head, radius).
# The first ring turns in a little, so the brim has a lip.
PROFILE = [
    (-0.172, 0.150),
    (-0.160, 0.170),
    (-0.120, 0.186),
    (-0.060, 0.194),
    (0.010, 0.192),
    (0.085, 0.174),
    (0.145, 0.132),
    (0.180, 0.072),
]
BACK = 0.192


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def place(y, r, a):
    """One point of the cloth. `a` is the angle round the hood: 0 at the top, pi (or -pi) under the chin."""
    x = r * math.sin(a)
    z = r * math.cos(a)
    up = max(0.0, math.cos(a))
    down = max(0.0, -math.cos(a))
    side = abs(math.sin(a))
    # 0 at the middle of the head, 1 at the brim.
    front = min(1.0, max(0.0, (0.02 - y) / 0.19))
    back = min(1.0, max(0.0, (y + 0.02) / 0.2))

    # Taller than it is wide.
    x *= 0.9
    z *= 1.2
    # A soft peak along the top, highest toward the back of the crown, where the cloth stands off the head.
    z += 0.05 * math.exp(-((a / 0.4) ** 2)) * (0.4 + 0.6 * back)
    # The brim hangs forward over the brow and droops a little at its middle.
    y -= 0.055 * up ** 2 * front
    z -= 0.03 * up ** 3 * front ** 2
    # The sides fall to the shoulders and spread; under the chin the cloth lies back against the chest.
    x *= 1 + 0.5 * down ** 1.4
    z -= 0.085 * down ** 2
    y += 0.075 * down ** 2 * front
    # Folds: long ones running down the back and sides, and the weight of the cloth pulling the left side lower.
    fold = math.sin(a * 7 + y * 26 + 0.6) * 0.011 + math.sin(a * 13 - y * 17) * 0.005
    fold *= (0.25 + 0.75 * side) * (0.35 + 0.65 * back)
    x += fold * math.sin(a)
    z += fold * math.cos(a)
    z -= 0.012 * side * (1 if x < 0 else 0.4) * (1 - up)
    return (x, y, z)


def cloth_mesh():
    me = bpy.data.meshes.new("hood")
    bm = bmesh.new()
    rings = []
    for (y, r) in PROFILE:
        ring = []
        for i in range(AROUND):
            a = (i / AROUND) * math.tau - math.pi
            ring.append(bm.verts.new(place(y, r, a)))
        rings.append(ring)
    pole = bm.verts.new(place(BACK, 0.0, 0.0))
    for k in range(len(rings) - 1):
        for i in range(AROUND):
            j = (i + 1) % AROUND
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    last = rings[-1]
    for i in range(AROUND):
        bm.faces.new((last[i], last[(i + 1) % AROUND], pole))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("hood", me)
    bpy.context.collection.objects.link(o)
    return o


def material(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 1
    return m


def finish(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    o.data.materials.append(material("cloth", (0.02, 0.018, 0.024)))
    o.data.materials.append(material("void", (0, 0, 0)))

    sub = o.modifiers.new("Round", "SUBSURF")
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=sub.name)

    # Give the cloth its thickness, inward. The inner skin is the void; the edge of the brim stays cloth, so it
    # catches the light as a rim round the dark.
    thick = o.modifiers.new("Thick", "SOLIDIFY")
    thick.thickness = THICK
    thick.offset = -1
    thick.use_rim = True
    thick.material_offset = 1
    thick.material_offset_rim = 0
    bpy.ops.object.modifier_apply(modifier=thick.name)

    # Soften the brim's edge.
    soft = o.modifiers.new("Soft", "BEVEL")
    soft.width = THICK * 0.3
    soft.segments = 2
    soft.limit_method = "ANGLE"
    soft.angle_limit = math.radians(50)
    bpy.ops.object.modifier_apply(modifier=soft.name)

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
    style.bake([o], apply=False, ground=False, ao_distance=0.05, wear=0.0, cavity=0.35, floor=0.3)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_materials="EXPORT", export_yup=True, export_texcoords=False, export_vertex_color="ACTIVE")
    style.quantize_glb(OUT)
    print(f"wrote {OUT}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} triangles, {os.path.getsize(OUT) // 1024} KB")


def main():
    clear()
    export(finish(cloth_mesh()))


# TALLOW_STEPS=1 only defines the steps, for running them one at a time from a live Blender.
if os.environ.get("TALLOW_STEPS") != "1":
    main()
