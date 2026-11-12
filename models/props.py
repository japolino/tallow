"""
The room's static props, in the style of docs/ART.md: one object per prop, all in assets/models/props.glb.

Run it either way:
    blender --background --python models/props.py            (all props, baked, exported)
    TALLOW_PROPS=tome,dish blender -b -P models/props.py      (only those, for a quick look; not exported)
or from a running Blender (it clears the scene first).

Each prop's origin is the middle of its base, on whatever it stands on; it faces -Y here (+Z in the room).
Lengths are metres and match where src/room/room.ts puts each one (by object name).
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow"), "models")
sys.path.insert(0, HERE)
import importlib  # noqa: E402

import style  # noqa: E402

importlib.reload(style)
from style import box, finish, lathe, new_object, tube, wobble  # noqa: E402

OUT = os.path.join(style.ROOT, "assets", "models", "props.glb")
PROPS = {}


def prop(fn):
    PROPS[fn.__name__] = fn
    return fn


def merge(bm, part):
    """Append the geometry of bmesh `part` to `bm` (materials by index), then free `part`."""
    tmp = bpy.data.meshes.new("_part")
    part.to_mesh(tmp)
    part.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def bands(bm, verts, axis, at, width, push, centre=(0.0, 0.0), step=0.0015):
    """Raised bands round a turned or swept part: loop cuts (bisect) at each band's two edges and support cuts
    `step` outside them, then the ring between the edges pushed out from the axis by `push` (a factor), so each band
    steps up sharply instead of swelling. `axis` is 0, 1 or 2."""
    no = [0, 0, 0]
    no[axis] = 1
    for a in at:
        for c in (a - width / 2 - step, a - width / 2, a + width / 2, a + width / 2 + step):
            co = [0, 0, 0]
            co[axis] = c
            geom = list({e for v in verts if v.is_valid for e in v.link_edges}) + [f for f in bm.faces] + [v for v in verts if v.is_valid]
            res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
            verts = [v for v in verts if v.is_valid] + [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMVert)]
    for v in verts:
        if not v.is_valid:
            continue
        for a in at:
            if abs(v.co[axis] - a) <= width / 2 + 1e-6:
                o = [1, 1, 1]
                o[axis] = 0
                for i in range(3):
                    if o[i]:
                        c = centre[0] if i == (0 if axis != 0 else 1) else centre[1]
                        v.co[i] = c + (v.co[i] - c) * push
    return verts


# ------------------------------------------------------------------ table props (replacing code-built ones)


@prop
def candlestick():
    """A brass candlestick with a deep drip pan and a chunky finger ring toward the table's middle. The socket's
    rim is at 0.132 (room.ts)."""
    bm = bmesh.new()
    prof = [
        (0, 0.002), (0.03, 0.002), (0.034, 0), (0.06, 0), (0.065, 0.005), (0.06, 0.011), (0.042, 0.016), (0.024, 0.025),
        (0.014, 0.038), (0.0125, 0.054), (0.0205, 0.064), (0.0175, 0.076), (0.012, 0.084), (0.0118, 0.102),
        (0.02, 0.109), (0.045, 0.116), (0.048, 0.1225), (0.043, 0.1265), (0.03, 0.1205),
        (0.0185, 0.1215), (0.0178, 0.13), (0.0198, 0.133), (0.0136, 0.133), (0.0134, 0.127), (0, 0.127),
    ]
    lathe(bm, prof, segs=12)
    # The pan is a little out of true, as cast brass is.
    for v in bm.verts:
        if v.co.z > 0.108 and math.hypot(v.co.x, v.co.y) > 0.025:
            v.co.z += 0.0016 * math.sin(math.atan2(v.co.y, v.co.x) + 0.4)
    ring = [(-0.06 - 0.015 * math.cos(a), 0.0, 0.118 + 0.015 * math.sin(a)) for a in [i / 8 * math.tau for i in range(11)]]
    tube(bm, ring, 0.0045, segs=6, closed=True)
    style.lean(bm, angle=0.045, axis="Y")
    style.lean(bm, angle=0.02, axis="X")
    wobble(bm, amount=0.003, scale=10, seed=3)
    o = new_object("candlestick", bm, ["brass"])
    return [finish(o, bevel=0.0012, angle=50)]


@prop
def dish():
    """The pewter dish the candle cluster stands on: hand-beaten, a heavy flanged rim, a raised middle at 0.009
    (room.ts) where the candles stand."""
    bm = bmesh.new()
    prof = [
        (0, 0.002), (0.06, 0.002), (0.066, 0), (0.086, 0), (0.09, 0.004), (0.108, 0.006), (0.12, 0.015), (0.126, 0.026),
        (0.136, 0.029), (0.1445, 0.034), (0.146, 0.04), (0.141, 0.046), (0.13, 0.045), (0.123, 0.041), (0.111, 0.026),
        (0.1, 0.0145), (0.09, 0.0108), (0.075, 0.0098), (0.04, 0.0092), (0, 0.009),
    ]
    lathe(bm, prof, segs=16)
    # Beaten by hand: a rim that is not quite level.
    for v in bm.verts:
        if v.co.z > 0.028:
            v.co.z += 0.0022 * math.sin(math.atan2(v.co.y, v.co.x) * 2 + 0.7)
    wobble(bm, amount=0.0024, scale=8, seed=5)
    o = new_object("dish", bm, ["pewter"])
    return [finish(o, bevel=0.0012, angle=50)]


@prop
def coin():
    """One coin, struck by hand: a fat rim, a dished field, an off-centre boss, not quite flat; the room instances it."""
    bm = bmesh.new()
    prof = [(0, 0), (0.0128, 0), (0.0134, 0.001), (0.0128, 0.0026), (0.0106, 0.0027), (0.0099, 0.0021), (0, 0.002)]
    lathe(bm, prof, segs=11)
    lathe(bm, [(0, 0.0019), (0.0052, 0.0019), (0.0046, 0.0027), (0, 0.003)], segs=4, at=(0.0008, -0.0005))
    for v in bm.verts:
        v.co.z += 0.0003 * v.co.x / 0.013
        v.co.x = min(v.co.x, 0.0118)  # clipped on one side
    wobble(bm, amount=0.0006, scale=70, seed=13)
    o = new_object("coin", bm, ["brass"])
    return [finish(o, bevel=0.0004, segments=2, angle=50)]


@prop
def tome():
    """The narrator's book: thick leather boards overhanging a recessed page block, a round spine with four fat
    raised bands, a sunk panel with a raised boss on the cover, brass corner caps on the boards and a strap clasp
    over the fore-edge. 0.225 x 0.3 x 0.062 (room.ts). The spine is on -X, the fore-edge on +X."""
    LEATHER, BRASS, PAPER, EDGE = 0, 1, 2, 3
    BT = 0.0075  # board thickness
    H = 0.062
    XS, XF, YH = -0.104, 0.115, 0.152  # spine line, fore-edge, half length
    bm = bmesh.new()

    # The page block, set back 8-10 mm inside the boards; the fore-edge is cut into page lines painted in two tones,
    # and hollowed the way a thick book's is. Its hidden top and bottom are left out.
    p = bmesh.new()
    box(p, (XF - 0.009 - XS, 2 * (YH - 0.009), H - 2 * BT), at=((XF - 0.009 + XS) / 2, 0, BT), mat_index=PAPER)
    for c in (-0.07, 0.0, 0.07):
        bmesh.ops.bisect_plane(p, geom=p.verts[:] + p.edges[:] + p.faces[:], plane_co=(0, c, 0), plane_no=(0, 1, 0))
    n = 6
    for i in range(1, n):
        bmesh.ops.bisect_plane(p, geom=p.verts[:] + p.edges[:] + p.faces[:], plane_co=(0, 0, BT + i * (H - 2 * BT) / n), plane_no=(0, 0, 1))
    for v in p.verts:
        if v.co.x > XF - 0.012:
            v.co.x -= 0.005 * max(0.0, 1 - (v.co.y / (YH - 0.009)) ** 2)
    bmesh.ops.delete(p, geom=[f for f in p.faces if abs(f.normal.z) > 0.9], context="FACES_ONLY")
    for f in p.faces:
        z = f.calc_center_median().z
        if (int((z - BT) / ((H - 2 * BT) / n))) % 2:
            f.material_index = EDGE
    merge(bm, p)

    # Boards, overhanging the block; the top one has a sunk panel with a raised boss in it.
    for z in (0.0, H - BT):
        c = bmesh.new()
        box(c, (XF - XS + 0.008, 2 * YH, BT), at=((XF + XS - 0.008) / 2, 0, z), mat_index=LEATHER)
        if z > 0:
            top = max(c.faces, key=lambda f: f.calc_center_median().z)
            bmesh.ops.inset_region(c, faces=[top], thickness=0.018, depth=-0.0018)
            bmesh.ops.inset_region(c, faces=[top], thickness=0.034, depth=0.0)
            bmesh.ops.inset_region(c, faces=[top], thickness=0.005, depth=0.003)
        merge(bm, c)

    # The spine: a half-round swept along the book, its ends closed, then four raised bands (loop cuts, pushed out).
    s = bmesh.new()
    rz, rx, cz = H / 2, 0.017, H / 2
    k = 8
    rings = []
    for y in (-YH, YH):
        ring = []
        for i in range(k + 1):
            a = math.pi / 2 + i / k * math.pi
            ring.append(s.verts.new((XS + rx * math.cos(a), y, cz + rz * math.sin(a))))
        rings.append(ring)
    for i in range(k):
        s.faces.new([rings[0][i], rings[0][i + 1], rings[1][i + 1], rings[1][i]])
    s.faces.new(rings[0][::-1])
    s.faces.new(rings[1])
    bmesh.ops.recalc_face_normals(s, faces=s.faces[:])
    for f in s.faces:
        f.material_index = LEATHER
    bands(s, s.verts[:], axis=1, at=[-0.096, -0.032, 0.032, 0.096], width=0.016, push=1.38, centre=(XS, cz))
    # bands only push outward from the spine, never into the boards
    for v in s.verts:
        v.co.x = min(v.co.x, XS + 0.002)
        v.co.z = max(-0.004, min(H + 0.004, v.co.z))
    merge(bm, s)

    # Brass caps on the four fore-edge corners of each board, folded round the board's edge.
    for sy in (-1, 1):
        for zb, up in ((H, 1), (0.0, -1)):
            kb = bmesh.new()
            L = 0.044
            ax, ay = XF + 0.0012, sy * (YH + 0.0012)
            tri = [Vector((ax, ay, zb)), Vector((ax - L, ay, zb)), Vector((ax, ay - sy * L, zb))]
            f = kb.faces.new([kb.verts.new(v) for v in tri])
            if sy < 0:
                f.normal_flip()
            r = bmesh.ops.extrude_face_region(kb, geom=[f])
            bmesh.ops.translate(kb, verts=[g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, 0.0028 * up))
            # the fold: the cap's two outer edges carried down the board's thickness
            zl = zb - up * (BT + 0.0006)
            box(kb, (0.0028, L, BT + 0.0034), at=(ax - 0.0014, ay - sy * L / 2, min(zl, zb + 0.0028 * up) if up < 0 else zl))
            box(kb, (L, 0.0028, BT + 0.0034), at=(ax - L / 2, ay - sy * 0.0014, min(zl, zb + 0.0028 * up) if up < 0 else zl))
            for ff in kb.faces:
                ff.material_index = BRASS
            bmesh.ops.recalc_face_normals(kb, faces=kb.faces[:])
            merge(bm, kb)

    # The clasp: a leather-backed brass strap from the top board, over the fore-edge, down to a catch on the lower board.
    strap = [(0.07, 0, H + 0.0006), (0.1, 0, H + 0.0008), (XF + 0.002, 0, H - 0.004), (XF + 0.004, 0, H - 0.014), (XF + 0.004, 0, BT + 0.006)]
    tube(bm, strap, 0.0135, segs=6, mat_index=BRASS, squash=0.22)
    c = bmesh.new()
    box(c, (0.005, 0.03, BT + 0.006), at=(XF + 0.002, 0, -0.0005), mat_index=BRASS)
    front = max(c.faces, key=lambda f: f.calc_center_median().x)
    bmesh.ops.inset_region(c, faces=[front], thickness=0.004, depth=-0.0015)
    merge(bm, c)
    lathe(bm, [(0, 0), (0.0065, 0), (0.0072, 0.002), (0.0052, 0.004), (0, 0.0044)], segs=8, mat_index=BRASS, z0=H + 0.0006, at=(0.072, 0.0))

    style.lean(bm, angle=0.012, axis="X")
    wobble(bm, amount=0.0042, scale=4, seed=7)
    o = new_object("tome", bm, ["leather", "brass", "paper", "paper_edge"])
    o["tones"] = {"2": 2, "3": 1}
    o["max_edge"] = 0.07
    return [finish(o, bevel=0.0022, angle=50)]


@prop
def dice_box():
    """An open box of dice: a tray hollowed from one block with a flared plinth, felt in the bottom, a sunk panel on
    each side and brass corner brackets. 0.21 x 0.15 x 0.042; the felt floor is at 0.011 (room.ts)."""
    WOOD, FELT, BRASS = 0, 1, 2
    W, D, H, T = 0.21, 0.15, 0.042, 0.016
    bm = bmesh.new()
    box(bm, (W, D, H), mat_index=WOOD)
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    bmesh.ops.inset_region(bm, faces=[top], thickness=T, depth=0.0)
    r = bmesh.ops.extrude_face_region(bm, geom=[top])
    bmesh.ops.translate(bm, verts=[g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, -(H - 0.011)))
    bmesh.ops.delete(bm, geom=[top], context="FACES")
    bm.normal_update()
    for f in r["geom"]:
        if isinstance(f, bmesh.types.BMFace) and f.is_valid and f.calc_center_median().z < 0.02:
            f.material_index = FELT
    # A plinth: a loop cut low on the outside, the band below it flared out.
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.007), plane_no=(0, 0, 1))
    for v in bm.verts:
        if v.co.z < 0.0072 and (abs(v.co.x) > W / 2 - 0.001 or abs(v.co.y) > D / 2 - 0.001):
            v.co.x *= 1.045
            v.co.y *= 1.06
    # Sunk panels on the four outer sides, above the plinth.
    sides = [f for f in bm.faces if abs(f.normal.z) < 0.1 and f.calc_center_median().z > 0.01 and f.material_index == WOOD and (abs(f.calc_center_median().x) > W / 2 - 0.002 or abs(f.calc_center_median().y) > D / 2 - 0.002)]
    bmesh.ops.inset_individual(bm, faces=sides, thickness=0.006, depth=-0.002)
    # Brass corner brackets: an L-section extruded up each corner.
    for sx in (-1, 1):
        for sy in (-1, 1):
            k = bmesh.new()
            x0, y0, t, leg = sx * (W / 2 - 0.0012), sy * (D / 2 - 0.0012), 0.0034, 0.026
            sec = [(x0, y0), (x0 - sx * leg, y0), (x0 - sx * leg, y0 + sy * t), (x0 + sx * t, y0 + sy * t), (x0 + sx * t, y0 - sy * leg), (x0, y0 - sy * leg)]
            f = k.faces.new([k.verts.new((x, y, 0.008)) for x, y in sec])
            rr = bmesh.ops.extrude_face_region(k, geom=[f])
            bmesh.ops.translate(k, verts=[g for g in rr["geom"] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, H - 0.008 - 0.0005))
            bmesh.ops.recalc_face_normals(k, faces=k.faces[:])
            for ff in k.faces:
                ff.material_index = BRASS
            merge(bm, k)
    wobble(bm, amount=0.0035, scale=5, seed=11)
    o = new_object("dice_box", bm, ["wood", "felt", "brass"])
    o["tones"] = {"1": 2}
    return [finish(o, bevel=0.0022, angle=35)]


# ------------------------------------------------------------------ new props


def xform(part, loc=(0, 0, 0), rot=None, scale=None):
    """Scale (x, y, z), then rotate ((angle, axis) or a Matrix) about the origin, then move a bmesh part."""
    if scale:
        for v in part.verts:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    if rot is not None:
        m = rot if isinstance(rot, Matrix) else Matrix.Rotation(rot[0], 3, rot[1])
        bmesh.ops.rotate(part, verts=part.verts[:], cent=(0, 0, 0), matrix=m)
    bmesh.ops.translate(part, verts=part.verts[:], vec=loc)
    return part


def ring(r, z=0.0, n=12, cx=0.0, cy=0.0, plane="XY"):
    """Points round a circle, for closed tubes (hoops, handles, links)."""
    out = []
    for i in range(n):
        a = i / n * math.tau
        if plane == "XY":
            out.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
        elif plane == "XZ":
            out.append((cx + r * math.cos(a), cy, z + r * math.sin(a)))
        else:
            out.append((cx, cy + r * math.cos(a), z + r * math.sin(a)))
    return out


def push_band(bm, axis, lo, hi, amount, mat_index=None, step=0.0015):
    """Loop-cut a band between lo and hi along `axis` (with support cuts `step` outside it, so it steps up sharply),
    push its verts out along their normals and (optionally) give its faces another material: hoops and straps."""
    no = [0, 0, 0]
    no[axis] = 1
    for c in (lo - step, lo, hi, hi + step):
        co = [0, 0, 0]
        co[axis] = c
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)
    bm.normal_update()
    inside = [v for v in bm.verts if lo - 1e-6 <= v.co[axis] <= hi + 1e-6]
    mid = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
    moves = [(v, v.normal.copy()) for v in inside]
    for v, n in moves:
        n[axis] = 0
        out = v.co - mid
        out[axis] = 0
        if n.dot(out) < 0:
            n = -n
        if n.length > 1e-6:
            v.co += n.normalized() * amount
    if mat_index is not None:
        for f in bm.faces:
            if all(lo - 1e-6 <= v.co[axis] <= hi + 1e-6 for v in f.verts):
                f.material_index = mat_index


@prop
def inkwell():
    """A squat pewter inkwell, ink to the neck, a goose quill standing in it (narrator's side of the table)."""
    PEWTER, INK, QUILL = 0, 1, 2
    bm = bmesh.new()
    prof = [(0, 0.002), (0.032, 0.002), (0.036, 0), (0.042, 0.002), (0.042, 0.007), (0.038, 0.009), (0.039, 0.016),
            (0.034, 0.021), (0.034, 0.024), (0.022, 0.03), (0.0125, 0.032), (0.0115, 0.036), (0.0158, 0.0388),
            (0.016, 0.0418), (0.0104, 0.0418), (0.0098, 0.033)]
    lathe(bm, prof, segs=10, mat_index=PEWTER)
    lathe(bm, [(0.0099, 0.033), (0, 0.033)], segs=10, mat_index=INK)
    # the quill: a tapering shaft leaning out of the neck, the vane a lens-section blade either side of it
    def p(t):
        return Vector((0.002 + 0.07 * t + 0.025 * t * t, -0.018 * t, 0.016 + 0.2 * t - 0.015 * t * t))
    n = 14
    pts = [p(i / n) for i in range(n + 1)]
    tube(bm, pts, lambda t: 0.0022 * (1 - 0.65 * t), segs=5, mat_index=QUILL)
    t0, t1, m = 0.3, 0.985, 10
    rows = []
    for i in range(m + 1):
        t = t0 + (t1 - t0) * i / m
        c = p(t)
        fwd = (p(min(1, t + 0.01)) - p(max(0, t - 0.01))).normalized()
        side = fwd.cross(Vector((0.35, 1.0, 0.0)).normalized()).normalized()
        nrm = side.cross(fwd).normalized()
        s = math.sin(math.pi * (t - 0.27) / 0.75) ** 0.7 * (0.55 if i in (3, 7) else 1.0)
        curl = nrm * 0.004 * ((t - t0) / (t1 - t0)) ** 2
        rows.append([bm.verts.new(c + side * 0.021 * s + curl), bm.verts.new(c + nrm * 0.0016), bm.verts.new(c - side * 0.012 * s + curl), bm.verts.new(c - nrm * 0.0016)])
    for a, b in zip(rows, rows[1:]):
        for i, j in ((0, 1), (1, 2), (2, 3), (3, 0)):
            bm.faces.new((a[i], a[j], b[j], b[i])).material_index = QUILL
    bm.faces.new([rows[0][k] for k in (3, 2, 1, 0)]).material_index = QUILL
    bm.faces.new(rows[-1]).material_index = QUILL
    wobble(bm, amount=0.0016, scale=14, seed=21)
    o = new_object("inkwell", bm, ["pewter", "ink", "bone"])
    o["tones"] = {"1": 0}
    return [finish(o, bevel=0.0013, angle=50)]


@prop
def tankard():
    """A pewter tankard: tapered body with cast bands, a domed lid on a hinge with a thumb-piece, a strap handle."""
    bm = bmesh.new()
    prof = [(0, 0.003), (0.036, 0.003), (0.04, 0), (0.0465, 0.002), (0.0475, 0.008), (0.0435, 0.012), (0.043, 0.03),
            (0.0458, 0.033), (0.0458, 0.038), (0.042, 0.041), (0.0392, 0.1), (0.0418, 0.103), (0.0418, 0.108), (0.0395, 0.111),
            (0.0388, 0.12), (0.0412, 0.123), (0.0412, 0.125), (0, 0.125)]
    lathe(bm, prof, segs=14)
    lid = [(0, 0.017), (0.012, 0.0155), (0.028, 0.0105), (0.039, 0.0055), (0.0435, 0.0025), (0.0432, 0), (0, 0)]
    lathe(bm, lid, segs=14, z0=0.1255)
    # hinge and thumb-piece at the back (-X), over the handle
    tube(bm, [(-0.047, -0.009, 0.128), (-0.047, 0.009, 0.128)], 0.0042, segs=6)
    k = bmesh.new()
    box(k, (0.01, 0.016, 0.016), at=(-0.052, 0, 0.127))
    for v in k.verts:
        if v.co.z > 0.135:
            v.co.x -= 0.006
            v.co.y *= 1.35
    merge(bm, k)
    handle = [(-0.039, 0, 0.106), (-0.057, 0, 0.111), (-0.071, 0, 0.1), (-0.077, 0, 0.077), (-0.073, 0, 0.054), (-0.061, 0, 0.038), (-0.042, 0, 0.031)]
    tube(bm, handle, 0.0088, segs=6, squash=0.45)
    style.lean(bm, angle=0.03, axis="Y")
    style.lean(bm, angle=-0.02, axis="X")
    wobble(bm, amount=0.0022, scale=9, seed=17)
    o = new_object("tankard", bm, ["pewter"])
    return [finish(o, bevel=0.0012, angle=50)]


@prop
def hourglass():
    """An hourglass: two moulded oak plates, three turned posts, a glass of two bulbs with sand run mostly through."""
    WOOD, GLASS, SAND = 0, 1, 2
    bm = bmesh.new()
    plate = [(0, 0), (0.046, 0), (0.05, 0.004), (0.046, 0.008), (0.0495, 0.0115), (0.047, 0.015), (0.03, 0.015), (0, 0.015)]
    lathe(bm, plate, segs=12, mat_index=WOOD)
    lathe(bm, plate, segs=12, mat_index=WOOD, z0=0.155)
    post = [(0, 0), (0.0062, 0), (0.0066, 0.01), (0.0042, 0.03), (0.0064, 0.07), (0.0042, 0.11), (0.0066, 0.13), (0.0062, 0.14), (0, 0.14)]
    for i in range(3):
        a = math.pi / 2 + i * math.tau / 3
        lathe(bm, post, segs=6, mat_index=WOOD, z0=0.015, at=(0.038 * math.cos(a), 0.038 * math.sin(a)))
    bulb = [(0, 0.017), (0.012, 0.018), (0.027, 0.03), (0.031, 0.05), (0.023, 0.072), (0.0055, 0.084), (0.0048, 0.0855),
            (0.0055, 0.087), (0.023, 0.099), (0.031, 0.121), (0.027, 0.141), (0.012, 0.153), (0, 0.154)]
    lathe(bm, bulb, segs=12, mat_index=GLASS)
    lathe(bm, [(0, 0.0195), (0.0105, 0.02), (0.0215, 0.031), (0.0235, 0.038), (0.01, 0.05), (0, 0.054)], segs=10, mat_index=SAND)
    lathe(bm, [(0, 0.089), (0.0065, 0.0925), (0.017, 0.1), (0.0225, 0.108), (0.0, 0.103)], segs=10, mat_index=SAND)
    tube(bm, [(0, 0, 0.087), (0, 0, 0.054)], 0.0009, segs=4, mat_index=SAND)
    style.lean(bm, angle=0.012, axis="X")
    wobble(bm, amount=0.0012, scale=12, seed=23)
    o = new_object("hourglass", bm, ["wood", "glass", "paper"])
    o["tones"] = {"1": 2, "2": 2}
    return [finish(o, bevel=0.0012, angle=65)]


@prop
def scroll():
    """A rolled parchment lying on its side: a real spiral of sheet you can see at the ends, its loose end flat on
    the table, tied with an oxblood ribbon. Lies along X."""
    PAPER, RIBBON = 0, 1
    bm = bmesh.new()
    L, R0, R1, T = 0.21, 0.004, 0.0155, 0.0011
    cz = R1
    n = 20
    turns = 2.0
    samples = []
    for i in range(n + 1):
        th = i / n * turns * math.tau
        r = R0 + (R1 - R0) * i / n
        samples.append((math.cos(th - math.pi / 2) * r, cz + math.sin(th - math.pi / 2) * r, r))
    # the loose end, laid flat along +Y on the table
    ly, lz = samples[-1][0], samples[-1][1]
    for d in (0.012, 0.028, 0.045):
        samples.append((ly + d, 0.0006 + 0.0012 * (d < 0.02), R1))
    cols = []
    for (y, z, r) in samples:
        dirv = Vector((0, y, z - cz))
        inward = (-dirv.normalized() * T) if dirv.length > 1e-6 else Vector((0, 0, T))
        if z < 0.002:
            inward = Vector((0, 0, T))
        o_ = Vector((0, y, z))
        i_ = o_ + inward
        cols.append([bm.verts.new((-L / 2, o_.y, o_.z)), bm.verts.new((L / 2, o_.y, o_.z)), bm.verts.new((L / 2, i_.y, i_.z)), bm.verts.new((-L / 2, i_.y, i_.z))])
    for a, b in zip(cols, cols[1:]):
        for i, j in ((0, 1), (1, 2), (2, 3), (3, 0)):
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(cols[0][::-1])
    bm.faces.new(cols[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for x in (-L / 4, 0.0, L / 4):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0), plane_no=(1, 0, 0))
    for v in bm.verts:  # a little sag in the middle, the roll tighter at one end
        v.co.z -= 0.0012 * (1 - (2 * v.co.x / L) ** 2)
    for v in bm.verts:  # cinched where the ribbon ties it
        if abs(v.co.x - 0.025) < 0.012 and v.co.z > 0.002:
            k = 1 - abs(v.co.x - 0.025) / 0.012
            v.co.y *= 1 - 0.08 * k
            v.co.z = cz + (v.co.z - cz) * (1 - 0.08 * k)
    snug = []
    for k in range(12):
        phi = k / 12 * math.tau
        i = n / 2 + ((phi + math.pi / 2) % math.tau) / math.tau * n / 2  # the outer turn of the spiral at this angle
        r = (R0 + (R1 - R0) * i / n) * 0.92 + 0.0013
        snug.append((0.025, math.cos(phi) * r, cz + math.sin(phi) * r))
    tube(bm, snug, 0.0045, segs=4, mat_index=RIBBON, squash=0.35, closed=True)
    tube(bm, [(0.025, -0.006, 0.0005), (0.03, -0.022, 0.0006), (0.036, -0.036, 0.0005)], 0.0045, segs=4, mat_index=RIBBON, squash=0.25)
    tube(bm, [(0.022, -0.005, 0.0005), (0.012, -0.02, 0.0006), (0.006, -0.03, 0.0005)], 0.0045, segs=4, mat_index=RIBBON, squash=0.25)
    wobble(bm, amount=0.0012, scale=18, seed=29)
    o = new_object("scroll", bm, ["paper", "leather"])
    return [finish(o, bevel=0.0006, angle=50)]


@prop
def lantern():
    """An iron lantern for the window sill: a tray base, four posts, glazed sides crossed by bars, a pyramid roof
    with a chimney and a ring to carry it by, a candle stub inside."""
    IRON, GLASS, WAX = 0, 1, 2
    W, Hb, Hp = 0.11, 0.014, 0.15
    bm = bmesh.new()
    box(bm, (W, W, Hb), mat_index=IRON)
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    bmesh.ops.inset_region(bm, faces=[top], thickness=0.007, depth=-0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            k = bmesh.new()
            box(k, (0.012, 0.012, Hp), at=(sx * (W / 2 - 0.006), sy * (W / 2 - 0.006), Hb), mat_index=IRON)
            merge(bm, k)
    for ax in (0, 1):
        for s in (-1, 1):
            k = bmesh.new()
            size = (W - 0.016, 0.002, Hp) if ax == 0 else (0.002, W - 0.016, Hp)
            at = (0, s * (W / 2 - 0.004), Hb) if ax == 0 else (s * (W / 2 - 0.004), 0, Hb)
            box(k, size, at=at, mat_index=GLASS)
            bsize = (W - 0.01, 0.0066, 0.0066) if ax == 0 else (0.0066, W - 0.01, 0.0066)
            box(k, bsize, at=(at[0] * 1.06, at[1] * 1.06, Hb + Hp * 0.55), mat_index=IRON)
            vsize = (0.0066, 0.0066, Hp)
            box(k, vsize, at=(at[0] * 1.06, at[1] * 1.06, Hb), mat_index=IRON)
            merge(bm, k)
    r = bmesh.new()
    box(r, (W + 0.032, W + 0.032, 0.012), at=(0, 0, Hb + Hp), mat_index=IRON)
    t = max(r.faces, key=lambda f: f.calc_center_median().z)
    e = bmesh.ops.extrude_face_region(r, geom=[t])
    ev = [g for g in e["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.scale(r, verts=ev, vec=(0.24, 0.24, 1), space=Matrix.Translation((0, 0, -(Hb + Hp + 0.012))))
    bmesh.ops.translate(r, verts=ev, vec=(0, 0, 0.05))
    bmesh.ops.delete(r, geom=[t], context="FACES")
    t2 = max(r.faces, key=lambda f: f.calc_center_median().z)
    e = bmesh.ops.extrude_face_region(r, geom=[t2])
    bmesh.ops.translate(r, verts=[g for g in e["geom"] if isinstance(g, bmesh.types.BMVert)], vec=(0, 0, 0.014))
    bmesh.ops.delete(r, geom=[t2], context="FACES")
    bmesh.ops.recalc_face_normals(r, faces=r.faces[:])
    merge(bm, r)
    zt = Hb + Hp + 0.076
    hr = bmesh.new()
    tube(hr, ring(0.022, z=0.0, n=12, plane="XZ"), 0.0036, segs=5, mat_index=IRON, closed=True)
    merge(bm, xform(hr, rot=(0.35, "X"), loc=(0, 0, zt + 0.02)))
    lathe(bm, [(0, 0), (0.016, 0), (0.0148, 0.004), (0.0142, 0.048), (0.0126, 0.054), (0.004, 0.056), (0.0014, 0.063), (0, 0.063)], segs=8, mat_index=WAX, z0=Hb - 0.004)
    wobble(bm, amount=0.0026, scale=8, seed=31)
    style.lean(bm, angle=0.025, axis="X")
    o = new_object("lantern", bm, ["iron", "glass", "wax"])
    o["tones"] = {"1": 2}
    return [finish(o, bevel=0.0016, segments=1, angle=50)]


@prop
def bottle():
    """A dark green wine bottle, corked, a dribbled oxblood wax seal over the cork and a parchment label."""
    GLASS, CORK, SEAL, LABEL = 0, 1, 2, 3
    bm = bmesh.new()
    prof = [(0, 0.012), (0.026, 0.004), (0.033, 0), (0.0375, 0.004), (0.038, 0.15), (0.0345, 0.172), (0.023, 0.193),
            (0.0138, 0.205), (0.0128, 0.232), (0.0148, 0.236), (0.0148, 0.243), (0.0118, 0.245), (0, 0.245)]
    lathe(bm, prof, segs=14, mat_index=GLASS)
    lathe(bm, [(0, 0.243), (0.0122, 0.243), (0.0128, 0.256), (0.0112, 0.26), (0, 0.26)], segs=8, mat_index=CORK)
    sv, _ = lathe(bm, [(0.0128, 0.226), (0.0162, 0.228), (0.016, 0.25), (0.0142, 0.263), (0.006, 0.267), (0, 0.268)], segs=10, mat_index=SEAL)
    rnd = __import__("random").Random(5)
    drips = {i: rnd.uniform(0, 0.012) for i in range(10)}
    for v in sv:
        if v.co.z < 0.229:
            a = int(round((math.atan2(v.co.y, v.co.x) % math.tau) / math.tau * 10)) % 10
            v.co.z -= drips[a]
    # the label: a strip round two thirds of the body
    m, z0, z1, r = 9, 0.07, 0.122, 0.0386
    vs = []
    for i in range(m + 1):
        a = -math.pi * 0.65 + i / m * math.pi * 1.3 - math.pi / 2
        vs.append((bm.verts.new((r * math.cos(a), r * math.sin(a), z0)), bm.verts.new((r * math.cos(a), r * math.sin(a), z1))))
    for (a0, a1), (b0, b1) in zip(vs, vs[1:]):
        bm.faces.new((a0, b0, b1, a1)).material_index = LABEL
    wobble(bm, amount=0.0012, scale=12, seed=37)
    o = new_object("bottle", bm, ["bottle", "wood_light", "leather", "paper"])
    return [finish(o, bevel=0.001, angle=50)]


@prop
def herb_jar():
    """A stoneware crock, its mouth covered with a ruffled cloth tied down with twine."""
    STONE, CLOTH, TWINE = 0, 1, 2
    bm = bmesh.new()
    prof = [(0, 0.003), (0.036, 0.003), (0.039, 0), (0.046, 0.002), (0.046, 0.008), (0.044, 0.011), (0.058, 0.04),
            (0.057, 0.07), (0.047, 0.088), (0.038, 0.096), (0.039, 0.104), (0.042, 0.108), (0, 0.108)]
    lathe(bm, prof, segs=12, mat_index=STONE)
    cv, _ = lathe(bm, [(0.0405, 0.078), (0.0475, 0.08), (0.0475, 0.096), (0.0445, 0.106), (0.034, 0.116), (0.016, 0.122), (0, 0.1235)], segs=12, mat_index=CLOTH)
    for v in cv:
        if v.co.z < 0.1:
            a = math.atan2(v.co.y, v.co.x)
            k = (0.1 - v.co.z) / 0.022
            v.co.x += math.cos(a) * 0.0045 * math.sin(7 * a + 0.4) * k
            v.co.y += math.sin(a) * 0.0045 * math.sin(7 * a + 0.4) * k
            v.co.z += 0.004 * math.sin(5 * a) * k
        elif 0.094 < v.co.z < 0.1:
            pass
    for v in cv:  # cinched under the twine, into the crock's neck
        if 0.093 < v.co.z < 0.104:
            v.co.x *= 0.9
            v.co.y *= 0.9
    tube(bm, ring(0.0455, z=0.0995, n=12), 0.0026, segs=4, mat_index=TWINE, closed=True)
    tube(bm, ring(0.0462, z=0.0945, n=12), 0.0024, segs=4, mat_index=TWINE, closed=True)
    tube(bm, [(0.044, -0.013, 0.098), (0.05, -0.017, 0.088), (0.053, -0.015, 0.072)], 0.0017, segs=4, mat_index=TWINE)
    wobble(bm, amount=0.002, scale=10, seed=41)
    o = new_object("herb_jar", bm, ["bone", "wool_dark", "rope"])
    return [finish(o, bevel=0.0012, angle=70)]


@prop
def jar():
    """A tall lidded jar: buff stoneware below, a blue glaze dipped over the shoulder that ran as it fired."""
    STONE, GLAZE = 0, 1
    bm = bmesh.new()
    lathe(bm, [(0, 0.003), (0.031, 0.003), (0.035, 0), (0.039, 0.006), (0.0455, 0.04)], segs=12, mat_index=STONE)
    gv, _ = lathe(bm, [(0.0455, 0.04), (0.0468, 0.07), (0.043, 0.1), (0.034, 0.116), (0.031, 0.12), (0.033, 0.124), (0, 0.124)], segs=12, mat_index=GLAZE)
    rnd = __import__("random").Random(9)
    for v in gv:
        if v.co.z < 0.0405:
            v.co.z -= rnd.uniform(0.0, 0.009)
    lathe(bm, [(0, 0.124), (0.0345, 0.124), (0.0355, 0.128), (0.021, 0.134), (0.009, 0.136), (0.011, 0.144), (0.008, 0.15), (0, 0.151)], segs=12, mat_index=STONE)
    style.lean(bm, angle=0.015, axis="Y")
    wobble(bm, amount=0.0018, scale=10, seed=43)
    o = new_object("jar", bm, ["bone", "ink"])
    return [finish(o, bevel=0.0012, angle=50)]


@prop
def skull():
    """A human skull for the shelf: a cranium shaped from a sphere, deep eye sockets and nose cavity pushed in,
    cheekbones and brow pulled out, a row of teeth and the jaw under it. Faces -Y."""
    BONE, TEETH = 0, 1
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)

    def dent(c, r, depth, sz=1.0, out=False):
        c = Vector(c).normalized()
        for v in bm.verts:
            d = v.co.normalized() - c
            d.z /= sz
            dl = d.length
            if dl < r:
                k = 1 - (dl / r) ** 2
                v.co -= v.co.normalized() * (depth * k * (-1 if out else 1))

    for v in bm.verts:  # flat underside, narrower temples, longer front to back
        v.co.z = max(v.co.z, -0.55)
        if v.co.y < 0.2:
            v.co.x *= 1 - 0.1 * max(0.0, 1 - abs(v.co.z + 0.1) * 1.5)
    dent((0.0, -1.0, 0.42), 0.55, 0.15, out=True)          # brow ridge
    dent((0.37, -0.9, 0.08), 0.34, 0.44)                    # eye sockets
    dent((-0.37, -0.9, 0.08), 0.34, 0.44)
    dent((0.0, -0.95, -0.26), 0.19, 0.38, sz=1.8)             # nose cavity
    dent((0.72, -0.6, -0.2), 0.3, 0.14, out=True)            # cheekbones
    dent((-0.72, -0.6, -0.2), 0.3, 0.14, out=True)
    for v in bm.verts:  # the upper jaw pushed forward and down under the nose
        if v.co.y < -0.3 and v.co.z < -0.3:
            k = min(1.0, (-0.3 - v.co.z) / 0.25) * min(1.0, (-0.3 - v.co.y) / 0.4)
            v.co.y -= 0.12 * k
            v.co.z -= 0.08 * k
    # teeth: a row of small chunky blocks round the front of the upper jaw
    for i in range(8):
        a = math.radians(-56 + i * 112 / 7)
        k = bmesh.new()
        box(k, (0.13, 0.1, 0.16), mat_index=TEETH)
        xform(k, loc=(0.52 * math.sin(a), -0.86 * math.cos(a) - 0.08, -0.82), rot=(-a, "Z"))
        merge(bm, k)
    # the jaw: a U of bone under the teeth, rising at the back
    jaw = [(-0.52, -0.05, -0.42), (-0.55, -0.22, -0.78), (-0.44, -0.62, -0.95), (-0.2, -0.88, -1.02), (0.0, -0.93, -1.03),
           (0.2, -0.88, -1.02), (0.44, -0.62, -0.95), (0.55, -0.22, -0.78), (0.52, -0.05, -0.42)]
    tube(bm, jaw, lambda t: 0.13 - 0.03 * abs(t - 0.5), segs=6, mat_index=BONE, squash=0.62)
    for i in range(8):
        a = math.radians(-56 + i * 112 / 7)
        k = bmesh.new()
        box(k, (0.12, 0.09, 0.13), mat_index=TEETH)
        xform(k, loc=(0.48 * math.sin(a), -0.82 * math.cos(a) - 0.08, -0.98), rot=(-a, "Z"))
        merge(bm, k)
    xform(bm, scale=(0.068, 0.088, 0.072))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, 0, 0.0745))
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(0.15, 3, "Z"))
    wobble(bm, amount=0.0015, scale=30, seed=47)
    o = new_object("skull", bm, ["bone", "bone"])
    o["tones"] = {"1": 2}
    return [finish(o, bevel=0.0, angle=70)]


