/**
 * Sample data for the table's props (preview/props.ts, scripts/prop-shots.ts): for each prop's key, the Shows that put
 * it on the table, at three fills (1 a little, 6 an ordinary amount, 20 a great deal). A prop's own agent fills in its
 * entry here and touches nothing else in this file.
 */
import type { PackItem, Show } from "../src/game/system.js";

export type Fill = 1 | 6 | 20;

/* ------------------------------------------------- the satchel ------------------------------------------------- */

/** Things to carry, written the way the goods system writes them (src/game/systems/goods.ts, packShow). */
const THINGS: [name: string, text: string, quality: string, qty: number, worn?: boolean][] = [
  ["Hemp rope", "Thirty feet of tarred rope, stiff with salt.", "common", 1],
  ["Belt knife", "A short knife with a horn grip, kept keen.", "uncommon", 1, true],
  ["Lamp oil", "A stoppered flask of whale oil.", "common", 3],
  ["Stale bread", "The heel of a loaf, hard as a boot.", "trash", 2],
  ["Lamplighter's key", "A brass key stamped with the guild's flame.", "rare", 1],
  ["Oilskin cloak", "A cloak that keeps the rain off, patched at the hem.", "common", 1, true],
  ["Iron hook", "A hook the size of your hand, for a pole or a line.", "mundane", 1],
  ["Candle stubs", "Ends of tallow candles, good for an hour each.", "mundane", 6],
  ["Sealed letter", "A letter under grey wax, addressed to nobody you know.", "uncommon", 1],
  ["Whetstone", "A slip of grey stone worn hollow.", "common", 1],
  ["Dried eel", "Smoked black and tough as cord.", "common", 4],
  ["Silver ring", "A plain band, a little too big for you.", "rare", 1, true],
  ["Tinderbox", "Flint, steel and a twist of charred linen.", "common", 1],
  ["Ferryman's token", "A lead disc that buys one crossing.", "common", 2],
  ["Glass vial", "Empty, with a cork.", "mundane", 3],
  ["Moonstone of the Drowned Chapel", "It is cold however long you hold it.", "legendary", 1],
  ["Boot nails", "A paper of hobnails.", "trash", 20],
  ["Watchman's whistle", "Tin, on a greasy cord.", "common", 1, true],
  ["Bone needle and thread", "For sailcloth, or skin.", "common", 1],
  ["Chart of the lower river", "Inked on calfskin, with soundings in a careful hand.", "epic", 1],
];

/**
 * The things above that are worn or held ready (engine/run.ts, Item.wearable): a worn one is offered "Take it off",
 * one carried is offered "Put it on"; the rest are offered neither (src/game/systems/goods.ts, packShow).
 */
const WEARABLE = new Set(["Belt knife", "Oilskin cloak", "Silver ring", "Watchman's whistle", "Iron hook"]);

function pack(fill: Fill): Show[] {
  // A little: one thing, a few coins, nobody to sell to and nowhere made for making. Otherwise a seller and a forge.
  const seller = fill > 1 ? "Marta" : "";
  const at = fill > 1 ? "at the forge" : "";
  const items: PackItem[] = THINGS.slice(0, fill).map(([name, text, quality, qty, worn]) => {
    const called = `the ${name.toLowerCase()}`;
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      text,
      quality,
      qty,
      worn: worn === true,
      note: `Worth about ${3 + name.length} silver${qty > 1 ? " each" : ""}; would sell for about ${Math.ceil((3 + name.length) / 2)}.`,
      called,
      choices: [
        { say: "Use it", line: `I use ${called} ` },
        ...(worn ? [{ say: "Take it off", line: `I take off ${called}.` }] : WEARABLE.has(name) ? [{ say: "Put it on", line: `I put on ${called}.` }] : []),
        ...(worn ? [] : [...(seller ? [{ say: `Sell it to ${seller}`, line: `I sell ${called} to ${seller}.` }] : []), { say: "Leave it behind", line: `I leave ${called} behind for good.` }]),
      ],
      makes: !worn,
    };
  });
  return [
    {
      kind: "pack",
      items,
      money: fill === 1 ? 7 : fill === 6 ? 148 : 12650,
      coin: "silver",
      notes: fill === 1 ? ["One silver buys a meal."] : ["One silver buys a meal.", "You owe Marta 30 silver."],
      making: { say: "Make something with it", before: at ? "At the forge, out of " : "Out of ", between: ", ", last: " and ", after: " I make ", most: 3, ...(at ? { at } : {}) },
      ...(seller ? { sellTo: seller } : {}),
    },
  ];
}

/* ------------------------------------------------- the seller's cloth ------------------------------------------------- */

