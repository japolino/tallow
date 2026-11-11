/**
 * The tavern at midnight (docs/MOONSHOT.md, 1): the scene the moonshot was written for. A party in a high-fantasy
 * town; the barkeep knows more than she says; four masked people meet in the alley behind the tavern at midnight and
 * hand a box to a courier, who takes it to the chapel, where a lich's servant waits under the floor. Stop the courier
 * and the masked four come back to look for whoever did it. Everyone and everything in it is made up.
 *
 * It uses every system of the moonshot: a world kit with a seventh strength (Arcana), people with minds of their own,
 * clues that ink the map (one of them a lie), the other side's clock, two other players at the table, and foes who
 * outmatch a lone hero until the gap is closed.
 */
import type { Adventure } from "../engine/adventure.js";
import type { Clue } from "../engine/clues.js";
import { DEFAULT_CONTENT } from "../engine/content.js";
import { stockKit } from "../engine/kit.js";
import type { Person } from "../engine/people.js";
import type { Appointment } from "../engine/schedule.js";
import type { Fellow } from "../engine/seats.js";

const HESK: Person = {
  id: "hesk",
  name: "Hesk",
  voice: "dry, short, calls everyone 'love' and means none of it",
  look: "a broad woman with burn-scarred forearms, polishing the same cup",
  wants: "her brother back from the chapel crypt, where he went digging for the bishop and never came up",
  fears: "the masked ones, who drink here and pay too well",
  likes: ["honesty", "food", "courage"],
  dislikes: ["flattery", "threats"],
  attitude: "wary",
  resolve: 2,
  knows: [
    { clue: "hesk-masks", at: "open" },
    { clue: "hesk-midnight", at: "guarded" },
    { clue: "hesk-brother", at: "secret" },
  ],
  sense: 2,
  age: "adult",
};

const PELL: Person = {
  id: "pell",
  name: "Old Pell",
  voice: "warm and quick, too quick, laughs before the joke",
  look: "a little man in three coats, rings on every finger",
  wants: "the masked ones' custom kept, and his name kept out of it",
  fears: "the watch, and the thing under the chapel more",
  likes: ["coin", "gossip", "trade"],
  dislikes: ["honesty", "faith"],
  attitude: "friendly",
  resolve: 2,
  knows: [
    { clue: "pell-river", at: "open" },
    { clue: "pell-sigil", at: "guarded" },
  ],
  lie: { clue: "pell-river", truth: "watch-chapel", skill: 2, why: "the masked ones pay him to send snoops the wrong way" },
  sense: 1,
  age: "adult",
};

/** What there is to find out: who the masked four are, how the box gets where it goes, where the lich's servant will be. */
export const TAVERN_CLUES: Clue[] = [
  // Key 0: who they are.
  { id: "hesk-masks", text: "The masked ones drink here: four of them, bone masks, and one wears the bishop's ring under a glove.", key: 0, from: { person: "hesk" } },
  { id: "pell-sigil", text: "Pell sold them wax with a sigil: a crowned skull, the old mark of the abbey under the chapel.", key: 0, from: { person: "pell" }, points: "the chapel" },
  { id: "alley-mask", text: "A bone mask dropped in the alley mud, the bishop's seal pressed inside it.", key: 0, from: { place: "alley" } },
  // Key 1: how it is done.
  { id: "hesk-midnight", text: "At midnight they meet in the alley behind the tavern, and a courier takes something from them.", key: 1, from: { person: "hesk" }, tells: "meet", points: "the alley" },
  { id: "alley-box", text: "A lead-lined box, too heavy for its size, cold to the touch: something is carried in it, not kept.", key: 1, from: { place: "alley" } },
  { id: "watch-courier", text: "The night watch has seen a courier with a heavy box go up the chapel steps three nights running.", key: 1, from: { place: "watch" }, tells: "courier" },
  // Key 2: where it will be.
  { id: "hesk-brother", text: "Hesk's brother went down into the crypt under the chapel for the bishop, and never came up.", key: 2, from: { person: "hesk" }, points: "the chapel" },
  { id: "watch-chapel", text: "The box goes to the chapel, and down: the crypt door is new iron, and it is warm.", key: 2, from: { place: "watch" }, against: ["pell-river"], tells: "chapel" },
  { id: "pell-river", text: "Pell swears the box goes down to the river, to a boat bound for the coast.", key: 2, false: true, truth: "watch-chapel", from: { person: "pell" }, points: "the river docks" },
  { id: "crypt-warm", text: "The crypt is warm as breath, and the bones in its niches have been moved.", key: 2, from: { place: "crypt" } },
];

