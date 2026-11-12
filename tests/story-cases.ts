/**
 * Lines a player writes at a place in a story, each with what it is (game/storyroute.ts). The measure for the story
 * router's prompt: scripts/bench-route.ts asks the real models; tests/storyroute.test.ts checks the cases are well
 * formed. `ok` lists other answers that are fair too. Every line that goes wrong at the table goes here.
 */
import type { StoryContext, StoryRoute } from "../src/game/storyroute.js";
import type { Way } from "../src/engine/moment.js";

export interface StoryCase {
  line: string;
  ctx: keyof typeof STORY_CONTEXTS;
  want: StoryRoute;
  ok?: StoryRoute[];
  /** For try: the way it goes, when only one is fair. For work: the goal id. For send: the player. */
  which?: string;
}

const slips = ["The miller's daughter was seen at the north gate after curfew.", "Sergeant Holt swears nobody passed the north gate all night.", "Someone paid the night watch in silver to look the other way."];

export const STORY_CONTEXTS: Record<string, StoryContext> = {
  gate: {
    here: "the North Gate",
    situation: "The north gate of Harrowmere is shut for the night. Sergeant Holt, a heavy, tired man with a crossbow on his knees, sits in the gatehouse door and lets nobody out without the Order's seal. Torches gutter along the wall; there is a drainage culvert half-hidden in the reeds to the left, and a merchant's cart waits by the gate.",
    ways: ["talk", "sneak", "force", "pay"] as Way[],
    person: "Sergeant Holt",
    fellows: ["Vypra", "Stolas"],
    away: [],
    slips,
    goals: [],
    contest: false,
    luck: true,
  },
  brawl: {
    here: "the Rusty Anchor",
    situation: "A brawl has broken out in the Rusty Anchor: three dockhands with cudgels are coming at you across the overturned tables, and the barkeep has ducked out of sight. The door to the alley is behind you. What has just happened: the biggest dockhand swung at your head and smashed a chair.",
    ways: ["force", "sneak", "talk"] as Way[],
    fellows: ["Vypra"],
    away: [],
    slips: [],
    goals: [],
    contest: true,
    luck: false,
  },
  archive: {
    here: "the Sealed Archive",
    situation: "A locked iron door at the bottom of the chapel stairs, the Order's records behind it. Nobody is about; a lamp burns in a niche, and the lock is old and heavy. Somewhere above, footsteps cross the chapel floor now and then.",
    ways: ["sneak", "force"] as Way[],
    fellows: [],
    away: [],
    slips,
    goals: [{ id: "project-1", goal: "restore my family's old forge" }],
    contest: false,
    luck: true,
  },
  chapel: {
    here: "the Ruined Chapel",
    situation: "A roofless chapel in the woods, where Brother Anselm, an old monk with ink-stained fingers, keeps a fire and a few books. He knows the old roads and something about the girl, but he is wary of strangers. Stolas is with you; Vypra went off to scout the mill.",
    ways: ["talk", "pay"] as Way[],
    person: "Brother Anselm",
    fellows: ["Stolas"],
    away: ["Vypra"],
    slips: [],
    goals: [],
    contest: false,
    luck: true,
  },
};

