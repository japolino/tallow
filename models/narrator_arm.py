"""
The narrator's arm: the gaunt hand from models/narrator_hand.py, given bones,
a sleeve, and the movements it makes at the table.

Run it either way:
    blender --background --python models/narrator_arm.py
or from a running Blender (it clears the scene first).

Writes assets/models/narrator_arm.glb: one arm (the one on the player's
right; the room mirrors it for the other), skinned, with every movement below
as a named clip.

What is in the file
-------------------
Bones:
    upper_arm > upper_arm_end > forearm > forearm_end > wrist > the fingers
    index_1..3, middle_1..3, ring_1..3, little_1..3, thumb_1..3
    grip   a marker on the wrist: the point the thumb and fingers close on
    ctl    not part of the arm: it says where the wrist should be and how the
           hand should be turned. The clips move this bone and the fingers;
           the room works out the shoulder and elbow from it (and from the real
           thing on the table it is reaching for), so the arm bones themselves
           carry no movement in the file.
    The two "_end" bones sit at the elbow and at the wrist. The room slides
    them along the arm to make it longer when something is far away; the
    sleeve is weighted between each bone and its end, so it stretches evenly.

Clips (all start from, or pass through, the poses named in POSES below):
    rest, idle                                  lying on the table; a slow drift in the fingers
    reach, pinch, lift, carry, set_down, release   taking a small thing (a piece, by its head) and putting it down
    grasp, lift_wide, carry_wide, set_down_wide    the same for something thicker (the top of a candle)
    light                                       a pinch at a wick, and the fingers springing open as it takes
    slam, drum, tap, steeple, flick             small things it does when it has an opinion

Blender's axes here: +Z up, the figure faces -Y (toward the player), +X is the
player's right. The origin is on the table top under the figure's neck, as in
models/narrator_cloak.py. In the notes below "room axes" means the room's own:
x to the player's right, y up, z toward the player.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.join(os.environ.get("TALLOW_ROOT", "D:/Lumiverse/tallow"), "models")
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "assets", "models", "narrator_arm.glb")

# The sculpted hand comes from the script next door; only its steps are wanted, not its export.
_steps = os.environ.get("TALLOW_STEPS")
os.environ["TALLOW_STEPS"] = "1"
sys.path.insert(0, HERE)
import narrator_hand as sculpt  # noqa: E402
import style  # noqa: E402

HAND_TRIS = 9000  # the knuckles and tendons must change the outline at the table, so they are geometry, not a normal map

if _steps is None:
    del os.environ["TALLOW_STEPS"]
else:
    os.environ["TALLOW_STEPS"] = _steps

FPS = 30

# ------------------------------- the body --------------------------------

# Where the hand lies at rest (its origin is on the table under the wrist), and how it is turned.
REST_AT = Vector((0.165, -0.43, 0.001))
REST_YAW = -0.3
# The shoulder, under the mantle.
SHOULDER = Vector((0.27, -0.02, 0.37))
# Elbow to wrist. The forearm lies straight back from the hand; the upper arm is whatever reaches the shoulder.
FOREARM = 0.46
# The wrist joint and the middle of the knuckles, in the sculpt's own space.
WRIST = Vector((0.0, 0.02, 0.027))
KNUCKLES = Vector((0.001, -0.092, 0.031))

FINGER_NAMES = ["index", "middle", "ring", "little"]

# The sleeve: how thick at the shoulder, the elbow and the cuff, and how far short of the wrist it stops.
SLEEVE_R = (0.085, 0.066, 0.045)
CUFF_BACK = 0.03
# The table's far edge, in front of the figure: the sleeve lies flat on the wood beyond it.
TABLE_EDGE_Y = -0.4
CUFF_FLARE = 1.14
ELBOW_ROUND = 0.07
SLEEVE_AROUND = 24

# How wide a thing the fingers close on, and how thick a fingertip is (bone to skin).
PINCH_GAP = 0.021  # the hood of the narrator's own piece
GRASP_GAP = 0.042  # the top of a candle
WICK_GAP = 0.002
PAD = 0.004

# How soft a joint is: the distance over which one bone's hold on the skin gives way to the next.
SOFT = 0.005
# The skin behind a knuckle stays with the back of the hand a little longer than plain nearness would have it.
KNUCKLE_STAYS = 0.003


def rm(x, y, z):
    """A point or direction given in room axes, in Blender's."""
    return Vector((x, -z, y))


def clear():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


# ------------------------------- the joints ------------------------------


