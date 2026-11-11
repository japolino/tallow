/**
 * Two adventures in trope mode for a made-up test card (milestone 3): a rescue and a courtship. Everyone and
 * everything in them is made up. At milestone 4 the same shapes are built from a real character card.
 */
import type { Adventure } from "../engine/adventure.js";
import type { Sheet } from "../engine/moment.js";
import { TAVERN } from "./tavern.js";

/** The made-up character you play in both: light on your feet, easy to like, no great fighter, hopeless with sums. */
export const COURIER: Sheet = {
  stats: { brawn: 1, grace: 3, charm: 1, guile: 2, wits: 0, sense: 1 },
  health: 5,
  supplies: 4,
  goodwill: 2,
  hour: 16.5,
};

export const RESCUE: Adventure = {
  id: "rescue",
  title: "The Road to Hollowmere",
  trope: "rescue",
  goal:
    "Ilse, the ferryman's grown daughter, was taken by the Warden of Hollowmere Keep against a debt her father cannot pay. At first light a barge takes her downriver, and she is gone for good. You have tonight to get her out.",
  who: "You are a courier who owes Tam the ferryman a kindness: light on your feet, easy to like, no great fighter, and hopeless with sums.",
  seed: 7,
  places: [
    { id: "ferry", name: "Tam's Ferry", u: 0.08, v: 0.86 },
    { id: "mill", name: "Orla's Mill", u: 0.24, v: 0.6 },
    { id: "bridge", name: "Wren Bridge", u: 0.4, v: 0.82 },
    { id: "crossing", name: "Dov's Crossing", u: 0.47, v: 0.42 },
    { id: "abbey", name: "Tessera Abbey", u: 0.3, v: 0.2 },
    { id: "rest", name: "Mara's Rest", u: 0.64, v: 0.66 },
    { id: "tor", name: "Grey Tor", u: 0.7, v: 0.28 },
    { id: "keep", name: "Hollowmere Keep", u: 0.9, v: 0.12 },
  ],
  start: "ferry",
  startHour: 17,
  roads: [
    ["ferry", "mill", 1],
    ["mill", "bridge", 1],
    ["mill", "crossing", 1.5],
    ["bridge", "rest", 1],
    ["crossing", "abbey", 1],
    ["crossing", "tor", 1.5],
    ["abbey", "tor", 1],
    ["rest", "tor", 1.5],
    ["tor", "keep", 1],
  ],
  deadline: { hour: 29.5, name: "first light", lost: "The sky goes grey over the river, and the barge is already out on the water. You are too late: Ilse is gone downriver." },
  companions: [
    { id: "dov", name: "Dov", card: "companion", who: "a drover the Warden's riders robbed at the ford, big and slow to anger", stat: "brawn", likes: "force", dislikes: "pay" },
  ],
  loot: [
    { id: "token", name: "Orla's token", card: "token", way: "talk", words: ["token", "orla", "miller"] },
    { id: "key", name: "the postern key", card: "key", way: "sneak", words: ["key", "postern", "back gate", "side gate"] },
    { id: "lantern", name: "the abbey lantern", card: "lantern", way: "sneak", words: ["lantern", "shutter", "light"] },
  ],
  stops: [
    {
      id: "mill",
      name: "Orla's Mill",
      card: "miller",
      kind: "person",
      teaser: "a mill by the race, where someone may have seen the riders pass",
      situation:
        "Orla the miller stands in the door of her mill with a sack hook in her hand. She saw the Warden's riders go by with a girl across a saddle, and she wants no part of it. Her cart is stuck in the race with a wheel off, and her mule will not pull it. Behind the mill a footpath runs along the race, past her door.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 0, price: 1 } },
      levers: [
        { id: "cart", way: "talk", name: "her cart stuck in the race", words: ["cart", "wheel", "mule", "help her"] },
        { id: "race", way: "sneak", name: "the footpath along the race", words: ["footpath", "race", "behind the mill", "along the water"] },
      ],
      reward: { loot: "token", says: "Orla presses a carved token into your hand. \"Show that to anyone on this road. They know me.\"" },
    },
    {
      id: "bridge",
      name: "Wren Bridge",
      card: "keeper",
      kind: "person",
      teaser: "the only dry way over the gorge, and someone keeps the toll",
      situation:
        "Wren Bridge is the only dry way over the gorge, and the bar is down across it. Old Wren, who keeps the toll, sits by a brazier that is burning low, frowning at a ledger whose sums will not come out. A grey dog sleeps against the bar's post, which is rotten at the foot. Under the planks, the old rope walk still hangs from pier to pier. The toll is two supplies.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 2 } },
      levers: [
        { id: "ledger", way: "talk", name: "her ledger that will not add up", words: ["ledger", "sums", "accounts", "her book", "the book"] },
        { id: "ropewalk", way: "sneak", name: "the rope walk under the bridge", words: ["rope walk", "ropewalk", "rope", "under the bridge", "under the planks", "pier"] },
        { id: "post", way: "force", name: "the rotten post", words: ["rotten", "post"] },
      ],
    },
    {
      id: "rest",
      name: "Mara's Rest",
      card: "host",
      kind: "person",
      teaser: "an inn on the road, where the Warden's people drink",
      situation:
        "Mara's Rest is loud with the Warden's grooms, drinking on the Warden's coin. Mara herself works the taps and watches you come in. She knew Ilse's mother, and she keeps a key on her belt that is not for any door in the inn. The grooms are betting on a game of knuckles by the fire, and one of them is losing badly.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 2 } },
      levers: [
        { id: "mother", way: "talk", name: "Ilse's mother, whom Mara knew", words: ["mother", "her mother", "ilse's mother"] },
        { id: "knuckles", way: "pay", name: "the game of knuckles", words: ["knuckles", "game", "bet", "wager", "dice"] },
      ],
      reward: { loot: "key", says: "Mara slides the key across the counter under a cloth. \"The postern on the river side. It sticks; lift as you turn.\"" },
    },
    {
      id: "crossing",
      name: "Dov's Crossing",
      card: "ambush",
      kind: "fight",
      holds: 2,
      teaser: "a ford where the Warden's riders water their horses",
      situation:
        "At the ford two of the Warden's riders have a drover on his knees in the shallows and are going through his packs. They see you. One wheels his horse to face you; the other draws. The water is fast and waist-deep off the stones, and the riders' horses are skittish in it. The drover's own goad lies in the reeds.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 1 } },
      levers: [
        { id: "horses", way: "sneak", name: "the skittish horses", words: ["horse", "horses", "spook", "startle"] },
        { id: "goad", way: "force", name: "the drover's goad in the reeds", words: ["goad", "reeds", "drover's", "staff", "stick"] },
      ],
      weather: "fog",
      reward: { joins: "dov", says: "The drover gets up out of the water, wringing his hat. \"Dov,\" he says. \"They took my beasts to the keep. I am coming with you.\"" },
    },
    {
      id: "abbey",
      name: "Tessera Abbey",
      card: "gate",
      kind: "obstacle",
      teaser: "a shut abbey on the high road, the quiet way round",
      situation:
        "The abbey gate is barred for the night and the sisters are at their prayers. The high road runs straight through the abbey yard and out the other side; the way round is a long scramble. A bell rope hangs by the gate, and a lamp is lit in the porter's window. The wall is old and the ivy on it is thick.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "bell", way: "talk", name: "the bell rope by the gate", words: ["bell", "ring", "rope"] },
        { id: "ivy", way: "sneak", name: "the ivy on the wall", words: ["ivy", "wall", "climb"] },
      ],
      reward: { loot: "lantern", says: "The porter gives you a shuttered lantern for the dark road. \"Keep the shutter down near the keep. They watch for lights.\"" },
    },
    {
      id: "tor",
      name: "Grey Tor",
      card: "climb",
      kind: "obstacle",
      teaser: "the last climb before the keep",
      situation:
        "The road to the keep goes up over Grey Tor, and the Warden keeps a watch-fire at the top. The path zigzags in plain sight of it. A gully runs up the dark side, loose with scree. The watchman at the fire is alone, and he has a jug.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 1 } },
      levers: [
        { id: "gully", way: "sneak", name: "the gully on the dark side", words: ["gully", "scree", "dark side"] },
        { id: "jug", way: "pay", name: "the watchman's jug", words: ["jug", "drink", "wine", "ale"] },
      ],
      weather: "wind",
    },
    {
      id: "keep",
      name: "Hollowmere Keep",
      card: "keep",
      kind: "person",
      climax: true,
      holds: 2,
      teaser: "the keep",
      situation:
        "Hollowmere Keep stands on its rock over the river. Ilse is in the tower; the barge is tied at the water stairs below. The Warden himself is in the hall with his accounts, and his men are few at this hour. He holds her against her father's debt: three supplies would clear it. There is a postern on the river side, and the water stairs are dark.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 3 } },
      levers: [
        { id: "debt", way: "pay", name: "her father's debt", words: ["debt", "what he owes", "father owes", "clear the debt", "pay off"] },
        { id: "stairs", way: "sneak", name: "the dark water stairs", words: ["water stairs", "stairs", "barge"] },
      ],
      weather: "storm",
    },
  ],
  won: "You come down the water stairs with Ilse's hand in yours as the first birds start. Behind you the keep is shouting. Ahead, the ferry light.",
};

