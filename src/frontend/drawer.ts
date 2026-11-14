/**
 * Tallow's tab in the Lumiverse drawer: where it is set up, outside the game. The room itself shows nothing but the room
 * (docs/DESIGN.md, 1); everything that is chosen once and kept lives here instead:
 *   a button to sit down at the table for this chat;
 *   which of the user's connections each job uses, whether it may think first, and the Decision and embedding models;
 *   the sound: on or off, how loud, and who made the music and the recordings.
 * Permissions are asked by Lumiverse's own dialog when you sit down (frontend.ts), not here.
 *
 * The models section is adapted from the sibling project's drawer (its src/frontend/host/panel.ts). Copied, not
 * imported (docs/DESIGN.md, 10).
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { Role } from "../game/ask.js";
import type { ModelsPatch, ReasoningPick } from "../meaning/models.js";
import type { ConnOption, ModelsState } from "../shared/protocol.js";
import { credit, music } from "../room/music.js";
import { sound, type Levels } from "../room/sound.js";
import { SOUND_CREDITS } from "./soundcredits.js";

export interface DrawerActions {
  /** Sit down at the table for the open chat. */
  sit(): void;
  models(patch?: ModelsPatch): Promise<ModelsState>;
}

/** A row of the models section: the roles it sets (the first is the one shown), its name, and a few words on it. */
const ROWS: [Role[], string, string][] = [
  [["builder", "hero"], "Building", "the story, and who you are"],
  [["teller"], "Narrating", "what happens, and answers"],
  [["reader"], "Reading your lines", "when the Decision model can't"],
];
const THINK: [ReasoningPick, string][] = [
  ["auto", "Auto"],
  ["on", "Think"],
  ["off", "Don't think"],
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
.tw .row { display: grid; gap: 6px; }
.tw .row .lbl { font-weight: 600; }
.tw .row .lbl small { font-weight: 400; opacity: .65; font-size: 13px; margin-left: 6px; }
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
      <div class="hint">Also in the Extras menu under the message box.</div></section>
    <section><h3>Models</h3>
      <div data-models class="row"><div class="hint">Loading…</div></div>
      <div class="saved" data-saved>Saved.</div></section>
    <section><h3>Sound</h3>
      <div class="seg" data-mute><button data-on="1">Sound on</button><button data-on="0">Muted</button></div>
      <div class="vol"><span>Everything</span><input type="range" min="0" max="100" data-vol="master"><output data-out="master"></output></div>
      <div class="vol"><span>Music</span><input type="range" min="0" max="100" data-vol="music"><output data-out="music"></output></div>
      <div class="vol"><span>The room</span><input type="range" min="0" max="100" data-vol="sounds"><output data-out="sounds"></output></div>
      <div class="hint" data-playing></div>
      <div class="hint">Music streams from incompetech.com; at 0 nothing is fetched.</div>
      <details data-credits><summary>Credits</summary><ul data-creditlist></ul></details></section>`;
  tab.root.appendChild(root);
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

  // The music is credited piece by piece, as each is played: any of the composer's library may be.
  const playingEl = root.querySelector<HTMLElement>("[data-playing]")!;
  const showCredits = (): void => {
    const { title, heard } = music.now;
    playingEl.textContent = title ? `Playing: "${title}", Kevin MacLeod.` : "";
    root.querySelector<HTMLElement>("[data-creditlist]")!.innerHTML = [
      `<li>Music by Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener">incompetech.com</a>), licensed under Creative Commons: By Attribution 4.0 (<a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">creativecommons.org/licenses/by/4.0</a>). Played since you opened the room:</li>`,
      ...(heard.length ? heard.map((t) => `<li>${esc(credit(t.title))}</li>`) : ["<li>Nothing yet.</li>"]),
      `<li>Recorded sounds from <a href="https://freesound.org" target="_blank" rel="noopener">freesound.org</a> (CC0 unless marked):</li>`,
      ...SOUND_CREDITS.map((c) => `<li>"${esc(c.name)}" by ${esc(c.user)}${c.by ? ` (${esc(c.by)})` : ""}</li>`),
    ].join("");
  };
  const offPiece = music.onPiece(showCredits);
  showCredits();

  let savedTimer = 0;
  const saved = (): void => {
    savedEl.textContent = "Saved.";
    savedEl.classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => savedEl.classList.remove("show"), 1400);
  };

  const renderModels = (st: ModelsState): void => {
    const def = st.llm.find((c) => c.isDefault);
    const rows = ROWS.map(([ids, label, sub]) => {
      const r = st.roles[ids[0]!];
      const missing = r.connectionId && !st.llm.some((c) => c.id === r.connectionId);
      return `<div class="row"><span class="lbl">${label}<small>${sub}</small></span>
        <select data-role="${ids.join(" ")}">${opt("", `Default${def ? `: ${named(def)}` : ""}`, !r.connectionId)}${st.llm.map((c) => opt(c.id, named(c), c.id === r.connectionId)).join("")}${missing ? opt(r.connectionId!, "A removed connection (uses the default)", true) : ""}</select>
        <div class="seg" data-think="${ids.join(" ")}">${THINK.map(([v, l]) => `<button data-v="${v}" class="${r.reasoning === v ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
    });
    const decision =
      st.decisions === null
        ? `<div class="hint">Not allowed in Lumiverse.</div>`
        : st.decisions.length === 0
          ? `<div class="hint">None yet: add one under Connections, Decision models.</div>`
          : `<select data-decision>${opt("auto", "Auto", st.decision === "auto")}${opt("off", "Off", st.decision === "off")}${st.decisions.map((c) => opt(c.id, `${named(c)}${c.isDefault ? ", default" : ""}`, c.id === st.decision)).join("")}</select>`;
    const embedding =
      st.embeddings.length === 0
        ? `<div class="hint">None on: add one under Connections, Embedding models.</div>`
        : `<select data-embedding>${opt("auto", "Auto", st.embedding === "auto")}${opt("off", "Off", st.embedding === "off")}${st.embeddings.map((c) => opt(c.id, `${named(c)}${c.isDefault ? ", primary" : ""}`, c.id === st.embedding)).join("")}</select>`;
    modelsEl.innerHTML = `${st.llm.length ? "" : `<div class="hint">No connections found: add one under Connections.</div>`}${rows.join("")}
      <div class="row"><span class="lbl">Decision model<small>reads your lines fast</small></span>${decision}</div>
      <div class="row"><span class="lbl">Embedding model<small>picks lorebook entries</small></span>${embedding}</div>`;
    const set = async (patches: ModelsPatch[]): Promise<void> => {
      try {
        let st2: ModelsState | undefined;
        for (const p of patches) st2 = await actions.models(p);
        if (st2) renderModels(st2);
        saved();
      } catch (e) {
        savedEl.textContent = `Could not save: ${e instanceof Error ? e.message : String(e)}`;
        savedEl.classList.add("show");
      }
    };
    const roles = (el: HTMLElement, key: "role" | "think"): Role[] => (el.dataset[key] ?? "").split(" ") as Role[];
    modelsEl.querySelectorAll<HTMLSelectElement>("[data-role]").forEach((s) =>
      s.addEventListener("change", () => void set(roles(s, "role").map((role) => ({ role, connectionId: s.value || null })))),
    );
    modelsEl.querySelectorAll<HTMLElement>("[data-think]").forEach((g) =>
      g.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => void set(roles(g, "think").map((role) => ({ role, reasoning: b.dataset.v as ReasoningPick }))))),
    );
    modelsEl.querySelector<HTMLSelectElement>("[data-decision]")?.addEventListener("change", (e) => void set([{ decision: (e.target as HTMLSelectElement).value }]));
    modelsEl.querySelector<HTMLSelectElement>("[data-embedding]")?.addEventListener("change", (e) => void set([{ embedding: (e.target as HTMLSelectElement).value }]));
  };

  const loadModels = async (): Promise<void> => {
    try {
      renderModels(await actions.models());
    } catch (e) {
      modelsEl.innerHTML = `<div class="hint">The models could not be read (${esc(e instanceof Error ? e.message : String(e))}).</div>`;
    }
  };
  const offShown = tab.onActivate(() => void loadModels());
  void loadModels();

  return () => {
    offShown();
    offLevels();
    offPiece();
    clearTimeout(savedTimer);
    removeStyle();
    tab.destroy();
  };
}