def trunk(name, W, D, H, LH, s, feet=False, handles=False):
    """A strong box with a barrel lid: panelled oak sides, iron straps round body and lid, a brass lock plate."""
    WOOD, IRON, BRASS = 0, 1, 2
    bm = bmesh.new()
    box(bm, (W, D, H - LH), mat_index=WOOD)
    sides = [f for f in bm.faces if abs(f.normal.z) < 0.1]
    bmesh.ops.inset_individual(bm, faces=sides, thickness=0.02 * s, depth=-0.004 * s)
    lid = bmesh.new()
    k = 9
    rings_ = []
    for x in (-W / 2, W / 2):
        rings_.append([lid.verts.new((x, D / 2 * math.cos(i / k * math.pi), H - LH + LH * math.sin(i / k * math.pi))) for i in range(k + 1)])
    for i in range(k):
        lid.faces.new((rings_[0][i], rings_[0][i + 1], rings_[1][i + 1], rings_[1][i]))
    lid.faces.new(rings_[0])
    lid.faces.new(rings_[1][::-1])
    bmesh.ops.recalc_face_normals(lid, faces=lid.faces[:])
    merge(bm, lid)
    for c in (-W * 0.32, W * 0.32):
        push_band(bm, 0, c - 0.022 * s, c + 0.022 * s, 0.0045 * s, IRON)
    # iron edging round the lid's lip
    push_band(bm, 2, H - LH - 0.01 * s, H - LH + 0.01 * s, 0.003 * s, IRON)
    lp = bmesh.new()
    box(lp, (0.06 * s, 0.008 * s, 0.07 * s), at=(0, -D / 2 - 0.002 * s, H - LH - 0.055 * s), mat_index=BRASS)
    front = min(lp.faces, key=lambda f: f.calc_center_median().y)
    bmesh.ops.inset_region(lp, faces=[front], thickness=0.012 * s, depth=-0.003 * s)
    bmesh.ops.inset_region(lp, faces=[front], thickness=0.01 * s, depth=-0.006 * s)
    merge(bm, lp)
    hp = bmesh.new()
    box(hp, (0.024 * s, 0.006 * s, 0.05 * s), at=(0, -D / 2 - 0.004 * s, H - LH - 0.03 * s), mat_index=IRON)
    merge(bm, hp)
    if handles:
        for sx in (-1, 1):
            tube(bm, ring(0.05 * s, z=H * 0.62, n=10, cx=sx * (W / 2 + 0.012 * s), plane="YZ")[5:] + [(sx * (W / 2 + 0.012 * s), 0.05 * s, H * 0.62)], 0.007 * s, segs=5, mat_index=IRON)
            k2 = bmesh.new()
            box(k2, (0.008 * s, 0.13 * s, 0.03 * s), at=(sx * (W / 2 + 0.002 * s), 0, H * 0.62 - 0.015 * s), mat_index=IRON)
            merge(bm, k2)
    if feet:
        for sx in (-1, 1):
            for sy in (-1, 1):
                k3 = bmesh.new()
                box(k3, (0.07 * s, 0.07 * s, 0.03 * s), at=(sx * (W / 2 - 0.04 * s), sy * (D / 2 - 0.04 * s), -0.03 * s), mat_index=WOOD)
                merge(bm, k3)
        bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, 0, 0.03 * s))
    style.lean(bm, angle=0.006, axis="X")
    wobble(bm, amount=0.0035 * s, scale=5 / s, seed=len(name) * 7)
    o = new_object(name, bm, ["wood_dark", "iron", "brass"])
    o["noise"] = 0.08
    o["max_edge"] = 0.14 * s
    return [finish(o, bevel=0.0025 * s, segments=1, angle=40)]


