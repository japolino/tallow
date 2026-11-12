/**
 * The narrator's book (engine/chapter.ts, game/chapterwriter.ts, game/chapters.ts, backend/book.ts, backend/pictures.ts):
 * what a chapter is written from, how a model's answer is checked, how the book is kept, and how a picture is asked of
 * Inlay Illustrator over the shared RPC pool (a fake pool here, as the sibling project Gambit tests its own).
 */
import { describe, expect, test } from "bun:test";
import { COURIER, RESCUE } from "../src/content/adventures.js";
import { STOCK_SCENES } from "../src/content/scenes.js";
import { startTrip, type Trip } from "../src/engine/adventure.js";
import { bookFile, chapterMaterial, chapterWorth, checkChapter, emptyBook, established, establishedSaid, markOf, pictureId, readBook, withChapter, withMark, withoutMark, withPicture, type Book, type BookChapter } from "../src/engine/chapter.js";
import { DEFAULT_CONTENT } from "../src/engine/content.js";
import { START } from "../src/engine/hero.js";
import type { Sheet } from "../src/engine/moment.js";
import { sceneAdventure, startHand } from "../src/engine/hand.js";
import { allowedChapter, chapterMessages, materialSaid, parseChapter, writeChapter } from "../src/game/chapterwriter.js";
import { chapterKeeper, CLOTHED } from "../src/game/chapters.js";
import type { Ask, Message } from "../src/game/prompts.js";
import { bookPathOk, createBooks } from "../src/backend/book.js";
import { createPictures } from "../src/backend/pictures.js";
import { layBook, openingPage, roman, wrapLines } from "../src/room/bookpages.js";

const SHEET: Sheet = { stats: { brawn: 1, grace: 2, charm: 3, guile: 2, wits: 1, sense: 1 }, ...START, hour: 19 };
const begun = (): Trip => startHand(startTrip(sceneAdventure(STOCK_SCENES, { seed: "book", who: "a courier", startHour: 19 }), SHEET, "book"));
/** The story after its first scene, got through, resting before the second. */
const afterFirst = (): Trip => {
  const t = begun();
  return { ...t, deeds: ["talked Orla round"], hand: { ...t.hand!, scene: 1, opened: false } };
};
const HERO = { name: "Wren", who: "a courier with a sealed letter" };

const ANSWER = [
  "TITLE: The Ferry Keeper's Coin",
  "",
  "Orla did not sleep. She sat in the boat shed with the lamp turned low and turned the stranger's coin over and over, as if it might tell her whose it was. The river talked to itself under the boards.",
  "",
  "Toward dawn her brother came in wet to the knees. \"They asked about the courier at the toll yard,\" he said. \"I told them nothing.\" Orla put the coin in her apron and said that was the first wise thing he had done all year.",
  "",
  "FACTS:",
  "- Orla kept the stranger's coin and means to say nothing of it.",
  "- The toll yard is asking after the courier.",
  "PICTURE: A broad tired woman sits alone in a lamplit boat shed at night, turning a coin in her fingers, the river dark beyond the open door.",
].join("\n");