/** The other side's clock: the meeting, the courier, the chapel, and what they do if you get in the way. */
export const TAVERN_CLOCK: Appointment[] = [
  { id: "meet", at: 24, where: "alley", what: "the four masked ones meet behind the tavern, in the rain", who: ["the masked four"], lasts: 0.5 },
  { id: "courier", at: 24.5, where: "alley", what: "a courier takes a lead-lined box from them and goes off toward the chapel", needs: ["meet"], lasts: 0.25 },
  { id: "chapel", at: 25.5, where: "crypt", what: "the box reaches the crypt, and something under the floor drinks from it", needs: ["courier"], otherwise: "lookout", front: true },
  { id: "lookout", at: 25.5, where: "taproom", what: "one of the masked ones comes back to the tavern to find whoever got in the way" },
  { id: "close", at: 26, where: "taproom", what: "Hesk calls last orders and bars the door", daily: true },
];

/** Two other players at the table. */
export const TAVERN_FELLOWS: Fellow[] = [
  {
    id: "brannoc",
    name: "Brannoc",
    who: "a sellsword with a broken nose and a good laugh, who would rather kick the door in",
    style: "brawler",
    stats: { brawn: 3, grace: 2, charm: 1, guile: 0, wits: 1, sense: 2 },
    fault: "never backs down from a fight",
    want: "a fight worth telling about",
    wantWords: ["fight", "masked", "blade", "door"],
    attitude: "friendly",
    toward: { ysolde: "friendly" },
    lastSpoke: -1,
    overruled: 0,
    age: "adult",
  },
  {
    id: "ysolde",
    name: "Ysolde",
    who: "a wizard in an ink-stained coat, who plans everything twice",
    style: "planner",
    stats: { brawn: 0, grace: 1, charm: 1, guile: 1, wits: 3, sense: 2, power: 3 },
    powerName: "Arcana",
    fault: "cannot leave a mystery alone",
    want: "to know what the box is",
    wantWords: ["box", "sigil", "crypt", "lich", "wax"],
    attitude: "wary",
    toward: { brannoc: "friendly" },
    lastSpoke: -1,
    overruled: 0,
    age: "adult",
  },
];

