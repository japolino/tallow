/**
 * Where each of the table's props lives. Every prop has a fixed home, the place it stands while it is closed, and a
 * spread, the patch of table it unfolds onto while it is open, and you lean over that patch to use it. They are set
 * here once, for all six, so that no two ever want the same wood.
 *
 * The table (room.ts) is 1.9 by 1.25 with its top at y = 0: x runs from -0.95 at your left to 0.95, z from -0.725 at
 * the narrator's edge to 0.525 at yours. What is on it already, and never moves:
 *
 *   the map sheet            x -0.54..0.54,  z -0.48..0.24 (out for the whole of a run; your piece stands on it)
 *   the narrator's dealing   x -0.17..0.17,  z -0.72..-0.50 (its hands, the deck), and its page at x -0.56..-0.43
 *   the candle dish          round (-0.70, -0.46), 0.13 across the half; the brass candlestick at (0.70, -0.42)
 *   the reckoning            its frame at (-0.655, -0.175), its slips in front of it to z 0.06 (tally.ts)
 *   your side, left to right what happened last (-0.63, 0.27..0.46), the notebook (-0.47), your sheets (-0.175),
 *                            the cards row (-0.06..0.10, z 0.31), the pile (0.20), the dice box (0.50, 0.30)
 *
 * From the chair on a wide screen the table is seen whole only beyond z = -0.1; nearer than that its ends run out of
 * the picture (at z = 0.1 you see to x = 0.80, at z = 0.3 to 0.67). On a phone held upright you sit further back and
 * see less of its width: to about x = 0.62 at the middle and 0.78 at the far edge. So every home has two places: one
 * for a wide view, out on the bare wood at the table's ends, and one for an upright view, drawn in over the map's
 * margin (as the reckoning is) and a little smaller.
 *
 *   key    wide home          what stands there                           spread (where it unfolds)
 *   ring   right, by you      the fight ring, a round mat, lying: nearest  where it lies
 *                             you, so the satchel behind never hides it
 *   pack   right, mid         your satchel and its purse, lying           toward you, along the table's right end
 *   rack   far right corner   the faction rack, standing by the candle    where it stands; you look at it from in front
 *   stall  far, right of the  the seller's cloth, lying on the            where it lies, the narrator's side
 *          narrator's hands   narrator's side
 *   board  far, left of the   the quest board, standing                   where it stands; you look at it from in front
 *          narrator's hands
 *   self   left, by you       the character board, lying                  where it lies
 *
 * A prop's agent may tune the `view` of its own entry (how you look at it when it is open), and how it uses its own
 * home and spread. Nobody moves a home or a spread, or makes one bigger: the next prop is built against these numbers.
 */

/** The table's props, by their keys. */
export const PROP_KEYS = ["pack", "stall", "ring", "board", "self", "rack"] as const;
export type PropKey = (typeof PROP_KEYS)[number];

/** Where a closed prop stands: the middle of its foot on the table, how it is turned, and the room it has. */
export interface Home {
  x: number;
  z: number;
  /** Turned about the upright axis, in radians: 0 faces your chair (its own +z is toward you). */
  yaw: number;
  /** How large it is built against its wide size: an upright view has less table, so its props are a little smaller. */
  scale: number;
  /** The room it has on the table, in its own turned space and before `scale`: across (x), deep (z) and tall. */
  w: number;
  d: number;
  h: number;
}

/**
 * The patch of table an open prop unfolds onto: its middle, how it is turned, and its size. A prop lays its open
 * parts out in the patch's own space: x from -w/2 at the left of the screen to w/2, z from -h/2 at the top of the
 * screen to h/2 at the bottom, y up from the wood. You look down on it from its +z side.
 */
export interface Spread {
  x: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
}

/** How you look at an open prop: where your eye is, what it looks at, and how wide the lens. */
export interface View {
  eye: [number, number, number];
  look: [number, number, number];
  fov: number;
}

export interface Lay {
  home: Home;
  spread: Spread;
  /** Set to look at an open prop some other way than down onto its spread (something that stands, say). */
  view?: View;
}

const TURNED_RIGHT = -Math.PI / 2;

/**
 * The homes and spreads, for a wide view and for an upright one. In the wide view the satchel's spread is turned a
 * quarter: you turn to your right and look along the table's end, so its long side lies across the screen.
 */
