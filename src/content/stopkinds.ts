/**
 * What each kind of card stands for when it is a stop on a laid-out road (src/engine/road.ts): what kind of trouble it
 * is, how hard each way past it tends to be, the things there that help, and plain words for it that a model rewrites
 * for the card's world. The words here are only what is said when no model writes any, so they are kept general:
 * "{place}" is the place's name.
 *
 * Also the names a laid-out road's places get before a model renames them, in an old world and in our own times, and
 * the things that can be won on the road.
 */
import type { Difficulty, Way } from "../engine/moment.js";

export interface LeverSpec {
  id: string;
  way: Way;
  name: string;
  words: readonly string[];
}

export interface StopKind {
  card: string;
  kind: "person" | "obstacle" | "fight";
  ways: Partial<Record<Way, { difficulty: Difficulty; price?: number }>>;
  levers: readonly LeverSpec[];
  situation: string;
  teaser: string;
  /** How a place of this kind is named: an old world, then our own times. "{n}" is a made-up word. */
  named: [string, string];
}

const L = (id: string, way: Way, name: string, ...words: string[]): LeverSpec => ({ id, way, name, words });

export const STOP_KINDS: Record<string, StopKind> = {
  /* ------------------------------ people ------------------------------ */
  keeper: {
    card: "keeper", kind: "person", named: ["{n} Bridge", "the {n} Street Bridge"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 2 } },
    levers: [L("tally", "talk", "the tally that will not add up", "tally", "sums", "ledger", "accounts", "count"), L("below", "sneak", "the unwatched way below", "below", "underneath", "under", "unwatched"), L("bar", "force", "the rickety bar", "bar", "rickety", "barrier"), L("cold", "pay", "the cold night they are sitting out", "cold", "warm", "drink", "brazier")],
    situation: "At {place} the way is barred, and someone sits by the bar to take the toll: two supplies to pass. They are cold and short-tempered, and their tally will not come out right. Below, a way round goes unwatched.",
    teaser: "a way that is barred, and someone takes a toll there",
  },
  host: {
    card: "host", kind: "person", named: ["The {n} Inn", "the {n} Bar"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 2 } },
    levers: [L("gossip", "talk", "the gossip they love", "gossip", "rumour", "rumor", "news", "story"), L("cellar", "sneak", "the back stair to the cellar", "cellar", "back stair", "stair", "back"), L("game", "pay", "the game of chance by the fire", "game", "bet", "wager", "dice", "cards"), L("bouncer", "force", "the doorman dozing on a stool", "doorman", "bouncer", "stool")],
    situation: "{place} is loud and full, and whoever keeps it knows everything that passes on this road. They watch you come in and say nothing. A game of chance runs by the fire, and a back stair leads down to the cellar. For two supplies they might remember what you need.",
    teaser: "a crowded house where people talk, and someone knows what you need",
  },
  miller: {
    card: "miller", kind: "person", named: ["{n} Mill", "the {n} Works"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 0, price: 1 } },
    levers: [L("broken", "talk", "the broken machine they cannot mend", "broken", "mend", "fix", "machine", "wheel", "help"), L("path", "sneak", "the path past the back", "path", "back", "behind", "past"), L("sacks", "force", "the stacked sacks by the door", "sacks", "stack", "door")],
    situation: "At {place} someone is at their work and wants no trouble. Something of theirs is broken and they cannot mend it alone. A path runs past the back, out of their sight. One supply would buy their silence, or their help.",
    teaser: "a working place, where someone may have seen what you are after",
  },
  warden: {
    card: "warden", kind: "person", named: ["{n} Hall", "the {n} Precinct"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 2 } },
    levers: [L("pride", "talk", "their pride in their office", "pride", "office", "flatter", "rank", "authority"), L("keys", "sneak", "the keys left on the desk", "keys", "desk"), L("bribe", "pay", "the debt they are hiding", "debt", "owe", "hiding", "secret"), L("guards", "force", "their few tired guards", "guards", "tired")],
    situation: "At {place} the one in charge sits behind a desk with a chain of office, and nothing passes without their word. They are proud of it, and they are hiding a debt. Their keys lie on the desk beside them. Two supplies, put the right way, might change their mind.",
    teaser: "a hall of office, and someone in charge who must give their word",
  },
  guardian: {
    card: "guardian", kind: "person", named: ["{n} Gate", "the {n} Lobby"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 1 } },
    levers: [L("duty", "talk", "their duty, and what it is for", "duty", "oath", "vow", "honour", "honor", "why"), L("shadow", "sneak", "the shadow behind them", "shadow", "behind", "dark"), L("weary", "force", "how weary they are", "weary", "tired", "push past", "shove")],
    situation: "At {place} someone stands in the doorway with folded arms, and they have sworn to let nobody by. They believe in it. But they have stood there a long time, and the shadow behind them is deep. A supply might be taken as a kindness, or an insult.",
    teaser: "a doorway, and someone sworn to let nobody by",
  },
  rival: {
    card: "rival", kind: "person", named: ["{n} House", "the {n} Club"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 2 } },
    levers: [L("vanity", "talk", "their vanity", "vanity", "proud", "flatter", "boast"), L("habit", "sneak", "the habit they never break", "habit", "routine", "always"), L("temper", "force", "their temper", "temper", "anger", "provoke"), L("greed", "pay", "their greed", "greed", "money", "price")],
    situation: "At {place} the one who stands against you is waiting, and they knew you would come. They are clever, vain and quick to anger, and they never break their habits. Two supplies might tempt their greed.",
    teaser: "the one against you, who knew you would come",
  },
  beloved: {
    card: "beloved", kind: "person", named: ["{n} Green", "the {n} Garden"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 2, price: 1 } },
    levers: [L("memory", "talk", "a memory you share", "memory", "remember", "once", "before"), L("gift", "pay", "a small gift they would love", "gift", "present", "flower", "ribbon"), L("quiet", "sneak", "a quiet moment away from the others", "quiet", "alone", "away", "aside")],
    situation: "At {place} the one you have come for is here, and has not seen you yet. Others are all around them. There is a quiet place a little way off, and a small gift might say what words cannot.",
    teaser: "the one you have come for",
  },

  /* ------------------------------ obstacles ------------------------------ */
  gate: {
    card: "gate", kind: "obstacle", named: ["{n} Gate", "the {n} Building"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 1 } },
    levers: [L("bell", "talk", "the bell to call the porter", "bell", "ring", "call", "porter", "knock"), L("wall", "sneak", "the old wall beside it", "wall", "climb", "ivy", "over"), L("hinge", "force", "the rusted hinge", "hinge", "rust", "rusted")],
    situation: "At {place} the gate is barred for the night. A bell hangs beside it to call whoever keeps it, and the wall beside it is old and easy to climb. The hinges are rusted. One supply would see it opened, no questions asked.",
    teaser: "a barred gate on the quickest way",
  },
  water: {
    card: "water", kind: "obstacle", named: ["{n} Ford", "the {n} Canal"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 1 }, pay: { difficulty: 1, price: 1 } },
    levers: [L("stones", "sneak", "the stepping stones", "stones", "stepping", "step"), L("rope", "force", "the old rope across", "rope", "across", "haul"), L("boat", "pay", "the boat tied up on the bank", "boat", "ferry", "bank", "row")],
    situation: "At {place} the water is high and fast, and the way goes straight across. Stepping stones show where it is shallow. An old rope is strung from bank to bank, and a boat is tied up on the near side: its owner would take one supply.",
    teaser: "high water across the way",
  },
  climb: {
    card: "climb", kind: "obstacle", named: ["{n} Tor", "the {n} Stairs"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 1 } },
    levers: [L("gully", "sneak", "the gully on the dark side", "gully", "dark side", "scree", "dark"), L("rope", "force", "the rope pegged to the rock", "rope", "peg", "haul", "pull"), L("guide", "pay", "the guide who knows the way", "guide", "knows the way")],
    situation: "At {place} the way goes steeply up, in plain sight of anyone watching from the top. A gully runs up the dark side, loose underfoot, and a rope is pegged to the rock on the straight way. A guide waits at the foot, for a supply.",
    teaser: "a steep climb, watched from the top",
  },
  crowd: {
    card: "crowd", kind: "obstacle", named: ["{n} Market", "the {n} Market"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 1 } },
    levers: [L("cheer", "talk", "something to start the crowd cheering", "cheer", "song", "shout", "announce"), L("lane", "sneak", "a side lane behind the stalls", "lane", "side", "behind", "stalls"), L("shove", "force", "the cart that could clear a path", "cart", "clear", "path"), L("hawker", "pay", "a hawker who knows the short way", "hawker", "seller", "short way")],
    situation: "At {place} a crowd is packed shoulder to shoulder, and the way is through the middle of it. A side lane runs behind the stalls, and a hawker who knows the short way calls out for custom, one supply a time.",
    teaser: "a dense crowd in the way",
  },
  contest: {
    card: "contest", kind: "obstacle", named: ["The {n} Green", "the {n} Arcade"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 1 }, pay: { difficulty: 1, price: 1 } },
    levers: [L("boast", "talk", "the champion's boasting", "boast", "champion", "dare", "challenge"), L("marker", "sneak", "the loose marker", "marker", "loose", "cheat"), L("stake", "pay", "the stake to enter", "stake", "enter", "entry", "fee")],
    situation: "At {place} a contest is under way, and only the winner goes on. The champion is boasting to anyone who will listen. One of the markers is loose. It costs one supply to enter.",
    teaser: "a contest, where only the winner goes on",
  },

  /* ------------------------------ fights ------------------------------ */
  ambush: {
    card: "ambush", kind: "fight", named: ["{n} Wood", "{n} Alley"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 1 } },
    levers: [L("ground", "force", "the high ground", "high ground", "above", "rock"), L("dark", "sneak", "the dark between the trees", "dark", "trees", "slip", "hide"), L("leader", "talk", "their nervous leader", "leader", "nervous", "boss")],
    situation: "At {place} they come out of hiding all at once, blades out, and there is no going round them. Their leader is nervous and keeps looking back. There is high ground to one side, and the dark between the trees to the other.",
    teaser: "a lonely stretch where someone may be waiting",
  },
  hound: {
    card: "hound", kind: "fight", named: ["{n} Hollow", "the {n} Yard"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 1 }, pay: { difficulty: 1, price: 1 } },
    levers: [L("meat", "pay", "food to throw it", "meat", "food", "throw", "bone"), L("chain", "force", "its broken chain", "chain", "broken"), L("wind", "sneak", "the wind in your face", "wind", "downwind", "upwind", "scent")],
    situation: "At {place} something big comes for you out of the dark, hackles up, a broken chain dragging behind it. The wind is in your face, so it has not got your scent yet. One supply of food, thrown well, might buy a moment.",
    teaser: "something big in the dark",
  },
  sentries: {
    card: "sentries", kind: "fight", named: ["{n} Watch", "the {n} Checkpoint"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 2 } },
    levers: [L("orders", "talk", "the orders they are not sure of", "orders", "papers", "pass", "sent by"), L("change", "sneak", "the changing of the watch", "change", "changing", "watch", "shift"), L("lamp", "force", "the lamp they stand under", "lamp", "light", "lantern")],
    situation: "At {place} two of the watch stand with their spears crossed, and nobody passes without a word from above. They are not sure of their orders. The watch changes soon, and they stand under a single lamp. Two supplies would make them look the other way.",
    teaser: "a watch post across the road",
  },

  /* ------------------------------ places, for the end of the road ------------------------------ */
  keep: {
    card: "keep", kind: "person", named: ["{n} Keep", "the {n} Tower"],
    ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 3 } },
    levers: [L("deal", "pay", "the price that would settle it", "price", "deal", "settle", "pay off", "ransom"), L("stairs", "sneak", "the dark back stairs", "stairs", "back", "dark", "postern"), L("pride", "talk", "the master's pride", "pride", "master", "honour", "honor")],
    situation: "{place} stands dark against the sky, with one window lit. What you came for is inside, and whoever holds it is awake. There are dark back stairs, and few guards at this hour. Three supplies might settle it without a fight.",
    teaser: "the end of the road",
  },
  fire: {
    card: "fire", kind: "person", named: ["The {n} Fire", "the {n} Rooftop"],
    ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 2, price: 2 } },
    levers: [L("song", "talk", "the song everyone knows", "song", "sing", "dance", "music"), L("edge", "sneak", "the dark at the edge of the light", "edge", "dark", "aside", "away"), L("round", "pay", "a round for everyone", "round", "drink", "everyone")],
    situation: "At {place} everyone is gathered round the fire, and it all comes to a head here. A song is starting that everyone knows. There is dark at the edge of the light, away from the others. Two supplies would stand a round for everyone.",
    teaser: "the fire where everyone gathers",
  },
};