export const STORY_CASES: StoryCase[] = [
  // ---- gone wrong at the table, or close to it ----
  { line: "I want to make a check to know if somebody is watching me", ctx: "gate", want: "check" },
  { line: "I lean on the gatehouse wall and tell the sergeant about the sea, the long grey swell of it, the gulls, and how I swore I'd never go back, and then I wait.", ctx: "gate", want: "speak", ok: ["say"] },
  { line: "I wait for the sergeant to doze off, then slip through the culvert.", ctx: "gate", want: "try", which: "sneak" },
  { line: "Vypra, you take this one: talk him round.", ctx: "gate", want: "try", which: "talk" },
  { line: "I pour the old monk a cup of my own wine, tell him it is from the hills where I was born, and wait.", ctx: "chapel", want: "speak", ok: ["favour"] },

  // ---- try ----
  { line: "I try to talk the sergeant into letting us out. We're pilgrims, late for the shrine.", ctx: "gate", want: "try", which: "talk" },
  { line: "I slip into the reeds and crawl through the culvert.", ctx: "gate", want: "try", which: "sneak" },
  { line: "I knock the crossbow out of his hands and shove past him.", ctx: "gate", want: "try", which: "force" },
  { line: "I press a silver coin into his palm. \"For your trouble, sergeant. We were never here.\"", ctx: "gate", want: "try", which: "pay" },
  { line: "We hide in the merchant's cart under the sacks and wait for it to go through.", ctx: "gate", want: "try", which: "sneak" },
  { line: "I show him a forged seal and tell him the Order sent us.", ctx: "gate", want: "try", which: "talk" },
  { line: "Can I roll to sneak past?", ctx: "gate", want: "try", which: "sneak" },
  { line: "Roll for it.", ctx: "gate", want: "try" },
  { line: "I pick the lock.", ctx: "archive", want: "try", which: "sneak" },
  { line: "I put my shoulder to the door until it gives.", ctx: "archive", want: "try", which: "force" },
  { line: "I slide my knife into the gap and work the old bolt back, listening for the footsteps above.", ctx: "archive", want: "try", which: "sneak" },
  { line: "I swing my cudgel at the biggest one.", ctx: "brawl", want: "try", which: "force" },
  { line: "I duck under the swing and bolt for the alley door.", ctx: "brawl", want: "try", ok: ["yield"] },
  { line: "I grab a bottle off the bar and smash it over his head.", ctx: "brawl", want: "try", which: "force" },
  { line: "\"Easy, lads, easy. Next round's on me, nobody needs to bleed tonight.\"", ctx: "brawl", want: "try", which: "talk" },
  { line: "I throw a chair at the one on the left and go for the one in the middle.", ctx: "brawl", want: "try", which: "force" },
  { line: "I try to convince Brother Anselm to show us the old road.", ctx: "chapel", want: "try", which: "talk" },
  { line: "I offer the monk a purse of silver for his map.", ctx: "chapel", want: "try", which: "pay", ok: ["favour"] },
  { line: "I lie and tell the sergeant I'm the magistrate's nephew.", ctx: "gate", want: "try", which: "talk", ok: ["speak"] },
  { line: "I sneak up behind him and snatch the keys from his belt.", ctx: "gate", want: "try", which: "sneak" },

  { line: "I lean against the wall, roll my aching shoulder, and tell whoever's in charge here about the last job I had, the caravan that never arrived, the three days I spent in the ditch afterwards, and then I wait.", ctx: "brawl", want: "say", ok: ["try", "wait"] },

  // ---- check ----
  { line: "I run my fingers along the shelves, feeling for a loose board or a hidden catch.", ctx: "archive", want: "check" },
  { line: "I search the dust on the floor for footprints.", ctx: "archive", want: "check" },
  { line: "I rack my brains: have I heard of Sergeant Holt before?", ctx: "gate", want: "check", ok: ["say"] },
  { line: "I watch the monk's hands while he talks. Is he nervous about something?", ctx: "chapel", want: "check", ok: ["sizeup"] },
  { line: "What can I see from here?", ctx: "gate", want: "look", ok: ["say"] },
  { line: "I make a dash for it, straight past the dockhands to the alley door.", ctx: "brawl", want: "try" },
  { line: "I make a perception check.", ctx: "archive", want: "check" },
  { line: "Can I roll to remember whose crest is on the sergeant's cloak?", ctx: "gate", want: "check" },
  { line: "I roll to see if I spot any traps on the stairs.", ctx: "archive", want: "check" },
  { line: "Let me roll Sense to see if the monk is hiding something.", ctx: "chapel", want: "check", ok: ["sizeup"] },
  { line: "I listen hard: is anyone coming down the stairs?", ctx: "archive", want: "check", ok: ["say", "luck", "look"] },

  // ---- stop ----
  { line: "done for tonight", ctx: "gate", want: "stop" },
  { line: "Okay, let's pick this up tomorrow, I need to sleep.", ctx: "brawl", want: "stop" },
  { line: "(OOC: I have to go, good night!)", ctx: "chapel", want: "stop" },
  { line: "We bed down by the monk's fire for the night.", ctx: "chapel", want: "wait", ok: ["say", "speak"] },

  // ---- say ----
  { line: "What does the sergeant look like?", ctx: "gate", want: "say" },
  { line: "How tall is the wall here?", ctx: "gate", want: "say", ok: ["look"] },
  { line: "Do I know anything about the Order's seal?", ctx: "gate", want: "say", ok: ["check"] },
  { line: "I tighten the straps on my pack and check my knife is loose in its sheath.", ctx: "gate", want: "say", ok: ["prepare"] },
  { line: "I whisper to Vypra: \"I don't like this. He's too awake.\"", ctx: "gate", want: "say", ok: ["talkover"] },
  { line: "How many of them are there?", ctx: "brawl", want: "say", ok: ["look"] },
  { line: "I shiver. It's cold down here, and the lamp smells of old fat.", ctx: "archive", want: "say" },
  { line: "What's the time?", ctx: "archive", want: "say" },
  { line: "I warm my hands at the monk's fire.", ctx: "chapel", want: "say", ok: ["speak"] },

  // ---- speak ----
  { line: "\"Evening, sergeant. Long night?\"", ctx: "gate", want: "speak" },
  { line: "I ask the sergeant if he's seen a girl come this way after curfew.", ctx: "gate", want: "speak" },
  { line: "I tell Holt a joke about the Order's inquisitor and see if he laughs.", ctx: "gate", want: "speak" },
  { line: "\"That's a fine crossbow. Did you make it yourself?\"", ctx: "gate", want: "speak" },
  { line: "I ask Brother Anselm what he knows about the girl.", ctx: "chapel", want: "speak" },
  { line: "I sit across the fire from the monk and ask him how long he's lived out here.", ctx: "chapel", want: "speak" },
  { line: "\"Brother, those books, are they yours? I've not seen hands like that since my mother's.\"", ctx: "chapel", want: "speak" },

  // ---- look ----
  { line: "I look round the gate for another way out.", ctx: "gate", want: "check", ok: ["say", "look"] },
  { line: "I search the stairwell for anything useful.", ctx: "archive", want: "check", ok: ["look"] },
  { line: "I examine the lock closely.", ctx: "archive", want: "check", ok: ["say", "look"] },
  { line: "I look around the chapel, at the books and the walls.", ctx: "chapel", want: "look" },

  // ---- luck ----
  { line: "Is there a ladder anywhere nearby?", ctx: "gate", want: "luck", ok: ["say", "look"] },
  { line: "Is the culvert grate rusted enough to pull loose?", ctx: "gate", want: "luck", ok: ["say", "look"] },
  { line: "Does the sergeant happen to be a man who drinks?", ctx: "gate", want: "luck", ok: ["say"] },
  { line: "Is there a key hidden somewhere down here, under a stone or above the lintel?", ctx: "archive", want: "luck", ok: ["look"] },
  { line: "Does Brother Anselm happen to have a horse?", ctx: "chapel", want: "luck", ok: ["speak", "say"] },

  // ---- press, read, favour ----
  { line: "I lean in close. \"You saw her. Don't lie to me. Tell me where she went.\"", ctx: "gate", want: "press" },
  { line: "I keep pressing him about the silver until he cracks.", ctx: "gate", want: "press" },
  { line: "\"Talk, old man, or I start feeding your books to the fire.\"", ctx: "chapel", want: "press", ok: ["try"] },
  { line: "Is he lying about nobody passing the gate?", ctx: "gate", want: "sizeup" },
  { line: "I watch his face while he answers. Can I trust him?", ctx: "gate", want: "sizeup" },
  { line: "Do I believe the monk?", ctx: "chapel", want: "sizeup" },
  { line: "\"What do you need, sergeant? There must be something.\"", ctx: "gate", want: "favour" },
  { line: "I ask Brother Anselm if there's anything I can do for him.", ctx: "chapel", want: "favour" },
  { line: "\"I could fix that roof for you, brother, if you'd help us.\"", ctx: "chapel", want: "favour", ok: ["try"] },

  // ---- wait, prepare ----
  { line: "I wait until midnight.", ctx: "gate", want: "wait" },
  { line: "We wait an hour and watch the gate.", ctx: "gate", want: "wait" },
  { line: "I settle into the shadows and watch the stairs for a while to see who comes down.", ctx: "archive", want: "wait" },
  { line: "We lay a trap on the stairs in case someone comes down.", ctx: "archive", want: "prepare" },
  { line: "Before we try anything, we plan it out: Stolas distracts him, Vypra watches the wall, I go for the culvert.", ctx: "gate", want: "prepare", ok: ["talkover"] },

  // ---- goal, work ----
  { line: "When this is over I want to build a proper shrine out here for travellers.", ctx: "chapel", want: "goal" },
  { line: "I want to become a knight of the Order one day.", ctx: "gate", want: "goal" },
  { line: "I spend an hour sketching plans for the forge while I wait.", ctx: "archive", want: "work", which: "project-1", ok: ["wait"] },

  // ---- compare ----
  { line: "I lay slips 1 and 2 side by side. They can't both be true.", ctx: "gate", want: "compare" },
  { line: "Hold on: the sergeant says nobody passed, but the girl was seen at this gate. Something doesn't add up.", ctx: "gate", want: "compare", ok: ["sizeup", "say"] },
  { line: "I compare what we heard about the silver with what Holt told us.", ctx: "archive", want: "compare" },

  // ---- the table ----
  { line: "Let's vote on it.", ctx: "gate", want: "vote" },
  { line: "Show of hands: talk, sneak, or fight our way out?", ctx: "gate", want: "vote" },
  { line: "What do you two think we should do?", ctx: "gate", want: "talkover" },
  { line: "Stolas, any ideas?", ctx: "chapel", want: "talkover" },
  { line: "We regroup with Vypra before going any further.", ctx: "chapel", want: "regroup" },
  { line: "Vypra, come back, we need you here.", ctx: "chapel", want: "regroup" },
  { line: "Stolas, go and scout the mill while I talk to the monk.", ctx: "chapel", want: "send", which: "Stolas" },
  { line: "Vypra, head back to the inn and keep watch on the inquisitor.", ctx: "gate", want: "send", which: "Vypra" },

  // ---- yield ----
  { line: "I drop my cudgel and put my hands up. \"Enough! I yield.\"", ctx: "brawl", want: "yield" },
  { line: "I give up. Let them have the bar.", ctx: "brawl", want: "yield" },
  { line: "I'm not giving up. I wipe the blood from my lip and go at him again.", ctx: "brawl", want: "try", which: "force" },
];

