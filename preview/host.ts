/**
 * A pretend Lumiverse for the built extension (dist/frontend.js), so the bundle can be tried in a browser without the
 * real host: it gives the frontend the few parts of the Spindle API it uses, and answers its backend messages itself
 * with a made-up card. Served by scripts/preview.ts at /host (run `bun run build` first).
 *
 * ?run=1 gives a pretend model for a run (src/game/runsit.ts): a sheet, a judge that calls for the die unless a line
 * only looks or asks, a short story and a read-back; without it every ask fails, as with no model. ?card=hangul gives
 * a card whose name is in Hangul, ?card=modern one set in our own times, ?card=world one that is a world rather than a
 * person. ?decide=1 grants the extras and gives a pretend Decision model. ?drawer=1, ?book=1 and ?table=1 show Tallow's
 * drawer tabs.
 */
import type { CardInfo } from "../src/game/card.js";
import { addCard, addWant, apply as applyRuling, arrive as arriveAt, newState } from "../src/engine/price.js";
import type { ModelsState, TableView, ToBackend, ToFrontend } from "../src/shared/protocol.js";

/** Made-up cards. */
const CARDS: Record<string, CardInfo> = {
  maren: {
    name: "Maren Vell",
    description: "Maren Vell is a lamplighter in the river town of Coldharbour, thirty-one, quick-tongued and stubborn, who knows every alley and roofline in the old quarter. She keeps a ledger of favours owed to her.",
    personality: "Wry, loyal, impatient with cowards.",
    scenario: "Coldharbour at dusk, when the lamps are lit.",
    firstMessage: "Maren swings down from her ladder and looks you over. \"You're late. The lamps don't wait, and neither do I.\"",
  },
  hangul: {
    name: "하나",
    description: "하나 is a potter of twenty-eight who keeps a small shop of bowls and cups by the sea, in a fishing town of steep lanes. She is patient, dry and kind, and she never forgets a debt.",
    personality: "Patient, dry, kind.",
  },
  modern: {
    name: "Ines Park",
    description: "Ines Park is a nurse on the night shift at a city hospital, thirty, sharp and tired. She lives in a small apartment downtown, drives a battered car, and texts you too late at night. She plays guitar in a band on weekends.",
    personality: "Sharp, warm under it, never sleeps.",
  },
  world: {
    name: "Thornvale",
    description: "{{char}} is the narrator of Thornvale, a valley kingdom of river towns, toll bridges and old forests, where the Guild and the Wardens quarrel over every road. {{char}} plays all the other characters.\nNPCs:\n- Edda, a ferrywoman who hears everything\n- Lord Asher, who keeps the high bridge\nFactions: the Guild, the Wardens",
    scenario: "You arrive in Thornvale on the last ferry of the day.",
  },
};
const WHICH = new URLSearchParams(location.search).get("card") ?? "maren";
const CARD = CARDS[WHICH] ?? CARDS.maren!;
const DECIDE = new URLSearchParams(location.search).get("decide") === "1";
/** ?run=1 gives a pretend model for a run (game/runsit.ts): a sheet, a judge that calls for the die unless the line only looks or asks, a short story, and a read-back. */
const RUN = new URLSearchParams(location.search).get("run") === "1";
function pretendRun(m: Extract<ToBackend, { type: "ask" }>): string | null {
  const sys = m.messages[0]?.content ?? "";
  const last = m.messages.at(-1)?.content ?? "";
  if (m.role === "builder" && sys.includes("set up a text adventure"))
    return JSON.stringify({
      place: { name: "The Lamplighters' Stair", text: "A steep stair between leaning houses, wet with dusk rain." },
      name: "Ash",
      calling: "Road-worn courier",
      attributes: ["dexterity", "cunning", "charisma", "intelligence", "strength"],
      skills: [{ name: "Stealth", level: 4 }, { name: "Climbing", level: 3 }, { name: "Haggling", level: 3 }, { name: "Running", level: 2 }, { name: "Lying", level: 2 }, { name: "Streetwise", level: 2 }, { name: "Knife work", level: 1 }, { name: "First aid", level: 1 }],
      abilities: [{ name: "Courier's Memory", text: "Recalls any street walked once, turn for turn.", tier: 1 }],
      items: [{ name: "Courier's satchel", text: "Sealed letters for three towns.", quality: "common", qty: 1, worn: true }, { name: "Belt knife", text: "Short and plain.", quality: "mundane", qty: 1, worn: true }],
      money: 12,
      coin: "silver",
      people: [{ name: CARD.name, text: "A lamplighter with a ledger of favours owed, impatient to be on with her round.", power: 3, hostile: false }],
      opening: `Rain has slicked the Lamplighters' Stair by the time you find her. ${CARD.name} swings down from her ladder, pole over one shoulder, and looks you over as if pricing you. "You're late. The lamps don't wait, and neither do I." Above, a shutter bangs; somewhere below, a watchman's rattle answers it. She tips her head at the dark quarter ahead, where three lamps stand unlit and something moves under the nearest.`,
    });
  if (m.role === "teller") return `You go about it as you wrote, and the stair gives you what it can. ${CARD.name} watches without a word, pole held loosely, ready to move either way.

When it is done, the thing under the lamp has shown itself: a boy with a hooked knife, more frightened than you are. "She sent me," he says, and does not say who.`;
  if (sys.includes("referee")) {
    const line = (/THE PLAYER WROTE:\s*"""([\s\S]*?)"""/.exec(last)?.[1] ?? "").toLowerCase();
    if (/^\s*\(?(ooc|how|what) /.test(line)) return JSON.stringify({ kind: "ooc" });
    const plain = /\b(look|ask|say|wait|greet)\b/.test(line) && !/\b(sneak|climb|grab|strike|lie|steal|jump|run)\b/.test(line);
    return JSON.stringify({ kind: "action", act: plain ? "look the quarter over" : "get close to the nearest lamp unseen", target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false, verdict: plain ? "trivial" : "challenge", reason: plain ? "Nothing resists it." : "Someone is watching the stair.", attribute: "dexterity", skill: "Stealth", for: ["the rain covers your steps", "the lamps are unlit"], against: ["something moves under the nearest lamp"], scores: { physical: 1, likelihood: 1, item: null, ability: null, other: null } });
  }
  if (sys.includes("records")) return JSON.stringify({ new: [{ name: "The boy with the hooked knife", text: "Sent by someone he will not name; more frightened than dangerous.", power: 2, hostile: false }], feelings: [{ who: CARD.name, delta: 3 }], xp: { why: "found the watcher", size: 3 }, minutes: 5 });
  if (sys.includes("spoken to you from outside")) return "You are at the Lamplighters' Stair with her; your sheets are by your left hand.";
  if (sys.includes("running summary")) return "Ash met the lamplighter on the stair at dusk and found a frightened boy with a hooked knife under an unlit lamp, sent by someone he would not name.";
  return null;
}
const decided: string[] = [];
/** Permissions this pretend user has granted; ?decide=1 grants the extras up front. */
const granted = new Set(["characters", "generation", "app_manipulation", ...(DECIDE ? ["decisions", "embeddings", "world_books"] : [])]);
/** Pretend connections and choices for the drawer. */
const PRETEND_LLM = [
  { id: "c1", name: "Main", model: "big-model-1", isDefault: true },
  { id: "c2", name: "Fast", model: "small-model-1", isDefault: false },
];
const settings: Omit<ModelsState, "llm" | "decisions" | "embeddings"> = {
  roles: { builder: { connectionId: null, reasoning: "auto" }, teller: { connectionId: null, reasoning: "auto" }, reader: { connectionId: null, reasoning: "auto" }, hero: { connectionId: null, reasoning: "auto" } },
  decision: "auto",
  embedding: "auto",
};

/** The pretend Decision model (?decide=1). */
function pretendDecide(m: Extract<ToBackend, { type: "decide" }>): Record<string, unknown> | null {
  const line = String((m.state as { line?: unknown }).line ?? "").toLowerCase();
  const q = m.questions.pick;
  decided.push(m.what);
  if (!line || !q || q.type !== "choice") return null;
  const words = (s: string) => s.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 3);
  const said = new Set(words(line));
  const score = Object.entries(q.criteria).map(([k, d]) => [k, words(`${k} ${typeof d === "string" ? d : ""}`).filter((w) => said.has(w)).length] as const);
  const best = Math.max(...score.map(([, n]) => n));
  const top = score.filter(([, n]) => n === best);
  const choice = best > 0 && top.length === 1 ? top[0]![0] : "unclear";
  return { pick: { type: "choice", choice, confidence: 0.9, probabilities: { [choice]: 0.9 } } };
}

