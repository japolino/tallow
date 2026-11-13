/**
 * The narrator's book beside an ordinary chat (engine/chatbook.ts, game/chatwriter.ts, game/chatbook.ts,
 * backend/chat.ts): what is taken out of a chat's messages, which of them a chapter is written from, when one is due,
 * what the writer is told, and that the chat itself is only ever read.
 */
import { describe, expect, test } from "bun:test";
import { chatLines, createChats, EARLIER_MAX, EARLIER_MOST, LINES_MOST } from "../src/backend/chat.js";
import { bookFile, emptyBook, readBook, withChapter, type Book } from "../src/engine/chapter.js";
import { CHAT_HERO, chatMark, chatStory, cleanLine, fitted, forkedBook, MOST_REPLIES, settledSpan, spanLong, spanWorth, wholeSpan, writtenUpTo, type ChatLine } from "../src/engine/chatbook.js";
import { DEFAULT_CONTENT } from "../src/engine/content.js";
import { chapterKeeper } from "../src/game/chapters.js";
import { chatBook, parseScene, sceneMessages, sceneQuestions } from "../src/game/chatbook.js";
import { chatLaid, chatRules, chatTurns, writeChatChapter, type ChatMaterial } from "../src/game/chatwriter.js";
import type { Decide } from "../src/game/decisions.js";
import type { PresetSnapshot } from "../src/game/preset.js";
import type { Ask, Message } from "../src/game/prompts.js";

const ANSWER = [
  "TITLE: What the Cook Heard",
  "",
  "Marta banked the kitchen fire and did not go to bed. The stranger had paid in silver and asked about the north road, and nobody asked about the north road who meant to come back by it.",
  "",
  "\"He'll be gone by morning,\" the stable boy said from the doorway. Marta said that was his business, and set a loaf aside in a cloth all the same.",
  "",
  "FACTS:",
  "- Marta has set bread aside for the stranger's road.",
  "PICTURE: An old cook sits by a banked kitchen fire at night, a wrapped loaf on the table beside her.",
].join("\n");

const line = (index: number, you: boolean, text: string): ChatLine => ({ index, id: `m${index}`, you, name: you ? "Ash" : "Marta", text });
/** A chat that begins with a greeting and then goes turn about, the player first. */
const chat = (turns: number, last?: string): ChatLine[] => {
  const out = [line(0, false, "The inn is warm and nearly empty. Marta looks up from the fire.")];
  for (let i = 0; i < turns; i++) {
    out.push(line(out.length, true, i === turns - 1 && last ? last : `I ask Marta about the road north, part ${i + 1}.`));
    out.push(line(out.length, false, `Marta answers, slowly, and pours another cup. (${i + 1})`));
  }
  return out;
};
const said = (messages: Message[]): string => messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");

describe("a chat's message as the story reads it", () => {
  test("a model's thinking, an illustrator's block, comments and markup are taken out; the prose and its paragraphs stay", () => {
    const raw = [
      "<Thoughts>She should hesitate here. Keep it short.</Thoughts>",
      "## Chapter of the evening",
      '<font color="#aa0000">"You came back,"</font> she said.',
      "",
      '<!-- inlay_illustrator --> <div class="inlay-illustrator-image" data-inlay-illustrator="true"><div class="frame"><img src="/api/v1/images/abc"></div><div class="caption">a picture</div></div>',
      "",
      "He did not answer.&nbsp;The rain went on.",
      "![map](https://example.test/map.png)",
    ].join("\n");
    const clean = cleanLine(raw);
    expect(clean).toContain('"You came back," she said.');
    expect(clean).toContain("He did not answer. The rain went on.");
    expect(clean).not.toContain("hesitate");
    expect(clean).not.toContain("a picture");
    expect(clean).not.toContain("<");
    expect(clean).not.toContain("example.test");
    expect(clean.split("\n\n").length).toBeGreaterThan(1);
  });

  test("an illustrator's block that never closes takes everything after it, rather than being read as story", () => {
    expect(cleanLine('She waited.\n<div data-inlay-illustrator="true"><div>broken')).toBe("She waited.");
  });

  test("a very long message keeps its start and its end", () => {
    const long = `START ${"word ".repeat(2000)}END`;
    const cut = cleanLine(long, 600);
    expect(cut.length).toBeLessThanOrEqual(620);
    expect(cut.startsWith("START")).toBe(true);
    expect(cut.endsWith("END")).toBe(true);
    expect(cut).toContain("[…]");
  });

  test("nothing is read into what is left: an out-of-character note is still there for the writer", () => {
    expect(cleanLine("Some days later... ooc: Marta has a brother now.")).toBe("Some days later... ooc: Marta has a brother now.");
  });
});