@prop
def coffer():
    """A small strongbox with a barrel lid for the shelf."""
    return trunk("coffer", 0.2, 0.13, 0.13, 0.045, 1.0)


@prop
def chest():
    """A travelling chest on the floor by the left wall: barrel lid, iron straps, side handles, feet."""
    return trunk("chest", 0.78, 0.44, 0.5, 0.14, 2.6, feet=True, handles=True)


@prop
def book_row():
    """Eight books standing on a shelf, spines out (-Y): rounded spines with raised bands, boards overhanging the
    page tops, the last one leaning on its neighbours."""
    rnd = __import__("random").Random(53)
    covers = [0, 1, 2, 3]
    PAGES = 4
    bm = bmesh.new()
    x = 0.0
    for i in range(8):
        w = rnd.uniform(0.03, 0.058)
        h = rnd.uniform(0.18, 0.27)
        d = rnd.uniform(0.13, 0.175)
        c = covers[i % 4] if i % 3 else covers[(i + 1) % 4]
        k = bmesh.new()
        box(k, (w, d, h), at=(0, d / 2 - 0.09, 0), mat_index=c)
        top = max(k.faces, key=lambda f: f.calc_center_median().z)
        bmesh.ops.inset_region(k, faces=[top], thickness=0.0035, depth=-0.003)
        top.material_index = PAGES
        for cx in (-w / 4, 0.0, w / 4):
            bmesh.ops.bisect_plane(k, geom=k.verts[:] + k.edges[:] + k.faces[:], plane_co=(cx, 0, 0), plane_no=(1, 0, 0))
        for v in k.verts:
            if v.co.y < -0.089 and abs(v.co.x) < w / 2 - 1e-5:
                v.co.y -= 0.0065 * (1 - (2 * v.co.x / w) ** 2)
        nb = rnd.choice((0, 3, 4))
        if nb:
            at = [h * (j + 1) / (nb + 1) for j in range(nb)]
            for a in at:
                for cz in (a - 0.0065, a - 0.005, a + 0.005, a + 0.0065):
                    bmesh.ops.bisect_plane(k, geom=k.verts[:] + k.edges[:] + k.faces[:], plane_co=(0, 0, cz), plane_no=(0, 0, 1))
            for v in k.verts:
                if v.co.y < -0.089 and any(abs(v.co.z - a) <= 0.0051 for a in at):
                    v.co.y -= 0.0032
        if i == 7:
            xform(k, rot=(-0.32, "Y"), loc=(x + w / 2 * 0.95 + h * math.sin(0.32), 0, 0))
        else:
            xform(k, rot=(rnd.uniform(-0.03, 0.03), "Y"), loc=(x + w / 2, rnd.uniform(-0.01, 0.01), 0))
        merge(bm, k)
        x += w + 0.002
    lo = min(v.co.x for v in bm.verts)
    hi = max(v.co.x for v in bm.verts)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(-(lo + hi) / 2, 0, 0))
    for v in bm.verts:
        v.co.z = max(v.co.z, 0.0)
    wobble(bm, amount=0.0015, scale=12, seed=59)
    o = new_object("book_row", bm, ["leather", "ink", "felt", "wood_dark", "paper"])
    o["tones"] = {"4": 2}
    return [finish(o, bevel=0.0014, segments=1, angle=50)]