export const TAVERN: Adventure = {
  id: "tavern",
  title: "Midnight at the Crowned Skull",
  trope: "rescue",
  kind: "mystery",
  goal:
    "Something is wrong in Varrow. People go missing near the chapel, the bishop has stopped preaching, and four people in bone masks drink at the Crowned Skull and pay in old abbey silver. Find out what they carry, and stop it before dawn.",
  who: "You are one of a party of three adventurers, new in town, with a room at the Crowned Skull and not much coin.",
  seed: 31,
  places: [
    { id: "room", name: "Your room upstairs", u: 0.1, v: 0.84 },
    { id: "taproom", name: "The Taproom", u: 0.26, v: 0.66 },
    { id: "market", name: "The Night Market", u: 0.44, v: 0.82 },
    { id: "alley", name: "The Alley", u: 0.42, v: 0.46 },
    { id: "watch", name: "The Watch House", u: 0.62, v: 0.66 },
    { id: "crypt", name: "The Chapel Crypt", u: 0.86, v: 0.2 },
  ],
  start: "room",
  startHour: 21,
  roads: [
    ["room", "taproom", 0.25],
    ["taproom", "alley", 0.25],
    ["taproom", "market", 0.5],
    ["market", "watch", 0.5],
    ["alley", "watch", 0.5],
    ["alley", "crypt", 1],
    ["watch", "crypt", 1],
  ],
  deadline: { hour: 30, name: "dawn", lost: "The bells ring for dawn, and under the chapel something sits up in the dark. You are too late." },
  companions: [],
  loot: [
    { id: "mask", name: "a bone mask", card: "token", way: "sneak", words: ["mask", "bone mask", "disguise"] },
    { id: "pass", name: "the watch-captain's pass", card: "key", way: "talk", words: ["pass", "captain", "warrant"] },
  ],
  stops: [
    {
      id: "taproom",
      name: "The Taproom",
      card: "host",
      kind: "person",
      teaser: "the taproom below, where the barkeep hears everything",
      situation:
        "The taproom of the Crowned Skull is half full and smoky. Hesk, the barkeep, polishes a cup and watches the door. In the corner booth, four people in plain cloaks drink without talking; one keeps a gloved hand on the table. The back door to the alley is barred, and the bar is off its hook.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, force: { difficulty: 2 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "brother", way: "talk", name: "Hesk's missing brother", words: ["brother", "missing", "crypt"] },
        { id: "backdoor", way: "sneak", name: "the back door to the alley", words: ["back door", "alley door", "bar is off"] },
      ],
      notices: [
        { id: "ring", stat: "sense", at: 2, says: "one of the four wears a ring under the glove: a bishop's ring" },
        { id: "silver", stat: "wits", at: 2, says: "they pay in old abbey silver, a hundred years out of use" },
      ],
      person: HESK,
      reward: { says: "Hesk nods you toward the back door. \"If you're going out there, love, go now.\"" },
    },
    {
      id: "market",
      name: "The Night Market",
      card: "keeper",
      kind: "person",
      teaser: "the night market, where Old Pell sells anything to anyone",
      situation:
        "Lanterns sway over the stalls of the night market. Old Pell sits among candles and wax and charms, three coats deep, rings on every finger. He sees you coming and laughs before you speak. Behind his stall a curtain hides a second table where the better things are kept.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 2 }, pay: { difficulty: 0, price: 1 } },
      levers: [
        { id: "wax", way: "pay", name: "the sigil wax he sold", words: ["wax", "sigil", "seal"] },
        { id: "curtain", way: "sneak", name: "the curtain behind his stall", words: ["curtain", "second table", "behind the stall"] },
      ],
      person: PELL,
    },
    {
      id: "alley",
      name: "The Alley",
      card: "ambush",
      kind: "fight",
      holds: 2,
      teaser: "the alley behind the tavern, where someone meets at midnight",
      situation:
        "The alley behind the Crowned Skull is narrow and wet, lit by one lamp over the back door. Crates are stacked against the wall, and a grate in the cobbles breathes cold air up from the old drains. Whoever comes here at midnight comes for a reason.",
      ways: { talk: { difficulty: 2 }, sneak: { difficulty: 1 }, force: { difficulty: 2 } },
      levers: [
        { id: "crates", way: "sneak", name: "the stacked crates", words: ["crates", "behind the crates", "hide"] },
        { id: "lamp", way: "force", name: "the lamp over the door", words: ["lamp", "light", "darkness"], edge: true },
      ],
      foe: { name: "the masked four", ratings: { force: 3, talk: 2, sneak: 1 }, hurtBy: ["fire", "light", "holy"], scale: "squad", breaks: 0.5 },
      reward: { loot: "mask", says: "One of them drops a bone mask as they scatter. It is warm, and it smells of incense." },
      weather: "rain",
    },
    {
      id: "watch",
      name: "The Watch House",
      card: "sentries",
      kind: "obstacle",
      teaser: "the watch house, where tired guards keep a log of the night",
      situation:
        "The watch house is a squat tower with a fire inside and a log book on a lectern. The captain is asleep in his chair; a young guard reads by the fire. The log is open to tonight's page, and the captain's pass hangs on a nail by the door.",
      ways: { talk: { difficulty: 1 }, sneak: { difficulty: 1 }, pay: { difficulty: 1, price: 1 } },
      levers: [
        { id: "log", way: "talk", name: "the log book on the lectern", words: ["log", "book", "lectern", "records"] },
        { id: "nail", way: "sneak", name: "the pass on its nail", words: ["pass", "nail", "by the door"] },
      ],
      reward: { loot: "pass", says: "The captain's pass comes with you. Nobody stops a pass with that seal on it." },
    },
    {
      id: "crypt",
      name: "The Chapel Crypt",
      card: "keep",
      kind: "fight",
      climax: true,
      holds: 3,
      teaser: "the chapel, and what is under it",
      situation:
        "Under the chapel the crypt is warm as breath. Candles burn in the niches where the bones have been moved aside. At the far end, in the bishop's robes, something too thin to be alive stands over a lead-lined box, and it turns its head toward you. Its servants' masks hang on the wall like faces.",
      ways: { talk: { difficulty: 3 }, sneak: { difficulty: 2 }, force: { difficulty: 2 } },
      levers: [
        { id: "candles", way: "force", name: "the candles in the niches", words: ["candles", "fire", "burn"], edge: true },
        { id: "box", way: "sneak", name: "the lead-lined box", words: ["box", "lead", "steal the box"] },
      ],
      foe: { name: "the lich's servant", ratings: { force: 3, talk: 4, sneak: 2 }, hurtBy: ["holy", "fire", "silver"], scale: "person" },
      weather: "storm",
    },
  ],
  won: "The thing in the bishop's robes comes apart into ash and old cloth, and the box cracks open on nothing. Above you the chapel bell starts ringing on its own. In the taproom, Hesk pours three cups and does not charge you.",
  kit: stockKit("high-fantasy", DEFAULT_CONTENT),
  clues: TAVERN_CLUES,
  appointments: TAVERN_CLOCK,
  fellows: TAVERN_FELLOWS,
};
