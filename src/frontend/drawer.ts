/**
 * Tallow's tab in the Lumiverse drawer: where it is set up, outside the game. The room itself shows nothing but the room
 * (docs/DESIGN.md, 1); everything that is chosen once and kept lives here instead:
 *   a button to sit down at the table for this chat;
 *   which permissions Tallow has, and a way to give the ones it is missing;
 *   which of the user's connections each job uses, whether it may think first, and the Decision and embedding models;
 *   the sound: on or off, how loud, and who made the music and the recordings.
 *
 * The models section is adapted from the sibling project's drawer (its src/frontend/host/panel.ts). Copied, not
 * imported (docs/DESIGN.md, 10).
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { Role } from "../game/prompts.js";
import type { ModelsPatch, ReasoningPick } from "../meaning/models.js";
import type { ConnOption, ModelsState } from "../shared/protocol.js";
import { ALL_TRACKS, credit } from "../room/music.js";
import { sound, type Levels } from "../room/sound.js";
import { SOUND_CREDITS } from "./soundcredits.js";

export interface DrawerActions {
  /** Sit down at the table for the open chat. */
  sit(): void;
  granted(): Promise<string[]>;
  /** Ask Lumiverse for these permissions (its own dialog). Resolves with what is granted after. */
  request(perms: string[]): Promise<string[]>;
  models(patch?: ModelsPatch): Promise<ModelsState>;
}

/** Every permission Tallow uses, in plain words, and whether the game needs it or is only better for it. */
export const PERMS: { id: string; name: string; why: string; needed: boolean }[] = [
  { id: "characters", name: "Character cards", why: "to build the adventure around the chat's character", needed: true },
  { id: "generation", name: "Your models", why: "to write the adventure and tell what happens", needed: true },
  { id: "app_manipulation", name: "Full screen", why: "to open the room over the whole app (otherwise a floating window)", needed: false },
  { id: "decisions", name: "Decision model", why: "reads each line you write in about a second, and your written choices", needed: false },
  { id: "world_books", name: "Lorebooks", why: "puts a few entries of the character's lorebook into the adventure", needed: false },
  { id: "embeddings", name: "Embedding model", why: "picks the lorebook entries nearest the character in meaning", needed: false },
];

const ROLES: [Role, string, string][] = [
  ["builder", "Building the adventure", "once per story, while you write who you are"],
  ["teller", "Narrating", "what happens after each throw, and answers to your questions"],
  ["reader", "Reading your lines", "when there is no Decision model, or it cannot tell"],
  ["hero", "Reading who you are", "once, at the start"],
];
const THINK: [ReasoningPick, string][] = [
  ["auto", "Auto"],
  ["on", "Think first"],
  ["off", "Answer straight away"],
];

const ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5c1.4 1.6 2 2.8 2 3.9a2 2 0 0 1-4 0c0-1.1.6-2.3 2-3.9z"/><rect x="7.5" y="9" width="5" height="8.5" rx="1"/><path d="M4 17.5h12"/></svg>`;