export const LAYOUT: Record<PropKey, { wide: Lay; narrow: Lay }> = {
  pack: {
    wide: { home: { x: 0.75, z: -0.235, yaw: -0.22, scale: 1, w: 0.3, d: 0.17, h: 0.1 }, spread: { x: 0.7775, z: 0.29, yaw: TURNED_RIGHT, w: 0.44, h: 0.305 } },
    narrow: { home: { x: 0.505, z: -0.235, yaw: -0.2, scale: 0.78, w: 0.3, d: 0.17, h: 0.1 }, spread: { x: 0.78, z: 0.285, yaw: 0, w: 0.3, h: 0.44 } },
  },
  ring: {
    // Leaned over from your side at about half way up, not from above: the pieces stand, and their health is on their sides.
    wide: {
      home: { x: 0.72, z: -0.005, yaw: 0, scale: 1, w: 0.24, d: 0.2, h: 0.09 },
      spread: { x: 0.72, z: -0.005, yaw: 0, w: 0.34, h: 0.22 },
      view: { eye: [0.72, 0.419, 0.259], look: [0.72, 0.02, 0.01], fov: 32 },
    },
    narrow: {
      home: { x: 0.51, z: -0.02, yaw: 0, scale: 0.7, w: 0.24, d: 0.2, h: 0.09 },
      spread: { x: 0.51, z: -0.02, yaw: 0, w: 0.22, h: 0.18 },
      view: { eye: [0.51, 0.566, 0.305], look: [0.51, 0.02, -0.01], fov: 44 },
    },
  },
  rack: {
    wide: {
      home: { x: 0.815, z: -0.615, yaw: -0.5, scale: 1, w: 0.22, d: 0.1, h: 0.16 },
      spread: { x: 0.815, z: -0.615, yaw: -0.5, w: 0.26, h: 0.18 },
      // From the right of the brass candlestick, which stands straight in front of the rack.
      view: { eye: [0.905, 0.3, -0.155], look: [0.815, 0.09, -0.58], fov: 31 },
    },
    narrow: {
      home: { x: 0.6, z: -0.63, yaw: -0.3, scale: 0.8, w: 0.22, d: 0.1, h: 0.16 },
      spread: { x: 0.6, z: -0.63, yaw: -0.3, w: 0.2, h: 0.15 },
      view: { eye: [0.42, 0.4, 0.02], look: [0.6, 0.06, -0.63], fov: 36 },
    },
  },
  stall: {
    wide: { home: { x: 0.39, z: -0.61, yaw: 0, scale: 1, w: 0.4, d: 0.19, h: 0.06 }, spread: { x: 0.39, z: -0.61, yaw: 0, w: 0.42, h: 0.2 } },
    narrow: { home: { x: 0.31, z: -0.615, yaw: 0, scale: 0.72, w: 0.4, d: 0.19, h: 0.06 }, spread: { x: 0.31, z: -0.615, yaw: 0, w: 0.3, h: 0.15 } },
  },
  board: {
    wide: {
      home: { x: -0.295, z: -0.64, yaw: 0.1, scale: 1, w: 0.22, d: 0.09, h: 0.17 },
      spread: { x: -0.295, z: -0.64, yaw: 0.1, w: 0.24, h: 0.19 },
      view: { eye: [-0.22, 0.27, -0.16], look: [-0.295, 0.08, -0.64], fov: 30 },
    },
    narrow: {
      home: { x: -0.295, z: -0.64, yaw: 0.1, scale: 0.9, w: 0.22, d: 0.09, h: 0.17 },
      spread: { x: -0.295, z: -0.64, yaw: 0.1, w: 0.22, h: 0.17 },
      view: { eye: [-0.23, 0.36, 0.0], look: [-0.295, 0.07, -0.64], fov: 36 },
    },
  },
  self: {
    wide: { home: { x: -0.67, z: 0.155, yaw: 0.2, scale: 1, w: 0.24, d: 0.17, h: 0.06 }, spread: { x: -0.67, z: 0.155, yaw: 0.2, w: 0.28, h: 0.19 } },
    narrow: {
      home: { x: -0.5, z: 0.065, yaw: 0.12, scale: 0.7, w: 0.24, d: 0.17, h: 0.06 },
      spread: { x: -0.5, z: 0.065, yaw: 0.12, w: 0.2, h: 0.14 },
      // Along the board from its right-hand end, so its long side runs up an upright picture and a leaf lies across it.
      view: { eye: [-0.322, 0.401, 0.0435], look: [-0.49, 0, 0.0638], fov: 44 },
    },
  },
};

/** The layout for a view: upright (a phone) or wide. */
export const layOf = (key: PropKey, narrow: boolean): Lay => LAYOUT[key][narrow ? "narrow" : "wide"];

/**
 * How you look at an open prop in a picture of this shape (width over height): the view set for it, or else down onto
 * its spread from its +z side, a little off the upright, from just far enough to have the whole patch in the picture
 * with room to spare at the foot for the narrator's words.
 */
export function viewOf(lay: Lay, aspect: number): View {
  if (lay.view) return lay.view;
  const s = lay.spread;
  const fov = aspect < 1 ? 44 : 32;
  const half = Math.tan((fov * Math.PI) / 360);
  // Off the upright by this much: enough for things lying there to have a side, not so much that the far row shrinks.
  const tilt = 0.4;
  const far = Math.max((s.h * Math.cos(tilt)) / (2 * half), s.w / (2 * half * aspect)) * 1.16;
  const toward = [Math.sin(s.yaw), Math.cos(s.yaw)] as const;
  // What you look at sits a little toward you from the middle, so the patch lies in the upper part of the picture.
  const lx = s.x + toward[0] * s.h * 0.05, lz = s.z + toward[1] * s.h * 0.05;
  return {
    eye: [lx + toward[0] * far * Math.sin(tilt), Math.min(1.5, far * Math.cos(tilt)), lz + toward[1] * far * Math.sin(tilt)],
    look: [lx, 0, lz],
    fov,
  };
}