/** A seller's wares, written the way the goods system writes them (src/game/systems/goods.ts, stallShows). */
const WARES: [name: string, text: string, quality: string, qty: number, price: number][] = [
  ["Heavy wool cloak", "A thick, weather-stained cloak woven to keep out the frontier wind.", "common", 4, 46],
  ["Crystal lantern", "A brass lantern with a dim monster core that glows without oil.", "uncommon", 2, 120],
  ["Coil of hemp rope", "Fifty feet of braided rope for cart loads or steep slopes.", "common", 5, 9],
  ["Iron skinning knife", "A plain sharp blade with a wrapped leather grip.", "common", 6, 11],
  ["Smoked venison rations", "Salted strips in wax paper, made to last for weeks.", "mundane", 14, 2],
  ["Waxed leather waterskin", "A sturdy skin lined with pitch against leaks.", "common", 8, 4],
  ["Flint and steel", "Tinder, flint and a curved striker in a brass box.", "common", 3, 5],
  ["Wayfarer's map of the marches", "Inked on hide, with the fords and the old watchtowers.", "uncommon", 1, 210],
  ["Bundle of tallow candles", "Six candles tied with twine.", "mundane", 10, 3],
  ["Bone fishhooks", "A dozen hooks in a twist of oilcloth.", "trash", 12, 1],
  ["Copper cooking pot", "Dented, but it holds water.", "common", 1, 14],
  ["Pair of hobnailed boots", "Heavy boots resoled more than once.", "common", 2, 38],
  ["Jar of goose grease", "For leather, for boots, for chapped hands.", "mundane", 4, 2],
  ["Silver hand mirror", "Small, tarnished, its back chased with leaves.", "uncommon", 1, 160],
  ["Woollen mittens", "Grey, darned at the thumbs.", "common", 3, 5],
  ["Hatchet", "A short axe with an ash haft.", "common", 2, 17],
  ["Salt in a horn", "A cow's horn stoppered with wax, full of coarse salt.", "common", 5, 3],
  ["Spool of sinew thread", "For stitching hide and canvas.", "mundane", 6, 2],
  ["Pewter flask", "Holds a gill of something warming.", "common", 1, 12],
  ["Gilded reliquary charm", "A finger-long case on a chain, said to hold a saint's hair.", "rare", 1, 480],
];

function stall(fill: Fill): Show[] {
  const seller = "Oren";
  const money = fill === 1 ? 7 : fill === 6 ? 108 : 1240;
  const wares = WARES.slice(0, fill).map(([name, text, quality, qty, price]) => {
    const thing = name.toLowerCase();
    const can = Math.min(qty, Math.floor(money / price));
    const means = can <= 0 ? `You have ${money} bronze coins; one costs ${price}, so you cannot afford it.` : can < qty ? `You have ${money} bronze coins: enough for ${can} of them.` : `You have ${money} bronze coins.`;
    return {
      id: thing.replace(/[^a-z0-9]+/g, " ").trim(),
      name,
      text,
      quality,
      qty,
      price,
      can,
      note: means,
      choices: [
        { say: qty > 1 ? "Buy one" : "Buy it", line: qty > 1 ? `I buy the ${thing} from ${seller}, just one.` : `I buy the ${thing} from ${seller}.` },
        ...(qty > 1 ? [{ say: "Buy several", line: `I buy the ${thing} from ${seller}, this many: ` }] : []),
        { say: "Haggle over the price (a poor throw raises it)", line: `I haggle with ${seller} over the price of the ${thing}, and buy it at whatever price we settle on.` },
      ],
    };
  });
  const purse = fill === 1 ? 40 : 1450;
  const restock = fill === 20 ? 50 : 300;
  return [
    {
      kind: "stall",
      id: "oren",
      seller,
      text: "A weathered trader who sells gear to travellers from the back of his cart.",
      wares,
      coin: "bronze coins",
      money,
      purse,
      restock,
      about: `${seller} has ${purse} bronze coins on hand to buy from you with. To sell, touch a thing in your satchel. ${restock < 60 ? "Fresh stock and a full purse within the hour." : `Fresh stock and a full purse in about ${Math.round(restock / 60)} hours of the story.`}`,
    },
    // With a great deal out, a second seller is here too: the slate turns from one cloth to the other.
    ...(fill === 20
      ? [
          {
            kind: "stall" as const,
            id: "marta",
            seller: "Marta",
            text: "A herb-wife with a basket of jars.",
            wares: [
              { id: "dried feverfew", name: "Dried feverfew", text: "A bunch of dried feverfew, good against aches.", quality: "common", qty: 3, price: 4, can: 3, note: "You have 1240 bronze coins.", choices: [{ say: "Buy one", line: "I buy the dried feverfew from Marta, just one." }, { say: "Buy several", line: "I buy the dried feverfew from Marta, this many: " }, { say: "Haggle over the price (a poor throw raises it)", line: "I haggle with Marta over the price of the dried feverfew, and buy it at whatever price we settle on." }] },
              { id: "pot of salve", name: "Pot of salve", text: "Beeswax and comfrey in a clay pot.", quality: "uncommon", qty: 1, price: 22, can: 1, note: "You have 1240 bronze coins.", choices: [{ say: "Buy it", line: "I buy the pot of salve from Marta." }, { say: "Haggle over the price (a poor throw raises it)", line: "I haggle with Marta over the price of the pot of salve, and buy it at whatever price we settle on." }] },
            ],
            coin: "bronze coins",
            money,
            purse: 60,
            restock: 400,
            about: "Marta has 60 bronze coins on hand to buy from you with. To sell, touch a thing in your satchel. Fresh stock and a full purse in about 7 hours of the story.",
          },
        ]
      : []),
  ];
}

