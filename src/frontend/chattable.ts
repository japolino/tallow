/**
 * The table kept under an ordinary chat, in Lumiverse (engine/price.ts, game/pricetable.ts, backend/table.ts). It has
 * a drawer tab of its own, "Table": what your character holds, what is in the scene, what you are after and what
 * stands in its way, and what is held against you. The chat is played as it always is; the tab only shows the table,
 * deals one, takes the last message back, and turns it on or off.
 *
 * Off for every chat until a table is dealt in it: each of your messages is then read by your models before the reply
 * is written, which is a small generation of its own, and needs Lumiverse's "interceptor" permission.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { CANDLE, WOUNDS, type Card, type Want } from "../engine/price.js";
import type { TableView, ToBackend, ToFrontend } from "../shared/protocol.js";

type Call = (msg: ToBackend extends infer M ? (M extends { id: string } ? Omit<M, "id"> : never) : never) => Promise<ToFrontend>;

export interface ChatTables {
  /** A chat's table has changed (the backend says so). */
  changed(chatId: string): void;
  open(): void;
  dispose(): void;
}

const NEEDS = ["interceptor", "chats", "chat_mutation", "generation", "characters"];
const WHY = "Tallow reads each message you send in this chat before the reply is written, plays it at the table, and tells your model what is now true. It also reads the chat once to set the table. Lumiverse lets an extension read a chat's messages under the same permission that would let it change them; Tallow only reads, and never changes or adds a message.";
const EXTRAS = ["personas", "decisions"];
const WHY_EXTRAS = "Optional. With your persona the table knows who your character is; with your Decision model each message is judged in about two seconds, and more strictly.";
const ASKED = "tallow:asked-table-extras-1";

const ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.500" y="4.500" width="8" height="11" rx="1.300" transform="rotate(-8 7.500 10)"/><rect x="9" y="4.500" width="8" height="11" rx="1.300" transform="rotate(9 13 10)"/></svg>`;

