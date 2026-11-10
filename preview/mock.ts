/**
 * Made-up data for the preview: one region sheet, the pieces on it, and one
 * moment to play at one of its stops.
 * Nothing here comes from a real card.
 */
import type { MapSheet } from "../src/room/mapsheet.js";
import type { PieceSpec } from "../src/room/room.js";
import type { Sheet, Stop, Way } from "../src/engine/moment.js";

export const MAP: MapSheet = {
  title: "The Road to Hollowmere",
  seed: 7,
  stops: [
    { id: "ferry", name: "Tam's Ferry", u: 0.08, v: 0.86 },
    { id: "mill", name: "Orla's Mill", u: 0.24, v: 0.6 },
    { id: "bridge", name: "Wren Bridge", u: 0.4, v: 0.82 },
    { id: "crossing", name: "Dov's Crossing", u: 0.47, v: 0.42 },
    { id: "abbey", name: "Tessera Abbey", u: 0.3, v: 0.2 },
    { id: "rest", name: "Mara's Rest", u: 0.64, v: 0.66 },
    { id: "tor", name: "Ilse Tor", u: 0.7, v: 0.28 },
    { id: "keep", name: "Hollowmere Keep", u: 0.9, v: 0.12, climax: true },
  ],
  paths: [
    ["ferry", "mill"],
    ["mill", "bridge"],
    ["mill", "crossing"],
    ["bridge", "rest"],
    ["crossing", "abbey"],
    ["crossing", "tor"],
    ["abbey", "tor"],
    ["rest", "tor"],
    ["tor", "keep"],
  ],
};

export const PIECES: PieceSpec[] = [
  { id: "you", kind: "player", at: "ferry" },
  { id: "shadow", kind: "narrator", at: "tor" },
];

/** The round the narrator's piece walks by itself in the preview. */
export const PATROL = ["tor", "crossing", "abbey", "tor", "rest", "tor"];

/* ------------------------- one moment (milestone 2) ------------------------- */

/** Where the pieces stand for the moment: you have come as far as the mill, and the bridge is next. */
export const ROAD = { from: "mill", stop: "bridge", next: "rest", nextName: "Mara's Rest", other: "crossing", otherName: "Dov's Crossing" };

export const WHO = "You are a courier with a sealed letter for Hollowmere Keep: light on your feet, easy to like, no great fighter, and hopeless with sums.";

export const YOU: Sheet = {
  stats: { brawn: 1, cunning: 3, charm: 2, wits: 0 },
  health: 5,
  supplies: 3,
  goodwill: 2,
  hour: 16.5,
};

export const BRIDGE: Stop = {
  id: "bridge",
  name: "Wren Bridge",
  kind: "person",
  situation:
    "Wren Bridge is the only dry way over the gorge, and the bar is down across it. Old Wren, who keeps the toll, sits by a brazier that is burning low, frowning at a ledger whose sums will not come out. A grey dog sleeps against the bar's post, which is rotten at the foot. Under the planks, the old rope walk still hangs from pier to pier. The toll is two supplies.",
  ways: {
    talk: { difficulty: 1 },
    sneak: { difficulty: 2 },
    force: { difficulty: 2 },
    pay: { difficulty: 1, price: 2 },
  },
  levers: [
    { id: "ledger", way: "talk", name: "her ledger that will not add up", words: ["ledger", "sums", "accounts", "her book", "the book"] },
    { id: "ropewalk", way: "sneak", name: "the rope walk under the bridge", words: ["rope walk", "ropewalk", "rope", "under the bridge", "under the planks", "below the bridge", "pier"] },
    { id: "post", way: "force", name: "the rotten post", words: ["rotten", "post"] },
    { id: "brazier", way: "pay", name: "her brazier burning low", words: ["brazier", "fuel", "firewood", "lamp oil", "coal", "kindling"] },
  ],
};

/**
 * What the narrator says of each result, for when there is no model to say it. In the game these lines are
 * written by the chat's own model from a note saying what code decided; here they are fixed.
 */
export const TOLD: Record<Way, { past: string; cost: string; fail: string }> = {
  talk: {
    past: "Old Wren looks you up and down, grunts, and leans on the bar until it lifts. \"Go on, then. Before I think better of it.\"",
    cost: "She lets you through, but she writes your name in the ledger first, and she is not smiling as she does it.",
    fail: "\"I have heard better from drovers,\" she says, and turns her stool so that her back is to you. She will not be talked to again.",
  },
  sneak: {
    past: "You are across and in among the trees before the dog so much as twitches an ear.",
    cost: "You get across a hand's breadth at a time. The light has moved a long way by the time you stand on the far side.",
    fail: "The dog's head comes up, and then the barking starts. Old Wren is on her feet with a lantern. She will be watching the gorge now.",
  },
  force: {
    past: "The bar goes up and over with a crack, and you are through before she can find her stick.",
    cost: "The bar gives, and so does something in your shoulder. You are through, and you will feel it tomorrow.",
    fail: "The bar holds. The dog does not hold back. You come away bitten, and she has dropped the second bar.",
  },
  pay: {
    past: "She counts it twice, nods, and lifts the bar.",
    cost: "\"After the bell it is one more,\" she says, with her hand still out. You pay it, and the bar lifts.",
    fail: "She weighs what you offer, pockets a part of it \"for the asking\", and shakes her head at the rest. The bar stays down.",
  },
};
