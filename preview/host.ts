/**
 * A pretend Lumiverse for the built extension (dist/frontend.js), so the bundle can be tried in a browser without the
 * real host: it gives the frontend the few parts of the Spindle API it uses, and answers its backend messages itself
 * with a made-up card. The model is either absent (?model=0, the default: every ask fails and the stand-ins answer)
 * or a slow echo of canned answers is not attempted: this page only checks that the bundle mounts, reads a card and
 * plays through the opening at the table.
 *
 * Served by scripts/preview.ts at /host.
 */
import type { CardInfo } from "../src/game/card.js";
import type { ToBackend, ToFrontend } from "../src/shared/protocol.js";

/** A made-up card. */
const CARD: CardInfo = {
  name: "Maren Vell",
  description: "Maren Vell is a lamplighter in the river town of Coldharbour, thirty-one, quick-tongued and stubborn, who knows every alley and roofline in the old quarter. She keeps a ledger of favours owed to her.",
  personality: "Wry, loyal, impatient with cowards.",
  scenario: "Coldharbour at dusk, when the lamps are lit.",
  firstMessage: "Maren swings down from her ladder and looks you over. \"You're late. The lamps don't wait, and neither do I.\"",
};

const listeners: ((m: unknown) => void)[] = [];
const reply = (m: ToFrontend): void => void setTimeout(() => listeners.forEach((f) => f(m)), 30);
const actions: { label: string; click: () => void }[] = [];

const ctx = {
  getActiveChat: () => ({ chatId: "chat-1", characterId: "card-1" }),
  permissions: {
    getGranted: async () => ["characters", "generation", "app_manipulation"],
    request: async (p: string[]) => p,
  },
  sendToBackend(raw: unknown) {
    const m = raw as ToBackend;
    if (m.type === "card") reply({ type: "card", id: m.id, card: CARD });
    else reply({ type: "error", id: m.id, error: "no model in the pretend host" });
  },
  onBackendMessage(f: (m: unknown) => void) {
    listeners.push(f);
    return () => listeners.splice(listeners.indexOf(f), 1);
  },
  ui: {
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
const bundle = "/dist/frontend.js";
const mod = (await import(/* the built file, served as it is */ bundle)) as { setup(ctx: unknown): () => void };
mod.setup(ctx);
Object.assign(window, { hostReady: true });
