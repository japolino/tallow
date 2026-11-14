/**
 * Tallow's frontend inside Lumiverse (Spindle). A button by the chat's input bar, "Sit at the table", opens the room
 * over the whole app for the chat's character card. You sit down as your persona, a sheet is written for you from the
 * card, and the narrator runs the game one written action at a time (src/game/runsit.ts). The models are the user's
 * own, through the backend (src/backend.ts): each job on its own connection, and the Decision model for second looks
 * when there is one. Leaving the table (the ✕) ends the sitting; the run is kept for the chat.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DefaultLoadingManager } from "three";
import { MODELS } from "./embedded/models.js";
import { SOUNDS } from "./embedded/sounds.js";
import { randomSeed } from "./engine/dice.js";
import type { Run } from "./engine/run.js";
import { cardText, unmacro, type CardInfo } from "./game/card.js";
import type { Decide } from "./game/decide.js";
import type { Ask } from "./game/ask.js";
import { PLAYER, roomTable } from "./game/roomtable.js";
import { runSit } from "./game/runsit.js";
import { createDrawer } from "./frontend/drawer.js";
import { createOverlay, type Overlay } from "./frontend/overlay.js";
import { music } from "./room/music.js";
import { SOUND_FILES } from "./room/soundfiles.js";
import { normalLevels, sound, type Levels } from "./room/sound.js";
import { mountRoom, type RoomHandle } from "./room/room.js";
import type { ToBackend, ToFrontend } from "./shared/protocol.js";

/** What the extension needs, and why, in the words of the host's own permission dialog. */
const NEEDS = ["characters", "generation"];
const WHY = "Tallow reads the chat's character card to set a game in its world, and asks your model to judge what you write and to tell the story.";
/** What makes it better, asked for once: the game is whole without them, and the user may say no. */
const EXTRAS = ["decisions", "embeddings", "world_books", "personas"];
const WHY_EXTRAS = "Optional. Your Decision model gives a quick second look to what the game decides; the card's lorebook gives the game more of its world, and your embedding model picks the entries that matter. With your persona, you sit down at the table as yourself (it is only read, never changed).";
/** Asked once; the key is new when a new extra is, so that one is asked for once too. */
const ASKED = "tallow:asked-extras-3";
/** How loud things are (the drawer's sound section), kept in the page: there is nothing secret in it. */
const LEVELS_KEY = "tallow:sound";

function readLevels(): Levels {
  try {
    return normalLevels(JSON.parse(localStorage.getItem(LEVELS_KEY) ?? "{}"));
  } catch {
    return normalLevels({});
  }
}

/** The room's model files are part of this bundle; three.js is pointed at them under this made-up folder. */
const ASSETS = "tallow-assets";
let urls: Map<string, string> | null = null;
function modelFiles(): void {
  if (urls) return;
  urls = new Map(
    Object.entries(MODELS).map(([name, b64]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return [`${ASSETS}/models/${name}`, URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }))];
    }),
  );
  DefaultLoadingManager.setURLModifier((url) => urls?.get(url) ?? url);
}