/* ------------------------------------------------- the quest board ------------------------------------------------- */

type BoardShow = Extract<Show, { kind: "quests" }>;
type BoardQuest = BoardShow["quests"][number];
type BoardTask = BoardQuest["tasks"][number];

/** A task, where it stands and what it offers, in the words the quests system writes (src/game/systems/quests.ts, QUEST_WORDS). */
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
function task(id: string, text: string, state: BoardTask["state"], needs: string[] = [], more: { main?: boolean; progress?: string; why?: string; steps?: boolean } = {}): BoardTask {
  const note = {
    open: "Can be done now.",
    waiting: "The steps under it come first, though it may be done outright.",
    blocked: more.steps ? "Out of reach until enough of the steps under it are done." : "Out of reach until more is found out.",
    done: "Done.",
    closed: more.why ? `No longer to be done: ${more.why}.` : "No longer to be done.",
  }[state];
  const choices =
    state === "open" || state === "waiting"
      ? [{ say: "Set about it", line: `I set about this: ${lowerFirst(text)}.` }, { say: "Say how", line: `To ${lowerFirst(text)}, I ` }]
      : state === "blocked"
        ? [{ say: "Look for a way", line: `I look for a way to ${lowerFirst(text)}.` }]
        : [];
  return { id, text, state, note, main: more.main === true, ...(more.progress ? { progress: more.progress } : {}), ...(more.why ? { why: more.why } : {}), needs, choices };
}

const OPEN_QUESTS: BoardQuest[] = [
  {
    id: "q1", title: "The Boy's Errand", text: "Find out who sent the boy with the hooked knife, and why.", from: "set by themselves", state: "open", fresh: true,
    tasks: [
      task("q1-1", "Learn who sent the boy", "waiting", ["q1-2", "q1-3"], { main: true }),
      task("q1-2", "Ask at the Lamplighters' Stair", "open"),
      task("q1-3", "Follow the smoke to the Old Mill", "done"),
    ],
  },
  {
    id: "q2", title: "Mara's Ring", text: "Find Mara's stolen ring and bring it back to her.", from: "asked by Mara", state: "open", fresh: false,
    tasks: [
      task("q2-1", "Return the ring to Mara", "waiting", ["q2-2"]),
      task("q2-2", "Find the ring", "blocked", ["q2-3", "q2-4"], { main: true, steps: true }),
      task("q2-3", "Ask the fisherman about the thief", "done"),
      task("q2-4", "Search the drying sheds by the ferry", "open"),
    ],
  },
  {
    id: "q3", title: "Wolves at the Reeve's Fold", text: "Clear the wolves that take the reeve's sheep.", from: "asked by Reeve Holt", state: "open", fresh: false,
    tasks: [
      task("q3-1", "Report to the reeve", "waiting", ["q3-2", "q3-3", "q3-4"]),
      task("q3-2", "Slay five wolves", "open", [], { main: true, progress: "2 of 5" }),
      task("q3-3", "Mend the fold's fence", "open", [], { progress: "40% of 100%" }),
      task("q3-4", "Ask the miller where they den", "closed", [], { why: "the miller has fled the valley" }),
    ],
  },
  {
    id: "q4", title: "The Drowned Chapel Bell", text: "Ring the bell of the Drowned Chapel at low tide.", from: "", state: "open", fresh: false,
    tasks: [task("q4-1", "Ring the chapel bell at low tide", "blocked", [], { main: true })],
  },
  {
    id: "q5", title: "A Debt to the Ferryman", text: "Pay old Corin what the crossing cost, before the month is out.", from: "asked by Corin", state: "open", fresh: false,
    tasks: [
      task("q5-1", "Pay Corin thirty silver", "waiting", ["q5-2", "q5-3", "q5-4", "q5-5", "q5-6", "q5-7"], { main: true, progress: "12 of 30" }),
      task("q5-2", "Sell the oilskin cloak at the Night Market", "open"),
      task("q5-3", "Win at knucklebones in the Gull and Lantern", "open"),
      task("q5-4", "Carry crates for the chandler", "open", [], { progress: "1 of 4" }),
      task("q5-5", "Ask Marta for an advance on wages", "done"),
      task("q5-6", "Find the purse dropped on the River Gate road", "blocked"),
      task("q5-7", "Beg the watch captain for the reward on the hooked-knife boy", "closed", [], { why: "the reward was already claimed" }),
    ],
  },
];

