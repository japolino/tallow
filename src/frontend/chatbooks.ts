/**
 * The narrator's book beside an ordinary chat, in Lumiverse (engine/chatbook.ts, game/chatbook.ts, docs/DESIGN.md 3.5,
 * item 30). It has a drawer tab of its own, "Book", where the open chat's book is read as plain pages with its
 * pictures, and where a chapter can be asked for. When it is switched on, the narrator also writes one by itself each
 * time a scene of the chat is over. The chat is only read; nothing is ever put into it or kept from it.
 *
 * Off until the user turns it on: a chapter is a generation on their own model, and reading a chat needs permissions
 * Tallow's table does not ("chats" and "chat_mutation", which Lumiverse also uses for reading).
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { bookFile, type Book, type BookChapter } from "../engine/chapter.js";
import { CHAT_HERO, chatStory } from "../engine/chatbook.js";
import { DEFAULT_CONTENT, readContent, type ContentSettings } from "../engine/content.js";
import { chapterKeeper } from "../game/chapters.js";
import { chatBook, type ChatBook, type ChatBookResult, type ChatWho } from "../game/chatbook.js";
import type { Decide } from "../game/decide.js";
import type { PresetSnapshot } from "../game/preset.js";
import type { Ask } from "../game/ask.js";
import type { ToBackend, ToFrontend } from "../shared/protocol.js";
import { picturesOn } from "./pictures.js";

type Call = (msg: ToBackend extends infer M ? (M extends { id: string } ? Omit<M, "id"> : never) : never) => Promise<ToFrontend>;

export interface ChatBooksOptions {
  call: Call;
  ask: Ask;
  decide: Decide;
  /** Whether you are sitting at Tallow's table now: the chat's book is not written while you are. */
  sitting(): boolean;
}

export interface ChatBooks {
  /** A reply has just been written in a chat (the backend says so). */
  replied(chatId: string, kind: string): void;
  /** Show the book's tab. */
  open(): void;
  dispose(): void;
}

/** Whether the narrator writes by itself when a scene is over. Kept in the page: there is nothing secret in it. */
const AUTO_KEY = "tallow:chatbook";
const autoOn = (): boolean => {
  try {
    return localStorage.getItem(AUTO_KEY) === "on";
  } catch {
    return false;
  }
};
const setAuto = (on: boolean): void => {
  try {
    localStorage.setItem(AUTO_KEY, on ? "on" : "off");
  } catch {
    /* Not kept: off again next time. */
  }
};

/** What reading a chat and writing from it needs, and why, in the words of the host's own permission dialog. */
const NEEDS = ["chats", "chat_mutation", "generation", "characters"];
const WHY = "Tallow reads this chat to write the narrator's book beside it, and asks your model to write each chapter. Lumiverse lets an extension read a chat's messages under the same permission that would let it change them; Tallow only reads, and never changes or adds a message.";
const EXTRAS = ["personas", "presets", "decisions"];
const WHY_EXTRAS = "Optional. With your persona the book knows who you are in the chat; with your preset its chapters are written the way your chats are; and your Decision model tells in a second when a scene is over (all only read).";
const ASKED = "tallow:asked-book-extras-1";

/** A chat's preset is read once and kept this long: it is a model call to judge its blocks. */
const SNAPSHOT_MS = 20 * 60_000;

const ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5.2C8.4 4 6.2 3.6 3.5 3.8v11.4c2.7-.2 4.9.2 6.5 1.4 1.6-1.2 3.800-1.6 6.5-1.4V3.800C13.800 3.600 11.600 4 10 5.200z"/><path d="M10 5.200v11.400"/></svg>`;