describe("what a chapter is written from", () => {
  test("at a rest: the scene got through, its person, the player's deeds and the narrator's lines", () => {
    const m = chapterMaterial(afterFirst(), "rest", { hero: HERO, told: ["The ferry pulls away into the fog."], more: ["Orla's brother works the toll yard."] });
    expect(m.happened.length).toBe(1);
    expect(m.happened[0]).toContain("The Night Ferry");
    expect(m.happened[0]).toContain("the player got through");
    expect(m.people.map((p) => p.name)).toEqual(["Orla"]);
    expect(m.people[0]!.wants).toContain("keep the coin");
    expect(m.deeds).toEqual(["talked Orla round"]);
    expect(m.told).toEqual(["The ferry pulls away into the fog."]);
    // More material goes in through `more`, and reaches the model as it is.
    expect(m.more).toEqual(["Orla's brother works the toll yard."]);
    expect(materialSaid(m)).toContain("MORE:\n- Orla's brother works the toll yard.");
    expect(m.hero).toEqual({ name: "Wren", who: "a courier with a sealed letter" });
    expect(chapterWorth(m)).toBe(true);
  });

  test("the next chapter starts where the last left off: no scene, deed or loss written about twice", () => {
    const t1 = afterFirst();
    const mark = markOf(t1, 5);
    const t2: Trip = { ...t1, over: "deadline", deeds: [...t1.deeds, "slipped past the sergeant"], hand: { ...t1.hand!, scene: 2, opened: true, lost: ["They keep your purse."] } };
    const m = chapterMaterial(t2, "end", { hero: HERO, since: mark });
    expect(m.happened.map((h) => h.split(":")[0])).toEqual(["The Toll Yard", "The Magistrate's Door"]);
    expect(m.deeds).toEqual(["slipped past the sergeant"]);
    expect(m.lost).toEqual(["They keep your purse."]);
    expect(m.people.map((p) => p.name)).toEqual(["Halden"]);
    expect(m.story.over).toBe("lost");
    expect(m.story.ending).toBe(STOCK_SCENES.lost);
    // Nothing new since a mark: not worth a chapter at a rest, but the end of a story always is.
    const still = chapterMaterial(t1, "rest", { hero: HERO, since: mark });
    expect(still.happened).toEqual([]);
    expect(chapterWorth(still)).toBe(false);
    expect(chapterWorth({ ...still, at: "end" })).toBe(true);
  });

  test("a road story: the stops reached since the last chapter, and who was at each", () => {
    const t = startTrip(RESCUE, COURIER, "road");
    const first = t.adv.stops.find((s) => !t.visited.includes(s.id))!;
    const bram = { id: "bram", name: "Bram", look: "a miller floured to the elbows", voice: "slow and gruff", wants: "his mill wheel mended", attitude: "friendly", helped: true };
    const walked = { ...t, visited: [...t.visited, first.id], people: { [first.id]: bram } } as unknown as Trip;
    const m = chapterMaterial(walked, "stop", { hero: HERO, since: markOf(t, 0) });
    expect(m.happened.length).toBe(1);
    expect(m.happened[0]).toContain(first.name);
    expect(m.people).toEqual([{ name: "Bram", who: "a miller floured to the elbows; slow and gruff", wants: "his mill wheel mended", met: `${first.name}; they are friendly toward the player, and the player did what they wanted` }]);
  });

  test("the model is told it is not a recap, and given the form", () => {
    const [sys, user] = chapterMessages(chapterMaterial(afterFirst(), "rest", { hero: HERO }), DEFAULT_CONTENT, false) as [Message, Message];
    expect(sys.content).toContain("A chapter is not a recap");
    expect(sys.content).toContain("TITLE:");
    expect(sys.content).toContain("PICTURE:");
    expect(user.content).toContain("THE PLAYER'S CHARACTER (seen only by others): Wren");
  });
});

