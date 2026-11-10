/**
 * Tallow's frontend inside Lumiverse (Spindle). A button by the chat's input bar, "Sit at the table", opens the room
 * over the whole app for the chat's character card. The narrator asks which story it is to be and who you are, and the
 * adventure is built for the card while you write (src/game/session.ts). The models are the user's own, through the
 * backend (src/backend.ts). Leaving the table (the ✕) ends the sitting.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DefaultLoadingManager } from "three";
import { MODELS } from "tallow:models";
import { mapOf } from "./engine/adventure.js";
import { randomSeed } from "./engine/dice.js";
import type { CardInfo } from "./game/card.js";
import { modelMinds } from "./game/modelminds.js";
import type { Ask } from "./game/prompts.js";
import { PLAYER, roomTable } from "./game/roomtable.js";
import { sit } from "./game/session.js";
import { createOverlay, type Overlay } from "./frontend/overlay.js";
import { mountRoom, type RoomHandle } from "./room/room.js";
import type { ToBackend, ToFrontend } from "./shared/protocol.js";

/** What the extension needs, and why, in the words of the host's own permission dialog. */
const NEEDS = ["characters", "generation"];
const WHY = "Tallow reads the chat's character card to build an adventure around them, and asks your model to write its words.";

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

  let overlay: Overlay | null = null;
  let room: RoomHandle | null = null;
  let sitting = 0;

  const leave = (): void => {
    sitting++;
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
    const { characterId } = ctx.getActiveChat();
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
    room = mountRoom(host, { map: { title: "", seed: 1, stops: [], paths: [] }, pieces: [{ id: PLAYER, kind: "player", at: "start" }, { id: "shadow", kind: "narrator", at: "end" }], hour: 20, assets: ASSETS });
    const r = room;
    // For a page that hosts the extension and wants to look at the room (preview/host.ts).
    window.dispatchEvent(new CustomEvent("tallow:room", { detail: r }));
    await r.ready;
    if (mine !== sitting || !r.desk) return;
    const table = roomTable(r, { reduced, setHour: (h) => r.setClock(((h % 24) + 24) % 24) });
    if (!card) {
      await table.say([characterId ? "I cannot read this character's card. Let me read it, and sit down again." : "There is nobody here tonight. Open a chat with a character, and sit down again."]);
      return;
    }
    const canAsk = granted.includes("generation");
    const minds = modelMinds(ask, { onFallback: (job, why) => console.warn(`tallow: the ${job} fell back to the rules (${why})`) });
    void sit({ card: card as CardInfo, seed: randomSeed(), table, minds, ask: canAsk ? ask : null, built: (adv) => r.setMap?.(mapOf(adv)) }).catch((e) => console.error("tallow:", e));
  }

  const action = ctx.ui.registerInputBarAction({ id: "tallow-sit", label: "Sit at the table", subtitle: "Play an adventure with this character" });
  const offClick = action.onClick(() => void open().catch((e) => console.error("tallow:", e)));

  return () => {
    offClick();
    action.destroy();
    offMsg();
    leave();
    overlay?.destroy();
    for (const u of urls?.values() ?? []) URL.revokeObjectURL(u);
    urls = null;
  };
}