@prop
def barrel():
    """A coopered barrel: bellied staves with real grooves between them, the head sunk inside the chime, four iron
    hoops. For the back corner."""
    WOOD, IRON = 0, 1
    bm = bmesh.new()
    prof = [(0, 0.03), (0.198, 0.03), (0.2, 0.012), (0.226, 0), (0.248, 0.12), (0.265, 0.28), (0.27, 0.35),
            (0.265, 0.42), (0.248, 0.58), (0.226, 0.7), (0.2, 0.688), (0.198, 0.665), (0, 0.665)]
    # Sixteen staves, each a flat face of the lathe, so the silhouette is a coopered polygon, not a cylinder.
    lathe(bm, prof, segs=16, mat_index=WOOD)
    for z, w in ((0.1, 0.017), (0.2, 0.015), (0.5, 0.015), (0.6, 0.017)):
        push_band(bm, 2, z - w, z + w, 0.008, IRON)
    for x in (-0.1, -0.03, 0.04, 0.11):  # the head's boards
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0.66), plane_no=(1, 0, 0))
    for v in bm.verts:
        if v.co.z > 0.66 and math.hypot(v.co.x, v.co.y) < 0.19 and any(abs(v.co.x - x) < 1e-4 for x in (-0.1, -0.03, 0.04, 0.11)):
            v.co.z -= 0.005
    wobble(bm, amount=0.007, scale=3.5, seed=61)
    o = new_object("barrel", bm, ["wood", "iron"])
    o["max_edge"] = 0.25
    return [finish(o, bevel=0.0045, segments=2, angle=30)]