/** The kinds of stop that can stand on the road (not at its end), by the kind of trouble. */
export const ROAD_CARDS: Record<"person" | "obstacle" | "fight", readonly string[]> = {
  person: ["keeper", "host", "miller", "warden", "guardian"],
  obstacle: ["gate", "water", "climb", "crowd", "contest"],
  fight: ["ambush", "hound", "sentries"],
};

/** Made-up words for places, before a model gives them names of the card's world. */
export const PLACE_WORDS = {
  old: ["Wren", "Ash", "Hollow", "Grey", "Thorn", "Cold", "Raven", "Elder", "Brack", "Lark", "Marsh", "Stone", "Fern", "Oak", "Hare", "Moss", "Rook", "Bell", "Sorrow", "Amber", "Heron", "Briar", "Kettle", "Mire"],
  now: ["Harbor", "Union", "Eighth", "Mercer", "Lincoln", "Delancey", "Fulton", "Grand", "Kent", "Orchard", "Canal", "Bowery", "Market", "Water", "Spring", "Bleecker", "Hudson", "Mott", "Clinton", "Pearl"],
};
/** Where you set out from. */
export const START_NAMED: [string, string] = ["{n} Cross", "{n} Station"];

/** The things that can be won on the road, each easing one way once. */
export const LOOT_KINDS: readonly { card: string; way: Way; name: [string, string]; words: readonly string[]; says: string }[] = [
  { card: "key", way: "sneak", name: ["an iron key", "a spare key card"], words: ["key", "card", "unlock", "lock"], says: "When it is over you are left holding a key: one that opens a door further on." },
  { card: "token", way: "talk", name: ["a carved token", "a business card with a name on it"], words: ["token", "name", "card", "show"], says: "You come away with a token that people on this road know: show it, and they will listen." },
  { card: "lantern", way: "sneak", name: ["a shuttered lantern", "a pocket torch"], words: ["lantern", "torch", "light", "shutter"], says: "You find a light that can be shuttered, good for dark places." },
  { card: "purse", way: "pay", name: ["a heavy purse", "a fold of banknotes"], words: ["purse", "coins", "money", "notes", "cash"], says: "A purse is left behind, heavy with coin. It will go further than your own supplies." },
];

/** People met on the road who may walk on with you, before a model makes them someone of the card's world. */
export const WALKERS: readonly { name: string; who: string; stat: "brawn" | "grace" | "charm" | "guile" | "wits" | "sense"; likes: Way; dislikes: Way }[] = [
  { name: "Dov", who: "a drover who was robbed on this road, big and slow to anger", stat: "brawn", likes: "force", dislikes: "pay" },
  { name: "Sela", who: "a pedlar who knows every back way and every price", stat: "guile", likes: "sneak", dislikes: "force" },
  { name: "Aurel", who: "a wandering singer who can talk to anyone", stat: "charm", likes: "talk", dislikes: "sneak" },
  { name: "Mott", who: "a clerk who ran away from a ledger, sharp with numbers", stat: "wits", likes: "pay", dislikes: "force" },
];