const ENDED_QUESTS = ["The Lamplighter's Key:done", "Smoke over the Mill:lost:the mill burned to the ground", "The Night Market Thief:done", "A Letter Under Grey Wax:dropped:given up", "The Sunken Well:lost:the well was sealed", "Candles for the Chapel:done", "The Chart of the Lower River:done", "Marta's Brother:dropped:set aside, long untouched", "The Whistle in the Fog:done", "Eels for the Feast:done", "The Toll at River Gate:lost:the gate was shut for good", "The Gull's Wager:done"];
const endedQuests = (n: number): BoardQuest[] =>
  ENDED_QUESTS.slice(0, n).map((e, i) => {
    const [title, state, end] = e.split(":") as [string, "done" | "lost" | "dropped", string | undefined];
    return {
      id: `q${10 + i}`, title, text: `${title}: a matter of the quarter, seen to one way or another.`, from: i % 3 ? "asked by Marta" : "", state, fresh: false, tasks: [],
      end: state === "done" ? "Achieved." : state === "lost" ? `Lost: ${end}.` : end && end !== "given up" ? `Given up: ${end}.` : "Given up.",
    };
  });

function board(fill: Fill): Show[] {
  // A little: one quest just begun. Ordinary: four open and two ended. A great deal: as many as the system keeps (five open, twelve ended).
  const quests = fill === 1 ? OPEN_QUESTS.slice(0, 1) : fill === 6 ? [...OPEN_QUESTS.slice(0, 4), ...endedQuests(2)] : [...OPEN_QUESTS, ...endedQuests(12)];
  return [{ kind: "quests", quests, own: { say: "Set yourself a quest", line: "I set myself a goal: " } }];
}

/* ------------------------------------------------- the faction rack ------------------------------------------------- */

/** The ladder, as the factions system gives it (src/game/systems/factions.ts, LADDER). */
const RACK_LADDER = [["hated", -100], ["shunned", -69], ["mistrusted", -29], ["neutral", -9], ["welcome", 11], ["trusted", 26], ["esteemed", 41], ["cherished", 61], ["exalted", 81]] as const;

/** Groups of a world, written the way the factions system writes them (standingShow): name, what it is, standing, holds, who is here, its aid. */
const GROUPS: [name: string, text: string, standing: number, holds: string[], here: string[], aid: [string, string][], rested?: number][] = [
  ["The Lamplighters' Guild", "Keepers of the city's lamps, who hear every rumour the night carries.", 34, ["the Lamplighters' Stair"], ["Old Wick"], [["A word in the right ear", "A guildsman passes a quiet word to whoever you need to reach."], ["Lamps put out", "The lamps of one street go dark for an hour at your asking."], ["The Long Night", "Every lamp in the quarter is doused, and the guild's people keep the dark for you."]], 3],
  ["River Watch", "The city's armed guard on the docks and bridges, short of men and of patience.", -42, ["River Gate"], ["Sergeant Hask", "a watchman"], [["Looked the other way", "A watchman lets you pass without a question."], ["An escort", "Two of the Watch walk with you through the docks."], ["Gates opened", "The river gate is opened for you at night, no questions asked."]]],
  ["Drowned Chapel", "A sect who pray to what lies under the river, and keep its relics.", -78, ["the Drowned Chapel"], [], [["A blessing of water", "A priest marks you against drowning."], ["The relic shown", "You are let into the undercroft to see what they keep."], ["The river's answer", "They call on what lies under the river on your behalf."]]],
  ["Night Market Traders", "Stall-keepers who sell anything after dark and remember who pays.", 4, ["Night Market"], ["Marta"], []],
  ["House Varrow", "An old merchant house that owns half the warehouses and wants the rest.", 72, [], [], [["Credit at the warehouses", "Varrow's clerks give you goods on the house's name."], ["A carriage and a seal", "A Varrow carriage and seal take you anywhere a merchant may go."], ["Varrow's ships", "One of the house's ships sails where you say."]]],
  ["The Ferrymen", "Those who work the boats between the banks, and charge what they like.", 18, ["the Ferry Steps"], [], [["A free crossing", "A ferryman takes you over for nothing."], ["A boat at night", "A boat waits for you after dark, with no lantern."], ["The whole river", "Every ferry on the river carries your word."]]],
  ["Grey Brotherhood", "Monks who sell cures and buy secrets.", -15, ["the Grey Cloister"], [], []],
  ["The Salt Court", "Judges of the old city, who distrust strangers above all.", -60, [], [], [["A hearing", "A judge hears you out."], ["A pardon", "A small crime of yours is forgotten."], ["The court's favour", "The court rules for you in a matter of your choosing."]]],
  ["Bridge Beggars", "The beggars of the seven bridges, who see everyone who crosses.", 55, [], ["a beggar child"], [["Eyes on the bridges", "They tell you who has crossed today."], ["A crowd when needed", "A crowd gathers wherever you say."], ["The bridges closed", "No one crosses the seven bridges without your leave for a night."]]],
  ["Order of the Ash Bell", "Knights sworn to ring the bell when the river rises, and few are left.", 92, ["the Bell Tower"], [], [["A knight's word", "A knight vouches for you."], ["A sword at your side", "A knight of the order rides with you for a day."], ["The bell rung", "The order rings the Ash Bell for you, and the whole city stops."]]],
];