describe("a model's chapter, checked", () => {
  test("the form asked for is read into its parts", () => {
    const d = checkChapter(parseChapter(ANSWER))!;
    expect(d.title).toBe("The Ferry Keeper's Coin");
    expect(d.text.length).toBe(2);
    expect(d.text[0]).toStartWith("Orla did not sleep.");
    expect(d.facts).toEqual(["Orla kept the stranger's coin and means to say nothing of it.", "The toll yard is asking after the courier."]);
    expect(d.picture).toStartWith("A broad tired woman");
  });

  test("its form is forgiven: JSON, bare prose with a heading, markdown, a chapter too long", () => {
    const json = checkChapter(parseChapter(JSON.stringify({ title: "Chapter Two: Wet Boots", text: ["Orla's brother came in wet to the knees and said nothing about the courier for a long while."], facts: "Orla's brother lied to the yard; he means to keep lying" })))!;
    expect(json.title).toBe("Wet Boots");
    expect(json.facts).toEqual(["Orla's brother lied to the yard", "he means to keep lying"]);
    const bare = checkChapter(parseChapter("**The Lamp in the Shed**\n\nOrla sat up with the lamp low and the coin in her hand, and listened to the river talking under the boards until dawn."))!;
    expect(bare.title).toBe("The Lamp in the Shed");
    expect(bare.text[0]).toStartWith("Orla sat up");
    const long = checkChapter({ text: `${"Orla turned the coin over again. ".repeat(120)}` })!;
    expect(long.text.join(" ").length).toBeLessThanOrEqual(2600);
    expect(long.text[0]).toEndWith(".");
  });

  test("only a missing or empty chapter is refused, and it says why", () => {
    const why: string[] = [];
    expect(checkChapter(parseChapter(""), (r) => why.push(r))).toBeNull();
    expect(checkChapter(parseChapter("TITLE: Nothing\nFACTS:\n- none"), (r) => why.push(r))).toBeNull();
    expect(checkChapter(parseChapter("Orla slept."), (r) => why.push(r))).toBeNull();
    expect(why).toEqual(["no chapter in the answer", "no chapter in the answer", "only 2 words: too short to be a chapter"]);
  });

  test("the table's lines are kept: a chapter that crosses them is refused, a picture that does is dropped", () => {
    const d = checkChapter(parseChapter(ANSWER))!;
    const veiled = { ...DEFAULT_CONTENT, lines: ["coin"] };
    const why: string[] = [];
    expect(allowedChapter(d, veiled, (r) => why.push(r))).toBeNull();
    expect(why[0]).toBe("it crossed the table's lines");
    const lamp = allowedChapter(d, { ...DEFAULT_CONTENT, lines: ["lamplit"] })!;
    expect(lamp.picture).toBe("");
    expect(lamp.text).toEqual(d.text);
  });

  test("written by a model; with no model, or none that answers, nothing is written and the reason is given", async () => {
    let asked: Message[] = [];
    const ask: Ask = async (messages) => ((asked = messages), ANSWER);
    const m = chapterMaterial(afterFirst(), "rest", { hero: HERO });
    const d = await writeChapter(ask, m, DEFAULT_CONTENT, null);
    expect(d?.title).toBe("The Ferry Keeper's Coin");
    expect(asked[0]!.content).toContain("not a recap");
    const why: string[] = [];
    expect(await writeChapter(null, m, DEFAULT_CONTENT, null, (r) => why.push(r))).toBeNull();
    expect(await writeChapter(async () => "No.", m, DEFAULT_CONTENT, null, (r) => why.push(r))).toBeNull();
    expect(why).toEqual(["no model to write it", "only 1 words: too short to be a chapter"]);
  });
});

const chapterOf = (id: string, story = "s|1", facts = ["Orla kept the coin."]): Omit<BookChapter, "n"> => ({ id, story, storyTitle: "The Letter", at: "rest", title: `Chapter ${id}`, text: ["Orla sat up all night with the lamp low and the coin in her hand."], facts, hour: 21, written: 1 });
const MARK = { deeds: [], scene: 1, lost: 0, visited: 0, told: 3 };

