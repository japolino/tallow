/**
 * Tallow's frontend inside Lumiverse (Spindle). A button by the chat's input bar, "Sit at the table", opens the room
 * over the whole app for the chat's character card. The narrator asks which story it is to be and who you are, and the
 * adventure is built for the card while you write (src/game/session.ts). The models are the user's own, through the
 * backend (src/backend.ts): each job on its own connection, the Decision model for quick reads when there is one, and
 * the card's lorebook picked by meaning. Leaving the table (the ✕) ends the sitting.
 */
import { readContent, type ContentSettings } from "./engine/content.js";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DefaultLoadingManager } from "three";
import { MODELS } from "./embedded/models.js";
import { SOUNDS } from "./embedded/sounds.js";
import { mapOf } from "./engine/adventure.js";
import { randomSeed } from "./engine/dice.js";
import type { Trip } from "./engine/adventure.js";
import { cardText, type CardInfo } from "./game/card.js";
import { modelMinds } from "./game/modelminds.js";
import type { Decide } from "./game/decisions.js";
import type { Ask } from "./game/prompts.js";
import { PLAYER, roomTable } from "./game/roomtable.js";
import { sit, type Kept } from "./game/session.js";
import { createDrawer } from "./frontend/drawer.js";
import { createOverlay, type Overlay } from "./frontend/overlay.js";
import { music } from "./room/music.js";
import { SOUND_FILES } from "./room/soundfiles.js";
import { normalLevels, sound, type Levels } from "./room/sound.js";
import { mountRoom, type RoomHandle } from "./room/room.js";
import type { ToBackend, ToFrontend } from "./shared/protocol.js";

/** What the extension needs, and why, in the words of the host's own permission dialog. */
const NEEDS = ["characters", "generation"];
const WHY = "Tallow reads the chat's character card to build an adventure around them, and asks your model to write its words.";
/** What makes it better, asked for once: the game is whole without them, and the user may say no. */
const EXTRAS = ["decisions", "embeddings", "world_books"];
const WHY_EXTRAS = "Optional. Your Decision model reads what you write in a second instead of several; the card's lorebook gives the adventure more of its world, and your embedding model picks the entries that matter.";
const ASKED = "tallow:asked-extras";
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
  const ask: Ask = async (messages, role) => {
    const m = await call({ type: "ask", role, messages });
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
    // A blank sheet until the adventure is built; the pieces wait in the middle of it.
    room = mountRoom(host, { map: { title: "", seed: 1, stops: [], paths: [] }, pieces: [{ id: PLAYER, kind: "player", at: "start" }, { id: "shadow", kind: "narrator", at: "end" }], hour: 16.5, assets: ASSETS });
    const r = room;
    // For a page that hosts the extension and wants to look at the room (preview/host.ts).
    window.dispatchEvent(new CustomEvent("tallow:room", { detail: r }));
    await r.ready;
    if (mine !== sitting || !r.desk) return;
    // The teller is given the card's world in a few lines, so what it says sounds like that world.
    const world = card ? cardText(card as CardInfo, 700) : "";
    const minds = modelMinds(ask, { ...(granted.includes("decisions") ? { decide } : {}), context: () => ({ world }), ...(characterId && granted.includes("embeddings") ? { lore: (text: string) => call({ type: "lore", characterId, text }).then((m) => (m.type === "lore" ? m.entries : [])) } : {}), onFallback: (job, why) => console.warn(`tallow: the ${job} fell back to the rules (${why})`) });
    const table = roomTable(r, { reduced, setHour: (h) => r.setClock(((h % 24) + 24) % 24), ...(minds.pick ? { pick: minds.pick } : {}) });
    if (!card) {
      await table.say([characterId ? "I cannot read this character's card. Let me read it, and sit down again." : "There is nobody here tonight. Open a chat with a character, and sit down again."]);
      return;
    }
    const canAsk = granted.includes("generation");
    // A sitting left before its end is kept for this chat, so leaving the table (or a reload) does not lose it.
    const key = `tallow:sitting:${chatId ?? "none"}:${characterId}`;
    const save = (t: Trip | null): void => {
      try {
        if (t) localStorage.setItem(key, JSON.stringify({ v: 1, trip: t }));
        else localStorage.removeItem(key);
      } catch {
        /* No storage here: the sitting simply is not kept. */
      }
    };
    let saved: Trip | null = null;
    try {
      const raw = localStorage.getItem(key);
      const got = raw ? (JSON.parse(raw) as { v?: number; trip?: Trip }) : null;
      if (got?.v === 1 && got.trip?.adv?.stops) saved = got.trip;
    } catch {
      saved = null;
    }
    // Who you are at this card's table is kept too, from one story and one sitting to the next.
    const heroKey = `tallow:hero:${chatId ?? "none"}:${characterId}`;
    let kept: Kept | null = null;
    try {
      const raw = localStorage.getItem(heroKey);
      const got = raw ? (JSON.parse(raw) as { v?: number; kept?: Kept }) : null;
      if (got?.v === 1 && got.kept?.hero?.sheet?.stats && Array.isArray(got.kept.played)) kept = { ...got.kept, carry: Array.isArray(got.kept.carry) ? got.kept.carry : [] };
    } catch {
      kept = null;
    }
    const keep = (k: Kept): void => {
      try {
        localStorage.setItem(heroKey, JSON.stringify({ v: 1, kept: k }));
      } catch {
        /* Not kept: next time you are asked who you are again. */
      }
    };
    // Done for tonight: the room fades and closes, as the ✕ would.
    const done = (): void => {
      if (mine !== sitting) return;
      setTimeout(() => {
        if (mine !== sitting) return;
        leave();
        overlay?.hide();
      }, 2500);
    };
    // What the game allows at this table (content.ts): heat, dark themes, lines and veils, kept for every chat.
    let content: ContentSettings | undefined;
    try {
      const raw = localStorage.getItem("tallow:content");
      content = raw ? readContent(JSON.parse(raw)) : undefined;
    } catch {
      content = undefined;
    }
    void sit({ card: card as CardInfo, seed: randomSeed(), table, minds, ask: canAsk ? ask : null, built: (adv) => r.setMap?.(mapOf(adv)), saved, save, kept, keep, content, keepContent: (c) => {
        try {
          localStorage.setItem("tallow:content", JSON.stringify(c));
        } catch {
          /* No storage here: the settings hold for this sitting only. */
        }
      }, leave: done, started: (d) => void window.dispatchEvent(new CustomEvent("tallow:director", { detail: d })) }).catch((e) => console.error("tallow:", e));
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

  const action = ctx.ui.registerInputBarAction({ id: "tallow-sit", label: "Sit at the table", subtitle: "Play an adventure with this character" });
  const offClick = action.onClick(() => void open().catch((e) => console.error("tallow:", e)));
  // Setting up lives in the drawer, outside the game: the room itself shows nothing but the room.
  const offDrawer = createDrawer(ctx, {
    sit: () => void open().catch((e) => console.error("tallow:", e)),
    granted: () => ctx.permissions.getGranted(),
    request: (perms) => ctx.permissions.request(perms, { reason: perms.some((p) => NEEDS.includes(p)) ? WHY : WHY_EXTRAS } as never),
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
