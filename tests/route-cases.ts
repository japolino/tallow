/**
 * Lines a player writes in free form, each with what it is (game/route.ts). The measure for the router's prompt:
 * scripts/bench-route.ts asks the real models; tests/route.test.ts checks the cases are well formed. `ok` lists other
 * answers that are fair too, for lines that could go either way. Every line that went wrong at the table goes here.
 */
import type { Route, RouteContext } from "../src/game/route.js";

export interface RouteCase {
  line: string;
  ctx: keyof typeof CONTEXTS;
  want: Route;
  ok?: Route[];
  /** For go: the known place, or "new". For thread or work: the id. */
  which?: string;
}

const harrow = {
  threads: [
    { id: "thread-1", said: "A woodsman outside the walls swears he saw a girl from the town led into Hollowfang Wood at dusk, and the Order will not open the gate for him." },
    { id: "thread-2", said: "Someone has been leaving chalk marks on the chapel door at night, and the inquisitor means to find out who." },
  ],
};

export const CONTEXTS: Record<string, RouteContext> = {
  forest: {
    here: "Hollowfang Wood",
    situation: "Here: A dark forest of twisted pines, mist low on the ground, and somewhere in the trees, soft giggling that stops whenever you stop. What has just happened: The player: I step off the path and into the trees. Then: The light goes green and dim, and from somewhere above you comes a giggle, then another, from a different side.",
    places: ["the Coiled Kettle", "the river gate"],
    ...harrow,
    goals: [],
  },
  inn: {
    here: "the Coiled Kettle",
    situation: "Here: A low, smoky inn by the river gate, full of Order men off duty and travellers who missed the bells, with a lamia innkeeper coiled behind the bar.",
    places: ["the river gate", "the chapel"],
    ...harrow,
    goals: [],
  },
  gate: {
    here: "the river gate",
    situation: "Here: The river gate is shut and barred, a single lantern swinging over the grille. Through the bars a big grey-bearded woodsman grips the iron. What has just happened: The player: I talk to the woodsman through the grille. Then: \"A girl,\" he says. \"Miller's daughter. Something with wings led her into Hollowfang at dusk.\"",
    places: ["the Coiled Kettle", "the chapel"],
    ...harrow,
    goals: [],
  },
  bar: {
    here: "the Byte Bar on Ninth Street",
    situation: "Here: A neon-lit dive bar in a rain-soaked city, a bouncer with chrome arms at the back door, a bartender wiping glasses, and a woman in a red coat alone at the end of the bar.",
    places: ["your apartment", "the night market under the bridge"],
    threads: [{ id: "thread-1", said: "A courier went missing two nights ago carrying a data chip somebody badly wants back." }],
    goals: [{ id: "project-1", goal: "open a noodle stall in the night market" }],
  },
  home: {
    here: "your cottage",
    situation: "Here: A small stone cottage at the edge of the village, a fire in the hearth, your tools by the door.",
    places: ["the village square", "the mill"],
    threads: [],
    goals: [{ id: "project-1", goal: "breed a line of hardy mountain goats" }, { id: "project-2", goal: "build a watermill on the stream" }],
  },
};

