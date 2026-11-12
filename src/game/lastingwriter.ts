/**
 * The scenes of a story of scenes written again to fit what tries have won (engine/lasting.ts). The builder wrote the
 * three scenes before the player said a word; when a try wins something that stays true (someone joins the player, a
 * villain takes their side, a debt is owed, the bridge is down), the scenes not yet come to are given to a model to
 * write again so they fit it, and checked by code scene by scene as the builder's are (hand.ts, `checkScene`). A scene
 * whose new writing does not check stays as it was, and the reason is told.
 */
import { checkScene, type Scene, type SceneStory } from "../engine/hand.js";
import { firstJson, type Ask, type Message } from "./prompts.js";

/** A scene as the builder's shape has it, to be handed back to a model to write again. */
const asWritten = (s: Scene) => ({
  name: s.name,
  card: s.card,
  face: s.face,
  situation: s.situation,
  person: s.person ?? null,
  through: s.through,
  closing: s.closing,
  taken: s.taken,
  things: s.things.map((t) => t.name),
  boon: s.boon,
});

/** What the model is asked: the story, what has been played, what is now true, and the scenes still to come. */
export function reviseMessages(story: SceneStory, from: number, truths: readonly string[]): Message[] {
  const ahead = story.scenes.slice(from);
  const system = [
    "You keep a short tabletop story true to what has happened in it. Its scenes were written before it was played. In the scenes played so far the player won things that are now true and stay true. Write the scenes not yet played again so they fit what is now true. The game's code owns every rule and number; you write who and what is in each scene.",
    "Whoever has joined the player is with them in every scene to come, as themselves: they are not waiting in a later scene as a stranger or a foe, and they can help, argue or get in the way. Someone won to the player's side acts like it. A thing taken is the player's, and someone may be looking for it. A promise or debt is owed. A fact changed is changed, and the world reacts to it. Someone set against the player acts on it.",
    "Keep what each scene is for in the story: the last is still where the story is settled and still the hardest, and every scene still has someone or something in the way that wants something and is acting on it now. What was won changes who is in the way and how, never whether: do not make a scene easier because of it, and give what was won its weight, good and bad.",
    "Keep each scene's name. Change only what what is now true changes; a scene it does not touch can come back as it was. Every part is in words of your own, in the card's world, said plainly, with nothing in angle brackets. Answer with the JSON only. Nothing sexual or explicit.",
  ].join("\n");
  const user = [
    `THE STORY: ${story.title}. ${story.goal}`,
    from ? `THE SCENES PLAYED: ${story.scenes.slice(0, from).map((s) => `${s.name}: ${s.situation}`).join(" ")}` : "",
    `WHAT IS NOW TRUE:\n${truths.map((t) => `- ${t}`).join("\n")}`,
    `THE SCENES STILL TO COME, as they were written:\n${JSON.stringify({ scenes: ahead.map(asWritten) }, null, 1)}`,
    `Write them again as JSON in the same shape, {"scenes": [...]}, with exactly ${ahead.length} scene${ahead.length === 1 ? "" : "s"}, in the same order.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * The scenes a model wrote again, checked one by one (hand.ts, `checkScene`), each as the scene of the story it stands
 * in place of. A scene that checks is kept; one that does not stays as it was, and `why` is told what was wrong. More
 * scenes than were asked for: the first ones are taken. Fewer: those it has.
 */
export function checkRevision(raw: unknown, story: SceneStory, from: number, why?: (reason: string) => void): Scene[] {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(o?.scenes) ? (o!.scenes as unknown[]) : Array.isArray(raw) ? (raw as unknown[]) : null;
  if (!list) return (why?.("the answer has no scenes"), []);
  const out: Scene[] = [];
  for (let i = from; i < story.scenes.length; i++) {
    const r = list[i - from];
    if (r === undefined) {
      why?.(`scene ${i + 1} was not written again`);
      continue;
    }
    const scene = checkScene(r, i, why);
    if (scene) out.push(scene);
  }
  return out;
}

/** How long a model is given to write the scenes again. The player is playing the scene they are in meanwhile. */
export const REVISE_MS = 120_000;

/**
 * The scenes from `from` on, written again to fit what is now true and checked, or an empty list when no model answers
 * or nothing checks (the old scenes stay). Asked once more when the first answer gives nothing usable.
 */
export async function reviseScenes(ask: Ask | null, story: SceneStory, from: number, truths: readonly string[], onFail?: (why: string) => void): Promise<Scene[]> {
  if (!ask || from >= story.scenes.length || !truths.length) return [];
  for (let tries = 0; tries < 2; tries++) {
    try {
      const got = checkRevision(firstJson(await ask(reviseMessages(story, from, truths), "builder")), story, from, onFail);
      if (got.length) return got;
    } catch (e) {
      onFail?.(e instanceof Error ? e.message : String(e));
    }
  }
  return [];
}