export function setup(ctx: SpindleFrontendContext): () => void {
  const waiting = new Map<string, { done: (m: ToFrontend) => void; fail: (e: Error) => void }>();
  let n = 0;
  const call = (msg: ToBackend extends infer M ? (M extends { id: string } ? Omit<M, "id"> : never) : never): Promise<ToFrontend> =>
    new Promise((done, fail) => {
      const id = `t${++n}`;
      waiting.set(id, { done, fail });
      ctx.sendToBackend({ ...msg, id });
    });
  const offMsg = ctx.onBackendMessage((raw: unknown) => {
    const m = raw as ToFrontend;
    const w = m && waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.type === "error") w.fail(new Error(m.error));
    else w.done(m);
  });
  const ask: Ask = async (messages, role, opts) => {
    const m = await call({ type: "ask", role, messages, ...(opts?.parameters ? { parameters: opts.parameters } : {}) });
    if (m.type !== "answer") throw new Error("not an answer");
    return m.text;
  };
  const decide: Decide = async (what, state, questions, ms) => {
    const m = await call({ type: "decide", what, state, questions, ms });
    return m.type === "decided" ? m.answers : null;
  };

  let overlay: Overlay | null = null;
  let room: RoomHandle | null = null;
  let sitting = 0;

  const leave = (): void => {
    sitting++;
    music.dispose();
    room?.dispose();
    room = null;
    if (overlay) overlay.content.textContent = "";
  };

  let opening = false;
  async function open(): Promise<void> {
    // The button keeps the keyboard after it is clicked, so the Space or Enter that hurries the narrator would press it
    // again and start the sitting over: while you sit at the table, it does nothing.
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (opening || room) return;
    opening = true;
    try {
      await sitDown();
    } finally {
      opening = false;
    }
  }

  async function sitDown(): Promise<void> {
    let granted = await ctx.permissions.getGranted().catch(() => [] as string[]);
    if (!NEEDS.every((p) => granted.includes(p))) granted = await ctx.permissions.request(NEEDS, { reason: WHY } as never).catch(() => granted);
    // The extras are asked for once, not every time you sit down: a no is an answer.
    let asked = false;
    try {
      asked = localStorage.getItem(ASKED) === "1";
    } catch {
      asked = true;
    }
    if (!asked && !EXTRAS.every((p) => granted.includes(p))) {
      try {
        localStorage.setItem(ASKED, "1");
      } catch {
        /* Asked this once anyway. */
      }
      granted = await ctx.permissions.request(EXTRAS.filter((p) => !granted.includes(p)), { reason: WHY_EXTRAS } as never).catch(() => granted);
    }
    const { chatId, characterId } = ctx.getActiveChat();
    const card = characterId && granted.includes("characters") ? await call({ type: "card", characterId }).then((m) => (m.type === "card" ? m.card : null)).catch(() => null) : null;

    if (!overlay) {
      overlay = createOverlay(ctx, granted.includes("app_manipulation"));
      overlay.onClose(leave);
    }
    leave();
    const mine = sitting;
    overlay.show();
    modelFiles();
    const host = document.createElement("div");
    Object.assign(host.style, { position: "absolute", inset: "0" });
    overlay.content.appendChild(host);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Theatre of the mind: a blank sheet, and the pieces put away once the game begins.
    room = mountRoom(host, { map: { title: "", seed: 1, stops: [], paths: [] }, pieces: [{ id: PLAYER, kind: "player", at: "start" }, { id: "shadow", kind: "narrator", at: "end" }], hour: 16.5, assets: ASSETS });
    const r = room;
    // For a page that hosts the extension and wants to look at the room (preview/host.ts).
    window.dispatchEvent(new CustomEvent("tallow:room", { detail: r }));
    window.dispatchEvent(new CustomEvent("tallow:music", { detail: music }));
    await r.ready;
    if (mine !== sitting || !r.desk) return;
    const table = roomTable(r, { reduced, setHour: (h) => r.setClock(((h % 24) + 24) % 24) });
    if (!card) {
      await table.say([characterId ? "I cannot read this character's card. Let me read it, and sit down again." : "There is nobody here tonight. Open a chat with a character, and sit down again."]);
      return;
    }
    // A run (engine/run.ts): who you are is your persona in Lumiverse; the run is kept for this chat as it goes.
    const runKey = `tallow:run:${chatId ?? "none"}:${characterId}`;
    let kept: Run | null = null;
    try {
      const got = JSON.parse(localStorage.getItem(runKey) ?? "null") as { v?: number; run?: Run } | null;
      if (got?.v === 1 && got.run?.v === 1 && got.run.sheet?.attributes) kept = got.run;
    } catch {
      kept = null;
    }
    const persona = (card as CardInfo).personas?.[0];
    const first = (card as CardInfo).firstMessage?.trim();
    table.clock(16.5);
    void runSit({
      table,
      deps: { ask, ...(granted.includes("decisions") ? { decide } : {}), log: (m) => console.warn(`tallow: ${m}`) },
      card: { world: cardText(card as CardInfo, 7000), who: persona ? `${persona.name}. ${persona.who}` : "Nothing is written about them: someone newly arrived in this world, as the card would have a newcomer be.", name: persona?.name ?? "", ...(first ? { first: unmacro(first, (card as CardInfo).name) } : {}), retell: true },
      seed: parseInt(randomSeed().slice(0, 8), 16),
      saved: kept,
      save: (run) => {
        try {
          localStorage.setItem(runKey, JSON.stringify({ v: 1, run }));
        } catch {
          /* No storage here: the run simply is not kept. */
        }
      },
      mute: !granted.includes("generation"),
    }).catch((e) => console.error("tallow:", e));
  }

  // Sound: the levels as they were left, and the recordings that are in this bundle. Nothing plays before the first
  // click or key press, and the room's own sounds only while the room is open.
  sound.setLevels(readLevels());
  const offLevels = sound.onLevels((l) => {
    try {
      localStorage.setItem(LEVELS_KEY, JSON.stringify(l));
    } catch {
      /* Not kept: the next visit starts at the usual levels. */
    }
  });
  sound.arm();
  sound.loadRecordings(
    SOUND_FILES.filter((f) => f in SOUNDS),
    async (f) => Uint8Array.from(atob(SOUNDS[f]!), (c) => c.charCodeAt(0)).buffer,
  );

  const action = ctx.ui.registerInputBarAction({ id: "tallow-sit", label: "Sit at the table", subtitle: "Play a game in this card's world" });
  const offClick = action.onClick(() => void open().catch((e) => console.error("tallow:", e)));
  // Setting up lives in the drawer, outside the game: the room itself shows nothing but the room.
  const offDrawer = createDrawer(ctx, {
    sit: () => void open().catch((e) => console.error("tallow:", e)),
    models: async (patch) => {
      const m = await call({ type: "models", ...(patch ? { patch } : {}) });
      if (m.type !== "models") throw new Error("no answer about the models");
      return m.state;
    },
  });

  return () => {
    offClick();
    action.destroy();
    offDrawer();
    offMsg();
    leave();
    offLevels();
    sound.dispose();
    overlay?.destroy();
    for (const u of urls?.values() ?? []) URL.revokeObjectURL(u);
    urls = null;
  };
}