describe("which messages a chapter is written from", () => {
  test("what is settled: everything after the last chapter and before the player's newest message", () => {
    const all = chat(3);
    const span = settledSpan(all, -1)!;
    // The newest reply can still be swiped, and the player's newest message opens what comes next.
    expect(span.opener!.index).toBe(5);
    expect(span.lines.map((l) => l.index)).toEqual([0, 1, 2, 3, 4]);
    expect(span.upTo).toBe(4);
    expect(span.replies).toBe(3);
    expect(settledSpan(all, 4)).toBeNull();
    expect(settledSpan([line(0, false, "A greeting.")], -1)).toBeNull();
  });

  test("a chapter asked for is written from everything to the end of the chat", () => {
    const span = wholeSpan(chat(2), 0)!;
    expect(span.lines.map((l) => l.index)).toEqual([1, 2, 3, 4]);
    expect(span.opener).toBeNull();
    expect(wholeSpan(chat(2), 4)).toBeNull();
  });

  test("too little is not a chapter's worth, and a long scene does not wait for the player to move on", () => {
    expect(spanWorth(settledSpan(chat(1), 0))).toBe(false);
    expect(spanWorth(settledSpan(chat(3), -1))).toBe(true);
    expect(spanLong(settledSpan(chat(4), -1)!)).toBe(false);
    expect(spanLong(settledSpan(chat(MOST_REPLIES + 1), -1)!)).toBe(true);
  });

  test("a transcript too long is cut from its older messages, the newest kept whole", () => {
    const big = [line(0, false, "a".repeat(5000)), line(1, true, "b".repeat(5000)), line(2, false, "c".repeat(5000)), line(3, true, "d".repeat(400))];
    const fit = fitted(big, 9000);
    expect(fit.cut).toBe(true);
    expect(fit.lines.at(-1)!.text).toBe("d".repeat(400));
    expect(fit.lines.at(-2)!.text).toBe("c".repeat(5000));
    expect(fit.lines.reduce((n, l) => n + l.text.length, 0)).toBeLessThanOrEqual(9000);
    expect(fitted(chat(2)).cut).toBe(false);
  });
});

describe("a chat's book", () => {
  const chapter = (id: string, story: string, upTo: number) => ({ id, story, storyTitle: "Marta", at: "chat" as const, title: id, text: ["Some words of a chapter."], facts: [`fact of ${id}`], hour: 0, written: 1, upTo });

  test("how far it has got is kept with it, and survives being stored and read back", () => {
    let b = emptyBook(CHAT_HERO, "chat-abc");
    expect(writtenUpTo(b, "abc")).toBe(-1);
    b = withChapter(b, chapter("one", chatStory("abc"), 6), chatMark(6));
    const back = readBook(JSON.parse(JSON.stringify(b)), CHAT_HERO, "");
    expect(writtenUpTo(back, "abc")).toBe(6);
    expect(back.chapters[0]).toMatchObject({ at: "chat", upTo: 6 });
    // Another chat's chapters are not this chat's.
    expect(writtenUpTo(back, "other")).toBe(-1);
  });

  test("a branch begins with the chapters written from the messages it shares, and no others", () => {
    let b = emptyBook(CHAT_HERO, "chat-abc");
    b = withChapter(b, chapter("one", chatStory("abc"), 6), chatMark(6));
    b = withChapter(b, chapter("two", chatStory("abc"), 14), chatMark(14));
    const f = forkedBook(b, "abc", "xyz", 9);
    expect(f.chapters.map((c) => c.id)).toEqual(["one"]);
    expect(f.chapters[0]!.story).toBe(chatStory("xyz"));
    expect(writtenUpTo(f, "xyz")).toBe(6);
    expect(forkedBook(b, "abc", "xyz", 3).chapters).toEqual([]);
  });
});