@prop
def crate():
    """A nailed crate of rough boards: planked sides with gaps, corner posts, a diagonal brace, a planked lid."""
    W, D, H, T = 0.5, 0.4, 0.38, 0.018
    rnd = __import__("random").Random(67)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            k = bmesh.new()
            box(k, (0.042, 0.042, H), at=(sx * (W / 2 - 0.021), sy * (D / 2 - 0.021), 0))
            merge(bm, k)
    n = 3
    ph = (H - 0.008 * (n - 1)) / n
    for ax, L, off in ((0, W - 0.004, D / 2 + T / 2), (1, D - 0.004, W / 2 + T / 2)):
        for s in (-1, 1):
            for i in range(n):
                k = bmesh.new()
                size = (L, T, ph) if ax == 0 else (T, L, ph)
                at = (0, s * off, i * (ph + 0.008)) if ax == 0 else (s * off, 0, i * (ph + 0.008))
                box(k, size, at=at)
                xform(k, rot=(rnd.uniform(-0.012, 0.012), "Y" if ax == 0 else "X"))
                bmesh.ops.translate(k, verts=k.verts[:], vec=(rnd.uniform(-0.004, 0.004) * (ax == 0), rnd.uniform(-0.004, 0.004) * (ax == 1), rnd.uniform(-0.002, 0.002)))
                merge(bm, k)
            if ax == 0:  # the brace across the long side
                k = bmesh.new()
                ln = math.hypot(W - 0.09, H - 0.06)
                box(k, (ln, T, 0.06), at=(0, 0, -0.03))
                xform(k, rot=(math.atan2(H - 0.06, W - 0.09), "Y"), loc=(0, s * (off + T * 0.9), H / 2))
                merge(bm, k)
    pw = (D + 2 * T - 0.006 * 3) / 4
    for i in range(4):
        k = bmesh.new()
        box(k, (W + 2 * T, pw, T), at=(0, -D / 2 - T + pw / 2 + i * (pw + 0.006), H))
        xform(k, rot=(rnd.uniform(-0.01, 0.01), "X"), loc=(rnd.uniform(-0.006, 0.006), 0, 0))
        merge(bm, k)
    for sx in (-1, 1):  # iron brackets over the top corners
        for sy in (-1, 1):
            k = bmesh.new()
            box(k, (0.07, 0.006, 0.07), at=(sx * (W / 2 - 0.035 + T), sy * (D / 2 + T + 0.003), H - 0.06), mat_index=1)
            box(k, (0.006, 0.07, 0.07), at=(sx * (W / 2 + T + 0.003), sy * (D / 2 - 0.035 + T), H - 0.06), mat_index=1)
            merge(bm, k)
    wobble(bm, amount=0.0035, scale=4, seed=71)
    o = new_object("crate", bm, ["wood_dark", "iron"])
    o["noise"] = 0.05
    o["max_edge"] = 0.26
    return [finish(o, bevel=0.0045, segments=1, angle=40)]