function rack(fill: Fill): Show[] {
  const n = fill === 1 ? 1 : fill === 6 ? 6 : GROUPS.length;
  const needs = [25, 60, 80];
  return [
    {
      kind: "standing",
      ladder: RACK_LADDER.map(([name, from]) => ({ name, from })),
      groups: GROUPS.slice(0, n).map(([name, text, standing, holds, here, aid, rested]) => {
        let step = 0;
        while (step + 1 < RACK_LADDER.length && standing >= RACK_LADDER[step + 1]![1]) step++;
        return {
          id: name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          name,
          text,
          standing,
          least: -100,
          most: 100,
          step,
          label: RACK_LADDER[step]![0],
          tone: step < 3 ? "against" : step > 3 ? "for" : "neutral",
          notes: [...(holds.length ? [`Holds ${holds.join(", ")}.`] : []), ...(here.length ? [`Here: ${here.join(", ")}.`] : [])],
          holds,
          here,
          aid: aid.map(([say, what], i) => {
            const open = standing >= needs[i]!;
            const wait = i === 0 && rested ? rested : 0;
            return { say, text: what, need: needs[i]!, state: !open ? `at standing ${needs[i]}` : wait ? `ready in ${wait} turns` : "ready", open: open && !wait, line: `I call on ${name.replace(/^The /, "the ")} for their help: ${say}.` };
          }),
        };
      }),
    },
  ];
}

/* ------------------------------------------------- the ring ------------------------------------------------- */

/** People to stand on the mat, written the way the fight system writes them (src/game/systems/fight.ts, ringShow). */
const RING_FOES: [name: string, text: string, tier: number, hp: number, down?: "beaten" | "dead"][] = [
  ["The Boy with the Hooked Knife", "A dock boy, quick and scared, with a gutting knife held low.", 2, 64],
  ["The Woman in Grey", "She has not raised her voice once. The knife in her sleeve is not her first.", 5, 91],
  ["Dock Thug", "A slab of a man with a belaying pin.", 1, 0, "beaten"],
  ["Hound", "A great dog with its hackles up, chain broken.", 3, 38],
  ["Old Tam", "The grey woman's man on the door.", 2, 100],
  ["Rat-catcher", "Wire, a sack, and no questions.", 1, 0, "dead"],
  ["Sister Ash", "A bell-knight gone to the bad.", 4, 77],
  ["The Twins' Lookout", "A child on a roof, with a whistle and a sling.", 1, 12],
];
const RING_OTHERS: [name: string, text: string, tier: number, side: string, stance: "yours" | "against" | "other"][] = [
  ["Mara", "Your sister, quick with a sling.", 2, "Ash's side", "yours"],
  ["The Fence", "He buys what the thieves bring, and will not fight for them.", 1, "The grey woman's people", "against"],
  ["Sergeant Holt", "Of the market watch. He wants the street quiet and does not care who pays for it.", 4, "The watch", "other"],
  ["Pell", "A lamplighter's boy who owes you.", 1, "Ash's side", "yours"],
  ["Watchman Crane", "Holt's man, new to the stick.", 2, "The watch", "other"],
  ["The Ferryman of the Lower Steps", "He was promised a crossing's worth of silver either way.", 3, "The ferrymen", "other"],
  ["Lantern Jack", "A lamplighter with a pole and a grudge.", 3, "Ash's side", "yours"],
  ["Knuckles", "Collects for the grey woman.", 2, "The grey woman's people", "against"],
  ["Watchman Idris", "Old, slow, and not paid enough for this.", 1, "The watch", "other"],
  ["Ferry-girl", "She poles for the Ferryman.", 1, "The ferrymen", "other"],
  ["Marta", "The chandler, with a cleaver from her own counter.", 2, "Ash's side", "yours"],
  ["The Clerk", "He keeps the grey woman's book.", 1, "The grey woman's people", "against"],
];
const RING_STANDS = ["far weaker than you", "much weaker than you", "a little weaker than you", "about your match", "a little stronger than you", "much stronger than you", "far stronger than you"];