const CSS = `
.twb { font: 14px/1.5 system-ui, sans-serif; padding: 14px; display: grid; gap: 14px; }
.twb h2 { margin: 0; font: 600 17px/1.25 Georgia, "Times New Roman", serif; }
.twb .sub { font-size: 13px; opacity: .7; }
.twb .hint { font-size: 13px; opacity: .72; }
.twb button { padding: 8px 12px; border-radius: 9px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25));
  background: var(--lumiverse-fill-subtle, rgba(127,127,127,.06)); color: inherit; cursor: pointer; font: inherit; }
.twb button:hover:not(:disabled) { border-color: var(--lumiverse-primary, #c8a26a); }
.twb button:disabled { opacity: .5; cursor: default; }
.twb .primary { background: var(--lumiverse-primary, #c8a26a); color: var(--lumiverse-primary-contrast, #111); border-color: transparent; font-weight: 600; }
.twb input[type=text] { font: inherit; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25));
  background: var(--lumiverse-fill-subtle, rgba(127,127,127,.06)); color: inherit; min-width: 0; width: 100%; box-sizing: border-box; }
.twb .ask { display: grid; gap: 8px; }
.twb .seg { display: flex; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); border-radius: 999px; overflow: hidden; width: max-content; max-width: 100%; }
.twb .seg button { border: 0; border-radius: 0; padding: 4px 11px; background: none; font-size: 13px; }
.twb .seg button.on { background: var(--lumiverse-primary, #c8a26a); color: var(--lumiverse-primary-contrast, #111); }
.twb .status { font-size: 13px; min-height: 1.5em; opacity: .8; }
.twb .pages { display: grid; gap: 26px; }
.twb article { display: grid; gap: 10px; }
.twb article .n { font: 600 11px/1.2 system-ui; letter-spacing: .12em; text-transform: uppercase; opacity: .6; }
.twb article h3 { margin: 0; font: 600 18px/1.25 Georgia, "Times New Roman", serif; }
.twb article p { margin: 0; font: 15px/1.65 Georgia, "Times New Roman", serif; text-wrap: pretty; }
.twb article img { width: 100%; height: auto; border-radius: 8px; display: block; }
.twb article .plate { font-size: 13px; opacity: .6; font-style: italic; }
.twb hr { border: 0; border-top: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); margin: 0; }
`;

const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Why there is no chapter, in the user's words. */
const WHY_NOT: Record<Exclude<ChatBookResult, { chapter: BookChapter }>["why"], string> = {
  "nothing new": "Nothing has happened in the chat since the last chapter.",
  "too soon": "Too little has happened since the last chapter.",
  "same scene": "The scene is still going on.",
  busy: "The narrator is already writing.",
  "not written": "No chapter came this time. Ask again in a moment.",
};

interface Open {
  chatId: string;
  characterId: string;
  book: ChatBook;
  who: Promise<ChatWho>;
}