const CSS = `
.tw { font: 14px/1.5 system-ui, sans-serif; padding: 14px; display: grid; gap: 18px; }
.tw section { display: grid; gap: 10px; }
.tw h3 { margin: 0; font: 600 12px/1.2 system-ui; letter-spacing: .1em; text-transform: uppercase; opacity: .7; }
.tw button { padding: 8px 12px; border-radius: 9px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25));
  background: var(--lumiverse-fill-subtle, rgba(127,127,127,.06)); color: inherit; cursor: pointer; font: inherit; }
.tw button:hover:not(:disabled) { border-color: var(--lumiverse-primary, #c8a26a); }
.tw button:disabled { opacity: .5; cursor: default; }
.tw .primary { background: var(--lumiverse-primary, #c8a26a); color: var(--lumiverse-primary-contrast, #111); border-color: transparent; font-weight: 600; }
.tw .hint { font-size: 13px; opacity: .72; }
.tw .perm { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: baseline; }
.tw .perm .why { grid-column: 1; font-size: 13px; opacity: .7; }
.tw .perm .state { grid-row: 1; grid-column: 2; font-size: 13px; }
.tw .perm .state.yes { color: var(--lumiverse-success, #5fae6a); }
.tw .perm .state.no { opacity: .65; }
.tw .row { display: grid; gap: 6px; }
.tw .row .lbl { font-weight: 600; }
.tw .row .lbl small { display: block; font-weight: 400; opacity: .65; font-size: 13px; }
.tw select { font: inherit; padding: 7px 10px; border-radius: 9px; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25));
  background: var(--lumiverse-fill-subtle, rgba(127,127,127,.06)); color: inherit; min-width: 0; width: 100%; }
.tw .seg { display: flex; border: 1px solid var(--lumiverse-border, rgba(127,127,127,.25)); border-radius: 999px; overflow: hidden; width: max-content; max-width: 100%; }
.tw .seg button { border: 0; border-radius: 0; padding: 4px 11px; background: none; font-size: 13px; }
.tw .seg button.on { background: var(--lumiverse-primary, #c8a26a); color: var(--lumiverse-primary-contrast, #111); }
.tw .saved { font-size: 13px; opacity: 0; transition: opacity .3s; }
.tw .saved.show { opacity: .75; }
.tw .vol { display: grid; grid-template-columns: 6.5em 1fr 2.6em; gap: 8px; align-items: center; }
.tw .vol input { width: 100%; accent-color: var(--lumiverse-primary, #c8a26a); }
.tw .vol output { font-size: 13px; opacity: .7; text-align: right; }
.tw details { font-size: 13px; }
.tw details summary { cursor: pointer; opacity: .8; }
.tw details ul { margin: 6px 0 0; padding-left: 18px; display: grid; gap: 4px; opacity: .8; word-break: break-word; }
.tw a { color: inherit; }
`;

const esc = (t: string): string => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const named = (c: ConnOption): string => `${c.name}${c.model && c.model !== c.name ? ` (${c.model})` : ""}`;
const opt = (value: string, label: string, on: boolean): string => `<option value="${esc(value)}"${on ? " selected" : ""}>${esc(label)}</option>`;