describe("the book", () => {
  test("chapters are numbered by code, marks kept per story, and the oldest go first past the most", () => {
    let b = emptyBook("Wren", "Maren");
    b = withChapter(b, chapterOf("a"), MARK);
    b = withChapter(b, chapterOf("b"), { ...MARK, scene: 2 });
    expect(b.chapters.map((c) => c.n)).toEqual([1, 2]);
    expect(b.marks["s|1"]!.scene).toBe(2);
    expect(withoutMark(b, "s|1").marks).toEqual({});
    expect(withMark(b, "t|2", MARK).marks["t|2"]).toEqual(MARK);
    let big = emptyBook("Wren", "Maren");
    for (let i = 0; i < 85; i++) big = withChapter(big, chapterOf(`c${i}`), MARK);
    expect(big.chapters.length).toBe(80);
    expect(big.chapters[0]!.id).toBe("c5");
    expect(big.chapters[0]!.n).toBe(1);
  });

  test("read back from storage: what is whole is kept, what is not is dropped, and a non-book is an empty one", () => {
    const b = withPicture(withChapter(emptyBook("Wren", "Maren"), chapterOf("a"), MARK), "a", { id: "p", status: "ready", imageId: "img1", url: "/api/v1/images/img1" });
    const back = readBook(JSON.parse(JSON.stringify(b)), "Wren", "Maren");
    expect(back).toEqual(b);
    const torn = readBook({ v: 1, hero: "Wren", chapters: [{ id: "x" }, { id: "y", text: ["Some words here."], picture: { id: 3 } }, 7], marks: { k: { scene: -2, deeds: "no" } } }, "Wren", "Maren");
    expect(torn.chapters.map((c) => c.id)).toEqual(["y"]);
    expect(torn.chapters[0]!.picture).toBeUndefined();
    expect(torn.marks.k).toEqual({ deeds: [], scene: 0, lost: 0, visited: 0, told: 0 });
    expect(readBook("nonsense", "Wren", "Maren")).toEqual(emptyBook("Wren", "Maren"));
    expect(readBook({ v: 2, chapters: [] }, "Wren", "Maren")).toEqual(emptyBook("Wren", "Maren"));
  });

  test("what it established: a story's own facts for its tellings, the last chapters' for the next story's builder", () => {
    let b = emptyBook("Wren", "Maren");
    b = withChapter(b, chapterOf("a", "old|1", ["The miller owes Wren a favour."]), MARK);
    b = withChapter(b, chapterOf("b", "new|2", ["Orla kept the coin."]), MARK);
    expect(established(b, "new|2")).toEqual(["Orla kept the coin."]);
    expect(established(b)).toEqual(["(The Letter) The miller owes Wren a favour.", "(The Letter) Orla kept the coin."]);
    expect(establishedSaid([])).toBe("");
    expect(establishedSaid(["Orla kept the coin."])).toContain("true in this story from now on");
  });

  test("where it is kept, and the picture's id: safe letters only, the same each time", () => {
    expect(bookFile("chat 1", "char/2", "Wren the Bold!")).toBe("books/char-2/chat-1-wren-the-bold.json");
    expect(bookPathOk(bookFile("abc", "def", "Ünïcode Hero"))).toBe(true);
    expect(bookPathOk("../secrets.json")).toBe(false);
    expect(bookPathOk("books/x/../../y.json")).toBe(false);
    const id = pictureId("Maren-Wren", "c123");
    expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.:#-]{0,95}$/);
    expect(pictureId("Maren-Wren", "c123")).toBe(id);
    const long = pictureId("x".repeat(200), "c999");
    expect(long.length).toBeLessThanOrEqual(96);
  });
});

describe("the book kept in the user's own storage (backend/book.ts)", () => {
  const store = () => {
    const files = new Map<string, unknown>();
    const spindle = {
      userStorage: {
        getJson: async <T,>(path: string, o: { fallback: T }) => (files.has(path) ? (files.get(path) as T) : o.fallback),
        setJson: async (path: string, v: unknown) => void files.set(path, v),
      },
    };
    return { files, books: createBooks(spindle as never) };
  };

  test("a book is kept at its own path and read back; nothing else is written anywhere", async () => {
    const { files, books } = store();
    const file = bookFile("chat", "char", "Wren");
    expect(await books.read("u", file)).toBeNull();
    const b = withChapter(emptyBook("Wren", "Maren"), chapterOf("a"), MARK);
    await books.keep("u", file, b);
    expect(await books.read("u", file)).toEqual(b);
    expect([...files.keys()]).toEqual([file]);
    expect(books.keep("u", "../etc/passwd", b)).rejects.toThrow("not a book's path");
    expect(books.keep("u", file, { v: 2 })).rejects.toThrow("not a book");
    expect(books.read("u", "elsewhere.json")).rejects.toThrow("not a book's path");
  });
});

