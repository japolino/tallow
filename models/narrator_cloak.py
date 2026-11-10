"""
The narrator's mantle: a sheet of heavy cloth dropped over a seated figure's
shoulders, left to fall, then frozen and exported. The arms are not under it:
they are their own model (models/narrator_arm.py), sleeves and all, and come
out from under this cloth, so nothing of an arm is left behind in the mantle
when an arm moves.

Run it either way:
    blender --background --python models/narrator_cloak.py
or from a running Blender (it clears the scene first).

Writes assets/models/narrator_cloak.glb next to this repo's root.

Blender's axes here: +Z up, the figure faces -Y (toward the player), so that
after export (+Y up) it faces +Z in the room. The origin is on the table top,
directly under the figure's neck. Lengths are metres and match
src/room/narrator.ts.
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if "__file__" in globals() else os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow")
OUT = os.path.join(ROOT, "assets", "models", "narrator_cloak.glb")

FRAMES = int(os.environ.get("TALLOW_CLOTH_FRAMES", "70"))
GRID = int(os.environ.get("TALLOW_CLOTH_GRID", "90"))
TARGET_TRIS = 26000

# Where the body is. Only the top of each arm is under the cloth: a stub hanging from the shoulder, a little
# thicker than the sleeve that starts inside it (models/narrator_arm.py), so the sleeve's top never shows through.
SHOULDER = (0.26, 0.0, 0.39)
STUB_END = (0.285, 0.0, 0.2)
STUB_R = (0.1, 0.09)
NECK_R = 0.105
SHEET_R = 0.86


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def collide(obj):
    obj.modifiers.new("Collision", "COLLISION")
    obj.collision.thickness_outer = 0.012
    obj.collision.thickness_inner = 0.02
    obj.collision.cloth_friction = 12
    return obj


def ball(name, at, r, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=at, segments=32, ring_count=20)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    return collide(o)


def limb(name, a, b, ra, rb):
    """A tapered tube from a to b, with a ball at each end so the cloth has nothing sharp to catch on."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=ra, radius2=rb, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    collide(o)
    ball(name + "_a", a, ra)
    ball(name + "_b", b, rb)


def body():
    # Chest and back: a broad, shallow barrel from the lap up to the shoulders.
    ball("torso", (0, 0.02, 0.1), 0.3, (0.95, 0.62, 1.35))
    ball("neck", (0, 0.0, 0.47), 0.1, (1, 1, 0.9))
    for side in (-1, 1):
        s = (SHOULDER[0] * side, SHOULDER[1], SHOULDER[2])
        e = (STUB_END[0] * side, STUB_END[1], STUB_END[2])
        limb(f"upper_{side}", s, e, STUB_R[0], STUB_R[1])
    # No table: the cloth hangs straight off the chest and the shoulders, behind the table's edge, into the lap.


def sheet():
    """A round sheet with a hole for the neck, lying flat just above the shoulders."""
    me = bpy.data.meshes.new("cloak")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=GRID, y_segments=GRID, size=SHEET_R)
    doomed = []
    for v in bm.verts:
        # Longer behind than in front.
        x, y = v.co.x, v.co.y
        reach = SHEET_R * (0.84 if y < 0 else 1.0)
        r = math.hypot(x / SHEET_R, y / reach)
        if r > 1 or math.hypot(x, y) < NECK_R:
            doomed.append(v)
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("cloak", me)
    bpy.context.collection.objects.link(o)
    o.location = (0, 0.02, 0.56)
    # The collar is held: without it the whole sheet slides off backward.
    pin = o.vertex_groups.new(name="pin")
    pin.add([v.index for v in me.vertices if math.hypot(v.co.x, v.co.y) < NECK_R + 0.03], 1.0, "REPLACE")
    return o


def drape(o):
    mod = o.modifiers.new("Cloth", "CLOTH")
    s = mod.settings
    s.quality = 10
    s.mass = 0.4
    s.air_damping = 1.5
    s.tension_stiffness = 20
    s.compression_stiffness = 20
    s.shear_stiffness = 6
    s.bending_stiffness = 0.35
    s.tension_damping = 8
    s.compression_damping = 8
    s.bending_damping = 0.6
    s.vertex_group_mass = "pin"
    c = mod.collision_settings
    c.collision_quality = 5
    c.distance_min = 0.012
    c.use_self_collision = True
    c.self_distance_min = 0.008
    c.self_friction = 8
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = FRAMES
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = FRAMES
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
    # Freeze the cloth where it has fallen.
    deps = bpy.context.evaluated_depsgraph_get()
    frozen = bpy.data.meshes.new_from_object(o.evaluated_get(deps))
    o.modifiers.clear()
    o.data = frozen
    return o


def finish(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    # Bring the mesh into the figure's own space, then smooth it and thin it to a budget.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # The solver leaves a fine tremble in the surface; ease it out and keep the folds.
    calm = o.modifiers.new("Calm", "SMOOTH")
    calm.factor = 0.5
    calm.iterations = 5
    bpy.ops.object.modifier_apply(modifier=calm.name)
    sub = o.modifiers.new("Smooth", "SUBSURF")
    sub.levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)
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
    body()
    o = finish(drape(sheet()))
    export(o)


# TALLOW_STEPS=1 only defines the steps, for running them one at a time from a live Blender.
if os.environ.get("TALLOW_STEPS") != "1":
    main()
