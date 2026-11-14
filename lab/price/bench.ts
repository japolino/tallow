/**
 * Measures the reader on a fixed table: the same lines, each with what a fair reading must and must not say.
 *
 *   bun --env-file=.env.local lab/price/bench.ts [model ids, comma separated; "strong" and "fast" are the configured ones]
 *
 * It scores what matters to play: an inventive line that would work is not refused, a wrong or empty line earns
 * nothing, what the player wrote as done is taken as done, and a reach for something lasting becomes a want.
 */
import { addCard, addWant, arrive, newState, type Ruling, type State } from "./engine.js";
import { json, read, refine, type Ask, type World } from "./minds.js";

const env = process.env;
const world: World = {
  world: "Harrowmere, a drowned canal city. Every lock has a keeper and every keeper answers to the Toll Magistrate, who taxes anything that floats or sells. The old river's spirits still take bargains: they give what is asked and keep something back. Guild cooks hold every licensed pitch; unlicensed stalls get tipped into the canal.",
  who: "Wren, a broke noodle cook with a handcart, a quick tongue and no skill at fighting. She left the Guild kitchens after a row with her old master, Chef Odalric.",
  premise: "I want to open my own noodle stand at the foot of the Tide Tower, where the lock crews eat.",
};

function fixed(): State {
  const s = newState(3);
  arrive(s, "The Sluice-Foot at the Tide Tower", "Shift-change bells are ringing and soaked lock-hands are coming down the ladders hungry.");
  addCard(s, "you", { name: "Battered Handcart", kind: "thing", text: "A copper broth-kettle, noodle racks and a charcoal brazier: fifty bowls before it runs dry.", catch: "Its wheel screeches on wet stone and it is too heavy to run with." }); // c1
  addCard(s, "you", { name: "Quick Tongue", kind: "trait", text: "She can talk a suspicious guard round and spin a story out of mist.", catch: "Her mouth makes promises she then has to keep." }); // c2
  addCard(s, "you", { name: "Crock of Odalric's Black Vinegar", kind: "thing", text: "Stolen from her old master; it turns canal scraps into rich broth, and the river spirits crave it.", catch: "Its reek is proof of Guild larceny." }); // c3
  addCard(s, "you", { name: "Seven Years of Guild Training", kind: "trait", text: "She knows every broth, shortcut and delivery schedule in the city.", catch: "Every licensed cook knows her face, and Odalric has a bounty on her." }); // c4
  addCard(s, "you", { name: "Cat's Body", kind: "trait", text: "Ears, a tail, wharf-cat balance: she climbs wet stone and lands on her feet from any height.", catch: "She tastes only mud now." }); // c5
  addCard(s, "here", { name: "Lockmaster Brant", kind: "tie", text: "A veteran keeper with a sour stomach who can let an unlicensed kettle stand if his belly is soothed; he fears the Magistrate's audit above all.", catch: "He expects a skim, and his word lasts until the Magistrate's barge docks." }, null); // c6
  addCard(s, "here", { name: "The Drowned Altar", kind: "thing", text: "A river shrine where hot broth and eel fat poured into the water draws the spirits of the silt to bargain.", catch: "They always keep something back." }, 1); // c7
  addCard(s, "here", { name: "The Guild Bailiff's Patrol-Skiff", kind: "fact", text: "A lantern-lit skiff that sweeps the piers every two bells, hunting unlicensed fires and anyone making trouble on the quay.", catch: "Smoke and steam draw it." }, null); // c8
  addWant(s, "you", { name: "A Pitch at the Tide Tower", text: "A place of her own where the lock crews eat.", size: 3, terms: ["The lock authority's leave to stand there", "A fire and supplies the Guild cannot cut off", "The river-thing under the tower left content"] }); // w9
  addWant(s, "them", { name: "Odalric's Cart-Breakers", text: "Two dock toughs with iron-tipped oars are working down the quay toward her cart.", size: 2, terms: ["To smash her cart and her hands, as Odalric paid them to"], bite: "They break the cart and her fingers." }); // x10
  return s;
}

type Check = (r: Ruling) => string | null;
const pts = (r: Ruling, on: string | RegExp): number => (r.plays ?? []).filter((p) => (typeof on === "string" ? p.on === on : on.test(String(p.on)))).reduce((n, p) => n + (p.fit === "full" ? 2 : p.fit === "part" ? 1 : 0) + (p.give && p.fit !== "none" ? 1 : 0), 0);
const anyPts = (r: Ruling): number => pts(r, /./);
const said = (r: Ruling): string[] => (r.declared ?? []).map((d) => String(typeof d === "string" ? d : d?.term));
const want = "w9", t1 = "w9.1", t3 = "w9.3", x = /^x10/;
const nothing: Check = (r) => (anyPts(r) ? `earned ${anyPts(r)} for nothing` : said(r).length ? "took an attempt as done" : null);