def joints(place):
    """Where every joint of the hand is, in the figure's space: {finger: [knuckle, first joint, second joint, tip]}."""
    low = sculpt.LOWERED
    out = {}
    for name, (x, ky, length, splay) in zip(FINGER_NAMES, sculpt.FINGERS):
        pts, y, xx = [], ky, x
        for step, z, _r in sculpt.JOINTS:
            y -= step * length
            xx += splay * step * length
            pts.append(Vector((xx, y, z - low)))
        out[name] = [place @ pts[i] for i in (0, 2, 4, 7)]
    t = [Vector(p) - Vector((0, 0, low)) for p, _r in sculpt.THUMB]
    out["thumb"] = [place @ t[i] for i in (0, 2, 3, 5)]
    return out


def build_rig(place, J):
    data = bpy.data.armatures.new("narrator_arm")
    arm = bpy.data.objects.new("narrator_arm", data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None, deform=True, up=(0, 0, 1)):
        b = data.edit_bones.new(name)
        b.head, b.tail = head, tail
        b.parent = parent
        b.use_connect = False
        b.use_deform = deform
        # Every bone's own z points "up" out of the back of the hand, so its own x is the hinge a finger curls round.
        b.align_roll(Vector(up))
        return b

    wrist = place @ WRIST
    back = (place.to_3x3() @ Vector((0, 1, 0))).normalized()
    elbow = wrist + back * FOREARM
    down = (elbow - SHOULDER).normalized()
    fwd = (wrist - elbow).normalized()
    upper = bone("upper_arm", SHOULDER, elbow, up=(0, -1, 0))
    upper_end = bone("upper_arm_end", elbow, elbow + down * 0.04, upper, up=(0, -1, 0))
    fore = bone("forearm", elbow, wrist, upper_end)
    fore_end = bone("forearm_end", wrist, wrist + fwd * 0.04, fore)
    hand = bone("wrist", wrist, place @ KNUCKLES, fore_end)
    bone("ctl", wrist, place @ KNUCKLES, None, deform=False)
    for name, pts in J.items():
        parent = hand
        for i in range(3):
            parent = bone(f"{name}_{i + 1}", pts[i], pts[i + 1], parent)
    # Put in its real place once the pinch is known.
    bone("grip", wrist, wrist + Vector((0, 0, 0.01)), hand, deform=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in arm.pose.bones:
        b.rotation_mode = "QUATERNION" if b.name == "ctl" else "XYZ"
    return arm, {"wrist": wrist, "elbow": elbow, "back": back}


# -------------------------------- the skin -------------------------------


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def skin_hand(hand, arm, J, at):
    """Give each bit of the hand's skin to the bones nearest it, sharing it out softly where two bones meet."""
    wrist = at["wrist"]
    holds = {"wrist": [(wrist, pts[0]) for pts in J.values()], "forearm_end": [(wrist, wrist + at["back"] * 0.3)]}
    for name, pts in J.items():
        for i in range(3):
            holds[f"{name}_{i + 1}"] = [(pts[i], pts[i + 1])]
    groups = {name: hand.vertex_groups.new(name=name) for name in holds}
    chain_of = {f"{name}_{i + 1}": name for name in J for i in range(3)}
    for v in hand.data.vertices:
        d = {name: min(seg_dist(v.co, a, b) for a, b in segs) for name, segs in holds.items()}
        # A bit of skin belongs to one finger only (the nearest), and to the hand behind it: never to the finger
        # next door, or one finger moving would drag the side of its neighbour with it.
        mine = min(J, key=lambda name: min(d[f"{name}_{i + 1}"] for i in range(3)))
        d = {name: x + (KNUCKLE_STAYS if name.endswith("_1") else 0.0) for name, x in d.items() if chain_of.get(name, mine) == mine}
        near = min(d.values())
        w = {name: math.exp(-(x - near) / SOFT) for name, x in d.items()}
        best = sorted(w.items(), key=lambda kv: -kv[1])[:4]
        best = [(n, x) for n, x in best if x > 0.03]
        total = sum(x for _n, x in best)
        for n, x in best:
            groups[n].add([v.index], x / total, "REPLACE")
    bind(hand, arm)


def bind(obj, arm):
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def sleeve(arm, at):
    """
    A tube of cloth from the shoulder, round the elbow, to a loose cuff just short of the wrist, with folds pressed
    into it. Each ring of it is shared between a bone and that bone's end, so the room can lengthen the arm and the
    cloth stretches evenly along it; near the elbow it is shared across the joint, so the bend is round.
    """
    S, E, W = SHOULDER, at["elbow"], at["wrist"]
    d1, d2 = (E - S).normalized(), (W - E).normalized()
    l1, l2 = (E - S).length, (W - E).length
    cuff = l2 - CUFF_BACK
    # The middle line: down the upper arm, round the elbow, along the forearm. Each sample: (point, which part, how far along it).
    line = []
    for i in range(9):
        k = i / 8 * (l1 - ELBOW_ROUND)
        line.append((S + d1 * k, 0, k / l1))
    a, b = E - d1 * ELBOW_ROUND, E + d2 * ELBOW_ROUND
    for i in range(1, 6):
        u = i / 6
        p = a * (1 - u) ** 2 + E * 2 * u * (1 - u) + b * u * u
        line.append((p, 0 if u < 0.5 else 1, 1.0 if u < 0.5 else 0.0))
    for i in range(17):
        k = ELBOW_ROUND + i / 16 * (cuff - ELBOW_ROUND)
        line.append((E + d2 * k, 1, k / l2))
    n = len(line)
    run = [0.0]
    for i in range(1, n):
        run.append(run[-1] + (line[i][0] - line[i - 1][0]).length)
    bend_at = next(run[i] for i in range(n) if line[i][1] == 1)
    verts, faces, weights = [], [], []
    side = Vector((1, 0, 0))
    for i, (p, part, along) in enumerate(line):
        tan = (line[min(n - 1, i + 1)][0] - line[max(0, i - 1)][0]).normalized()
        side = (side - tan * side.dot(tan)).normalized()
        other = tan.cross(side)
        s = run[i] / run[-1]
        r = SLEEVE_R[0] + (SLEEVE_R[1] - SLEEVE_R[0]) * min(1, run[i] / bend_at) if part == 0 else SLEEVE_R[1] + (SLEEVE_R[2] - SLEEVE_R[1]) * (run[i] - bend_at) / (run[-1] - bend_at)
        # The cuff hangs open a little.
        r *= 1 + (CUFF_FLARE - 1) * max(0.0, 1 - (run[-1] - run[i]) / 0.035) ** 2
        # Folds: a few long ones running down the arm, and the cloth bunching where it lies along the forearm.
        bunch = 1 + (0.035 * math.sin(run[i] * 95) if part == 1 else 0.02 * math.sin(run[i] * 60))
        # How much of this ring belongs across the elbow.
        across = 0.5 * max(0.0, 1 - abs(run[i] - bend_at) / 0.1)
        if part == 0:
            w = {"upper_arm": (1 - along) * (1 - across), "upper_arm_end": along * (1 - across), "forearm": across}
        else:
            w = {"forearm": (1 - along) * (1 - across), "forearm_end": along * (1 - across), "upper_arm_end": across}
        for j in range(SLEEVE_AROUND):
            ang = j / SLEEVE_AROUND * math.tau
            fold = 1 + 0.05 * math.sin(ang * 3 + s * 14) + 0.035 * math.sin(ang * 7 - s * 23 + 1)
            at_ring = p + (side * math.cos(ang) + other * math.sin(ang)) * r * fold * bunch
            # Where the forearm lies on the table the cloth lies on the wood, not in it.
            if at_ring.y < TABLE_EDGE_Y:
                at_ring.z = max(at_ring.z, 0.003)
            verts.append(at_ring)
            weights.append(w)
        if i:
            for j in range(SLEEVE_AROUND):
                k = (j + 1) % SLEEVE_AROUND
                faces.append(((i - 1) * SLEEVE_AROUND + j, (i - 1) * SLEEVE_AROUND + k, i * SLEEVE_AROUND + k, i * SLEEVE_AROUND + j))
    me = bpy.data.meshes.new("sleeve")
    me.from_pydata(verts, [], faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new("sleeve", me)
    bpy.context.collection.objects.link(o)
    groups = {name: o.vertex_groups.new(name=name) for name in ("upper_arm", "upper_arm_end", "forearm", "forearm_end")}
    for i, w in enumerate(weights):
        for name, x in w.items():
            if x > 0.001:
                groups[name].add([i], x, "REPLACE")
    bind(o, arm)
    return o


def material(obj, name, colour):
    """A named material: the room chooses what each surface is made of by this name."""
    m = bpy.data.materials.new(name)
    m.diffuse_color = colour
    obj.data.materials.clear()
    obj.data.materials.append(m)


# ------------------------------- the poses -------------------------------
#
# A pose is (where the wrist is, how the hand is turned, how every finger bone is bent).


class Poser:
    def __init__(self, arm):
        self.arm = arm
        self.rest_m = arm.data.bones["ctl"].matrix_local.copy()
        self.rest_at = self.rest_m.to_translation()
        self.rest_turn = self.rest_m.to_quaternion()
        self.finger_bones = [b.name for b in arm.pose.bones if b.name[-2:] in ("_1", "_2", "_3")]
        self.curl = self.swing = 1.0
        self.curl = 1.0 if self.tips(self.fingers(index=(0.3, 0, 0)))["index"].z < self.tips({})["index"].z else -1.0
        # Which way round its own z a finger swings toward the thumb.
        thumbward = self.rest_m.to_3x3() @ Vector((1, 0, 0))
        probe = {"index_1": (0, 0, 0.2)}
        self.swing = 1.0 if (self.tips(probe)["index"] - self.tips({})["index"]).dot(thumbward) > 0 else -1.0

    def fingers(self, thumb=None, **bends):
        """
        Every finger bone's bend. For a finger: (knuckle, first joint, second joint[, spread]), in radians, where
        more is more closed and spread is away from the middle finger. For the thumb: its five raw angles.
        """
        out = {name: (0.0, 0.0, 0.0) for name in self.finger_bones}
        for name, b in bends.items():
            spread = (b[3] if len(b) > 3 else 0.0) * self.swing * (1 if name in ("index", "middle") else -1)
            out[f"{name}_1"] = (self.curl * b[0], 0.0, spread)
            out[f"{name}_2"] = (self.curl * b[1], 0.0, 0.0)
            out[f"{name}_3"] = (self.curl * b[2], 0.0, 0.0)
        if thumb:
            out["thumb_1"] = (thumb[0], thumb[1], thumb[2])
            out["thumb_2"] = (thumb[3], 0.0, 0.0)
            out["thumb_3"] = (thumb[4], 0.0, 0.0)
        return out

    def apply(self, at, turn, bends):
        ctl = self.arm.pose.bones["ctl"]
        basis = self.rest_m.inverted() @ (Matrix.Translation(at) @ turn.to_matrix().to_4x4())
        ctl.location = basis.to_translation()
        q = basis.to_quaternion()
        if q.dot(ctl.rotation_quaternion) < 0:
            q.negate()
        ctl.rotation_quaternion = q
        for name in self.finger_bones:
            self.arm.pose.bones[name].rotation_euler = bends.get(name, (0.0, 0.0, 0.0))

    def tips(self, bends):
        """Where the fingertips are with the hand lying at rest and the fingers bent like this."""
        self.apply(self.rest_at, self.rest_turn, bends)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.arm.evaluated_get(dg)
        out = {name: ev.pose.bones[f"{name}_3"].tail.copy() for name in FINGER_NAMES + ["thumb"]}
        out["index_mid"] = (ev.pose.bones["index_2"].head + ev.pose.bones["index_2"].tail) / 2
        return out

    def tip_of(self, pose, finger):
        """Where a fingertip is in a whole pose (wrist placed and turned, fingers bent)."""
        self.apply(*pose)
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.arm.evaluated_get(dg).pose.bones
        # The fingers hang off the wrist bone, which the room lays on "ctl"; here, do the same by hand.
        to_ctl = ev["ctl"].matrix @ ev["wrist"].matrix.inverted()
        return to_ctl @ ev[f"{finger}_3"].tail

    def aim(self, fwd, back):
        """How the hand is turned, from where the fingers point and where the back of the hand faces (room axes)."""
        y = rm(*fwd).normalized()
        z = rm(*back)
        z = (z - y * z.dot(y)).normalized()
        x = y.cross(z)
        return Matrix((x, y, z)).transposed().to_quaternion()


def settle(score, start, lo, hi, rounds=70):
    """Nudge a list of angles, one at a time, to whatever makes `score` smallest."""
    x = list(start)
    best = score(x)
    step = 0.3
    for _ in range(rounds):
        moved = False
        for i in range(len(x)):
            for d in (step, -step):
                y = list(x)
                y[i] = max(lo[i], min(hi[i], y[i] + d))
                s = score(y)
                if s < best - 1e-9:
                    x, best, moved = y, s, True
                    break
        if not moved:
            step *= 0.6
            if step < 0.002:
                break
    return x, best


def close_on(P, gap, like, at=None, ring=(0.62, 0.72, 0.42), little=(0.52, 0.62, 0.36)):
    """
    Find the bend of thumb, first and middle finger that brings their pads `gap` apart, thumb on one side and the
    two fingers side by side on the other, staying as near as it can to the relaxed curl `like`. If `at` is given
    the pads close round that point. Returns (the finger bends, the point they close on).
    """
    want = gap + 2 * PAD

    def unpack(x):
        return P.fingers(index=x[0:3], middle=x[3:6], ring=ring, little=little, thumb=x[6:11])

    def score(x):
        t = P.tips(unpack(x))
        ti, tm, tt = t["index"], t["middle"], t["thumb"]
        e = 4 * (100 * ((ti - tt).length - want)) ** 2 + 4 * (100 * ((tm - tt).length - want)) ** 2
        e += (100 * ((ti - tm).length - 0.017)) ** 2
        if at is not None:
            e += 4 * (100 * (((ti + tm) / 2 + tt) / 2 - at).length) ** 2
        e += 0.3 * sum((a - b) ** 2 for a, b in zip(x, like))
        return e

    lo = [-0.3] * 6 + [-1.3] * 5
    hi = [1.7] * 6 + [1.3] * 5
    x, e = settle(score, like, lo, hi)
    t = P.tips(unpack(x))
    middle = ((t["index"] + t["middle"]) / 2 + t["thumb"]) / 2
    print(f"  closed on {gap * 1000:.0f} mm: thumb to first finger {((t['index'] - t['thumb']).length - 2 * PAD) * 1000:.1f} mm, to middle {((t['middle'] - t['thumb']).length - 2 * PAD) * 1000:.1f} mm (score {e:.3f})")
    return unpack(x), middle


def make_fist(P):
    """Fingers rolled right up, the thumb laid across the front of the first one."""
    curl = dict(index=(1.45, 1.6, 1.15), middle=(1.5, 1.65, 1.2), ring=(1.5, 1.65, 1.2), little=(1.45, 1.6, 1.15))

    def score(x):
        t = P.tips(P.fingers(thumb=x, **curl))
        return (100 * ((t["thumb"] - t["index_mid"]).length - 0.016)) ** 2 + 0.2 * sum(a * a for a in x)

    x, _e = settle(score, [0.0] * 5, [-1.3] * 5, [1.3] * 5)
    return P.fingers(thumb=x, **curl)


def mix(a, b, k):
    """Part way from one pose to another."""
    return (
        a[0].lerp(b[0], k),
        a[1].slerp(b[1], k),
        {n: tuple(x + (y - x) * k for x, y in zip(a[2][n], b[2][n])) for n in a[2]},
    )


def bent(pose, **more):
    """The same pose with some finger bones bent further: bent(p, index_1=(-0.3, 0, 0)) adds to what is there."""
    f = dict(pose[2])
    for n, add in more.items():
        f[n] = tuple(x + y for x, y in zip(f[n], add))
    return (pose[0], pose[1], f)


EASE = {
    "smooth": lambda u: u * u * (3 - 2 * u),  # starts and ends gently
    "in": lambda u: u * u,  # gathers speed and arrives fast
    "out": lambda u: 1 - (1 - u) ** 2,  # leaves fast and settles
    "hit": lambda u: u ** 3,  # arrives hard
    "spring": lambda u: 1 - (1 - u * u * (3 - 2 * u)) ** 2,  # lets go quickly, but from stillness, and settles
    "linear": lambda u: u,
}


def keyed(keys):
    """A movement from a list of (seconds, pose, how it gets there). Returns (length, a function of time)."""

    def at(t):
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, p0, _e), (t1, p1, e1) in zip(keys, keys[1:]):
            if t <= t1:
                return mix(p0, p1, EASE[e1]((t - t0) / (t1 - t0)))
        return keys[-1][1]

    return keys[-1][0], at


def write_clip(P, name, length, at):
    """Key every frame of one movement into an action of its own, and put it away where the exporter finds it."""
    arm = P.arm
    if not arm.animation_data:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    ctl = arm.pose.bones["ctl"]
    ctl.rotation_quaternion = (1, 0, 0, 0)
    frames = max(1, round(length * FPS))
    for f in range(frames + 1):
        P.apply(*at(f / FPS))
        ctl.keyframe_insert("location", frame=f)
        ctl.keyframe_insert("rotation_quaternion", frame=f)
        for n in P.finger_bones:
            arm.pose.bones[n].keyframe_insert("rotation_euler", frame=f)
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, act)
    arm.animation_data.action = None