describe("reading a chat (the backend)", () => {
  const host = (i: number, is_user: boolean, content: string, more: object = {}) => ({ id: `m${i}`, index_in_chat: i, is_user, name: is_user ? "Ash" : "Marta", content, ...more });

  test("hidden messages and the system's own are not the story; the rest is cleaned and in order", () => {
    const got = chatLines([host(2, false, "<think>plan</think>She nods."), host(0, false, "Hello."), host(1, true, "I sit."), host(3, true, "secret", { hidden: true }), host(4, false, "a note", { role: "system" })], -1);
    expect(got.lines.map((l) => [l.index, l.you, l.text])).toEqual([[0, false, "Hello."], [1, true, "I sit."], [2, false, "She nods."]]);
    expect(got.last).toBe(2);
    expect(got.earlier).toEqual([]);
  });

  test("what was already written about comes along cut short, a few messages of it", () => {
    const messages = Array.from({ length: 30 }, (_, i) => host(i, i % 2 === 1, `${i}: ${"x".repeat(3000)}`));
    const got = chatLines(messages, 19);
    expect(got.lines.map((l) => l.index)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    expect(got.earlier.length).toBe(EARLIER_MOST);
    expect(got.earlier.at(-1)!.index).toBe(19);
    expect(got.earlier.every((l) => l.text.length <= EARLIER_MAX + 10)).toBe(true);
    expect(got.lines[0]!.text.length).toBeGreaterThan(3000);
  });

  test("a book far behind reads the newest of the chat, not all of it", () => {
    const messages = Array.from({ length: 200 }, (_, i) => host(i, i % 2 === 1, `line ${i}`));
    const got = chatLines(messages, -1);
    expect(got.lines.length).toBe(LINES_MOST);
    expect(got.lines.at(-1)!.index).toBe(199);
    expect(got.earlier.every((l) => l.index < got.lines[0]!.index)).toBe(true);
  });

  const spindle = (o: { chat?: object | null; messages?: object[]; files?: Map<string, unknown> }) => {
    const files = o.files ?? new Map<string, unknown>();
    const calls: string[] = [];
    const api = {
      chats: { get: async (id: string) => (calls.push(`chats.get ${id}`), o.chat === undefined ? { id, character_id: "c1" } : o.chat) },
      chat: { getMessages: async (id: string) => (calls.push(`chat.getMessages ${id}`), o.messages ?? []) },
      characters: { get: async () => ({ name: "Marta", description: "{{char}} keeps the inn where {{user}} is staying.", scenario: "" }) },
      personas: { getActive: async () => ({ name: "Ash", title: "a courier", description: "" }), getDefault: async () => null },
      userStorage: { getJson: async (p: string, opt: { fallback: unknown }) => (files.has(p) ? files.get(p) : opt.fallback), setJson: async (p: string, v: unknown) => void files.set(p, v) },
    };
    return { chats: createChats(api as never), calls, files };
  };

  test("only the user's own chat is read, and only read: the host is asked for it and nothing else", async () => {
    const { chats, calls } = spindle({ messages: [host(0, false, "Hello."), host(1, true, "I sit.")] });
    const got = await chats.read("u", "abc", -1);
    expect(got.lines.length).toBe(2);
    expect(calls).toEqual(["chats.get abc", "chat.getMessages abc"]);
    const other = spindle({ chat: null });
    expect(other.chats.read("u", "abc", -1)).rejects.toThrow("no such chat");
    expect(other.calls).toEqual(["chats.get abc"]);
  });

  test("who the chat is between: the card in a few words, the persona as it is now, macros filled", async () => {
    const who = await spindle({}).chats.who("u", "abc");
    expect(who.card).toEqual({ name: "Marta", about: "Marta keeps the inn where Ash is staying." });
    expect(who.hero).toEqual({ name: "Ash", who: "a courier" });
  });

  test("a branched chat's book is begun from the one it came from, once", async () => {
    let b: Book = emptyBook(CHAT_HERO, "chat-abc");
    b = withChapter(b, { id: "one", story: chatStory("abc"), storyTitle: "Marta", at: "chat", title: "One", text: ["Some words of a chapter."], facts: [], hour: 0, written: 1, upTo: 6 }, chatMark(6));
    const files = new Map<string, unknown>([[bookFile("abc", "c1", CHAT_HERO), b]]);
    const { chats } = spindle({ files });
    expect(await chats.forked("u", "abc", "xyz", "c1", 8)).toBe(1);
    const made = readBook(files.get(bookFile("xyz", "c1", CHAT_HERO)), CHAT_HERO, "");
    expect(made.chapters.map((c) => c.story)).toEqual([chatStory("xyz")]);
    // Not again: the branch's book is its own from then on.
    expect(await chats.forked("u", "abc", "xyz", "c1", 8)).toBe(0);
    expect(await chats.forked("u", "none", "new", "c1", 8)).toBe(0);
  });
});

describe("what the chapter's writer is told", () => {
  const M: ChatMaterial = {
    card: { name: "Marta", about: "She keeps the inn." },
    hero: { name: "Ash", who: "a courier" },
    earlier: [line(0, false, "The inn is warm.")],
    lines: [line(1, true, "I ask about the road."), line(2, true, "Marta frowns at that."), line(3, false, "She pours a cup.")],
    cut: false,
    opener: "Some days later, I ride north.",
    established: ["Marta has set bread aside."],
  };
  const SNAP: PresetSnapshot = { v: 1, presetId: "p", name: "Mine", before: [{ role: "system", content: "PRESET BEFORE" }], after: [{ role: "system", content: "PRESET AFTER" }], parameters: { temperature: 0.9 }, dropped: [], judged: true };

  test("the chat is laid out as the conversation it was, the player's run of messages joined", () => {
    expect(chatTurns(M.lines)).toEqual([{ role: "user", content: "I ask about the road.\n\nMarta frowns at that." }, { role: "assistant", content: "She pours a cup." }]);
  });

  test("under a preset: its blocks, the chat, its later blocks, then the job last, so the job's rules win", () => {
    const laid = chatLaid(SNAP, M, DEFAULT_CONTENT);
    const all = said(laid);
    expect(laid[0]!.content).toBe("PRESET BEFORE");
    expect(all.indexOf("PRESET AFTER")).toBeGreaterThan(all.indexOf("She pours a cup."));
    expect(all.indexOf("Stop the roleplay here")).toBeGreaterThan(all.indexOf("PRESET AFTER"));
    expect(laid.at(-1)!.role).toBe("user");
    expect(laid.at(-1)!.content).toContain("Some days later, I ride north.");
    expect(laid.at(-1)!.content).toContain("Marta has set bread aside.");
    expect(laid.at(-1)!.content).toContain("begins at the message that starts");
  });

  test("with no preset the chat is said to be what it is, and the chapter's length is given in words", () => {
    const laid = chatLaid(null, { ...M, earlier: [], opener: undefined, wish: "what Marta thinks of the letter" }, DEFAULT_CONTENT);
    expect(laid[0]!.content).toContain("freeform roleplay");
    expect(laid[0]!.content).toContain("Marta: She keeps the inn.");
    expect(said(laid)).toContain("150 to 350 words");
    expect(laid.at(-1)!.content).toContain("what Marta thinks of the letter");
    expect(laid.at(-1)!.content).toContain("asked for a chapter now");
  });

  test("the rules: the player is a co-author, it is not a recap, their character is only seen, and nothing the chat must follow up", () => {
    const rules = chatRules(DEFAULT_CONTENT, true);
    for (const must of ["co-author", "not a recap", "only as others see", "This is not the next reply", "would have to follow up", "never the intimate scene itself", "TITLE:"]) expect(rules).toContain(must);
  });

  test("the answer is checked as any chapter is, and a preset's thinking and colours are taken out of it", async () => {
    const asked: { role: string; parameters?: unknown }[] = [];
    const ask: Ask = async (_m, role, opts) => (asked.push({ role, parameters: opts?.parameters }), `<Thoughts>Marta, alone, the fire.</Thoughts>\n${ANSWER.replace('"He\'ll be gone by morning,"', '<font color="#884400">"He\'ll be gone by morning,"</font>')}`);
    const draft = (await writeChatChapter(ask, M, DEFAULT_CONTENT, SNAP))!;
    expect(draft.title).toBe("What the Cook Heard");
    expect(draft.text.join(" ")).toContain('"He\'ll be gone by morning," the stable boy said');
    expect(draft.text.join(" ")).not.toContain("alone, the fire");
    expect(draft.facts).toEqual(["Marta has set bread aside for the stranger's road."]);
    expect(asked).toEqual([{ role: "teller", parameters: { temperature: 0.9 } }]);
    const why: string[] = [];
    expect(await writeChatChapter(async () => "I can't.", M, DEFAULT_CONTENT, null, (w) => void why.push(w))).toBeNull();
    expect(why.length).toBe(1);
  });
});

describe("whether a scene is over", () => {
  test("the question is asked of the Decision model as a choice, and of the reader as JSON", () => {
    const q = sceneQuestions("She pours a cup.", "Some days later, I ride north.");
    expect(Object.keys((q.questions.scene as { criteria?: object }).criteria ?? {})).toEqual(["new", "same", "unclear"]);
    expect(JSON.stringify(q.state)).toContain("Some days later");
    expect(said(sceneMessages("She pours a cup.", "Some days later, I ride north."))).toContain('{"scene": "new"}');
    expect(parseScene('```json\n{"scene": "New"}\n```')).toBe(true);
    expect(parseScene('{"scene":"same"}')).toBe(false);
    expect(parseScene("it depends")).toBeNull();
  });
});

describe("keeping the book beside a chat", () => {
  const setup = (o: { lines: () => ChatLine[]; scene?: "new" | "same" | "unsure" | "none"; reader?: string; chapter?: () => string | Promise<string>; snapshot?: PresetSnapshot | null }) => {
    const saved = new Map<string, Book>();
    const shown: Book[] = [];
    const fell: string[] = [];
    const asks: { role: string; text: string }[] = [];
    const decides: string[] = [];
    const ask: Ask = async (messages, role) => {
      asks.push({ role, text: said(messages) });
      if (role === "reader") return o.reader ?? '{"scene":"same"}';
      return o.chapter ? o.chapter() : ANSWER;
    };
    const decide: Decide | undefined =
      o.scene === "none" || o.scene === undefined
        ? undefined
        : async (what) => {
            decides.push(what);
            if (o.scene === "unsure") return { scene: { type: "choice", choice: "new", confidence: 0.3 } as never };
            return { scene: { type: "choice", choice: o.scene!, confidence: 0.9 } as never };
          };
    const keeper = chapterKeeper({ ask, card: "chat-abc", load: async (h) => saved.get(h) ?? null, save: async (h, b) => void saved.set(h, b), shelf: { writing: () => undefined, show: (b) => void shown.push(b) }, fellBack: (job, why) => void fell.push(`${job}: ${why}`) });
    const reads: number[] = [];
    const book = chatBook({
      chatId: "abc",
      lines: async (after) => {
        reads.push(after);
        const all = o.lines();
        return { lines: all.filter((l) => l.index > after), earlier: all.filter((l) => l.index <= after).slice(-3), last: all.at(-1)?.index ?? -1 };
      },
      who: async () => ({ card: { name: "Marta", about: "She keeps the inn." }, hero: { name: "Ash", who: "a courier" } }),
      snapshot: async () => o.snapshot ?? null,
      ask,
      ...(decide ? { decide } : {}),
      keeper,
      fellBack: (job, why) => void fell.push(`${job}: ${why}`),
    });
    return { book, saved, shown, fell, asks, decides, reads, keeper };
  };
  const tellers = (asks: { role: string }[]): number => asks.filter((a) => a.role === "teller").length;

  test("when the player's newest message opens a new scene, the one that is over gets its chapter", async () => {
    const all = chat(3, "Some days later, I ride north with the letter.");
    const { book, saved, decides, asks, fell } = setup({ lines: () => all, scene: "new" });
    const r = await book.replied();
    expect(r.chapter?.title).toBe("What the Cook Heard");
    expect(r.chapter).toMatchObject({ at: "chat", story: chatStory("abc"), upTo: 4, n: 1 });
    expect(decides).toEqual(["chat scene"]);
    // The Decision model was sure, so the reader was not asked; the chapter was written once.
    expect(asks.map((a) => a.role)).toEqual(["teller"]);
    const prompt = asks[0]!.text;
    expect(prompt).toContain("Marta answers, slowly, and pours another cup. (2)");
    expect(prompt).toContain("Some days later, I ride north with the letter.");
    // The newest reply can still be swiped: it is not in what the chapter is written from.
    expect(prompt).not.toContain("pours another cup. (3)");
    expect(writtenUpTo(saved.get(CHAT_HERO)!, "abc")).toBe(4);
    expect(fell).toEqual([]);
  });

  test("while the scene goes on nothing is written, and the same message is not asked about twice", async () => {
    const all = chat(3);
    const { book, decides, asks } = setup({ lines: () => all, scene: "same" });
    expect(await book.replied()).toEqual({ chapter: null, why: "same scene" });
    // The reply was swiped: the same message is still the newest.
    expect(await book.replied()).toEqual({ chapter: null, why: "same scene" });
    expect(decides.length).toBe(1);
    expect(tellers(asks)).toBe(0);
  });

  test("a Decision model that is not sure hands the question to the reader; with neither, nothing is written", async () => {
    const all = chat(3, "The next morning I am gone before anyone wakes.");
    const unsure = setup({ lines: () => all, scene: "unsure", reader: '{"scene":"new"}' });
    expect((await unsure.book.replied()).chapter).not.toBeNull();
    expect(unsure.asks.map((a) => a.role)).toEqual(["reader", "teller"]);
    const mute = setup({ lines: () => all, scene: "none", reader: "who can say" });
    expect(await mute.book.replied()).toEqual({ chapter: null, why: "same scene" });
    expect(mute.fell).toEqual(["chat scene: the reader did not say whether a new scene began"]);
  });

  test("too little since the last chapter is not asked about at all", async () => {
    const { book, asks, decides } = setup({ lines: () => chat(2), scene: "new" });
    // One settled reply besides the greeting... the greeting counts, so two turns is just enough; one turn is not.
    expect((await book.replied()).chapter).not.toBeNull();
    const few = setup({ lines: () => chat(1), scene: "new" });
    expect(await few.book.replied()).toEqual({ chapter: null, why: "too soon" });
    expect(few.asks).toEqual([]);
    expect(few.decides).toEqual([]);
    expect(asks.length + decides.length).toBeGreaterThan(0);
  });

  test("a scene that has run long gets a chapter without the question being asked", async () => {
    const { book, decides, asks } = setup({ lines: () => chat(MOST_REPLIES + 1), scene: "same" });
    expect((await book.replied()).chapter).not.toBeNull();
    expect(decides).toEqual([]);
    expect(asks.map((a) => a.role)).toEqual(["teller"]);
  });

  test("a chapter asked for is written at once from everything so far, about what was asked", async () => {
    const all = chat(1);
    const { book, asks, decides, saved } = setup({ lines: () => all, scene: "same" });
    const r = await book.write("what Marta thinks of the letter");
    expect(r.chapter?.upTo).toBe(2);
    expect(decides).toEqual([]);
    expect(asks[0]!.text).toContain("what Marta thinks of the letter");
    expect(asks[0]!.text).toContain("asked for a chapter now");
    // Nothing new since: asking again writes nothing, and says so.
    expect(await book.write()).toEqual({ chapter: null, why: "nothing new" });
    expect(saved.get(CHAT_HERO)!.chapters.length).toBe(1);
  });

  test("the next chapter begins where the last ended, knows what came before, and is told what the book established", async () => {
    let all = chat(3, "Some days later, I ride north.");
    const { book, asks, reads } = setup({ lines: () => all, scene: "new" });
    await book.replied();
    all = [...all, line(7, true, "At the ford I make camp."), line(8, false, "The river is high. A ferryman watches from the far bank."), line(9, true, "A week on, I reach the city."), line(10, false, "The gates are shut.")];
    const r = await book.replied();
    expect(r.chapter).toMatchObject({ n: 2, upTo: 8 });
    expect(reads).toEqual([-1, 4]);
    const prompt = asks.at(-1)!.text;
    expect(prompt).toContain("A ferryman watches from the far bank.");
    expect(prompt).toContain("Marta has set bread aside for the stranger's road.");
    expect(prompt).toContain("begins at the message that starts");
  });

  test("a chapter that fails is not kept, and its material waits: the mark only moves when a chapter is kept", async () => {
    let fail = true;
    const all = chat(3, "Some days later, I ride north.");
    const { book, saved, fell } = setup({ lines: () => all, scene: "new", chapter: () => (fail ? Promise.reject(new Error("the model is down")) : ANSWER) });
    expect(await book.replied()).toEqual({ chapter: null, why: "not written" });
    expect(fell).toEqual(["chapter: the model is down"]);
    expect(saved.get(CHAT_HERO)?.chapters.length ?? 0).toBe(0);
    fail = false;
    const r = await book.write();
    expect(r.chapter?.upTo).toBe(6);
  });

  test("messages deleted from under a chapter leave nothing new, not an error", async () => {
    let all = chat(3, "Some days later, I ride north.");
    const { book } = setup({ lines: () => all, scene: "new" });
    await book.replied();
    all = all.slice(0, 3);
    expect(await book.replied()).toEqual({ chapter: null, why: "nothing new" });
    expect(await book.write()).toEqual({ chapter: null, why: "nothing new" });
  });

  test("one thing at a time: a second look while a chapter is being written says so", async () => {
    let release: (s: string) => void = () => undefined;
    const all = chat(3, "Some days later, I ride north.");
    const { book } = setup({ lines: () => all, scene: "new", chapter: () => new Promise<string>((ok) => (release = ok)) });
    const first = book.replied();
    await new Promise((r) => setTimeout(r, 5));
    expect(book.writing()).toBe(true);
    expect(await book.write()).toEqual({ chapter: null, why: "busy" });
    release(ANSWER);
    expect((await first).chapter).not.toBeNull();
    expect(book.writing()).toBe(false);
  });
});
