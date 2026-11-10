"""
The pieces that stand on the map: small carved figures, a few centimetres tall.

  traveller   a walker in a long cloak and a wide hat, with a staff and a pack.
              Yours, and (smaller) each companion's.
  shadow      a tall robed figure under a deep hood with nothing in it: the
              narrator's own piece, a small copy of the narrator.

Run it either way:
    blender --background --python models/pieces.py
or from a running Blender (it clears the scene first).

Writes assets/models/pieces.glb next to this repo's root.

Blender's axes here: +Z up, each figure faces -Y, so that after export (+Y up)
it faces +Z in the room. Each figure's origin is the middle of its base, on
the table. Lengths are metres and match the heights in src/room/room.ts.

Materials, by name: "body" is the carved figure, "band" the coloured ring
round its base that says whose it is, "void" the inside of the hood, and
"eyes" the two small lights in it.
"""
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow"), "models")
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "assets", "models", "pieces.glb")

# The shadow's hood is the narrator's own, made small.
_steps = os.environ.get("TALLOW_STEPS")
os.environ["TALLOW_STEPS"] = "1"
sys.path.insert(0, HERE)
import narrator_hood  # noqa: E402

if _steps is None:
    del os.environ["TALLOW_STEPS"]
else:
    os.environ["TALLOW_STEPS"] = _steps

