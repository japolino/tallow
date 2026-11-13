/**
 * The model's part in the narrator's book (engine/chapter.ts, docs/DESIGN.md 11, item 29): a chapter written from what
 * code gathered, under the story's voice when it has one, so it reads like the rest of the night's prose. Code checks
 * what comes back and keeps it to what the game allows (content.ts); nothing in the game changes because of it.
 */
import { checkChapter, type ChapterDraft, type ChapterMaterial } from "../engine/chapter.js";
import { contentRules, crossesLine, playable, refused, VEIL_SAID, type ContentSettings } from "../engine/content.js";
import { laid, type Voice } from "./voice.js";
import { firstJson, type Ask, type Message } from "./prompts.js";

/** How long a chapter may take, in all: it is never waited for, so a slow model is given its time. */
export const CHAPTER_MS = 150_000;
/** One try's share of it; a second is asked only while there is time for it. */
const TRY_MS = 110_000;

const AT_SAID: Record<ChapterMaterial["at"], string> = {
  rest: "The player is resting between scenes; the story is not over. Set the chapter where the player's character is not acting, at this same hour. Either somewhere else: with someone they met earlier and left behind, or with the people working against them. Or, when someone walks with the player, among those who walk with them while the player's character sleeps or is out of earshot: what they make of the player, of each other and of what they have got into. Whichever it is, it is something the player did not see or hear.",
  end: "The story has just ended. Set the chapter afterwards: the next morning, or days or a season later, among the people the story touched.",
  stop: "The player has stopped for the night in the middle of the story; it will go on another night. Set the chapter where the player's character is not acting, while they are away: with someone they met earlier and left behind, with the people working against them, or, when someone walks with the player, among those who walk with them, out of the player's hearing. Whichever it is, it is something the player did not see or hear, never the scene they stopped in told again.",
  night: "A night of wandering the world freely has ended; there was no set story. Set the chapter later, the next day or after, among the people the player met.",
  // A chapter beside an ordinary chat is written by game/chatwriter.ts, in its own words.
  chat: "A scene has just ended. Set the chapter a little later, or in between, among the people the player dealt with.",
};

/** The form a chapter is asked in: plain text with three marks, which a model holds to under any preset, unlike JSON. */
export const CHAPTER_FORM = [
  "TITLE: <the chapter's title, two to six words>",
  "<the chapter itself, in paragraphs>",
  "FACTS:",
  "- <one thing this chapter makes true that the story should keep: where someone is now, what they feel about the player, what they have set out to do>",
  "- <another, if there is one; three at most>",
  "PICTURE: <one sentence for an illustrator: a single moment of this chapter, who is in it, where, doing what, and the light. Name nobody; describe them.>",
].join("\n");

/** The rules for a chapter: what it is, what it may and may not do, and its form. */
export function chapterRules(content: ContentSettings, voiced: boolean): string {
  return [
    "Between scenes of a tabletop game the narrator writes a short chapter in a book of its own, and stands the book on the shelf behind it. The player can take the book down and read it later.",
    "A chapter is not a recap. The player was there and knows what they did; never retell it. Write what they did not see: a little later, or in between, among the other people of the story, the ones the player dealt with, travelled with or left behind. What did they do and say once the player had gone, and what did they feel? Who talked about the player, and how? What changed for them because of what happened?",
    "Choose one or two of those people and one place, and stay with them. Let them speak in their own voices.",
    "The player's character appears only as others see, remember or talk about them. Never write what the player does, says, thinks or feels, and decide nothing for them. Invent nothing the game would have to keep: no treasure, wounds, debts, or promises made by the player. What happens among the others is yours to write, and it is true in the story from now on; keep it within what has happened, and contradict nothing given.",
    voiced
      ? "Write it as the chapter of a book, in the style above, in the past tense; no longer than a few hundred words."
      : "Write it as the chapter of a book: 150 to 300 words, in two to five paragraphs, in the past tense, in the plain voice of a storyteller.",
    "No numbers, dice, scenes, checks or other game words, no markdown, and nothing in angle brackets.",
    contentRules(content, ["adult"]),
    `Answer in exactly this form, and nothing else:\n${CHAPTER_FORM}`,
  ].join("\n");
}