/** A line written at a fork, with the ways on offer (option id to what it is) and which one it takes. */
export interface ForkCase {
  line: string;
  fork: keyof typeof FORKS;
  want: string;
}

/** The question and options as the room asks them (game/roomtable.ts, fork). */
export const FORKS = {
  two: {
    question: "Which way do you go, left or right?",
    options: { left: "the card on the left: the Drowned Chapel, where the bells ring under the water", right: "the card on the right: the Smugglers' Stair, where someone is waiting with a lantern" },
  },
  hub: {
    question: "Which place do you go to?",
    options: { "1": "place 1 on the map: the Night Market, where a fence buys anything", "2": "place 2 on the map: the Archive, where the Order's records are kept", "3": "place 3 on the map: the Docks, where the ship from the south came in" },
  },
} as const;

export const FORK_CASES: ForkCase[] = [
  { line: "Left.", fork: "two", want: "left" },
  { line: "right", fork: "two", want: "right" },
  { line: "I take the chapel.", fork: "two", want: "left" },
  { line: "The one with the lantern, I think.", fork: "two", want: "right" },
  { line: "Bells under water? Absolutely not. The stairs.", fork: "two", want: "right" },
  { line: "Let's go and see who's waiting for us.", fork: "two", want: "right" },
  { line: "I'm curious about the drowned bells.", fork: "two", want: "left" },
  { line: "Whichever is quicker. Actually no, the smugglers.", fork: "two", want: "right" },
  { line: "Vypra wants the chapel, and I trust her nose for these things, so we go there.", fork: "two", want: "left" },
  { line: "Hmm, I don't like either of them. The second one, I guess.", fork: "two", want: "right" },
  { line: "the docks", fork: "hub", want: "3" },
  { line: "Let's check the records first.", fork: "hub", want: "2" },
  { line: "3", fork: "hub", want: "3" },
  { line: "I want to sell this ring before anyone recognises it.", fork: "hub", want: "1" },
  { line: "the first one", fork: "hub", want: "1" },
  { line: "Where the ship came in.", fork: "hub", want: "3" },
];
