/**
 * The model's part in a chat's book (engine/chatbook.ts, docs/DESIGN.md 3.5, item 30): a chapter written from an
 * ordinary chat, under the chat's own preset when it can be read, so it reads like the chat does. The chat itself is
 * laid out as the conversation it was, and the job comes last, so its rules win over the preset's.
 *
 * The player of such a chat is a co-author: their messages say what their own character does, and often what others
 * say and do, that time has passed, or how something turned out. All of it is as true as the replies. The writer is
 * told so, and told to add only what neither of them showed.
 */
import { cleanLine, type ChatLine } from "../engine/chatbook.js";
import { type ChapterDraft } from "../engine/chapter.js";
import { contentRules, type ContentSettings } from "../engine/content.js";
import { CHAPTER_FORM, CHAPTER_MS, writeDraft } from "./chapterwriter.js";
import type { PresetSnapshot } from "./preset.js";
import type { Ask, Message } from "./prompts.js";

/** What a chat's chapter is written from. Everything here is the chat's own; nothing is made up by code. */
export interface ChatMaterial {
  /** The card the chat is with: its name, and a few words on it for a writer with no preset to read it from. */
  card: { name: string; about: string };
  /** The player's character: their persona's name, and what it says of them. */
  hero: { name: string; who: string };
  /** The last few messages before that part, cut short: who everyone is and how things stood, already written about. */
  earlier: readonly ChatLine[];
  /** The part of the chat to write from, in order: the scene that is over. */
  lines: readonly ChatLine[];
  /** Some of that part was left out or shortened for size. */
  cut: boolean;
  /** The player's newest message, which comes after `lines` and opens what happens next; not written about. */
  opener?: string;
  /** What earlier chapters of this chat's book established. */
  established: readonly string[];
  /** What the player asked the chapter to be about, in their words; none when the narrator chose to write. */
  wish?: string;
}

/** What stands before the chat when there is no preset to say what it is. */
const BARE = (m: ChatMaterial): string =>
  [`What follows is a freeform roleplay between a player and a storyteller.`, m.card.name ? `It is played with ${m.card.name}${m.card.about ? `: ${m.card.about}` : "."}` : "", `The player's own character is ${m.hero.name}${m.hero.who ? `: ${m.hero.who}` : "."}`].filter(Boolean).join("\n");

/** The rules for a chat's chapter: what it is, what it may and may not do, and its form. */
export function chatRules(content: ContentSettings, voiced: boolean): string {
  return [
    "Stop the roleplay here. This is not the next reply. Beside the chat above, a narrator keeps a book of its own, and writes one short chapter in it whenever a scene is over. The player can open the book and read it.",
    "The player of this chat is a co-author. Their messages say what their own character does, and often what other characters say and do, that time has passed, or how something turned out. Everything in the chat is true, whoever wrote it.",
    "A chapter is not a recap. The player was there and knows what happened; never retell it. Write what neither of you showed: a little later, or in between, among the other people of the story. What did they make of the player's character? What did they say to each other, or do alone, once the player's character had left the room or fallen asleep? What has changed for them because of what happened?",
    "Choose one or two of those people and one place, and stay with them, close to what they see and feel. Let them speak in their own voices, as the chat has shown them.",
    "The player's character appears only as others see, remember or talk about them. Never write what the player's character does, says, thinks or feels, and decide nothing for them.",
    "Keep inside what the chat has made true, and contradict nothing in it. Nobody here does anything the chat would have to follow up: no one leaves for good, dies, tells a secret to someone who would act on it, or settles what is still open between them and the player's character. What moves is what they feel, what they understand, and what they mean to do.",
    voiced
      ? "Write it as the chapter of a book, in the prose style the chat is written in, in the past tense and the third person, in a few hundred words: far shorter than a reply, whatever length the instructions above ask of a reply."
      : "Write it as the chapter of a book: 150 to 350 words, in two to five paragraphs, in the past tense and the third person, in the voice the chat is told in.",
    "Plain prose only: no headings inside it, no status panel, no list of choices, no thinking written out, no markdown, and nothing in angle brackets, whatever the instructions above ask of a reply.",
    `${contentRules({ ...content, heat: false }, ["adult"])} A chapter is never the intimate scene itself: when one happened, the chapter is what it meant to them afterwards. Anyone the chat shows to be a child is never part of anything romantic or sexual.`,
    `Answer in exactly this form, and nothing else:\n${CHAPTER_FORM}`,
  ].join("\n");
}