/** [chat book] The pretend chat, the pretend host's storage for books, and what its model writes when asked for a chapter. */
const PRETEND_CHAT = [
  "The inn is warm and nearly empty. The innkeeper looks up from the fire.",
  "I shake the rain off my coat and ask about the road north.",
  "She tells you the bridge is out, and pours you a cup without being asked.",
  "I thank her, pay in silver, and go up to bed.",
  "The stair creaks under you. Below, the fire is banked for the night.",
].map((text, index) => ({ index, id: `m${index}`, you: index % 2 === 1, name: index % 2 === 1 ? "Ash" : "Marta", text }));
const books = new Map<string, unknown>();
const PRETEND_CHAPTER = [
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

/** [chat table] A pretend table under the pretend chat (?table=1 shows its tab): dealt by the engine itself, with one message played. */
let pretendTable: TableView | null = null;
function dealPretendTable(premise: string): TableView {
  const s = newState(7);
  arriveAt(s, "The Ferryman's Rest", "A warm, nearly empty inn on the north road; rain on the shutters.");
  addCard(s, "you", { name: "Courier's Satchel", kind: "thing", text: "Sealed letters for three towns, and the right to carry them.", catch: "Somebody always wants to know what is in it." });
  addCard(s, "you", { name: "Road-Hard Legs", kind: "trait", text: "Can walk a day and a night without stopping." });
  addCard(s, "you", { name: "A Purse of Silver", kind: "thing", text: "Enough for a week of inns, or one good bribe." });
  addCard(s, "you", { name: "The Guild's Token", kind: "fact", text: "Guild houses must give its bearer a bed.", catch: "The Wardens stop anyone who shows one." });
  addCard(s, "here", { name: "Marta", kind: "tie", text: "The innkeeper. Pours without being asked, and hears everything.", catch: "She tells the next traveller what she heard." }, null);
  addCard(s, "here", { name: "The Banked Fire", kind: "thing", text: "Warmth, light, and a place nobody is hurried from." });
  addWant(s, "you", { name: "The North Road, Open", text: "A way past the broken bridge before the letters go stale.", size: "middling", terms: ["Somebody who knows another crossing", "Leave to use it"] });
  addWant(s, "them", { name: "A Warden at the Door", text: "Shaking rain from his cloak and looking at every satchel in the room.", size: "small", terms: ["To see what the courier carries"], bite: "he takes the satchel to the toll-house" });
  const res = applyRuling(s, { plays: [{ card: "c3", on: "w7.1", fit: "part", give: true, why: "silver across the bar" }], declared: [{ term: "w7.2", cost: "a letter carried north for Marta, unread" }], time: 1 });
  return { on: true, state: s, ledger: res.ledger, news: [], premise, canUndo: true };
}

const listeners: ((m: unknown) => void)[] = [];
const reply = (m: ToFrontend): void => void setTimeout(() => listeners.forEach((f) => f(m)), 30);
const actions: { label: string; click: () => void }[] = [];

const ctx = {
  getActiveChat: () => ({ chatId: `chat-${WHICH}`, characterId: `card-${WHICH}` }),
  permissions: {
    getGranted: async () => [...granted],
    // As Lumiverse does: everything granted after the ask, not only what was asked for.
    request: async (p: string[]) => (p.forEach((x) => granted.add(x)), [...granted]),
  },
  sendToBackend(raw: unknown) {
    const m = raw as ToBackend;
    if (m.type === "card") reply({ type: "card", id: m.id, card: CARD });
    else if (m.type === "models") {
      if (m.patch) Object.assign(settings, m.patch.role ? { roles: { ...settings.roles, [m.patch.role]: { ...settings.roles[m.patch.role], ...("connectionId" in m.patch ? { connectionId: m.patch.connectionId ?? null } : {}), ...(m.patch.reasoning ? { reasoning: m.patch.reasoning } : {}) } } } : {}, "decision" in m.patch ? { decision: m.patch.decision || "auto" } : {}, "embedding" in m.patch ? { embedding: m.patch.embedding || "auto" } : {});
      reply({ type: "models", id: m.id, state: { ...settings, llm: PRETEND_LLM, decisions: DECIDE ? [{ id: "d1", name: "Quick reads", model: "jev-small", isDefault: true }] : null, embeddings: DECIDE ? [{ id: "e1", name: "Local embedder", model: "embed-small", isDefault: true }] : [] } });
    }
    else if (m.type === "decide") reply({ type: "decided", id: m.id, answers: DECIDE ? (pretendDecide(m) as never) : null });
    // [chat book] A pretend chat to keep a book beside (?book=1 shows its tab): its messages, who it is between, the
    // book's storage, and a chapter for the asking.
    else if (m.type === "chat") reply({ type: "chat", id: m.id, lines: PRETEND_CHAT.filter((l) => l.index > m.after), earlier: PRETEND_CHAT.filter((l) => l.index <= m.after).slice(-3), last: PRETEND_CHAT.length - 1 });
    else if (m.type === "who") reply({ type: "who", id: m.id, card: { name: CARD.name, about: "" }, hero: { name: "Ash", who: "a courier" } });
    else if (m.type === "preset") reply({ type: "preset", id: m.id, snapshot: null });
    else if (m.type === "book") reply({ type: "book", id: m.id, book: books.get(m.file) ?? null });
    else if (m.type === "book-keep") (books.set(m.file, m.book), reply({ type: "book-kept", id: m.id }));
    else if (m.type === "table") {
      if (m.do === "deal") setTimeout(() => ((pretendTable = dealPretendTable(m.premise ?? "")), reply({ type: "table", id: m.id, table: pretendTable })), 900);
      else {
        if (m.do === "drop") pretendTable = null;
        else if (pretendTable && (m.do === "on" || m.do === "off")) pretendTable = { ...pretendTable, on: m.do === "on" };
        else if (pretendTable && m.do === "undo") pretendTable = { ...pretendTable, ledger: [], canUndo: false };
        reply({ type: "table", id: m.id, table: pretendTable });
      }
    } else if (m.type === "ask" && m.role === "teller" && m.messages.some((x) => x.content.includes("Stop the roleplay here"))) setTimeout(() => reply({ type: "answer", id: m.id, text: PRETEND_CHAPTER }), 1500);
    else if (RUN && m.type === "ask" && pretendRun(m) !== null) setTimeout(() => reply({ type: "answer", id: m.id, text: pretendRun(m)! }), m.role === "teller" ? 2500 : 700);
    else reply({ type: "error", id: m.id, error: "no model in the pretend host" });
  },
  onBackendMessage(f: (m: unknown) => void) {
    listeners.push(f);
    return () => listeners.splice(listeners.indexOf(f), 1);
  },
  dom: {
    addStyle(css: string) {
      const el = document.createElement("style");
      el.textContent = css;
      document.head.appendChild(el);
      return () => el.remove();
    },
  },
  ui: {
    /** A drawer tab, shown on the right of the page so it can be looked at: Tallow's with ?drawer=1, the chat's book with ?book=1, the chat's table with ?table=1. */
    registerDrawerTab(o: { id: string }) {
      const book = o.id === "tallow-book";
      const kind = book ? "book" : o.id === "tallow-table" ? "table" : "drawer";
      const root = document.createElement("div");
      root.id = kind === "drawer" ? "drawer" : `${kind}drawer`;
      const shown = new URLSearchParams(location.search).get(kind) === "1";
      Object.assign(root.style, { position: "fixed", top: "0", right: "0", width: "min(360px, 100%)", height: "100%", overflow: "auto", background: "#1d1a17", color: "#e8e0d4", zIndex: "2", display: shown ? "" : "none" });
      document.body.appendChild(root);
      return {
        root,
        tabId: o.id,
        setTitle() {},
        setShortName() {},
        setBadge(t: string | null) {
          root.dataset.badge = t ?? "";
        },
        activate() {
          root.style.display = "";
        },
        destroy: () => root.remove(),
        onActivate: (f: () => void) => (shown && setTimeout(f, 50), () => {}),
      };
    },
    registerInputBarAction(o: { label: string }) {
      let click = (): void => {};
      const a = { label: o.label, click: () => click() };
      actions.push(a);
      const b = document.createElement("button");
      b.textContent = o.label;
      b.id = o.label === "Sit at the table" ? "sit" : `act${actions.length}`;
      // One above the other, so each can be clicked.
      Object.assign(b.style, { position: "fixed", bottom: `${16 + 28 * (actions.length - 1)}px`, left: "16px", zIndex: "1" });
      b.onclick = () => a.click();
      document.body.appendChild(b);
      return { actionId: "a", setLabel() {}, setSubtitle() {}, setEnabled() {}, onClick: (f: () => void) => ((click = f), () => {}), destroy: () => b.remove() };
    },
    mountApp() {
      const root = document.createElement("div");
      document.body.appendChild(root);
      return { root, mountId: "m", setVisible: (v: boolean) => (root.style.display = v ? "" : "none"), destroy: () => root.remove() };
    },
    createFloatWidget() {
      throw new Error("not in the pretend host");
    },
  },
};

window.addEventListener("tallow:room", (e) => Object.assign(window, { room: (e as CustomEvent).detail }));
window.addEventListener("tallow:director", (e) => Object.assign(window, { director: (e as CustomEvent).detail }));
const bundle = "/dist/frontend.js";
const mod = (await import(/* the built file, served as it is */ bundle)) as { setup(ctx: unknown): () => void };
mod.setup(ctx);
Object.assign(window, { hostReady: true, decided });