function ring(fill: Fill): Show[] {
  // The player's character stands on the second step of power.
  const step = (tier: number): number => Math.max(-3, Math.min(3, tier - 2));
  const power = (tier: number): string => `Power ${tier} of 7, ${RING_STANDS[step(tier) + 3]!}.`;
  const id = (name: string): string => name.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const speak = (name: string) => ({ say: "Speak to them", line: `I say to ${name}: ` });
  const use = (name: string) => ({ say: "Use something on them", line: `On ${name} I use ` });
  const attack = (name: string) => ({ say: "Attack them", line: `I attack ${name} ` });
  const foes = RING_FOES.slice(0, fill === 1 ? 1 : fill === 6 ? 3 : 8).map(([name, text, tier, hp, down]) => ({
    id: id(name),
    name,
    text,
    hp,
    max: 100,
    tier,
    step: step(tier),
    odds: down ? (down === "dead" ? "Dead." : "Beaten: they can do no more.") : `Health ${hp} of 100. ${power(tier)}`,
    down: !!down,
    choices: down ? [] : [attack(name), speak(name), use(name)],
  }));
  const others = RING_OTHERS.slice(0, fill === 1 ? 0 : fill === 6 ? 3 : 12).map(([name, text, tier, side, stance]) => ({
    id: id(name),
    name,
    text,
    side,
    stance,
    tier,
    step: step(tier),
    odds: `${stance === "yours" ? "On your side." : stance === "against" ? `With ${side}, against you.` : `With ${side}.`} ${power(tier)}`,
    choices: [speak(name), use(name)],
  }));
  const standing = foes.filter((f) => !f.down);
  const attacks = standing.map((f) => ({ say: `Attack ${f.name}`, line: `I attack ${f.name} ` }));
  const you = { name: "Ash", hp: fill === 1 ? 100 : fill === 6 ? 58 : 21, max: 100 };
  const saves = { count: fill === 1 ? 2 : fill === 6 ? 1 : 0, max: 2 };
  const mine = `Health ${you.hp} of 100. Saves from a killing blow: ${saves.count} of ${saves.max}. A blow that would bring you down costs one, and 20 health, instead.`;
  if (fill === 1) return [{ kind: "fight", name: "The fight", text: `You are fighting ${foes[0]!.name}.`, foes, others, sides: [], measures: [], lines: attacks, you: { ...you, text: mine }, saves }];
  const sideNames = [...new Set(RING_OTHERS.slice(0, fill === 6 ? 3 : 12).map((o) => o[3]))];
  const sides = sideNames.map((name) => {
    const stance = RING_OTHERS.find((o) => o[3] === name)![4];
    return { name, stance, members: [...(stance === "against" ? foes.map((f) => f.name) : []), ...others.filter((o) => o.side === name).map((o) => o.name)] };
  });
  const measure = (i: number, name: string, value: number, max: number, good: "up" | "down", atFull: "win" | "lose" | "none", atEmpty: "win" | "lose" | "none") => {
    const end = (when: string, e: string): string => (e === "none" ? "" : ` ${when}, you ${e}.`);
    return { id: `${id(name)}~${i}`, name, value, max, good, atFull, atEmpty, note: `${value} of ${max}.${end("Full", atFull)}${end("Empty", atEmpty)}` || `${value} of ${max}. It ends nothing; ${good === "up" ? "more" : "less"} of it is better for you.` };
  };
  const measures = [
    measure(0, "Your way to the stair", fill === 6 ? 7 : 3, 12, "up", "win", "lose"),
    { ...measure(1, "The watch's patience", fill === 6 ? 4 : 2, 5, "up", "none", "lose") },
    ...(fill === 20 ? [{ ...measure(2, "The crowd in the street", 16, 25, "down", "none", "none"), note: "16 of 25. It ends nothing; less of it is better for you." }] : []),
  ];
  const lines = [
    ...["I fight my way toward the stair", "I shout for the watch to take my side", ...(fill === 20 ? ["I slip into the crowd and away"] : [])].map((l) => ({ say: l, line: l })),
    ...attacks,
  ].slice(0, 5);
  return [
    {
      kind: "fight",
      name: fill === 6 ? "The brawl under the Lamplighters' Stair" : "The fight for the Lamplighters' Stair, with the whole street in it",
      text: `${fill === 6 ? "Hard for you." : "Very hard for you."} ${sides.map((s) => `${s.name}${s.stance === "against" ? ", against you" : ""}: ${[...(s.stance === "yours" ? ["you"] : []), ...s.members].join(", ")}.`).join(" ")}`,
      foes,
      others,
      sides,
      measures,
      lines,
      you: { ...you, text: mine },
      saves,
    },
  ];
}