export const COURTSHIP: Adventure = {
  id: "courtship",
  title: "Midsummer at Lowen",
  trope: "courtship",
  goal:
    "Tessera, the glassblower, has had your heart since spring, and she has never once looked your way. Tonight is the Midsummer fair at Lowen, and by the bonfire at midnight people say what they mean. Corwin the vintner means to say it to her first.",
  who: "You are a courier back in Lowen for the fair: light on your feet, easy to like, no great fighter, and hopeless with sums.",
  seed: 23,
  places: [
    { id: "gate", name: "Lowen Gate", u: 0.1, v: 0.8 },
    { id: "stall", name: "The Glass Stall", u: 0.28, v: 0.62 },
    { id: "butts", name: "The Butts", u: 0.46, v: 0.82 },
    { id: "cider", name: "The Cider Tent", u: 0.5, v: 0.4 },
    { id: "walk", name: "The Lantern Walk", u: 0.7, v: 0.55 },
    { id: "fire", name: "The Bonfire", u: 0.88, v: 0.22 },
  ],
  start: "gate",
  startHour: 14,
  roads: [
    ["gate", "stall", 1],
    ["stall", "butts", 1.5],
    ["stall", "cider", 1.5],
    ["butts", "walk", 1.5],
    ["cider", "walk", 1.5],
    ["walk", "fire", 1],
  ],
  deadline: { hour: 24, name: "midnight", lost: "The bell in Lowen strikes twelve. By the fire, Tessera is laughing at something Corwin said. The moment has gone past you." },
  courted: { name: "Tessera", card: "beloved", who: "the glassblower, a woman of thirty with burn scars on her forearms and a laugh you can hear across the square" },
  rival: { name: "Corwin", card: "rival", who: "the vintner, handsome and sure of himself", max: 4, lost: "Corwin has got there before you. Tessera takes his arm and they walk off toward the fire together." },
  companions: [],
  loot: [
    { id: "favour", name: "the glass favour", card: "token", way: "talk", words: ["favour", "glass bead", "bead", "her glass"] },
    { id: "purse", name: "the archery purse", card: "purse", way: "pay", words: ["purse", "prize", "winnings"] },
  ],
  stops: [
    {
      id: "stall",
      name: "The Glass Stall",
      card: "beloved",
      kind: "person",
      teaser: "her stall",
      situation:
        "Tessera is at her stall, packing glass in straw before the crowds come. A bead has rolled under the trestle and she has not seen it. Her furnace cart needs moving, and it is heavy. She looks up at you, and then past you, at Corwin coming across the square.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 1 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "bead", way: "talk", name: "the bead under the trestle", words: ["bead", "trestle", "dropped"] },
        { id: "furnace", way: "force", name: "her heavy furnace cart", words: ["furnace", "cart", "lift", "carry"] },
      ],
      reward: { loot: "favour", says: "She threads the bead on a string and ties it at your wrist. \"For luck. You will need it, at the butts.\"" },
    },
    {
      id: "butts",
      name: "The Butts",
      card: "contest",
      kind: "obstacle",
      teaser: "the archery contest, where everyone is watching",
      situation:
        "The archery contest is on, and Tessera is watching from the rope. Corwin has shot already, and shot well. The wind is gusting across the field, and the other archers are waiting for it to drop. The prize is a purse.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 1 }, pay: { difficulty: 2, price: 1 } },
      levers: [
        { id: "wind", way: "force", name: "the gusting wind", words: ["wind", "gust", "wait for"] },
      ],
      reward: { loot: "purse", says: "The purse is yours, and so, for a moment, is Tessera's whole attention." },
    },
    {
      id: "cider",
      name: "The Cider Tent",
      card: "guardian",
      kind: "person",
      teaser: "the cider tent, and her brother, who does not think much of you",
      situation:
        "Tessera's brother Ansel holds court in the cider tent, and he does not think much of couriers. He is arguing with a farmer about the price of apples and losing. A fiddler is tuning up in the corner, and the floor is clearing for a dance.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "apples", way: "talk", name: "the argument about apples", words: ["apples", "price", "argument", "farmer"] },
        { id: "dance", way: "talk", name: "the dance starting", words: ["dance", "fiddler", "fiddle"] },
      ],
    },
    {
      id: "walk",
      name: "The Lantern Walk",
      card: "crowd",
      kind: "obstacle",
      teaser: "the lantern walk, and the whole town in it",
      situation:
        "The whole town is on the lantern walk down to the river, and Tessera is somewhere ahead in it. The lane is packed shoulder to shoulder. There is a back way through the dyers' yards, if the gate is open. A lantern seller is crying his wares.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "yards", way: "sneak", name: "the back way through the dyers' yards", words: ["dyers", "yards", "back way"] },
        { id: "lanterns", way: "pay", name: "the lantern seller", words: ["lantern", "lanterns", "seller"] },
      ],
    },
    {
      id: "fire",
      name: "The Bonfire",
      card: "fire",
      kind: "person",
      climax: true,
      holds: 2,
      teaser: "the bonfire",
      situation:
        "The bonfire is roaring and the sparks go up into the dark. Tessera stands a little apart, watching the fire, and for once she is alone. Corwin is pushing through the crowd toward her with two cups. Somewhere a fiddle is playing slow.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 3 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 1 } },
      levers: [
        { id: "fiddle", way: "force", name: "the slow fiddle", words: ["fiddle", "dance", "music"] },
        { id: "sparks", way: "talk", name: "the sparks going up", words: ["sparks", "stars", "fire"] },
      ],
    },
  ],
  won: "Tessera turns from the fire and looks at you, properly, for the first time. Then she takes your hand, and Corwin's two cups are someone else's problem.",
};