export function createChatBooks(ctx: SpindleFrontendContext, o: ChatBooksOptions): ChatBooks {
  const tab = ctx.ui.registerDrawerTab({
    id: "tallow-book",
    title: "The narrator's book",
    shortName: "Book",
    description: "Chapters the narrator writes beside this chat: what happened among the others when your character was not there",
    keywords: ["book", "chapter", "story", "narrator", "aftermath", "tallow"],
    iconSvg: ICON,
  });
  const removeStyle = ctx.dom.addStyle(CSS);
  const root = document.createElement("div");
  root.className = "twb";
  root.innerHTML = `
    <div><h2>The narrator's book</h2><div class="sub" data-sub></div></div>
    <div class="ask">
      <input type="text" data-wish maxlength="300" placeholder="What should it be about? (optional)">
      <button class="primary" data-write>Write a chapter now</button>
      <div class="status" data-status></div>
    </div>
    <div class="pages" data-pages></div>
    <hr>
    <div class="ask">
      <div class="seg" data-auto><button data-on="1">Write by itself</button><button data-on="0">Only when I ask</button></div>
      <div class="hint">Your chat is the story. When a scene is over, the narrator writes a short chapter here of what you did not see: what the others made of it, a little later or in between. Nothing is ever put into the chat.</div>
      <div class="hint">By itself: after each reply a quick question is asked of your Decision model (or the reader), and a chapter is written when your newest message has moved the story on. Each chapter is one generation on your model.</div>
    </div>`;
  tab.root.appendChild(root);
  const subEl = root.querySelector<HTMLElement>("[data-sub]")!;
  const statusEl = root.querySelector<HTMLElement>("[data-status]")!;
  const pagesEl = root.querySelector<HTMLElement>("[data-pages]")!;
  const wishEl = root.querySelector<HTMLInputElement>("[data-wish]")!;
  const writeEl = root.querySelector<HTMLButtonElement>("[data-write]")!;
  const autoEl = root.querySelector<HTMLElement>("[data-auto]")!;

  let disposed = false;
  let shown = false;
  let unseen = 0;
  let open: Open | null = null;
  const snapshots = new Map<string, { at: number; got: Promise<PresetSnapshot | null> }>();

  const status = (t: string): void => {
    statusEl.textContent = t;
  };
  const showAuto = (): void => autoEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.classList.toggle("on", (b.dataset.on === "1") === autoOn()));

  const content = (): ContentSettings => {
    try {
      const raw = localStorage.getItem("tallow:content");
      return raw ? readContent(JSON.parse(raw)) : DEFAULT_CONTENT;
    } catch {
      return DEFAULT_CONTENT;
    }
  };

  /** A chapter's picture: from Lumiverse by its address, or from its bytes when that will not load. */
  const plate = (img: HTMLImageElement, c: BookChapter): void => {
    const p = c.picture;
    if (!p || p.status !== "ready") return;
    const bytes = (): void => {
      img.onerror = () => img.remove();
      if (!p.imageId) return img.remove();
      o.call({ type: "image", imageId: p.imageId }).then(
        (m) => (m.type === "image" && m.data ? (img.src = m.data) : img.remove()),
        () => img.remove(),
      );
    };
    img.onerror = bytes;
    if (p.url) img.src = p.url;
    else bytes();
  };

  const render = (book: Book | null, chatId: string): void => {
    const own = (book?.chapters ?? []).filter((c) => c.story === chatStory(chatId));
    pagesEl.textContent = "";
    if (!own.length) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "Nothing is written yet for this chat.";
      pagesEl.appendChild(empty);
      return;
    }
    // Newest first: the chapter just written is the one you came to read.
    for (const [i, c] of [...own.entries()].reverse()) {
      const a = document.createElement("article");
      a.innerHTML = `<div class="n">Chapter ${i + 1}</div>${c.title ? `<h3>${esc(c.title)}</h3>` : ""}`;
      if (c.picture?.status === "ready") {
        const img = document.createElement("img");
        img.alt = c.scene ?? "";
        img.loading = "lazy";
        plate(img, c);
        a.appendChild(img);
      } else if (c.picture?.status === "asked") {
        const wait = document.createElement("div");
        wait.className = "plate";
        wait.textContent = "Its picture is being painted.";
        a.appendChild(wait);
      }
      for (const para of c.text) {
        const p = document.createElement("p");
        p.textContent = para;
        a.appendChild(p);
      }
      pagesEl.appendChild(a);
    }
  };

  const snapshotOf = (chatId: string, granted: readonly string[]): Promise<PresetSnapshot | null> => {
    if (!granted.includes("presets")) return Promise.resolve(null);
    const kept = snapshots.get(chatId);
    if (kept && Date.now() - kept.at < SNAPSHOT_MS) return kept.got;
    const got = o.call({ type: "preset", chatId }).then(
      (m) => (m.type === "preset" ? m.snapshot : null),
      () => null,
    );
    snapshots.set(chatId, { at: Date.now(), got });
    return got;
  };

  /** The open chat's book, made the first time it is wanted; null (with why, in the status) when it cannot be. */
  const forChat = async (askFor: boolean): Promise<Open | null> => {
    const { chatId, characterId } = ctx.getActiveChat();
    if (!chatId || !characterId) return (status("Open a chat with a character first."), null);
    if (open && open.chatId === chatId) return open;
    let granted = await ctx.permissions.getGranted().catch(() => [] as string[]);
    if (!NEEDS.every((p) => granted.includes(p))) {
      if (!askFor) return null;
      granted = await ctx.permissions.request(NEEDS.filter((p) => !granted.includes(p)), { reason: WHY } as never).catch(() => granted);
      if (!NEEDS.every((p) => granted.includes(p))) return (status("The book needs to read this chat, and was not allowed to."), null);
    }
    if (askFor && !EXTRAS.every((p) => granted.includes(p))) {
      let asked = true;
      try {
        asked = localStorage.getItem(ASKED) === "1";
        localStorage.setItem(ASKED, "1");
      } catch {
        asked = true;
      }
      if (!asked) granted = await ctx.permissions.request(EXTRAS.filter((p) => !granted.includes(p)), { reason: WHY_EXTRAS } as never).catch(() => granted);
    }
    const file = bookFile(chatId, characterId, CHAT_HERO);
    const who = o.call({ type: "who", chatId }).then(
      (m): ChatWho => (m.type === "who" ? { card: m.card, hero: m.hero } : { card: { name: "", about: "" }, hero: { name: "the player's character", who: "" } }),
      (): ChatWho => ({ card: { name: "", about: "" }, hero: { name: "the player's character", who: "" } }),
    );
    const here = (): boolean => ctx.getActiveChat().chatId === chatId;
    const keeper = chapterKeeper({
      ask: o.ask,
      card: `chat-${chatId.slice(0, 12)}`,
      load: () => o.call({ type: "book", file }).then((m) => (m.type === "book" ? m.book : null)),
      save: (_hero, book) => o.call({ type: "book-keep", file, book }).then(() => undefined),
      shelf: {
        writing: (work) => {
          if (!here()) return;
          writeEl.disabled = true;
          status("The narrator is writing…");
          void work.finally(() => {
            if (here()) writeEl.disabled = false;
          });
        },
        show: (book) => {
          if (here()) render(book, chatId);
        },
      },
      pictures: {
        allowed: () => picturesOn(),
        draw: (p) => o.call({ type: "picture", picture: { id: p.id, chatId, text: p.text } }).then((m) => (m.type === "picture" && m.picture ? m.picture : { why: (m.type === "picture" && m.why) || "no picture came" })),
      },
      content,
      fellBack: (job, why) => console.warn(`tallow: the chat book's ${job} was not taken (${why})`),
    });
    const g = granted;
    const book = chatBook({
      chatId,
      lines: (after) =>
        o.call({ type: "chat", chatId, after }).then((m) => {
          if (m.type !== "chat") throw new Error("the chat could not be read");
          return { lines: m.lines, earlier: m.earlier, last: m.last };
        }),
      who: () => who,
      snapshot: () => snapshotOf(chatId, g),
      ask: o.ask,
      ...(g.includes("decisions") ? { decide: o.decide } : {}),
      keeper,
      content,
      fellBack: (job, why) => console.warn(`tallow: the chat book's ${job} was not taken (${why})`),
    });
    open = { chatId, characterId, book, who };
    void who.then((w) => {
      if (here()) subEl.textContent = w.card.name ? `Beside your chat with ${w.card.name}` : "";
    });
    return open;
  };

  /** Show the open chat's book in the tab. */
  const refresh = async (askFor: boolean): Promise<void> => {
    const { chatId } = ctx.getActiveChat();
    if (!chatId) {
      subEl.textContent = "";
      pagesEl.textContent = "";
      return status("Open a chat with a character first.");
    }
    const b = await forChat(askFor);
    if (!b || disposed) {
      if (!b && !statusEl.textContent) status("Write a chapter, or turn on “Write by itself”, and Tallow will ask to read this chat.");
      return;
    }
    try {
      render(await b.book.book(), b.chatId);
    } catch (e) {
      status(`The book could not be read (${e instanceof Error ? e.message : String(e)}).`);
    }
  };

  const said = (r: ChatBookResult, here: boolean): void => {
    if (!here) return;
    status(r.chapter ? `Written: ${r.chapter.title || `Chapter ${r.chapter.n}`}.` : WHY_NOT[r.why]);
  };

  writeEl.addEventListener("click", () => {
    void (async () => {
      status("");
      const b = await forChat(true);
      if (!b) return;
      const wish = wishEl.value.trim();
      status("The narrator is writing…");
      const r = await b.book.write(wish || undefined);
      if (r.chapter) wishEl.value = "";
      said(r, ctx.getActiveChat().chatId === b.chatId);
    })().catch((e) => status(`No chapter came (${e instanceof Error ? e.message : String(e)}).`));
  });
  autoEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
    b.addEventListener("click", () => {
      setAuto(b.dataset.on === "1");
      showAuto();
      // Turning it on is when the chat's permissions are asked for.
      if (autoOn()) void refresh(true).catch(() => undefined);
    }),
  );
  showAuto();

  const offShown = tab.onActivate(() => {
    shown = true;
    unseen = 0;
    tab.setBadge(null);
    status("");
    void refresh(false).catch(() => undefined);
  });
  // The tab stops being the one shown when another is: the host says nothing then, so a new chapter always marks it.
  let offSwitch: (() => void) | null = null;
  try {
    offSwitch = ctx.events.on("CHAT_SWITCHED", () => {
      open = null;
      status("");
      if (shown) void refresh(false).catch(() => undefined);
    });
  } catch {
    offSwitch = null;
  }

  return {
    replied(chatId, kind) {
      if (disposed || !autoOn() || o.sitting() || kind === "impersonate") return;
      if (ctx.getActiveChat().chatId !== chatId) return;
      void (async () => {
        const b = await forChat(false);
        if (!b) return;
        const r = await b.book.replied();
        if (!r.chapter) return;
        said(r, ctx.getActiveChat().chatId === b.chatId);
        unseen++;
        tab.setBadge(String(unseen));
        shown = false;
      })().catch((e) => console.warn("tallow: the chat's book:", e));
    },
    open() {
      tab.activate();
    },
    dispose() {
      disposed = true;
      offShown();
      offSwitch?.();
      removeStyle();
      tab.destroy();
    },
  };
}