/** What the writer is told about this chapter, after the chat. */
export function chatFacts(m: ChatMaterial): string {
  const list = (head: string, xs: readonly string[]): string => (xs.length ? `${head}\n${xs.map((x) => `- ${x}`).join("\n")}` : "");
  return [
    `THE PLAYER'S CHARACTER (seen only by others): ${m.hero.name}${m.hero.who ? `, ${m.hero.who}` : ""}`,
    m.earlier.length
      ? `The chat above begins with earlier parts of the story, shortened; the book has already written about those. THE SCENE THIS CHAPTER FOLLOWS begins at the message that starts: "${(m.lines[0]?.text ?? "").replace(/\s+/g, " ").slice(0, 90)}"`
      : "",
    m.cut ? "Some of the scene above was left out or shortened for length; what is there is still true." : "",
    m.opener
      ? `WHERE IT STANDS: the scene above is over. The player has just moved the story on with this, which the chapter comes before and must not write about or contradict: "${m.opener}"`
      : "WHERE IT STANDS: the player has asked for a chapter now, at this point in the chat.",
    m.wish ? `WHAT THE PLAYER ASKED THIS CHAPTER TO BE ABOUT (follow it, inside the rules above): ${m.wish}` : "",
    list("WHAT EARLIER CHAPTERS OF THE BOOK ESTABLISHED (keep to it, and don't write it again):", m.established),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The job's own messages: its rules, then what this chapter is. They go last. */
export function chatJob(m: ChatMaterial, content: ContentSettings, voiced: boolean): Message[] {
  return [
    { role: "system", content: chatRules(content, voiced) },
    { role: "user", content: `${chatFacts(m)}\n\nWrite the chapter now, in the form given.` },
  ];
}

/** The chat as the conversation it was: the player's messages and the replies, a run of one side's joined into one. */
export function chatTurns(lines: readonly ChatLine[]): Message[] {
  const out: Message[] = [];
  for (const l of lines) {
    const role = l.you ? ("user" as const) : ("assistant" as const);
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${l.text}`;
    else out.push({ role, content: l.text });
  }
  return out;
}

/**
 * A chat's chapter as it is asked: the preset's blocks from before the chat (or a line saying what the chat is), the
 * chat, the preset's blocks from after it, then the job.
 */
export function chatLaid(snapshot: PresetSnapshot | null, m: ChatMaterial, content: ContentSettings): Message[] {
  const job = chatJob(m, content, !!snapshot);
  const turns = chatTurns([...m.earlier, ...m.lines]);
  return snapshot ? [...snapshot.before, { role: "system", content: BARE(m) }, ...turns, ...snapshot.after, ...job] : [{ role: "system", content: BARE(m) }, ...turns, ...job];
}

/**
 * A chat's chapter written by a model and checked by code (chapterwriter.ts, `writeDraft`); null with the reason when
 * there is none. A preset can make a model think aloud or colour its dialogue whatever the job says, so the answer is
 * cleaned as the chat's own messages are (thinking and markup taken away, nothing read into what is left).
 */
export function writeChatChapter(ask: Ask | null, m: ChatMaterial, content: ContentSettings, snapshot: PresetSnapshot | null, onFail?: (why: string) => void, ms = CHAPTER_MS): Promise<ChapterDraft | null> {
  const plain: Ask | null = ask && (async (messages, role, opts) => cleanLine(await ask(messages, role, opts), 40_000));
  return writeDraft(plain, () => ({ messages: chatLaid(snapshot, m, content), ...(snapshot?.parameters ? { parameters: snapshot.parameters } : {}) }), content, onFail, ms);
}