/*
 * The same two tropes in a modern city, for cards set in our own times (build.ts, skeletonFor): a different map, a
 * different order of trouble, and a choice of road from the first step. Everyone and everything in them is made up.
 */

export const NIGHT_RESCUE: Adventure = {
  id: "night-rescue",
  title: "Northside After Dark",
  trope: "rescue",
  goal:
    "Juno works the night desk at the Northside clinic, and she saw Saul Brant's books when she should not have. His people took her off the street tonight. At six in the morning a car takes her to a private airfield, and she is gone for good. You have tonight to get her out.",
  who: "You are a courier who owes Juno a favour: light on your feet, easy to like, no great fighter, and hopeless with sums.",
  seed: 11,
  weather: "rain",
  places: [
    { id: "station", name: "Northside Station", u: 0.08, v: 0.5 },
    { id: "cafe", name: "Nadia's Café", u: 0.25, v: 0.28 },
    { id: "market", name: "Market Street", u: 0.26, v: 0.74 },
    { id: "yard", name: "Brant's Scrapyard", u: 0.46, v: 0.16 },
    { id: "club", name: "The Velvet Room", u: 0.46, v: 0.48 },
    { id: "docks", name: "The Dock Gate", u: 0.48, v: 0.84 },
    { id: "roofs", name: "The Fire Escape", u: 0.7, v: 0.5 },
    { id: "tower", name: "Brant Tower", u: 0.9, v: 0.26 },
  ],
  start: "station",
  startHour: 18.5,
  roads: [
    ["station", "cafe", 1],
    ["station", "market", 1],
    ["cafe", "yard", 1],
    ["cafe", "club", 1],
    ["market", "club", 1],
    ["market", "docks", 1.5],
    ["yard", "roofs", 1],
    ["club", "roofs", 1.5],
    ["docks", "roofs", 1],
    ["roofs", "tower", 1],
  ],
  deadline: { hour: 30, name: "six in the morning", lost: "Down in the street the black car pulls out of the basement and turns toward the airfield. You are too late: Juno is gone." },
  companions: [
    { id: "rook", name: "Rook", card: "companion", who: "a bike courier Brant's men jumped, quick, wiry and fearless on a roof", stat: "grace", likes: "sneak", dislikes: "force" },
  ],
  loot: [
    { id: "card", name: "Nadia's card", card: "token", way: "talk", words: ["card", "nadia", "lou", "sent me"] },
    { id: "keycard", name: "the staff keycard", card: "key", way: "sneak", words: ["keycard", "key card", "staff card", "pass", "lanyard"] },
    { id: "cash", name: "the night shift's cash", card: "purse", way: "pay", words: ["cash", "envelope", "money", "night shift"] },
  ],
  stops: [
    {
      id: "cafe",
      name: "Nadia's Café",
      card: "host",
      kind: "person",
      teaser: "an all-night café by the station, where the night people talk",
      situation:
        "Nadia runs the all-night café across from the station, and nothing happens on this street she does not hear about. She saw a black van take a woman off the corner an hour ago, and she wants no trouble from Brant's people. Her coffee machine has died in the middle of the rush, and the queue is getting ugly. The back door opens onto the service alley.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 0, price: 1 } },
      levers: [
        { id: "machine", way: "talk", name: "her dead coffee machine", words: ["machine", "coffee", "espresso", "fix it", "help her"] },
        { id: "alley", way: "sneak", name: "the service alley out back", words: ["alley", "back door", "service", "out back"] },
      ],
      reward: { loot: "card", says: "On the counter by the till lies one of Nadia's cards, a name written on the back: Lou, on the club door. It goes in your pocket." },
    },
    {
      id: "market",
      name: "Market Street",
      card: "crowd",
      kind: "obstacle",
      teaser: "the night market, packed from wall to wall",
      situation:
        "The night market fills Market Street from wall to wall, and Brant's van went straight through it. The stalls are packed shoulder to shoulder under strings of bulbs. A delivery lane runs behind the stalls, half blocked with crates. A man is selling umbrellas out of a pram as the rain comes on, and for one supply he will walk you through.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "lane", way: "sneak", name: "the delivery lane behind the stalls", words: ["lane", "crates", "behind the stalls", "delivery"] },
        { id: "umbrellas", way: "pay", name: "the umbrella seller", words: ["umbrella", "umbrellas", "pram", "seller"] },
      ],
    },
    {
      id: "yard",
      name: "Brant's Scrapyard",
      card: "hound",
      kind: "fight",
      holds: 2,
      teaser: "a scrapyard where Brant keeps his dogs",
      situation:
        "Behind the scrapyard fence two of Brant's men have a bike courier pinned against a crushed car, and a big dog strains on its chain beside them. They see you. The yard is a maze of stacked wrecks, and the floodlight flickers on its pole. A tyre iron lies in the mud by the gate.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 1 } },
      levers: [
        { id: "light", way: "sneak", name: "the flickering floodlight", words: ["floodlight", "light", "flicker", "dark", "wrecks"] },
        { id: "iron", way: "force", name: "the tyre iron by the gate", words: ["tyre iron", "tire iron", "iron", "crowbar"] },
      ],
      reward: { joins: "rook", says: "The courier picks her bike up out of the mud and wipes her mouth. \"Rook,\" she says. \"They took my bag up to that tower. I know the roofs. I'm coming.\"" },
    },
    {
      id: "club",
      name: "The Velvet Room",
      card: "guardian",
      kind: "person",
      teaser: "a club where Brant's crew drinks, and a doorman who decides who goes in",
      situation:
        "The Velvet Room is where Brant's crew drinks, and Lou on the door decides who comes in. She is arguing into her earpiece with a manager who will not send her a break. Round the side, the kitchen door is propped open with a bin for the smokers. A staff keycard hangs from her belt. Getting on the list costs two supplies.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 2 } },
      levers: [
        { id: "earpiece", way: "talk", name: "her argument with the manager", words: ["manager", "earpiece", "break", "argument"] },
        { id: "kitchen", way: "sneak", name: "the propped kitchen door", words: ["kitchen", "side door", "bin", "smokers"] },
      ],
      reward: { loot: "keycard", says: "Somewhere between the door and the bar, the staff keycard ends up in your pocket. It opens the service lift in Brant's tower." },
    },
    {
      id: "docks",
      name: "The Dock Gate",
      card: "gate",
      kind: "obstacle",
      teaser: "the dock gate, the long way round by the river",
      situation:
        "The dock road is shut by a rolling gate, and the guard in the hut is watching football on his phone. The fence runs down into the river on both sides. A forklift is parked against the fence. He lets people through for one supply, and asks no questions.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "football", way: "talk", name: "the football on his phone", words: ["football", "match", "score", "phone", "game"] },
        { id: "forklift", way: "sneak", name: "the forklift by the fence", words: ["forklift", "climb", "over the fence"] },
      ],
      reward: { loot: "cash", says: "The night shift's envelope of cash is left lying in the hut window, and it goes with you." },
    },
    {
      id: "roofs",
      name: "The Fire Escape",
      card: "climb",
      kind: "obstacle",
      teaser: "the fire escapes up to the rooftops, the last way across",
      situation:
        "The last stretch to Brant Tower is across the rooftops, up a rusted fire escape in plain sight of a watcher on the next roof. A drainpipe runs up the dark side of the building, slick with rain. The watcher is cold and bored, and he keeps shaking an empty cigarette packet.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 1 } },
      levers: [
        { id: "pipe", way: "sneak", name: "the drainpipe on the dark side", words: ["drainpipe", "pipe", "dark side", "gutter"] },
        { id: "smokes", way: "pay", name: "his empty cigarette packet", words: ["cigarette", "cigarettes", "smoke", "packet", "lighter"] },
      ],
      weather: "wind",
    },
    {
      id: "tower",
      name: "Brant Tower",
      card: "keep",
      kind: "person",
      climax: true,
      holds: 2,
      teaser: "the tower",
      situation:
        "Brant Tower is all dark glass, and Juno is held on the top floor while a car waits in the basement. Brant himself is in his office with his phone, and only two of his men are awake at this hour. He holds her because she saw his books, and three supplies would buy him her silence. The service lift runs up from the loading bay, and the stairwell is dark.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 3 } },
      levers: [
        { id: "silence", way: "pay", name: "the price of her silence", words: ["silence", "hush", "deal", "settle", "pay him"] },
        { id: "lift", way: "sneak", name: "the service lift from the loading bay", words: ["service lift", "lift", "elevator", "loading bay", "basement"] },
      ],
      weather: "storm",
    },
  ],
  won: "You come out through the loading bay with Juno's hand in yours as the sky goes grey over the river. Behind you the tower is waking up. Ahead, the first train.",
};