@prop
def stool():
    """A three-legged milking stool: a thick dished seat with a rounded edge, splayed turned legs, a ring of
    stretchers."""
    bm = bmesh.new()
    lathe(bm, [(0, 0.405), (0.15, 0.405), (0.164, 0.412), (0.171, 0.428), (0.166, 0.443), (0.15, 0.45), (0.08, 0.446), (0, 0.443)], segs=16)
    leg = [(0, 0), (0.019, 0), (0.021, 0.04), (0.017, 0.16), (0.021, 0.2), (0.016, 0.26), (0.0135, 0.43), (0, 0.43)]
    splay = 0.2
    feet = []
    for i in range(3):
        a = i * math.tau / 3 + 0.3
        k = bmesh.new()
        lathe(k, leg, segs=7)
        dirv = Vector((math.cos(a), math.sin(a), 0))
        for v in k.verts:
            v.co += dirv * (0.43 - v.co.z) * math.tan(splay)
        xform(k, loc=dirv * 0.092)
        merge(bm, k)
        feet.append((a, dirv))
    zr = 0.17
    pts = [(math.cos(a) * (0.092 + (0.43 - zr) * math.tan(splay)), math.sin(a) * (0.092 + (0.43 - zr) * math.tan(splay)), zr) for a, _ in feet]
    for j in range(3):
        tube(bm, [pts[j], pts[(j + 1) % 3]], 0.0105, segs=6)
    wobble(bm, amount=0.004, scale=5, seed=73)
    o = new_object("stool", bm, ["wood_dark"])
    return [finish(o, bevel=0.002, angle=55)]