describe("the keeper: chapters written in the background, kept and shelved", () => {
  const keeper = (ask: Ask | null, draw?: (p: { id: string; text: string }) => Promise<{ imageId: string; url: string } | { why: string }>) => {
    const saved = new Map<string, Book>();
    const shown: Book[] = [];
    const writing: Promise<unknown>[] = [];
    const fell: string[] = [];
    let allowed = !!draw;
    const k = chapterKeeper({
      ask,
      card: "Maren",
      load: async (h) => saved.get(h) ?? null,
      save: async (h, b) => void saved.set(h, b),
      shelf: { writing: (w) => void writing.push(w), show: (b) => void shown.push(b) },
      ...(draw ? { pictures: { allowed: () => allowed, draw } } : {}),
      fellBack: (job, why) => void fell.push(`${job}: ${why}`),
    });
    return { k, saved, shown, writing, fell, allow: (on: boolean) => (allowed = on) };
  };

  test("a rest's chapter is written, kept, shelved, and its picture drawn, without the game waiting on any of it", async () => {
    const prompts: string[] = [];
    const drawn: { id: string; text: string }[] = [];
    const { k, saved, shown, writing, fell } = keeper(
      async (messages) => (prompts.push(messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n")), ANSWER),
      async (p) => (drawn.push(p), { imageId: "img9", url: "/api/v1/images/img9" }),
    );
    k.heard(["The ferry pulls away into the fog."]);
    k.due(afterFirst(), "rest", HERO);
    await k.settled();
    const b = saved.get("Wren")!;
    expect(b.chapters.length).toBe(1);
    expect(b.chapters[0]!.title).toBe("The Ferry Keeper's Coin");
    expect(b.chapters[0]!.picture).toMatchObject({ status: "ready", imageId: "img9" });
    expect(writing.length).toBe(1);
    expect(shown.at(-1)!.chapters[0]!.picture?.status).toBe("ready");
    // What the narrator said is in what the chapter is written from, and the picture is never more than clothed.
    expect(prompts[0]).toContain("The ferry pulls away into the fog.");
    expect(drawn[0]!.text).toContain("A broad tired woman");
    expect(drawn[0]!.text).toEndWith(CLOTHED);
    expect(fell).toEqual([]);
    // From now on the tellings and the next builder are told what it established.
    k.story(b.chapters[0]!.story);
    expect(k.established()).toContain("Orla kept the stranger's coin");
    expect(k.forBuilder()).toContain("Orla kept the stranger's coin");
  });

  test("pictures are asked only while the user allows them", async () => {
    const draws: string[] = [];
    const { k, saved, allow } = keeper(async () => ANSWER, async (p) => (draws.push(p.id), { why: "never" }));
    allow(false);
    k.due(afterFirst(), "rest", HERO);
    await k.settled();
    expect(draws).toEqual([]);
    expect(saved.get("Wren")!.chapters[0]!.picture).toBeUndefined();
  });

  test("a failed chapter is not written, and why goes to the fallback report; its material waits for the next one", async () => {
    let n = 0;
    const { k, saved, fell } = keeper(async () => (n++ < 2 ? Promise.reject(new Error("the model is down")) : ANSWER));
    k.due(afterFirst(), "rest", HERO);
    await k.settled();
    expect(saved.get("Wren")?.chapters.length ?? 0).toBe(0);
    expect(fell).toEqual(["chapter: the model is down"]);
    // The same story, later: the first scene is still in what the next chapter is written from.
    const t = afterFirst();
    k.due({ ...t, hand: { ...t.hand!, scene: 2, opened: false } }, "rest", HERO);
    await k.settled();
    expect(saved.get("Wren")!.chapters.length).toBe(1);
  });

  test("nothing new since the last chapter: none is written, only the mark moves", async () => {
    let asked = 0;
    const { k, saved } = keeper(async () => (asked++, ANSWER));
    const t = afterFirst();
    k.due(t, "rest", HERO);
    await k.settled();
    k.due(t, "rest", HERO);
    await k.settled();
    expect(asked).toBe(1);
    expect(saved.get("Wren")!.chapters.length).toBe(1);
  });

  test("a picture that fails is reported, and the chapter stands without it", async () => {
    const { k, saved, fell } = keeper(async () => ANSWER, async () => ({ why: "Inlay Illustrator took too long" }));
    k.due(afterFirst(), "rest", HERO);
    await k.settled();
    expect(saved.get("Wren")!.chapters[0]!.picture).toMatchObject({ status: "failed", why: "Inlay Illustrator took too long" });
    expect(fell).toEqual(["chapter picture: Inlay Illustrator took too long"]);
  });

  test("the trip is taken as it was when the chapter came due, though play goes on and changes it", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { k, saved } = keeper(async () => (await gate, ANSWER));
    const t = afterFirst();
    k.due(t, "rest", HERO);
    t.deeds.push("something done after the rest");
    release();
    await k.settled();
    expect(saved.get("Wren")!.marks[`${t.adv.id}|${t.seed}`]!.deeds).toEqual(["talked Orla round"]);
  });
});

describe("pictures from Inlay Illustrator, over a fake shared pool (backend/pictures.ts)", () => {
  const pool = (answers: (published: { id: string; text: string; direction: string; chatId: string }[], n: number) => unknown) => {
    const published: { key: string; value: { version: number; pictures: { id: string; text: string; direction: string; chatId: string }[] }; requires: string[] }[] = [];
    const reads: string[] = [];
    let n = 0;
    const spindle = {
      rpcPool: {
        sync: (key: string, value: never, o: { requires: string[] }) => void published.push({ key, value, requires: o.requires }),
        read: async (key: string) => (reads.push(key), answers(published.at(-1)?.value.pictures ?? [], n++)),
      },
    };
    return { published, reads, pictures: createPictures(spindle as never, () => {}, { pollMs: 1, busyWaitMs: 1 }) };
  };

  test("asked as a scene, polled until it is ready, then taken off the list", async () => {
    const { published, reads, pictures } = pool((list, n) => ({ version: 1, pictures: Object.fromEntries(list.map((p) => [p.id, n < 2 ? { status: n ? "running" : "queued" } : { status: "ready", imageId: "img7" }])) }));
    const got = await pictures.request("User_1", { id: "tallow:book:m:c1", chatId: "chat1", text: "A boat shed at night." });
    expect(got).toEqual({ imageId: "img7", url: "/api/v1/images/img7" });
    expect(published[0]!.key).toBe("inlay.pictures.user_1");
    expect(published[0]!.requires).toEqual(["characters"]);
    expect(published[0]!.value.pictures).toEqual([{ id: "tallow:book:m:c1", chatId: "chat1", direction: "scene", text: "A boat shed at night." }]);
    expect(reads[0]).toBe("inlay_illustrator.pictures.user_1");
    // Once it has come, the list Tallow publishes no longer asks for it.
    await new Promise((r) => setTimeout(r, 5));
    expect(published.at(-1)!.value.pictures).toEqual([]);
  });

  test("a busy image connection is waited out; a real failure, a missing Inlay and a bad request say why", async () => {
    let tries = 0;
    const busy = pool((list) => ({ version: 1, pictures: Object.fromEntries(list.map((p) => [p.id, tries++ < 1 ? { status: "failed", error: "429 too many concurrent generations" } : { status: "ready", imageId: "img8", url: "/x/img8" }])) }));
    expect(await busy.pictures.request("u", { id: "p1", chatId: "c1", text: "A lamp." })).toEqual({ imageId: "img8", url: "/x/img8" });
    const failed = pool((list) => ({ version: 1, pictures: Object.fromEntries(list.map((p) => [p.id, { status: "failed", error: "no image connection" }])) }));
    expect(await failed.pictures.request("u", { id: "p2", chatId: "c1", text: "A lamp." })).toEqual({ why: "Inlay Illustrator could not draw it: no image connection" });
    const none = pool(() => {
      throw new Error("no such endpoint");
    });
    expect(await none.pictures.request("u", { id: "p3", chatId: "c1", text: "A lamp." })).toEqual({ why: "Inlay Illustrator does not answer" });
    expect(await none.pictures.ready("u")).toBe(false);
    expect(await none.pictures.request("u", { id: "bad id!", chatId: "c1", text: "A lamp." })).toEqual({ why: "not an id Inlay takes" });
    expect(await none.pictures.request("u", { id: "p4", chatId: "", text: "A lamp." })).toEqual({ why: "no chat for Inlay to read" });
  });

  test("a user id the pool cannot take is asked for as the owner", async () => {
    const p = pool((list) => ({ version: 1, pictures: Object.fromEntries(list.map((x) => [x.id, { status: "ready", imageId: "i" }])) }));
    expect(await p.pictures.request("Not A Segment!", { id: "p5", chatId: "c1", text: "A lamp." })).toEqual({ imageId: "i", url: "/api/v1/images/i" });
    expect(p.published[0]!.key).toBe("inlay.pictures.owner");
  });
});

describe("the book laid out in pages (room/bookpages.ts)", () => {
  const measure = (s: string, f: string) => s.length * (f === "body" ? 14 : f === "title" ? 19 : 12);

  test("a first page, then each chapter from a page of its own, its picture on its first page; always a spread", () => {
    let b = withChapter(emptyBook("Wren", "Maren"), { ...chapterOf("a"), text: Array.from({ length: 6 }, () => "Orla sat up all night with the lamp low and the coin in her hand, listening to the river under the boards. ".repeat(3)) }, MARK);
    b = withChapter(b, chapterOf("b"), MARK);
    b = withPicture(b, "b", { id: "p", status: "ready", imageId: "img" });
    const pages = layBook(b, measure);
    expect(pages[0]!.kind).toBe("front");
    expect(pages[0]!.said).toContain("The Book of Wren");
    expect(pages.length % 2).toBe(0);
    const a = pages.filter((p) => p.chapter === "a");
    expect(a.length).toBeGreaterThan(1);
    expect(a[0]!.kind).toBe("title");
    expect(a[1]!.head).toBe("The Letter");
    const bPages = pages.filter((p) => p.chapter === "b");
    expect(bPages[0]!.items.some((i) => i.t === "picture")).toBe(true);
    expect(bPages[0]!.items.some((i) => i.t === "line" && i.font === "body")).toBe(false);
    // It opens at its newest chapter.
    expect(pages[openingPage(pages, b)]!.chapter).toBe("b");
    // No line runs off its page.
    for (const p of pages) for (const it of p.items) if (it.t === "line" && it.font === "body") expect(it.y).toBeLessThan(1008 - 60);
  });

  test("an empty book opens at its first page and says nothing is written", () => {
    const pages = layBook(emptyBook("Wren", "Maren"), measure);
    expect(pages.length).toBe(2);
    expect(pages[0]!.said).toContain("Nothing is written in it yet.");
    expect(openingPage(pages, emptyBook("Wren", "Maren"))).toBe(0);
  });

  test("lines wrap at spaces, and a word too long for a line is cut", () => {
    const m = (s: string) => s.length * 10;
    expect(wrapLines(m, "one two three four", 100)).toEqual(["one two", "three four"]);
    expect(wrapLines(m, "abcdefghijklmnop", 50)).toEqual(["abcde", "fghij", "klmno", "p"]);
    expect(roman(4)).toBe("IV");
    expect(roman(19)).toBe("XIX");
  });
});