/* ------------------------------------------------- the character board ------------------------------------------------- */

import { checkTrees, perkNamed, perksOf, type RawNode, type RawTree } from "../src/engine/perks.js";
import { attributesFrom, newRun, skillXpFor } from "../src/engine/run.js";
import { selfShow } from "../src/game/systems/perks.js";

const perk = (name: string, text: string, children: RawNode[] = []): RawNode => ({ name, text, children });
/** Three trees as the strong model writes them (src/game/systems/perks.ts): five perks in each, and eight in each when there is a great deal. */
const SELF_TREES = (many: boolean): RawTree[] => [
  {
    name: "The Long Road",
    root: perk("Sure Feet", "You keep your footing on wet stone, loose scree and bad stairs.", [
      perk("Second Wind", "When you are worn down you find a little more in yourself than you should have.", [
        perk("Road Without End", "A day's march leaves you no more tired than a morning's walk.", many ? [perk("Sleeps Anywhere", "You wake rested from a doorway, a ditch or a saddle.")] : []),
      ]),
      perk("Weather Wise", "You know what the sky will do an hour before it does it.", [
        perk("Storm Crow", "Foul weather hides you, and never slows you.", many ? [perk("Rides the Gale", "The worst of a storm is where you are most at home.")] : []),
        ...(many ? [perk("Reads the Tide", "Rivers and tides keep no secrets from you.")] : []),
      ]),
    ]),
  },
  {
    name: "Quiet Hands",
    root: perk("Light Touch", "What you handle, you handle without a sound or a mark.", [
      perk("Soft Step", "Boards do not creak for you and gravel does not shift.", [
        perk("Shadow at Noon", "You go unremarked in plain sight, as one more face in the street.", [perk("Never There", "Those who saw you cannot agree on what you looked like.", many ? [perk("A Name Nobody Knows", "Rumour cannot find you: tales of what you did are told of someone else.")] : [])]),
      ]),
      perk("Lockwise", "Locks, latches and seals read to you like a familiar hand.", many ? [perk("Glass Fingers", "You feel a snare or a tripwire before you touch it."), perk("Borrowed Keys", "Any tool will do you for the right one.")] : []),
    ]),
  },
  {
    name: "Lamplit Tongue",
    root: perk("Easy Smile", "Strangers take you for harmless until they have reason not to.", [
      perk("Good Listener", "People tell you a little more than they meant to.", many ? [perk("Hears the Unsaid", "You catch what a silence is hiding.")] : []),
      perk("Remembered Name", "You never forget a name, a face or a favour owed.", [perk("Friend in Every Port", "Wherever you fetch up, someone there owes you a kindness.", many ? [perk("The Lamplighters' Own", "The guild counts you one of theirs, wherever its lamps burn.")] : [])]),
      perk("Borrowed Trust", "A good word from you carries the weight of whoever spoke for you last.", many ? [perk("Honest Face", "A lie from you is taken for the plain truth more often than it should be.")] : []),
    ]),
  },
];
const SELF_SKILLS = [
  "Stealth", "Climbing", "Haggling", "Streetwise", "Running", "Lockpicking", "Knife work", "First aid", "Rope work", "Lying", "Map reading", "Boating",
  "Swimming", "Cooking", "Tracking", "Gambling", "Fishing", "Lamp tending", "Letter writing", "Riding", "Singing", "Tinkering", "Bartering", "Wrestling",
  "Herb lore", "Night watching", "Sail mending", "Ciphering",
];
const SELF_ABILITIES: [name: string, text: string, tier: 0 | 1 | 2, kind: "innate" | "learned", wait: number][] = [
  ["Courier's Memory", "Recalls any street walked once, turn for turn.", 0, "innate", 0],
  ["Lamplighter's Sign", "A word and a gesture that any of the guild will answer, once in a while.", 1, "innate", 3],
  ["Cold Read", "Tells a liar by the first three things they say.", 0, "learned", 0],
  ["Rooftop Run", "Crosses a street's worth of roofs faster than the street can be walked.", 0, "innate", 1],
  ["Dead Drop", "Leaves a thing where only the one meant to find it will.", 0, "learned", 0],
  ["The Long Night", "Goes a night and a day without sleep and shows none of it.", 2, "innate", 6],
];