const cases: { line: string; ok: Check }[] = [
  { line: "I sneak past the toll men.", ok: nothing },
  { line: "I use my lovely new tail to convince the Magistrate to give me a licence.", ok: (r) => (pts(r, t1) ? "a tail earned the authority's leave" : said(r).includes(t1) ? "took an attempt as done" : null) },
  { line: "I tell the toughs, very eloquently and at great length, that violence is beneath them and they ought to go home.", ok: (r) => (pts(r, x) >= 2 ? "fine words alone ended the trouble" : said(r).some((d) => x.test(d)) ? "took an attempt as done" : null) },
  { line: "I smash my vinegar crock on the ground in frustration.", ok: nothing },
  { line: "I pull my scarf up over my nose against the eel smoke.", ok: (r) => (anyPts(r) ? "earned points for nothing" : r.wish ? "a scarf became a want" : null) },
  { line: "I ask Brant what he makes of Odalric.", ok: nothing },
  { line: "I ladle Brant a bowl, soured just right with the black vinegar to settle his stomach, and ask him to let my kettle stand here.", ok: (r) => (pts(r, t1) >= 1 ? null : "soothing Brant's belly earned nothing toward his leave") },
  { line: "I pour a cup of hot broth and eel fat into the water at the altar and ask the river-thing to leave my pitch be.", ok: (r) => (pts(r, t3) >= 1 ? null : "an offering at the altar earned nothing with the river-thing") },
  { line: "I throw the whole crock of black vinegar into the canal as an offering to the river-thing under the tower.", ok: (r) => (pts(r, t3) >= 2 && (r.plays ?? []).some((p) => p.give) ? null : "a sacrifice the spirits crave was not counted as given") },
  { line: "I climb the tower wall where the toughs cannot follow and haul my lantern up after me.", ok: (r) => (pts(r, x) >= 1 ? null : "climbing out of reach did nothing about the toughs") },
  { line: "I whistle up the bailiff's skiff and point it at the two men with oars loitering by an unlicensed fire.", ok: (r) => (pts(r, x) >= 1 ? null : "setting the bailiffs on the toughs earned nothing") },
  { line: "I feed Odalric's black vinegar to the spirits at the altar so they boil the spillway into a geyser of steam that knocks the toughs flat.", ok: (r) => (pts(r, x) >= 1 ? null : "an inventive use that makes sense was refused") },
  { line: "The toughs take one look at the bailiff's lanterns and run. They do not come back tonight.", ok: (r) => (said(r).some((d) => x.test(d)) ? null : "an outcome written as done was not taken as done") },
  { line: "Some days later the stand is open, and the lock crews queue at it every noon.", ok: (r) => (said(r).some((d) => d === want || d.startsWith("w9.")) ? null : "the want written as won was not taken as won") },
  { line: "I sell the handcart to a bargeman and pay the toughs off with the coin; they take it and go.", ok: (r) => (pts(r, x) >= 1 || said(r).some((d) => x.test(d)) ? null : "selling the cart to pay them off earned nothing") },
  { line: "I want to learn to breathe under water, like the river folk.", ok: (r) => (r.wish?.name ? (said(r).length ? "a wish was taken as done" : null) : "a reach for something lasting was not made a want") },
  { line: "Brant sighs, wipes his mouth, and chalks his mark on my cart. \"Stand where you like, girl.\"", ok: (r) => (said(r).includes(t1) ? null : "another character's settling words were not taken as done") },
];

const models = (process.argv[2] ?? "strong,fast").split(",");
for (const m0 of models) {
  // "fast+decide" is the fast model's reading with each fit judged again by the Decision model.
  const two = m0.endsWith("+decide");
  const m = m0.replace("+decide", "");
  const id = m === "strong" ? env.CHAT_MODEL_STRONG! : m === "fast" ? env.CHAT_MODEL_FAST! : m;
  const times: number[] = [];
  const ask: Ask = async (messages) => {
    const t = Date.now();
    const r = await fetch(env.CHAT_URL!, { method: "POST", headers: { Authorization: `Bearer ${env.CHAT_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: id, messages }), signal: AbortSignal.timeout(120_000) });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    times.push(Date.now() - t);
    const text = j.choices?.[0]?.message?.content ?? "";
    if (!text || !json(text)) throw new Error(`no answer: ${JSON.stringify(j).slice(0, 120)}`);
    return text;
  };
  const whole: number[] = [];
  const results = await Promise.all(cases.map(async (c) => { const t = Date.now(); const st = fixed(); let r = await read(ask, world, st, [], c.line); if (r && two) r = await refine(world, st, c.line, r); whole.push(Date.now() - t); return r ? c.ok(r) : "no answer"; }));
  if (two) { times.length = 0; times.push(...whole); }
  const bad = results.map((r, i) => (r ? `    ${i + 1}. ${cases[i]!.line.slice(0, 70)}: ${r}` : "")).filter(Boolean);
  times.sort((a, b) => a - b);
  console.log(`${id}${two ? " + Decision model" : ""}: ${cases.length - bad.length} of ${cases.length} right, median ${(times[Math.floor(times.length / 2)]! / 1000).toFixed(1)} s`);
  for (const b of bad) console.log(b);
}
process.exit(0);