BODY, BAND, VOID, EYES = 0, 1, 2, 3
AROUND = 20
TARGET_TRIS = 4200
TAU = math.tau


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def turned(bm, profile, mat=BODY, around=AROUND, fold=None, squash=1.0, shift=None):
    """
    A turned shape: a profile of (radius, height) spun round the upright axis.
    fold(angle, height) scales the radius, for cloth that hangs in folds; squash flattens it front to back;
    shift(height) moves each ring sideways, for something that leans.
    """
    rings = []
    for (r, h) in profile:
        dx, dy = shift(h) if shift else (0.0, 0.0)
        if r <= 1e-7:
            rings.append([bm.verts.new((dx, dy, h))])
            continue
        ring = []
        for i in range(around):
            a = i / around * TAU
            k = fold(a, h) if fold else 1.0
            ring.append(bm.verts.new((dx + r * k * math.cos(a), dy + r * k * math.sin(a) * squash, h)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        lo, hi = rings[k], rings[k + 1]
        if len(lo) == 1 and len(hi) == 1:
            continue
        for i in range(around):
            j = (i + 1) % around
            if len(lo) == 1:
                f = bm.faces.new((lo[0], hi[j], hi[i]))
            elif len(hi) == 1:
                f = bm.faces.new((lo[i], lo[j], hi[0]))
            else:
                f = bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
            f.material_index = mat


def ball(bm, at, r, mat=BODY, scale=(1, 1, 1), around=AROUND, rings=8):
    """A ball, or with `scale` a rounded lump."""
    first = len(bm.verts)
    prof = [(r * math.sin(math.pi * k / rings), -r * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof[0] = (0.0, -r)
    prof[-1] = (0.0, r)
    turned(bm, prof, mat, around)
    bm.verts.ensure_lookup_table()
    for v in bm.verts[first:]:
        v.co.x = v.co.x * scale[0] + at[0]
        v.co.y = v.co.y * scale[1] + at[1]
        v.co.z = v.co.z * scale[2] + at[2]


def ring(bm, radius, height, thick, mat=BAND):
    """A ring lying flat: the band round a piece's base."""
    n = 8
    prof = [(radius + thick * math.cos(TAU * k / n), height + thick * math.sin(TAU * k / n)) for k in range(n)]
    prof.append(prof[0])
    turned(bm, prof, mat)


def base(bm):
    """A low round foot, with a groove the coloured band sits in."""
    turned(bm, [(0, 0), (0.0205, 0), (0.0212, 0.0025), (0.0196, 0.0062), (0.0150, 0.0092), (0.0132, 0.0112), (0, 0.0112)])
    ring(bm, 0.0186, 0.0070, 0.0019)


def traveller(bm):
    base(bm)

    # The cloak: flared at the hem, hanging in folds that fade out toward the shoulders.
    def folds(a, h):
        hang = max(0.0, 1 - (h - 0.011) / 0.04)
        return 1 + (0.11 * math.sin(a * 6 + 0.5) + 0.04 * math.sin(a * 11)) * hang

    turned(bm, [(0, 0.0105), (0.0142, 0.0108), (0.0128, 0.02), (0.0098, 0.034), (0.0088, 0.045), (0.0104, 0.0535), (0.0092, 0.0585), (0.0048, 0.0615), (0, 0.062)], fold=folds, squash=0.86)
    # The pack, high on the back.
    ball(bm, (0, 0.0078, 0.0455), 0.0072, scale=(1.0, 0.72, 1.12), around=12, rings=6)
    # The head, and the hat: a wide brim that dips a little, and a soft crown that leans back.
    ball(bm, (0, -0.0006, 0.0668), 0.0068, around=14, rings=6)
    turned(
        bm,
        [(0, 0.0702), (0.0146, 0.0696), (0.0150, 0.0707), (0.0086, 0.0728), (0.0072, 0.0772), (0.0052, 0.0822), (0.0022, 0.0852), (0, 0.0858)],
        shift=lambda h: (0.0, max(0.0, h - 0.0728) * 0.22),
    )
    # The staff, held out to the right hand side and a little forward, with a knob at its head.
    turned(
        bm,
        [(0, 0.0105), (0.0012, 0.0105), (0.0012, 0.0885), (0, 0.0885)],
        around=8,
        shift=lambda h: (0.0138 - (h - 0.0105) * 0.035, -0.0052),
    )
    ball(bm, (0.0111, -0.0052, 0.0897), 0.002, around=8, rings=4)
    # The hand on the staff: a lump where the cloak reaches it.
    ball(bm, (0.0118, -0.0046, 0.047), 0.0027, scale=(1.5, 1.0, 1.0), around=8, rings=4)


def hood(bm, scale, lift, lean):
    """The narrator's hood, made small: an outer skin of cloth, an inner skin of nothing, joined at the brim."""
    around = 24
    thick = 0.045
    prof = narrator_hood.PROFILE

    def at(y, r, a):
        x, yy, z = narrator_hood.place(y, r, a)
        # Tip the whole hood forward a little, as a head bowed over a table.
        c, s = math.cos(lean), math.sin(lean)
        yy, z = yy * c - z * s, yy * s + z * c
        return (x * scale, yy * scale, z * scale + lift)

    skins = []
    for inset, mat in ((0.0, BODY), (thick, VOID)):
        rings = [[bm.verts.new(at(y, max(0.01, r - inset), (i / around) * TAU - math.pi)) for i in range(around)] for (y, r) in prof]
        pole = bm.verts.new(at(narrator_hood.BACK - inset, 0.0, 0.0))
        for k in range(len(rings) - 1):
            for i in range(around):
                j = (i + 1) % around
                quad = (rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i])
                bm.faces.new(quad if mat == BODY else quad[::-1]).material_index = mat
        for i in range(around):
            tri = (rings[-1][i], rings[-1][(i + 1) % around], pole)
            bm.faces.new(tri if mat == BODY else tri[::-1]).material_index = mat
        skins.append(rings)
    # Two small eyes in the dark, as its owner has.
    for side in (-1, 1):
        ball(bm, at_point(side * 0.046, -0.1, 0.005, scale, lift, lean), 0.024 * scale, EYES, scale=(1.35, 0.6, 0.75), around=8, rings=4)
    outer, inner = skins[0][0], skins[1][0]
    for i in range(around):
        j = (i + 1) % around
        bm.faces.new((outer[j], outer[i], inner[i], inner[j])).material_index = BODY


def at_point(x, y, z, scale, lift, lean):
    """A place given in the narrator's hood's own measure, on the small hood."""
    c, s = math.cos(lean), math.sin(lean)
    return (x * scale, (y * c - z * s) * scale, (y * s + z * c) * scale + lift)


def shadow(bm):
    base(bm)

    # The robe: long, narrow, hanging in deep folds from narrow shoulders.
    def folds(a, h):
        hang = max(0.0, 1 - (h - 0.011) / 0.06)
        return 1 + (0.17 * math.sin(a * 7 + 1.1) + 0.06 * math.sin(a * 12 + 0.4)) * hang

    turned(bm, [(0, 0.0105), (0.0168, 0.0108), (0.0142, 0.022), (0.0106, 0.04), (0.0098, 0.052), (0.0140, 0.0635), (0.0138, 0.0695), (0.0082, 0.0752), (0, 0.0762)], fold=folds, squash=0.76)
    hood(bm, 0.057, 0.0868, 0.26)


def material(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.4
    return m


def figure(name, build, mats, at_x):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index != VOID])
    used = max(f.material_index for f in bm.faces)
    mats = mats[: used + 1]
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    for m in mats:
        o.data.materials.append(m)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    sub = o.modifiers.new("Round", "SUBSURF")
    sub.levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if tris > TARGET_TRIS:
        dec = o.modifiers.new("Thin", "DECIMATE")
        dec.ratio = TARGET_TRIS / tris
        bpy.ops.object.modifier_apply(modifier=dec.name)
    for p in o.data.polygons:
        p.use_smooth = True
    # Side by side in the file only so they can be looked at; the room reads each by name and stands it where it likes.
    o.location.x = at_x
    print(f"{name}: {sum(len(p.vertices) - 2 for p in o.data.polygons)} triangles, {o.dimensions.z * 1000:.1f} mm tall")
    return o


def export(objs):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_materials="EXPORT", export_yup=True, export_texcoords=False)
    print(f"wrote {OUT}: {os.path.getsize(OUT) // 1024} KB")


def main():
    clear()
    mats = [material("body", (0.8, 0.74, 0.6)), material("band", (0.5, 0.1, 0.1)), material("void", (0, 0, 0)), material("eyes", (1, 0.85, 0.5))]
    objs = [figure("traveller", traveller, mats, -0.03), figure("shadow", shadow, mats, 0.03)]
    export(objs)


# TALLOW_STEPS=1 only defines the steps, for running them one at a time from a live Blender.
if os.environ.get("TALLOW_STEPS") != "1":
    main()