/** What a chapter is written from, as the model is given it. */
export function materialSaid(m: ChapterMaterial): string {
  const list = (head: string, xs: readonly string[]): string => (xs.length ? `${head}\n${xs.map((x) => `- ${x}`).join("\n")}` : "");
  const hour = ((Math.floor(m.hour) % 24) + 24) % 24;
  return [
    `THE STORY: ${m.story.title}. ${m.story.goal}`,
    `WHERE IT STANDS: ${AT_SAID[m.at]}${m.story.ending ? ` It was ${m.story.over === "won" ? "won" : "lost"}: ${m.story.ending}` : ""} It is about ${hour}:00 in the story.`,
    `THE PLAYER'S CHARACTER (seen only by others): ${m.hero.name}, ${m.hero.who}`,
    list("WHAT HAPPENED SINCE THE LAST CHAPTER, place by place:", m.happened),
    list("THE PEOPLE THE CHAPTER CAN BE ABOUT:", m.people.map((p) => `${p.name}: ${p.who}${p.wants ? `; wanted ${p.wants}` : ""} (met at ${p.met})`)),
    list("WHO WALKS WITH THE PLAYER (a chapter can be among them, when the player's character is asleep or away):", m.companions.map((c) => `${c.name}: ${c.who}`)),
    list("WHAT THE PLAYER DID THAT WORKED:", m.deeds),
    list("WHAT IT COST THEM:", m.lost),
    list("WHAT THEY CARRY FROM IT:", m.boons),
    list("WHAT THE PLAYER HAS WON OR TURNED AGAINST THEM THAT STAYS TRUE (show what it means to the people it touches):", m.changed),
    list("WHAT THE NARRATOR SAID ALOUD, most recent last (the player heard all of this; don't repeat it):", m.told),
    list("WHAT EARLIER CHAPTERS ESTABLISHED (keep to it):", m.established),
    list("MORE:", m.more),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The job's own messages: its rules, then what it is written from. Under a voice they go last (voice.ts, `laid`). */
export function chapterMessages(m: ChapterMaterial, content: ContentSettings, voiced: boolean): Message[] {
  return [
    { role: "system", content: chapterRules(content, voiced) },
    { role: "user", content: `${materialSaid(m)}\n\nWrite the chapter now, in the form given.` },
  ];
}

/**
 * A model's answer read into its parts: the form asked for, JSON, or plain prose with nothing marked (its first short
 * line taken as the title). Checked by `checkChapter`; null when nothing can be read from it.
 */
export function parseChapter(text: string): unknown {
  const t = text.replace(/```[a-z]*\n?|```/gi, "").replace(/\r/g, "").trim();
  if (!t) return null;
  if (/^\s*\{/.test(t)) {
    const j = firstJson(t);
    if (j && typeof j === "object") return j;
  }
  const mark = (name: string): RegExp => new RegExp(`^\\s*\\**${name}\\**\\s*:\\s*`, "im");
  const titleM = t.match(/^\s*\**TITLE\**\s*:\s*(.+)$/im);
  const factsAt = t.search(mark("FACTS"));
  const pictureAt = t.search(mark("PICTURE"));
  const ends = [factsAt, pictureAt].filter((i) => i >= 0);
  const bodyEnd = ends.length ? Math.min(...ends) : t.length;
  let body = t.slice(titleM ? (titleM.index ?? 0) + titleM[0].length : 0, bodyEnd).trim();
  let title = titleM?.[1]?.trim() ?? "";
  if (!titleM) {
    // No marks at all: a short first line on its own is the title.
    const first = body.split("\n")[0] ?? "";
    if (first.split(/\s+/).length <= 8 && body.includes("\n")) {
      title = first;
      body = body.slice(first.length).trim();
    }
  }
  const facts = factsAt >= 0 ? t.slice(factsAt, pictureAt > factsAt ? pictureAt : t.length).replace(mark("FACTS"), "").split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const picture = pictureAt >= 0 ? (t.slice(pictureAt).replace(mark("PICTURE"), "").split("\n\n")[0] ?? "").trim() : "";
  return { title, text: body, facts, picture };
}

/** A chapter kept to what the game allows: refused whole if its text is not, its title, facts and picture dropped one by one if they are not. */
export function allowedChapter(d: ChapterDraft, content: ContentSettings, why?: (reason: string) => void): ChapterDraft | null {
  const whole = d.text.join("\n\n");
  if (refused(whole)) return (why?.("the model would not write it"), null);
  if (playable(whole, content) === VEIL_SAID) return (why?.("it crossed the table's lines"), null);
  const ok = (s: string): boolean => !!s && !crossesLine(s, content);
  return { title: ok(d.title) ? d.title : "", text: d.text, facts: d.facts.filter(ok), picture: ok(d.picture) ? d.picture : "" };
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((done, fail) => {
    const t = setTimeout(() => fail(new Error(`no answer in ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => (clearTimeout(t), done(v)),
      (e) => (clearTimeout(t), fail(e)),
    );
  });

/** What a chapter is asked with: the messages, and the preset's own settings when it is written under one. */
export interface ChapterAsk {
  messages: Message[];
  parameters?: Record<string, unknown>;
}

/**
 * A chapter written by a model and checked by code, asked twice at most while there is time; null when no model can be
 * asked or neither answer is a chapter, with the reason (`onFail`). What it is asked with is built by the caller.
 */
export async function writeDraft(ask: Ask | null, build: () => ChapterAsk, content: ContentSettings, onFail?: (why: string) => void, ms = CHAPTER_MS): Promise<ChapterDraft | null> {
  if (!ask) return (onFail?.("no model to write it"), null);
  const until = Date.now() + ms;
  let last = "no answer";
  for (let tries = 0; tries < 2 && Date.now() < until - 5000; tries++) {
    try {
      const job = build();
      const said = await within(ask(job.messages, "teller", job.parameters ? { parameters: job.parameters } : undefined), Math.min(TRY_MS, until - Date.now()));
      const draft = checkChapter(parseChapter(said), (why) => (last = why));
      const fit = draft && allowedChapter(draft, content, (why) => (last = why));
      if (fit) return fit;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  onFail?.(last);
  return null;
}

/**
 * A chapter of the game's book. Under a voice it is written as the night's prose is: the preset, the story so far,
 * then this job last.
 */
export function writeChapter(ask: Ask | null, m: ChapterMaterial, content: ContentSettings, voice: Voice | null, onFail?: (why: string) => void, ms = CHAPTER_MS): Promise<ChapterDraft | null> {
  return writeDraft(
    ask,
    () => {
      const job = chapterMessages(m, content, !!voice);
      return voice ? { messages: laid(voice, job), ...(voice.snapshot.parameters ? { parameters: voice.snapshot.parameters } : {}) } : { messages: job };
    },
    content,
    onFail,
    ms,
  );
}