export const CASES: RouteCase[] = [
  // ---- said at the table and gone wrong ----
  { line: "I want to make a check to know if somebody is watching me", ctx: "forest", want: "try" },
  { line: "I go back out to the gate and talk to the woodsman outside the walls through the grille. What did you see?", ctx: "inn", want: "go", which: "the river gate", ok: ["say"] },
  { line: "I talk to the woodsman. What exactly did you see out there?", ctx: "gate", want: "say" },
  { line: "I lean on the bar and tell the keeper about the sea, the long grey swell of it, the gulls, the salt in everything, and how I swore I'd never go back, and then I smile at her.", ctx: "inn", want: "say" },
  { line: "I pour the keeper a cup of my own wine, tell her it is from the hills where I was born, and wait.", ctx: "inn", want: "say" },

  // ---- say or do ----
  { line: "I look around the room.", ctx: "inn", want: "say" },
  { line: "\"Evening,\" I say to the innkeeper, sliding onto a stool. \"What's good tonight?\"", ctx: "inn", want: "say" },
  { line: "I order a drink and sit near the fire.", ctx: "inn", want: "say" },
  { line: "I ask the Order men at the long table if they've heard anything about the chalk marks.", ctx: "inn", want: "say" },
  { line: "I wink at the lamia and ask her what a nice snake like her is doing in a place like this.", ctx: "inn", want: "say" },
  { line: "I sit down next to the woman in the red coat and ask if the seat's taken.", ctx: "bar", want: "say" },
  { line: "I listen to the giggling. Where is it coming from?", ctx: "forest", want: "say", ok: ["try"] },
  { line: "I call out into the trees: \"I know you're there. Come out, I won't hurt you.\"", ctx: "forest", want: "say" },
  { line: "I keep walking deeper into the wood, one hand on my sword.", ctx: "forest", want: "say", ok: ["go"] },
  { line: "I crouch and look at the ground for tracks.", ctx: "forest", want: "say", ok: ["try"] },
  { line: "I take off my wet cloak and hang it by the fire, then rub my hands together to get the feeling back.", ctx: "inn", want: "say" },
  { line: "I tell the woodsman I'll see what I can do, and ask him the girl's name.", ctx: "gate", want: "say", ok: ["thread"] },
  { line: "What does the woodsman look like?", ctx: "gate", want: "say" },
  { line: "I hand the bartender a twenty and ask what she knows about the missing courier.", ctx: "bar", want: "say", ok: ["try"] },
  { line: "I check my gear.", ctx: "inn", want: "say" },
  { line: "I check the door to see if it's locked.", ctx: "inn", want: "say" },
  { line: "I make myself a cup of tea and sit by the fire, thinking about the goats.", ctx: "home", want: "say" },
  { line: "She is beautiful in the lamplight, and I tell her so, quietly, and ask whether she ever gets tired of this town.", ctx: "inn", want: "say" },
  { line: "I kiss her.", ctx: "bar", want: "say", ok: ["try"] },
  { line: "Can you describe the chapel to me?", ctx: "inn", want: "say" },
  { line: "I want to see what the chalk marks look like, so I ask the innkeeper if she's seen them.", ctx: "inn", want: "say" },
  { line: "I want to find out who is giggling, so I follow the sound.", ctx: "forest", want: "say", ok: ["try", "go"] },
  { line: "I hum an old marching song to keep my spirits up as I walk.", ctx: "forest", want: "say" },

  // ---- try ----
  { line: "I make a perception check.", ctx: "forest", want: "try" },
  { line: "Can I roll to see if I notice anything?", ctx: "forest", want: "try" },
  { line: "Roll for it.", ctx: "forest", want: "try" },
  { line: "I'd like to roll stealth to slip past the bouncer.", ctx: "bar", want: "try" },
  { line: "I try to sneak past the bouncer to the back door.", ctx: "bar", want: "try" },
  { line: "I ask the bouncer to let me through the back door.", ctx: "bar", want: "try" },
  { line: "I pick the lock on the chapel door.", ctx: "inn", want: "try" },
  { line: "I draw my sword and attack whatever's giggling in the trees.", ctx: "forest", want: "try" },
  { line: "I try to convince the guards to open the gate for the woodsman.", ctx: "gate", want: "try" },
  { line: "I climb the wall to get out of town without the guards seeing.", ctx: "gate", want: "try", ok: ["go"] },
  { line: "I lie and tell the inquisitor I'm a pilgrim from the south.", ctx: "inn", want: "try" },
  { line: "I swipe the purse off the drunk Order man's belt while he's laughing.", ctx: "inn", want: "try" },
  { line: "I punch him.", ctx: "bar", want: "try" },
  { line: "I haggle the bartender down on the price of the room.", ctx: "inn", want: "try" },
  { line: "I try to spot who's watching me without letting on that I've noticed.", ctx: "forest", want: "try" },
  { line: "I want to test if the lamia is lying to me.", ctx: "inn", want: "try" },
  { line: "I run for it, back toward the path, as fast as I can.", ctx: "forest", want: "try", ok: ["go"] },
  { line: "I grab the chrome-armed bouncer's wrist and twist it behind his back.", ctx: "bar", want: "try" },
  { line: "I hide behind a tree and hold my breath until whatever it is passes.", ctx: "forest", want: "try" },
  { line: "Let me roll to see if I can pick up the trail.", ctx: "forest", want: "try" },

  // ---- go ----
  { line: "I head to the chapel.", ctx: "inn", want: "go", which: "the chapel" },
  { line: "I go home.", ctx: "bar", want: "go", which: "your apartment" },
  { line: "I go back to the Coiled Kettle.", ctx: "forest", want: "go", which: "the Coiled Kettle" },
  { line: "I leave the bar and walk down to the night market under the bridge.", ctx: "bar", want: "go", which: "the night market under the bridge" },
  { line: "I head out to the docks.", ctx: "bar", want: "go", which: "new" },
  { line: "I walk to the blacksmith's at the end of the street.", ctx: "inn", want: "go", which: "new" },
  { line: "I leave.", ctx: "inn", want: "go", which: "new" },
  { line: "I finish my drink, toss a coin on the bar, and step out into the rain toward the old cathedral.", ctx: "bar", want: "go", which: "new" },
  { line: "Let's go to the mill.", ctx: "home", want: "go", which: "the mill" },
  { line: "I go into Hollowfang Wood.", ctx: "gate", want: "go", which: "new", ok: ["try"] },

  // ---- rest and wait ----
  { line: "I get a room and sleep.", ctx: "inn", want: "rest" },
  { line: "I rest for a few hours.", ctx: "home", want: "rest" },
  { line: "I bed down under a tree for the night.", ctx: "forest", want: "rest" },
  { line: "I wait until morning.", ctx: "inn", want: "wait", ok: ["rest"] },
  { line: "I wait an hour and see who comes in.", ctx: "bar", want: "wait", ok: ["say"] },
  { line: "I sit and wait for nightfall.", ctx: "home", want: "wait" },

  // ---- goal ----
  { line: "I want to open a bakery in this town.", ctx: "inn", want: "goal" },
  { line: "Let's train an army of ants.", ctx: "home", want: "goal" },
  { line: "I've decided I'm going to build my own tavern, right here by the gate.", ctx: "inn", want: "goal" },
  { line: "I want to become a knight of the Order.", ctx: "inn", want: "goal" },
  { line: "I want to start a smuggling ring out of the night market.", ctx: "bar", want: "goal" },
  { line: "I want to find the girl.", ctx: "gate", want: "thread", which: "thread-1", ok: ["say", "try"] },
  { line: "I want to make him talk.", ctx: "bar", want: "try", ok: ["say"] },

  // ---- work ----
  { line: "I spend the day working on the watermill.", ctx: "home", want: "work", which: "project-2" },
  { line: "I go out and tend the goats for a few hours.", ctx: "home", want: "work", which: "project-1", ok: ["go"] },
  { line: "I put in some hours on the noodle stall.", ctx: "bar", want: "work", which: "project-1" },

  // ---- thread ----
  { line: "I'll look into the missing girl.", ctx: "inn", want: "thread", which: "thread-1" },
  { line: "Alright. I'm taking the job: I'll find out who's leaving those chalk marks.", ctx: "inn", want: "thread", which: "thread-2" },
  { line: "Fine, I'll find your courier and the chip.", ctx: "bar", want: "thread", which: "thread-1" },
  { line: "Thread 2.", ctx: "inn", want: "thread", which: "thread-2" },
  { line: "What's this about chalk marks?", ctx: "inn", want: "say" },

  // ---- settings ----
  { line: "No gore please, keep that off-screen.", ctx: "inn", want: "settings" },
  { line: "(OOC: can we turn the explicit stuff off for now?)", ctx: "bar", want: "settings" },
  { line: "Let's keep torture out of the story entirely.", ctx: "forest", want: "settings" },

  // ---- notebook and done ----
  { line: "notebook", ctx: "inn", want: "notebook" },
  { line: "What do I know so far?", ctx: "inn", want: "notebook", ok: ["say"] },
  { line: "(OOC: can you remind me which places I've been to?)", ctx: "forest", want: "notebook" },
  { line: "Show me the notebook.", ctx: "bar", want: "notebook" },
  { line: "I'm done for tonight.", ctx: "inn", want: "done" },
  { line: "Let's stop here, I need to sleep.", ctx: "bar", want: "done", ok: ["rest"] },
  { line: "Okay that's enough for today, good night!", ctx: "home", want: "done" },
  { line: "I'm done with this conversation and walk away from him.", ctx: "bar", want: "say", ok: ["go"] },
];