const CSS = `
.twt { font: 14px/1.5 system-ui, sans-serif; padding: 14px; display: grid; gap: 16px; }
.twt h2 { margin: 0; font: 600 17px/1.25 Georgia, "Times New Roman", serif; }
.twt h3 { margin: 0 0 6px; font: 600 11px/1.2 system-ui; letter-spacing: .12em; text-transform: uppercase; opacity: .62; }
.twt .sub, .twt .hint { font-size: 13px; opacity: .72; }
.twt button { padding: 8px 12px; border-radius: 9px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25));
  background: var(--lumiverse-fill-subtle, rgba(127,127,127,.06)); color: inherit; cursor: pointer; font: inherit; }
.twt button:hover:not(:disabled) { border-color: var(--lumiverse-primary, #c8a26a); }
.twt button:disabled { opacity: .5; cursor: default; }
.twt .primary { background: var(--lumiverse-primary, #c8a26a); color: var(--lumiverse-primary-contrast, #111); border-color: transparent; font-weight: 600; }
.twt .quiet { padding: 4px 10px; font-size: 13px; }
.twt input[type=text] { font: inherit; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25));
  background: var(--lumiverse-fill-subtle, rgba(127,127,127,.06)); color: inherit; min-width: 0; width: 100%; box-sizing: border-box; }
.twt .ask { display: grid; gap: 8px; }
.twt .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.twt .status { font-size: 13px; min-height: 1.5em; opacity: .8; }
.twt .top { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: center; }
.twt .candle { display: flex; gap: 2px; }
.twt .candle i { flex: 1; height: 8px; border-radius: 2px; background: var(--lumiverse-border, rgba(127,127,127,.25)); }
.twt .candle i.lit { background: var(--lumiverse-primary, #c8a26a); }
.twt .dice { display: flex; gap: 6px; }
.twt .dice b { min-width: 28px; text-align: center; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); font-variant-numeric: tabular-nums; }
.twt .dice b.low { opacity: .55; }
.twt .cards { display: grid; gap: 8px; }
.twt .card { padding: 9px 11px; border-radius: 10px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); display: grid; gap: 3px; }
.twt .card.tired { opacity: .55; }
.twt .card.against { border-style: dashed; }
.twt .card .name { font: 600 14px/1.3 Georgia, "Times New Roman", serif; display: flex; justify-content: space-between; gap: 8px; }
.twt .card .name span { font: 12px/1.5 system-ui; opacity: .7; white-space: nowrap; }
.twt .card .text { font-size: 13px; }
.twt .card .catch { font-size: 13px; font-style: italic; opacity: .75; }
.twt .hurdle { display: grid; grid-template-columns: auto 1fr; gap: 8px; font-size: 13px; align-items: baseline; }
.twt .pips { letter-spacing: 2px; font-size: 11px; white-space: nowrap; }
.twt .hurdle.met { opacity: .6; text-decoration: line-through; }
.twt ul { margin: 0; padding-left: 18px; display: grid; gap: 3px; font-size: 13px; }
.twt .seg { display: flex; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); border-radius: 999px; overflow: hidden; width: max-content; max-width: 100%; }
.twt .seg button { border: 0; border-radius: 0; padding: 4px 11px; background: none; font-size: 13px; }
.twt .seg button.on { background: var(--lumiverse-primary, #c8a26a); color: var(--lumiverse-primary-contrast, #111); }
.twt hr { border: 0; border-top: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); margin: 0; }
.twt [hidden] { display: none !important; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

function cardEl(c: Card, against = false): HTMLElement {
  const box = el("div", `card${c.tired ? " tired" : ""}${against ? " against" : ""}`);
  const name = el("div", "name", c.name);
  const badge = c.tired ? "tired until a rest" : c.uses !== null ? `${c.uses} use${c.uses === 1 ? "" : "s"}` : "";
  if (badge) name.appendChild(el("span", "", badge));
  box.append(name, el("div", "text", c.text));
  if (c.catch) box.appendChild(el("div", "catch", `The catch: ${c.catch}`));
  return box;
}

function wantEl(w: Want): HTMLElement {
  const box = el("div", "card");
  box.appendChild(el("div", "name", w.name));
  if (w.text) box.appendChild(el("div", "text", w.text));
  for (const t of w.terms) {
    const met = t.points >= t.need;
    const row = el("div", `hurdle${met ? " met" : ""}`);
    row.append(el("span", "pips", "●".repeat(Math.min(t.points, t.need)) + "○".repeat(Math.max(0, t.need - t.points))), el("span", "", t.text));
    row.title = met ? "Cleared" : `${t.points} of ${t.need}`;
    box.appendChild(row);
  }
  return box;
}

function troubleEl(w: Want): HTMLElement {
  const box = el("div", "card against");
  const name = el("div", "name", w.name);
  name.appendChild(el("span", "", `in ${w.fuse ?? 0} beat${w.fuse === 1 ? "" : "s"}`));
  box.append(name, el("div", "text", w.text));
  const t = w.terms[0];
  if (t) {
    const row = el("div", "hurdle");
    row.append(el("span", "pips", "●".repeat(Math.min(t.points, t.need)) + "○".repeat(Math.max(0, t.need - t.points))), el("span", "", `It wants: ${t.text}`));
    box.appendChild(row);
  }
  if (w.bite) box.appendChild(el("div", "catch", `Left alone: ${w.bite}`));
  return box;
}

export function createChatTables(ctx: SpindleFrontendContext, o: { call: Call }): ChatTables {
  const tab = ctx.ui.registerDrawerTab({
    id: "tallow-table",
    title: "The table under this chat",
    shortName: "Table",
    description: "A light game under your roleplay: what your character holds, what you are after, and what it will cost",
    keywords: ["table", "game", "cards", "rpg", "wants", "markers", "tallow"],
    iconSvg: ICON,
  });
  const removeStyle = ctx.dom.addStyle(CSS);
  const root = el("div", "twt");
  root.innerHTML = `
    <div><h2>The table under this chat</h2><div class="sub" data-sub></div></div>
    <div class="status" data-status></div>
    <div data-table hidden>
      <div class="twt-body" style="display:grid;gap:16px">
        <div class="top">
          <div><h3>The candle <span data-night></span></h3><div class="candle" data-candle></div></div>
          <div><h3>Dice</h3><div class="dice" data-dice></div></div>
          <div class="hint" data-wounds></div>
        </div>
        <div data-did-box><h3>What your last message did</h3><ul data-did></ul><div class="row" style="margin-top:8px"><button class="quiet" data-undo>Take it back</button></div></div>
        <div><h3>What you are after</h3><div class="cards" data-wants></div></div>
        <div><h3>Yours</h3><div class="cards" data-yours></div></div>
        <div><h3>Here</h3><div class="cards" data-here></div></div>
        <div><h3>Held against you</h3><div class="cards" data-against></div></div>
        <hr>
        <div class="row"><div class="seg" data-on><button data-v="on">Playing</button><button data-v="off">Paused</button></div><button class="quiet" data-drop>Put the table away</button></div>
      </div>
    </div>
    <div class="ask">
      <input type="text" data-premise maxlength="300" placeholder="What is your character after? (optional)">
      <button class="primary" data-deal>Deal a table for this chat</button>
      <div class="hint">Your chat stays an ordinary chat. Write what you like, including what others do and what has already happened: nothing is refused. The table reads each message you send, counts what your character really brought to it, and tells your model what is now true. What you take without paying for goes on account, and comes back.</div>
      <div class="hint">Each message you send is one small generation on your reader model (and one question to your Decision model, if you have one) before the reply is written. A table is dealt from where the chat is now.</div>
    </div>`;
  tab.root.appendChild(root);
  const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const subEl = q("[data-sub]");
  const statusEl = q("[data-status]");
  const tableEl = q("[data-table]");
  const dealEl = q<HTMLButtonElement>("[data-deal]");
  const premiseEl = q<HTMLInputElement>("[data-premise]");
  const undoEl = q<HTMLButtonElement>("[data-undo]");

  let disposed = false;
  let shown = false;
  let busy = false;
  const status = (t: string): void => {
    statusEl.textContent = t;
  };

  const fill = (sel: string, nodes: HTMLElement[], empty: string): void => {
    const box = q(sel);
    box.textContent = "";
    if (nodes.length) box.append(...nodes);
    else box.appendChild(el("div", "hint", empty));
  };

  const render = (v: TableView | null): void => {
    tableEl.hidden = !v;
    dealEl.textContent = v ? "Deal a new table" : "Deal a table for this chat";
    if (!v) return;
    const s = v.state;
    const candle = q("[data-candle]");
    candle.textContent = "";
    for (let i = 0; i < CANDLE; i++) candle.appendChild(el("i", i < s.candle ? "lit" : ""));
    candle.title = `${s.candle} of ${CANDLE} notches left`;
    q("[data-night]").textContent = (s.night ?? 1) > 1 ? `· night ${s.night}` : "";
    const dice = q("[data-dice]");
    dice.textContent = "";
    for (const d of s.dice) dice.appendChild(el("b", d < 11 ? "low" : "", String(d)));
    dice.title = "Spent when a message has nothing on the table behind it. 11 or more costs no time.";
    q("[data-wounds]").textContent = s.wounds ? `${s.wounds} of ${WOUNDS} wounds` : "";
    const did = q("[data-did]");
    did.textContent = "";
    for (const l of v.ledger.length ? v.ledger : ["Nothing at the table changed."]) did.appendChild(el("li", "", l.replace(/ \([cwx]\d+(?:\.\d+)?\)/g, "")));
    for (const l of v.news) did.appendChild(el("li", "", `Since then: ${l.replace(/ Bring it into the scene[\s\S]*$/, "")}`));
    q("[data-did-box]").hidden = !v.canUndo && !v.news.length;
    undoEl.hidden = !v.canUndo;
    fill("[data-wants]", s.wants.filter((w) => w.whose === "you").map(wantEl), "Nothing yet. Reach for something in the chat and it will be put here, with what stands in its way.");
    fill("[data-yours]", s.cards.filter((c) => c.side === "you").map((c) => cardEl(c)), "Nothing.");
    fill("[data-here]", s.cards.filter((c) => c.side === "here").map((c) => cardEl(c)), "Nothing in the scene to lean on yet.");
    fill("[data-against]", [...s.wants.filter((w) => w.whose === "them").map(troubleEl), ...s.cards.filter((c) => c.kind === "debt").map((c) => cardEl(c, true))], "Nothing. You owe nobody.");
    root.querySelectorAll<HTMLButtonElement>("[data-on] button").forEach((b) => b.classList.toggle("on", (b.dataset.v === "on") === v.on));
  };

  const active = (): string => ctx.getActiveChat().chatId ?? "";

  const refresh = async (): Promise<void> => {
    const chatId = active();
    if (!chatId) return (render(null), status("Open a chat with a character first."));
    const granted = await ctx.permissions.getGranted().catch(() => [] as string[]);
    if (!NEEDS.every((p) => granted.includes(p))) return (render(null), status(""));
    try {
      const m = await o.call({ type: "table", chatId });
      if (disposed || active() !== chatId) return;
      render(m.type === "table" ? m.table : null);
    } catch (e) {
      status(`The table could not be read (${e instanceof Error ? e.message : String(e)}).`);
    }
  };

  const act = async (what: "deal" | "on" | "off" | "undo" | "drop", saying: string): Promise<void> => {
    const chatId = active();
    if (!chatId || busy) return;
    busy = true;
    dealEl.disabled = true;
    status(saying);
    try {
      if (what === "deal") {
        let granted = await ctx.permissions.getGranted().catch(() => [] as string[]);
        if (!NEEDS.every((p) => granted.includes(p))) granted = await ctx.permissions.request(NEEDS.filter((p) => !granted.includes(p)), { reason: WHY } as never).catch(() => granted);
        if (!NEEDS.every((p) => granted.includes(p))) return status("The table needs to read your messages before a reply, and was not allowed to.");
        let askedBefore = true;
        try {
          askedBefore = localStorage.getItem(ASKED) === "1";
          localStorage.setItem(ASKED, "1");
        } catch {
          askedBefore = true;
        }
        if (!askedBefore && !EXTRAS.every((p) => granted.includes(p))) await ctx.permissions.request(EXTRAS.filter((p) => !granted.includes(p)), { reason: WHY_EXTRAS } as never).catch(() => granted);
      }
      const m = await o.call({ type: "table", chatId, do: what, ...(what === "deal" ? { premise: premiseEl.value.trim() } : {}) });
      if (disposed || active() !== chatId) return;
      render(m.type === "table" ? m.table : null);
      status(what === "deal" ? "The table is set. Carry on with the chat." : what === "undo" ? "Taken back. Send or regenerate, and the message is played again." : "");
      if (what === "deal") premiseEl.value = "";
    } catch (e) {
      status(`${what === "deal" ? "No table was dealt" : "That did not go through"} (${e instanceof Error ? e.message : String(e)}).`);
    } finally {
      busy = false;
      dealEl.disabled = false;
    }
  };

  dealEl.addEventListener("click", () => void act("deal", "Setting the table from where the chat is now. This takes about half a minute…"));
  undoEl.addEventListener("click", () => void act("undo", "Taking it back…"));
  q("[data-drop]").addEventListener("click", () => void act("drop", "Putting the table away…"));
  root.querySelectorAll<HTMLButtonElement>("[data-on] button").forEach((b) => b.addEventListener("click", () => void act(b.dataset.v === "on" ? "on" : "off", "")));

  const offShown = tab.onActivate(() => {
    shown = true;
    tab.setBadge(null);
    status("");
    void refresh();
  });
  let offSwitch: (() => void) | null = null;
  try {
    offSwitch = ctx.events.on("CHAT_SWITCHED", () => {
      status("");
      subEl.textContent = "";
      if (shown) void refresh();
    });
  } catch {
    offSwitch = null;
  }

  return {
    changed(chatId) {
      if (disposed || active() !== chatId) return;
      if (shown) void refresh();
      else tab.setBadge("•");
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