export const CITY_COURTSHIP: Adventure = {
  id: "city-courtship",
  title: "Summer on Canal Street",
  trope: "courtship",
  goal:
    "Noor works the counter at Sol's Records, and she has had your heart since spring without once looking your way. Tonight is the canal festival, and when the last song plays on the Lido roof, people say what they mean. Dex, who plays bass in a band nobody has heard of, means to say it to her first.",
  who: "You are a courier who lives two streets from the canal: light on your feet, easy to like, no great fighter, and hopeless with sums.",
  seed: 29,
  places: [
    { id: "metro", name: "Canal Street Stop", u: 0.08, v: 0.6 },
    { id: "shop", name: "Sol's Records", u: 0.27, v: 0.34 },
    { id: "arcade", name: "The Pier Arcade", u: 0.28, v: 0.8 },
    { id: "boat", name: "The Boat Party", u: 0.5, v: 0.24 },
    { id: "towpath", name: "The Towpath", u: 0.52, v: 0.66 },
    { id: "stairs", name: "The Lido Stairs", u: 0.72, v: 0.46 },
    { id: "roof", name: "The Lido Roof", u: 0.9, v: 0.2 },
  ],
  start: "metro",
  startHour: 16.5,
  roads: [
    ["metro", "shop", 1],
    ["metro", "arcade", 1],
    ["shop", "boat", 1],
    ["shop", "towpath", 1.5],
    ["arcade", "towpath", 1],
    ["boat", "stairs", 1],
    ["towpath", "stairs", 1],
    ["stairs", "roof", 0.5],
  ],
  deadline: { hour: 25, name: "the last song", lost: "The band plays its last note, and the lights come up on the roof. By the rail, Noor is laughing at something Dex said. The moment has gone past you." },
  courted: { name: "Noor", card: "beloved", who: "the record-shop clerk, a woman of thirty with ink on her fingers and a laugh you can hear across the shop" },
  rival: { name: "Dex", card: "rival", who: "a bass player, handsome and sure of himself", max: 4, lost: "Dex has got there before you. Noor takes his hand, and they go up to the roof together." },
  companions: [],
  loot: [
    { id: "pin", name: "the enamel pin", card: "token", way: "talk", words: ["pin", "badge", "enamel", "moon"] },
    { id: "tickets", name: "the prize tickets", card: "purse", way: "pay", words: ["tickets", "prize", "winnings"] },
  ],
  stops: [
    {
      id: "shop",
      name: "Sol's Records",
      card: "beloved",
      kind: "person",
      teaser: "her shop",
      situation:
        "Noor is closing the record shop early for the festival, stacking crates of records by the door. A box of badges has spilled behind the counter, and she has not seen it. The crates need carrying out to the van, and they are heavy. She looks up at you, and then past you, at Dex leaning in the doorway.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, force: { difficulty: 1 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "badges", way: "talk", name: "the badges spilled behind the counter", words: ["badge", "badges", "spilled", "counter"] },
        { id: "crates", way: "force", name: "the heavy crates of records", words: ["crate", "crates", "carry", "lift", "records", "van"] },
      ],
      reward: { loot: "pin", says: "One of the spilled badges ends up on your jacket: an enamel moon. \"Keep it,\" Noor says. \"For luck, at the pier.\"" },
    },
    {
      id: "arcade",
      name: "The Pier Arcade",
      card: "contest",
      kind: "obstacle",
      teaser: "the strength tester at the pier, where everyone is watching",
      situation:
        "At the pier arcade a crowd is round the strength tester, and Noor's friends are watching. Dex has rung the bell already, twice. The hammer is heavy, and the machine sticks unless you hit it dead in the centre. The prize is a strip of tickets.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 2 }, force: { difficulty: 1 }, pay: { difficulty: 2, price: 1 } },
      levers: [
        { id: "centre", way: "force", name: "the sticking machine", words: ["centre", "center", "machine", "hammer", "bell", "sticks"] },
      ],
      reward: { loot: "tickets", says: "The tickets are yours, and so, for a moment, is everyone's attention." },
    },
    {
      id: "boat",
      name: "The Boat Party",
      card: "guardian",
      kind: "person",
      teaser: "the boat party, and her flatmate, who does not think much of you",
      situation:
        "Noor's flatmate Priya is holding court at the boat party, and she does not think much of couriers. She is losing an argument with the skipper about the music. Someone is clearing the deck for dancing, and the boat pushes off in a minute.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 3 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "music", way: "talk", name: "the argument about the music", words: ["music", "skipper", "argument", "playlist"] },
        { id: "deck", way: "talk", name: "the dancing on the deck", words: ["dance", "dancing", "deck"] },
      ],
    },
    {
      id: "towpath",
      name: "The Towpath",
      card: "crowd",
      kind: "obstacle",
      teaser: "the towpath, and the whole city on it",
      situation:
        "The whole city is on the towpath for the festival, and Noor is somewhere ahead in it. It is packed shoulder to shoulder between the water and the wall. There is a back way through the boatyard, if the gate is open. A woman is selling glow sticks from a cool box.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "boatyard", way: "sneak", name: "the back way through the boatyard", words: ["boatyard", "yard", "back way", "gate"] },
        { id: "glow", way: "pay", name: "the glow stick seller", words: ["glow", "glow stick", "sticks", "seller", "cool box"] },
      ],
    },
    {
      id: "stairs",
      name: "The Lido Stairs",
      card: "climb",
      kind: "obstacle",
      teaser: "the stairs up to the roof, and a steward turning people back",
      situation:
        "The stairs up to the Lido roof are roped off, and a steward with a clipboard is turning people back: the roof is full. An outside stair runs up past the changing rooms, wet from the pool. The steward is new, and nobody has brought her a drink all night. A wristband costs one supply.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "outside", way: "sneak", name: "the wet outside stair", words: ["outside stair", "outside", "changing rooms", "wet"] },
        { id: "drink", way: "talk", name: "the steward nobody has looked after", words: ["drink", "water", "steward", "clipboard"] },
      ],
    },
    {
      id: "roof",
      name: "The Lido Roof",
      card: "fire",
      kind: "person",
      climax: true,
      holds: 2,
      teaser: "the roof",
      situation:
        "On the Lido roof the fire pits are lit, and the city is all lights below. Noor stands a little apart at the rail, watching the canal, and for once she is alone. Dex is pushing through the crowd toward her with two drinks. The band is starting the last song, slow.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 3 }, force: { difficulty: 2 }, pay: { difficulty: 2, price: 1 } },
      levers: [
        { id: "song", way: "force", name: "the slow last song", words: ["song", "dance", "band", "music"] },
        { id: "lights", way: "talk", name: "the city lights below", words: ["lights", "city", "view", "canal", "rail"] },
      ],
    },
  ],
  won: "Noor turns from the rail and looks at you, properly, for the first time. Then she takes your hand, and Dex's two drinks are someone else's problem.",
};

export const ADVENTURES: Record<string, Adventure> = { rescue: RESCUE, courtship: COURTSHIP, "night-rescue": NIGHT_RESCUE, "city-courtship": CITY_COURTSHIP, tavern: TAVERN };