export function createDrawer(ctx: SpindleFrontendContext, actions: DrawerActions): () => void {
  const tab = ctx.ui.registerDrawerTab({
    id: "tallow",
    title: "Tallow",
    shortName: "Tallow",
    description: "Set up Tallow, the tabletop adventure, and sit down at the table",
    keywords: ["tabletop", "adventure", "rpg", "game", "narrator", "models"],
    iconSvg: ICON,
  });
  const removeStyle = ctx.dom.addStyle(CSS);
  const root = document.createElement("div");
  root.className = "tw";
  root.innerHTML = `
    <section><h3>Play</h3>
      <button class="primary" data-sit>Sit at the table</button>
      <div class="hint">Plays an adventure with the open chat's character. It is also in the Extras menu (the three dots) under the message box.</div></section>
    <section><h3>Permissions</h3><div data-perms class="row"><div class="hint">Loading…</div></div></section>
    <section><h3>Models</h3>
      <div class="hint">Each job can use a different one of your connections. "Default" is the connection you have marked as default in Lumiverse. Thinking first is slower: it is worth it for building, not for things you wait on.</div>
      <div data-models class="row"><div class="hint">Loading…</div></div>
      <div class="saved" data-saved>Saved.</div></section>
    <section><h3>Sound</h3>
      <div class="seg" data-mute><button data-on="1">Sound on</button><button data-on="0">Muted</button></div>
      <div class="vol"><span>Everything</span><input type="range" min="0" max="100" data-vol="master"><output data-out="master"></output></div>
      <div class="vol"><span>Music</span><input type="range" min="0" max="100" data-vol="music"><output data-out="music"></output></div>
      <div class="vol"><span>The room</span><input type="range" min="0" max="100" data-vol="sounds"><output data-out="sounds"></output></div>
      <div class="hint">The room's sounds (the fire, the weather, the die, the cards) are recordings that come with Tallow. The music is streamed from incompetech.com while it plays; turn it to 0 and nothing is fetched.</div>
      <details data-credits><summary>Who made the music and sounds</summary><ul data-creditlist></ul></details></section>`;
  tab.root.appendChild(root);
  const permsEl = root.querySelector<HTMLElement>("[data-perms]")!;
  const modelsEl = root.querySelector<HTMLElement>("[data-models]")!;
  const savedEl = root.querySelector<HTMLElement>("[data-saved]")!;
  root.querySelector("[data-sit]")!.addEventListener("click", () => actions.sit());

  // Sound: the levels change at once, as the sliders move.
  const muteEl = root.querySelector<HTMLElement>("[data-mute]")!;
  const showLevels = (l: Levels): void => {
    muteEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.classList.toggle("on", (b.dataset.on === "0") === l.muted));
    for (const k of ["master", "music", "sounds"] as const) {
      const input = root.querySelector<HTMLInputElement>(`[data-vol="${k}"]`)!;
      if (document.activeElement !== input) input.value = String(Math.round(l[k] * 100));
      root.querySelector<HTMLOutputElement>(`[data-out="${k}"]`)!.textContent = `${Math.round(l[k] * 100)}`;
    }
  };
  muteEl.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => sound.setLevels({ muted: b.dataset.on === "0" })));
  root.querySelectorAll<HTMLInputElement>("[data-vol]").forEach((input) =>
    input.addEventListener("input", () => sound.setLevels({ [input.dataset.vol as "master" | "music" | "sounds"]: Number(input.value) / 100 })),
  );
  const offLevels = sound.onLevels(showLevels);
  showLevels(sound.levels);

  root.querySelector<HTMLElement>("[data-creditlist]")!.innerHTML = [
    `<li>Music by Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener">incompetech.com</a>), licensed under Creative Commons: By Attribution 4.0 (<a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">creativecommons.org/licenses/by/4.0</a>).</li>`,
    ...ALL_TRACKS.map((t) => `<li>${esc(credit(t))}</li>`),
    `<li>Recorded sounds from <a href="https://freesound.org" target="_blank" rel="noopener">freesound.org</a> (CC0 unless marked):</li>`,
    ...SOUND_CREDITS.map((c) => `<li>"${esc(c.name)}" by ${esc(c.user)}${c.by ? ` (${esc(c.by)})` : ""}</li>`),
  ].join("");

  let savedTimer = 0;
  const saved = (): void => {
    savedEl.classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => savedEl.classList.remove("show"), 1400);
  };

  const renderPerms = (granted: string[]): void => {
    const missing = PERMS.filter((p) => !granted.includes(p.id));
    permsEl.innerHTML = `${PERMS.map(
      (p) => `<div class="perm"><span><b>${esc(p.name)}</b>${p.needed ? "" : ' <span class="hint">(optional)</span>'}</span><span class="state ${granted.includes(p.id) ? "yes" : "no"}">${granted.includes(p.id) ? "Allowed" : "Not allowed"}</span><span class="why">${esc(p.why)}</span></div>`,
    ).join("")}${missing.length ? `<button data-allow>Allow ${missing.length === 1 ? esc(missing[0]!.name.toLowerCase()) : `the ${missing.length} missing ones`}</button>` : ""}`;
    permsEl.querySelector("[data-allow]")?.addEventListener("click", async () => {
      const after = await actions.request(missing.map((p) => p.id)).catch(() => granted);
      renderPerms(after);
      void loadModels();
    });
  };

  const renderModels = (st: ModelsState): void => {
    const def = st.llm.find((c) => c.isDefault);
    const roles = ROLES.map(([id, label, sub]) => {
      const r = st.roles[id];
      const missing = r.connectionId && !st.llm.some((c) => c.id === r.connectionId);
      return `<div class="row"><span class="lbl">${label}<small>${sub}</small></span>
        <select data-role="${id}">${opt("", `Default${def ? `: ${named(def)}` : ""}`, !r.connectionId)}${st.llm.map((c) => opt(c.id, named(c), c.id === r.connectionId)).join("")}${missing ? opt(r.connectionId!, "A removed connection (uses the default)", true) : ""}</select>
        <div class="seg" data-think="${id}">${THINK.map(([v, l]) => `<button data-v="${v}" class="${r.reasoning === v ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
    });
    const decision =
      st.decisions === null
        ? `<div class="hint">Allow the Decision model above to choose one.</div>`
        : st.decisions.length === 0
          ? `<div class="hint">You have no Decision connection yet. Add one in Lumiverse under Connections, Decision models; Tallow picks it up by itself.</div>`
          : `<select data-decision>${opt("auto", "Auto (a TypeSafe one first, else your default)", st.decision === "auto")}${opt("off", "Off (your ordinary model reads instead)", st.decision === "off")}${st.decisions.map((c) => opt(c.id, `${named(c)}${c.isDefault ? ", default" : ""}`, c.id === st.decision)).join("")}</select>`;
    const embedding =
      st.embeddings.length === 0
        ? `<div class="hint">No embedding model is on. Add or enable one in Lumiverse under Connections, Embedding Models (and allow it above). Without it, lorebook entries are picked by the words the card uses.</div>`
        : `<select data-embedding>${opt("auto", "Auto (your primary one)", st.embedding === "auto")}${opt("off", "Off (pick by the card's words)", st.embedding === "off")}${st.embeddings.map((c) => opt(c.id, `${named(c)}${c.isDefault ? ", primary" : ""}`, c.id === st.embedding)).join("")}</select>`;
    modelsEl.innerHTML = `${st.llm.length ? "" : `<div class="hint">No connections could be read. Allow "Your models" above, and add a connection in Lumiverse under Connections.</div>`}${roles.join("")}
      <div class="row"><span class="lbl">Decision model<small>reads each line in about a second, and your written choices</small></span>${decision}</div>
      <div class="row"><span class="lbl">Embedding model<small>picks the lorebook entries nearest the character</small></span>${embedding}</div>`;
    const set = async (patch: ModelsPatch): Promise<void> => {
      try {
        renderModels(await actions.models(patch));
        saved();
      } catch (e) {
        savedEl.textContent = `Could not save: ${e instanceof Error ? e.message : String(e)}`;
        savedEl.classList.add("show");
      }
    };
    modelsEl.querySelectorAll<HTMLSelectElement>("[data-role]").forEach((s) => s.addEventListener("change", () => void set({ role: s.dataset.role as Role, connectionId: s.value || null })));
    modelsEl.querySelectorAll<HTMLElement>("[data-think]").forEach((g) =>
      g.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => void set({ role: g.dataset.think as Role, reasoning: b.dataset.v as ReasoningPick }))),
    );
    modelsEl.querySelector<HTMLSelectElement>("[data-decision]")?.addEventListener("change", (e) => void set({ decision: (e.target as HTMLSelectElement).value }));
    modelsEl.querySelector<HTMLSelectElement>("[data-embedding]")?.addEventListener("change", (e) => void set({ embedding: (e.target as HTMLSelectElement).value }));
  };

  const loadModels = async (): Promise<void> => {
    try {
      renderModels(await actions.models());
    } catch (e) {
      modelsEl.innerHTML = `<div class="hint">The models could not be read (${esc(e instanceof Error ? e.message : String(e))}).</div>`;
    }
  };
  const load = (): void => {
    void actions.granted().then(renderPerms, () => renderPerms([]));
    void loadModels();
  };
  const offShown = tab.onActivate(load);
  load();

  return () => {
    offShown();
    offLevels();
    clearTimeout(savedTimer);
    removeStyle();
    tab.destroy();
  };
}