/** Who you are, made by the game's own hand (src/game/systems/perks.ts, selfShow) from a run set up for each fill. */
function self(fill: Fill): Show[] {
  const r = newRun(1, "", "", "Ash of the Lamplighters' Stair");
  const s = r.sheet;
  s.calling = "Road-worn courier";
  s.attributes = attributesFrom(["dexterity", "cunning", "charisma", "intelligence"]);
  const st = perksOf(r);
  st.trees = checkTrees(SELF_TREES(fill === 20))!;
  const learnt = (names: string[], active: string[]): void => {
    for (const name of names) Object.assign(perkNamed(st, name)!, { learned: true, active: active.includes(name) });
  };
  const skill = (name: string, level: number, part: number) => ({ name, level, xp: Math.round(skillXpFor(level) + (skillXpFor(level + 1) - skillXpFor(level)) * part) });
  if (fill === 1) {
    // A run just begun: nothing placed, nothing learned, one perk point.
    s.skills = SELF_SKILLS.slice(0, 5).map((name, i) => skill(name, [4, 3, 3, 2, 1][i]!, 0));
    s.abilities = SELF_ABILITIES.slice(0, 1).map(([name, text, tier, kind, wait]) => ({ name, text, tier, kind, wait }));
  } else if (fill === 6) {
    Object.assign(s, { level: 5, xp: 96, hp: 82, points: 3 });
    s.attributes.dexterity += 3;
    s.attributes.cunning += 2;
    s.skills = SELF_SKILLS.slice(0, 12).map((name, i) => skill(name, [5, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1][i]!, ((i * 37) % 10) / 10));
    s.abilities = SELF_ABILITIES.slice(0, 3).map(([name, text, tier, kind, wait]) => ({ name, text, tier, kind, wait }));
    learnt(["Sure Feet", "Light Touch"], ["Light Touch"]);
  } else {
    Object.assign(s, { level: 14, xp: 1310, hp: 37, points: 6 });
    s.attributes.dexterity += 14;
    s.attributes.cunning += 9;
    s.attributes.charisma += 6;
    s.attributes.strength += 4;
    s.skills = SELF_SKILLS.map((name, i) => skill(name, Math.max(1, 10 - Math.floor(i / 2.6)), ((i * 37) % 10) / 10));
    s.abilities = SELF_ABILITIES.map(([name, text, tier, kind, wait]) => ({ name, text, tier, kind, wait }));
    learnt(["Sure Feet", "Second Wind", "Weather Wise", "Light Touch", "Soft Step", "Easy Smile"], ["Second Wind", "Soft Step", "Easy Smile"]);
    st.held.push({ name: "Quick on the Stair", text: "Takes steps three at a time without a thought.", effect: "skill", target: "Climbing", when: "", level: 2 });
  }
  return [selfShow(r)];
}

export const SAMPLES: Record<string, (fill: Fill) => Show[]> = {
  pack,
  stall,
  ring,
  board,
  self,
  rack,
};

/** Everything else the table can hold at once: a map of known places, a full row of cards, and a full reckoning. */
export const REST: Show[] = [
  {
    kind: "map",
    title: "The Lamplighters' Quarter",
    places: [
      { id: "stair", name: "The Lamplighters' Stair", seen: true },
      { id: "mill", name: "The Old Mill", seen: false, danger: 2, note: "smoke by night" },
      { id: "market", name: "Night Market", seen: true },
      { id: "chapel", name: "Drowned Chapel", seen: false, danger: 1 },
      { id: "gate", name: "River Gate", seen: true },
      { id: "well", name: "The Sunken Well by the Ferry Steps", seen: false, note: "the boy ran this way" },
    ],
    ways: [["stair", "mill"], ["stair", "market"], ["market", "chapel"], ["market", "gate"], ["gate", "well"]],
    at: "market",
  },
  { kind: "card", id: "c1", group: "choices", title: "Follow the smoke", text: "", line: "I follow the smoke toward the Old Mill." },
  { kind: "card", id: "c2", group: "choices", title: "Ask the boy who sent him", text: "", line: "I ask the boy who sent him." },
  { kind: "card", id: "c3", group: "choices", title: "Wait for the watch to pass", text: "", line: "I wait in the doorway until the watch has passed." },
  { kind: "card", id: "p1", group: "perks", title: "Night Eyes", text: "You see in the dark as well as others do at dusk.", line: "I take Night Eyes." },
  { kind: "bar", id: "b1", group: "Needs", name: "Hunger", value: 62, max: 100, good: "up" },
  { kind: "bar", id: "b2", group: "Needs", name: "Rest", value: 35, max: 100, good: "up", note: "Tired" },
  { kind: "bar", id: "b3", group: "The chase", name: "Her lead", value: 4, max: 12, good: "down" },
  { kind: "bar", id: "b4", group: "The chase", name: "Your wind", value: 7, max: 12, good: "up" },
];