@prop
def rug():
    """A worn wool rug under the table, 12 mm thick: an indigo border with a parchment line inside it, an oxblood
    field and a stepped diamond in the middle, all cut as real edges (bisect planes) so the pattern is clean; fringe
    in clumps at both ends; rumpled a little, one corner lifted."""
    FIELD, BORDER, LIGHT = 0, 1, 2
    W, D, T = 2.4, 1.6, 0.012
    bm = bmesh.new()
    box(bm, (W, D, T), mat_index=FIELD)

    def cut(co, no):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)

    for e in (0.15, 0.2):
        for sgn in (-1, 1):
            cut((sgn * (W / 2 - e), 0, 0), (1, 0, 0))
            cut((0, sgn * (D / 2 - e), 0), (0, 1, 0))
    A, B = 0.55, 0.36
    for c in (1.0, 0.78, 0.5):
        for sx in (-1, 1):
            for sy in (-1, 1):
                cut((sx * A * c, 0, 0), (sx / A, sy / B, 0))
    for x in (-0.6, 0.6):  # extra lines for the rumple to bend along
        cut((x, 0, 0), (1, 0, 0))
    for f in bm.faces:
        c = f.calc_center_median()
        e = min(W / 2 - abs(c.x), D / 2 - abs(c.y))
        dmd = abs(c.x) / A + abs(c.y) / B
        if e < 0.15:
            f.material_index = BORDER
        elif e < 0.2:
            f.material_index = LIGHT
        elif dmd < 0.5:
            f.material_index = BORDER
        elif dmd < 0.78:
            f.material_index = LIGHT
        elif dmd < 1.0:
            f.material_index = BORDER
        else:
            f.material_index = FIELD
    for v in bm.verts:  # rumpled: a soft wave, the outline not quite straight, one corner lifted
        v.co.z += 0.004 * math.sin(v.co.x * 3.1 + 0.4) * math.sin(v.co.y * 4.3)
        v.co.x += 0.008 * math.sin(v.co.y * 2.3)
        v.co.y += 0.008 * math.sin(v.co.x * 1.7 + 1)
        d = math.hypot(v.co.x - 1.0, v.co.y + 0.65)
        if d < 0.4:
            v.co.z += 0.03 * (1 - d / 0.4) ** 2
    rnd = __import__("random").Random(79)
    for sx in (-1, 1):
        for j in range(11):
            k = bmesh.new()
            box(k, (0.085, 0.034, 0.006), at=(0, 0, 0), mat_index=LIGHT)
            for v in k.verts:
                if v.co.x * sx > 0:
                    v.co.y *= 0.55
            xform(k, rot=(rnd.uniform(-0.18, 0.18), "Z"), loc=(sx * (W / 2 + 0.04), -D / 2 + 0.09 + j * (D - 0.18) / 10, 0.0))
            merge(bm, k)
    o = new_object("rug", bm, ["wool", "wool_dark", "wool_light"])
    o["max_edge"] = 0.35
    return [finish(o, bevel=0.0045, segments=1, angle=40)]