def clips(P):
    """Every movement. Returns the moments inside them that the room needs to know about."""
    marks = {}
    rest_at, rest_turn = P.rest_at, P.rest_turn
    flat = P.fingers()
    REST = (rest_at, rest_turn, flat)

    # --- the hands it works with ---
    print("fitting the fingers:")
    relaxed = [0.75, 0.75, 0.35, 0.8, 0.8, 0.4, 0, 0, 0, 0, 0]
    pinch_f, grip = close_on(P, PINCH_GAP, relaxed)
    grasp_f, _ = close_on(P, GRASP_GAP, relaxed, at=grip, ring=(0.5, 0.6, 0.35), little=(0.42, 0.5, 0.3))
    wick_f, _ = close_on(P, WICK_GAP, relaxed, at=grip)
    fist_f = make_fist(P)
    # Open over the thing, about to close: the fingers a little curled and apart, the thumb half way round.
    open_f = P.fingers(index=(0.28, 0.32, 0.15, 0.1), middle=(0.26, 0.3, 0.15, 0.0), ring=(0.3, 0.36, 0.2, 0.06), little=(0.32, 0.4, 0.22, 0.14))
    for n in ("thumb_1", "thumb_2", "thumb_3"):
        open_f[n] = tuple(v * 0.45 for v in pinch_f[n])
    wide_f = P.fingers(index=(-0.12, 0.05, 0.0, 0.2), middle=(-0.14, 0.05, 0.0, 0.05), ring=(-0.1, 0.08, 0.0, 0.14), little=(-0.06, 0.1, 0.0, 0.28))
    for n in ("thumb_1", "thumb_2", "thumb_3"):
        wide_f[n] = tuple(v * 0.15 for v in pinch_f[n])

    # Over the table, coming down on something from above. The room puts the wrist where the real thing is; this
    # place is only where the hand is on its way there and back.
    over = rm(0.17, 0.24, 0.6)

    def down(pitch, roll=0.0):
        p = math.radians(pitch)
        return P.aim((math.sin(roll) * 0.3, -math.sin(p), math.cos(p)), (roll, math.cos(p), math.sin(p)))

    REACH = (over, down(46), open_f)
    PINCH = (over, down(50), pinch_f)
    GRASP = (over, down(50), grasp_f)
    WICK = (over, down(52), wick_f)

    write_clip(P, "rest", 1.0, lambda t: REST)

    # Lying on the table: now and then a finger lifts a hair and settles, never two together.
    def idle(t):
        f = dict(flat)
        for i, name in enumerate(FINGER_NAMES):
            lift = max(0.0, math.sin(math.tau * (t / 8 + i * 0.27))) ** 3
            f[f"{name}_1"] = (-P.curl * 0.05 * lift, 0.0, 0.0)
            f[f"{name}_2"] = (P.curl * 0.03 * lift, 0.0, 0.0)
        f["thumb_1"] = (0.0, 0.0, 0.03 * math.sin(math.tau * t / 8 * 2))
        return (rest_at, rest_turn, f)

    write_clip(P, "idle", 8.0, idle)

    write_clip(P, "reach", *keyed([(0, REST, ""), (0.55, REACH, "smooth")]))
    # The fingers close: quickly at first, then the last of the way with care.
    write_clip(P, "pinch", *keyed([(0, REACH, ""), (0.2, mix(REACH, PINCH, 0.8), "smooth"), (0.36, PINCH, "smooth")]))
    write_clip(P, "grasp", *keyed([(0, REACH, ""), (0.2, mix(REACH, GRASP, 0.8), "smooth"), (0.36, GRASP, "smooth")]))
    for suffix, HELD in (("", PINCH), ("_wide", GRASP)):
        LIFT = (over, down(41), HELD[2])
        write_clip(P, "lift" + suffix, *keyed([(0, HELD, ""), (0.4, LIFT, "smooth")]))

        # Carried: the wrist rocks a very little, the way a held thing swings.
        def carry(t, LIFT=LIFT):
            return (over, down(41 + 2.2 * math.sin(math.tau * t / 2.4), 0.06 * math.sin(math.tau * t / 1.2)), LIFT[2])

        write_clip(P, "carry" + suffix, 2.4, carry)
        write_clip(P, "set_down" + suffix, *keyed([(0, LIFT, ""), (0.32, HELD, "smooth")]))
    # Letting go: the fingers come away all at once and the hand lifts its wrist.
    write_clip(P, "release", *keyed([(0, PINCH, ""), (0.14, mix(PINCH, REACH, 0.55), "spring"), (0.36, REACH, "smooth")]))

    # Lighting a candle: finger and thumb close on the wick, roll it once, and spring apart as it takes.
    rub = bent(WICK, thumb_3=(0.12, 0.0, 0.0), index_3=(-P.curl * 0.1, 0.0, 0.0))
    marks["light"] = 0.5
    write_clip(
        P,
        "light",
        *keyed([(0, REACH, ""), (0.26, WICK, "smooth"), (0.38, rub, "smooth"), (0.5, WICK, "smooth"), (0.66, (over, down(40), wide_f), "spring"), (0.8, (over, down(40), wide_f), "linear"), (1.25, REACH, "smooth")]),
    )

    # --- what it does when it has an opinion ---

    def lay(x, y, z, turn, f):
        return (rm(x, y, z), turn, f)

    # A fist brought down on the table: gathered and drawn up beside the hood, held a breath, struck, held there,
    # and slowly let go. It lands on the bare wood between the figure and the map.
    hammer = P.aim((-0.12, 0.0, 1.0), (1.0, 0.25, 0.1))  # the little-finger side down
    high = P.aim((-0.08, 1.0, 0.5), (1.0, 0.1, -0.1))  # the forearm upright, the fist over it
    half = mix(REST, (rest_at, rest_turn, fist_f), 0.5)[2]
    up = lay(0.255, 0.46, 0.2, high, fist_f)
    hit = lay(0.2, 0.047, 0.49, hammer, fist_f)
    marks["slam"] = 1.0
    write_clip(
        P,
        "slam",
        *keyed(
            [
                (0, REST, ""),
                (0.72, up, "smooth"),
                (0.8, lay(0.262, 0.475, 0.185, high, fist_f), "smooth"),
                # Fast, but a blow and not a blink: it gathers speed all the way down.
                (1.0, hit, "in"),
                (1.07, lay(0.2, 0.057, 0.49, hammer, fist_f), "out"),
                (1.2, hit, "smooth"),
                (2.1, hit, "linear"),
                (2.6, lay(0.185, 0.06, 0.46, P.aim((-0.2, 0.05, 1.0), (0.5, 1.0, 0.0)), half), "smooth"),
                (3.4, REST, "smooth"),
            ]
        ),
    )

    # Drumming: little finger to first, three times over, a little faster each time.
    def drum(t):
        f = dict(flat)
        env = EASE["smooth"](min(1.0, t / 0.25)) * EASE["smooth"](min(1.0, max(0.0, 2.3 - t) / 0.3))
        for i, name in enumerate(reversed(FINGER_NAMES)):
            lift = 0.0
            for start, period in ((0.2, 0.62), (0.82, 0.56), (1.38, 0.5)):
                u = (t - start - i * 0.085) / period
                if 0 <= u < 1:
                    # Up slowly, down fast.
                    lift = EASE["smooth"](u / 0.72) if u < 0.72 else 1 - EASE["in"]((u - 0.72) / 0.28)
            f[f"{name}_1"] = (-P.curl * (0.07 * env + 0.3 * lift), 0.0, 0.0)
            f[f"{name}_2"] = (P.curl * 0.12 * lift, 0.0, 0.0)
        return (rest_at, rest_turn, f)

    write_clip(P, "drum", 2.4, drum)

    # One finger, lifted high and let fall, three times, unhurried.
    def tap(t):
        f = dict(flat)
        lift = 0.0
        for start in (0.15, 1.15, 2.15):
            u = t - start
            if 0 <= u < 1.0:
                lift = EASE["smooth"](u / 0.5) if u < 0.5 else 1.0 if u < 0.72 else 1 - EASE["hit"](min(1.0, (u - 0.72) / 0.1))
        f["index_1"] = (-P.curl * 0.55 * lift, 0.0, P.swing * 0.06 * lift)
        f["index_2"] = (P.curl * 0.16 * lift, 0.0, 0.0)
        return (rest_at, rest_turn, f)

    write_clip(P, "tap", 3.3, tap)

    # Steepled: both hands come up and meet at the fingertips (the other hand is this one in a mirror), wait, and
    # go back. While it waits the fingers press together and ease, slowly.
    straight = P.fingers(index=(-0.2, -0.16, -0.08, 0.1), middle=(-0.2, -0.16, -0.08, 0.02), ring=(-0.2, -0.16, -0.08, 0.08), little=(-0.2, -0.14, -0.08, 0.16))
    steep_turn = P.aim((-0.5, 0.78, 0.4), (0.82, 0.5, -0.2))
    steep_at = [0.122, 0.118, 0.415]
    # Slide the wrist sideways until the middle fingertip is just short of the line between the two hands.
    for _ in range(3):
        steep_at[0] += 0.008 - P.tip_of(lay(*steep_at, steep_turn, straight), "middle").x
    STEEP = lay(*steep_at, steep_turn, straight)

    def steeple(t):
        if t < 1.3:
            return keyed([(0, REST, ""), (0.5, mix(REST, lay(0.15, 0.1, 0.44, steep_turn, straight), 0.5), "in"), (1.3, STEEP, "out")])[1](t)
        if t > 5.6:
            return keyed([(5.6, STEEP, ""), (6.3, mix(REST, lay(0.15, 0.09, 0.44, steep_turn, straight), 0.5), "in"), (7.0, REST, "out")])[1](t)
        press = 0.5 - 0.5 * math.cos(math.tau * (t - 1.3) / 2.15)
        f = dict(straight)
        for name in FINGER_NAMES:
            f[f"{name}_2"] = (straight[f"{name}_2"][0] - P.curl * 0.05 * press, 0.0, 0.0)
        return lay(steep_at[0] - 0.004 * press, steep_at[1], steep_at[2], steep_turn, f)

    write_clip(P, "steeple", 7.0, steeple)

    # A flick of the fingers, as at a fly: the hand lifts with the fingers gathered, and throws them open outward.
    gathered = P.fingers(index=(0.75, 0.9, 0.5), middle=(0.8, 0.95, 0.55), ring=(0.8, 0.95, 0.55), little=(0.75, 0.9, 0.5))
    for n in ("thumb_1", "thumb_2", "thumb_3"):
        gathered[n] = tuple(v * 0.7 for v in pinch_f[n])
    thrown = lay(0.25, 0.13, 0.5, P.aim((0.75, 0.3, 0.7), (-0.2, 1.0, -0.1)), wide_f)
    write_clip(
        P,
        "flick",
        *keyed(
            [
                (0, REST, ""),
                (0.42, lay(0.185, 0.1, 0.45, P.aim((-0.45, -0.1, 1.0), (0.1, 1.0, 0.1)), gathered), "smooth"),
                (0.5, lay(0.187, 0.102, 0.452, P.aim((-0.47, -0.1, 1.0), (0.1, 1.0, 0.1)), gathered), "linear"),
                (0.67, thrown, "spring"),
                (1.0, lay(0.255, 0.125, 0.5, P.aim((0.7, 0.2, 0.75), (-0.15, 1.0, -0.05)), mix(thrown, REST, 0.35)[2]), "smooth"),
                (1.8, REST, "smooth"),
            ]
        ),
    )
    P.apply(*REST)
    return grip, marks


