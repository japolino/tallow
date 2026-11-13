/**
 * A pretend Lumiverse for the built extension (dist/frontend.js), so the bundle can be tried in a browser without the
 * real host: it gives the frontend the few parts of the Spindle API it uses, and answers its backend messages itself
 * with a made-up card. The model is either absent (?model=0, the default: every ask fails and the stand-ins answer)
 * or a slow echo of canned answers is not attempted: this page only checks that the bundle mounts, reads a card and
 * plays through the opening at the table.
 *
 * Served by scripts/preview.ts at /host. ?card=hangul gives a card whose name is in Hangul, ?card=modern one set in our
 * own times, ?card=world one that is a world rather than a person. ?decide=1 grants the extras and gives a pretend Decision model: it picks the answer that shares the most
 * words with what was written (sure of it when one does), and is never sure how a line tries to get past, so the
 * line goes on to the reader and the rules as it would with a real one that cannot tell.
 * ?scenes=1 gives a pretend builder that answers one thing only: asked for a story of scenes (game/scenewriter.ts), it
 * hands back the stock one (content/scenes.ts), so the hand of dice can be played at the table with no model. Every
 * line is then read by its words and told in code's plain ones.
 */
import { STOCK_SCENES_RAW } from "../src/content/scenes.js";
import type { CardInfo } from "../src/game/card.js";
import type { ModelsState, ToBackend, ToFrontend } from "../src/shared/protocol.js";

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
const SCENES = new URLSearchParams(location.search).get("scenes") === "1";
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
    } else if (SCENES && m.type === "ask" && m.role === "builder" && m.messages.some((x) => x.content.includes("THE STORY TO WRITE"))) reply({ type: "answer", id: m.id, text: JSON.stringify(STOCK_SCENES_RAW) });
    else if (m.type === "decide") reply({ type: "decided", id: m.id, answers: DECIDE ? (pretendDecide(m) as never) : null });
    // [chat book] A pretend chat to keep a book beside (?book=1 shows its tab): its messages, who it is between, the
    // book's storage, and a chapter for the asking.
    else if (m.type === "chat") reply({ type: "chat", id: m.id, lines: PRETEND_CHAT.filter((l) => l.index > m.after), earlier: PRETEND_CHAT.filter((l) => l.index <= m.after).slice(-3), last: PRETEND_CHAT.length - 1 });
    else if (m.type === "who") reply({ type: "who", id: m.id, card: { name: CARD.name, about: "" }, hero: { name: "Ash", who: "a courier" } });
    else if (m.type === "preset") reply({ type: "preset", id: m.id, snapshot: null });
    else if (m.type === "book") reply({ type: "book", id: m.id, book: books.get(m.file) ?? null });
    else if (m.type === "book-keep") (books.set(m.file, m.book), reply({ type: "book-kept", id: m.id }));
    else if (m.type === "ask" && m.role === "teller" && m.messages.some((x) => x.content.includes("Stop the roleplay here"))) setTimeout(() => reply({ type: "answer", id: m.id, text: PRETEND_CHAPTER }), 1500);
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
    /** A drawer tab, shown on the right of the page so it can be looked at: Tallow's with ?drawer=1, the chat's book with ?book=1. */
    registerDrawerTab(o: { id: string }) {
      const book = o.id === "tallow-book";
      const root = document.createElement("div");
      root.id = book ? "bookdrawer" : "drawer";
      const shown = new URLSearchParams(location.search).get(book ? "book" : "drawer") === "1";
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
      b.id = "sit";
      Object.assign(b.style, { position: "fixed", bottom: "16px", left: "16px", zIndex: "1" });
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