@prop
def candle_wheel():
    """An iron candle wheel hanging from the beam: a flat ring on six spokes, six drip cups with burnt-down
    stubs, three rods up to a short chain and a hook. Its origin is the hook; it hangs down -Z."""
    IRON, WAX = 0, 1
    R, Z = 0.32, -0.62
    bm = bmesh.new()
    tube(bm, ring(R, z=Z, n=24), 0.015, segs=6, squash=1.6, closed=True, mat_index=IRON)
    lathe(bm, [(0, -0.03), (0.035, -0.025), (0.04, -0.005), (0.03, 0.012), (0.012, 0.02), (0.01, 0.05), (0, 0.055)], segs=8, z0=Z, mat_index=IRON)
    rnd = __import__("random").Random(83)
    for i in range(6):
        a = i * math.tau / 6
        c, s = math.cos(a), math.sin(a)
        tube(bm, [(c * 0.035, s * 0.035, Z), (c * R * 0.5, s * R * 0.5, Z - 0.012), (c * (R - 0.006), s * (R - 0.006), Z)], 0.0105, segs=5, mat_index=IRON)
        a2 = a + math.tau / 12
        cx, cy = math.cos(a2) * R, math.sin(a2) * R
        lathe(bm, [(r * 1.2, z * 1.2) for r, z in [(0, 0), (0.03, 0), (0.036, 0.009), (0.02, 0.006), (0.0145, 0.01), (0.0135, 0.03), (0.0165, 0.033), (0.0125, 0.033), (0.0125, 0.012), (0, 0.012)]], segs=8, z0=Z + 0.012, at=(cx, cy), mat_index=IRON)
        h = rnd.uniform(0.025, 0.07)
        wv, _ = lathe(bm, [(0, 0), (0.0146, 0), (0.0148, h * 0.7), (0.0144, h), (0.008, h + 0.002), (0.002, h + 0.006), (0, h + 0.006)], segs=8, z0=Z + 0.036, at=(cx, cy), mat_index=WAX)
        wobble(bm, amount=0.0028, scale=60, seed=89 + i, verts=wv, lift=1)
    for i in range(3):
        a = i * math.tau / 3
        tube(bm, [(math.cos(a) * R, math.sin(a) * R, Z + 0.01), (0, 0, -0.16)], 0.009, segs=5, mat_index=IRON)
    tube(bm, ring(0.034, z=-0.16, n=10), 0.009, segs=5, closed=True, mat_index=IRON)
    for j in range(4):
        z = -0.16 + 0.018 + j * 0.034
        plane = "XZ" if j % 2 == 0 else "YZ"
        tube(bm, [(0.011 * math.cos(t / 8 * math.tau) if plane == "XZ" else 0, 0.011 * math.cos(t / 8 * math.tau) if plane == "YZ" else 0, z + 0.02 * math.sin(t / 8 * math.tau)) for t in range(8)], 0.0058, segs=4, closed=True, mat_index=IRON)
    tube(bm, [(0, 0, -0.03), (0, 0, 0.0), (0.014, 0, 0.014), (0.028, 0, 0.0)], 0.0075, segs=5, mat_index=IRON)
    o = new_object("candle_wheel", bm, ["iron", "wax"])
    return [finish(o, bevel=0.0018, segments=1, angle=80)]


@prop
def table():
    """The table: five oak planks with honest gaps, an apron under them, four octagon-turned legs with square
    blocks and feet, an H stretcher. Its origin is the middle of the top surface (y = 0 in the room); it hangs down -Z.
    1.9 x 1.25, 0.76 to the floor (room.ts)."""
    TOP, BASE = 0, 1
    W, D, T = 1.9, 1.25, 0.07
    rnd = __import__("random").Random(97)
    bm = bmesh.new()
    pw = (D - 0.004 * 4) / 5
    for i in range(5):
        k = bmesh.new()
        box(k, (W, pw, T), at=(0, -D / 2 + pw / 2 + i * (pw + 0.004), -T), mat_index=TOP)
        for v in k.verts:
            v.co.z += rnd.uniform(-0.0012, 0.0012) + 0.002 * (1 - (2 * v.co.x / W) ** 2) * (i % 2)
        merge(bm, k)
    ax, ay, ah = 0.78, 0.52, 0.12
    for s in (-1, 1):
        k = bmesh.new()
        box(k, (2 * ax, 0.028, ah), at=(0, s * (ay - 0.012), -T - ah), mat_index=BASE)
        box(k, (0.028, 2 * ay, ah), at=(s * (ax - 0.012), 0, -T - ah), mat_index=BASE)
        merge(bm, k)
    turned = [(r * 1.22, z) for r, z in [(0, 0), (0.04, 0), (0.044, 0.02), (0.034, 0.04), (0.029, 0.1), (0.04, 0.14), (0.047, 0.16), (0.039, 0.18), (0.027, 0.24),
              (0.025, 0.34), (0.033, 0.38), (0.04, 0.41), (0.033, 0.43), (0.04, 0.45), (0.035, 0.47), (0, 0.47)]]
    for sx in (-1, 1):
        for sy in (-1, 1):
            k = bmesh.new()
            box(k, (0.1, 0.1, 0.15), at=(0, 0, -T - 0.15), mat_index=BASE)
            box(k, (0.095, 0.095, 0.07), at=(0, 0, -0.76), mat_index=BASE)
            t = bmesh.new()
            lathe(t, turned, segs=8, z0=-0.69, mat_index=BASE)
            merge(k, xform(t, rot=(math.pi / 8, "Z")))
            xform(k, loc=(sx * ax, sy * ay, 0))
            merge(bm, k)
    k = bmesh.new()
    for sx in (-1, 1):
        box(k, (0.062, 2 * ay, 0.068), at=(sx * ax, 0, -0.645), mat_index=BASE)
    box(k, (2 * ax, 0.062, 0.062), at=(0, 0, -0.625), mat_index=BASE)
    merge(bm, k)
    wobble(bm, amount=0.004, scale=2.5, seed=101)
    o = new_object("table", bm, ["wood_dark", "wood_dark"])
    o["noise"] = 0.05
    o["max_edge"] = 0.35
    return [finish(o, bevel=0.006, segments=1, angle=50)]


# ------------------------------------------------------------------ build


# Props other things stand on or in, exactly where room.ts expects: they keep their own, smaller wobble.
STEADY = {"table", "dish", "candlestick", "coin"}


def build(names=None):
    style.clear()
    objs = []
    x = 0.0
    for name, fn in PROPS.items():
        if names and name not in names:
            continue
        made = fn()
        if name not in STEADY:
            for o in made:
                size = max(o.dimensions)
                b = bmesh.new()
                b.from_mesh(o.data)
                wobble(b, amount=0.006 * size, scale=1.6 / size, seed=sum(map(ord, name)))
                b.to_mesh(o.data)
                b.free()
        lo, hi = style.bounds(made)
        w = hi.x - lo.x
        for o in made:
            o.location.x += x - lo.x
        x += w + 0.08
        objs += made
    for o in objs:
        style.paint(o, seed=sum(map(ord, o.name)))
    return objs


def main():
    names = [n for n in os.environ.get("TALLOW_PROPS", "").split(",") if n]
    objs = build(names or None)
    if os.environ.get("TALLOW_NO_BAKE") == "1":
        return objs
    style.bake(objs)
    for o in objs:
        style.paint(o, seed=sum(map(ord, o.name)))
    if not names:
        for o in objs:
            o.location = (0, 0, 0)
        style.export(objs, OUT)
    return objs


if os.environ.get("TALLOW_STEPS") != "1":
    main()