# ------------------------------- the whole -------------------------------


def export(objs):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.context.scene.render.fps = FPS
    wanted = dict(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=False,
        export_vertex_color="ACTIVE",
        export_materials="EXPORT",
        export_skins=True,
        export_def_bones=False,
        export_extras=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_optimize_animation_size=False,
        export_anim_slide_to_zero=True,
    )
    # Blender versions disagree about which of these exist; pass the ones this one knows.
    known = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in known})
    style.quantize_glb(OUT)


def main():
    clear()
    place = Matrix.Translation(REST_AT) @ Matrix.Rotation(REST_YAW, 4, "Z")
    hand = sculpt.build()
    hand.data.transform(place)
    # The knuckles and tendons are real geometry, so they hold the outline at the table; a normal map baked onto a
    # thinned copy only mottled a smooth lump.
    style.thin(hand, HAND_TRIS)
    J = joints(place)
    arm, at = build_rig(place, J)
    skin_hand(hand, arm, J, at)
    cloth = sleeve(arm, at)
    material(hand, "skin", (0.54, 0.5, 0.45, 1))
    material(cloth, "cloth", (0.02, 0.02, 0.03, 1))
    # The hand's and the sleeve's own shadow, into their vertex colours, at rest: dark between the tendons and
    # the fingers, so the bones read in candlelight.
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    style.bake([hand, cloth], apply=False, ground=False, ao_distance=0.03, wear=0.0, cavity=0.55, floor=0.3)
    arm.data.pose_position = "POSE"
    P = Poser(arm)
    grip, marks = clips(P)
    # The marker for where the fingers close goes where the fitting found it.
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    g = arm.data.edit_bones["grip"]
    g.head, g.tail = grip, grip + Vector((0, 0, 0.01))
    bpy.ops.object.mode_set(mode="OBJECT")
    arm["marks"] = json.dumps(marks)
    export([arm, hand, cloth])
    tris = sum(len(p.vertices) - 2 for o in (hand, cloth) for p in o.data.polygons)
    print(f"wrote {OUT}: {tris} triangles, {len(arm.data.bones)} bones, {len(bpy.data.actions)} clips, {os.path.getsize(OUT) // 1024} KB")


# TALLOW_STEPS=1 only defines the steps, for running them one at a time from a live Blender.
if os.environ.get("TALLOW_STEPS") != "1":
    main()
