/**
 * Pictures for the narrator's book, drawn by Inlay Illustrator through its shared-pictures endpoint (inlay-illustrator
 * src/backend/pipeline/shared-pictures.ts). Inlay makes them with its own chat pipeline: the chat's cast and their
 * looks, the user's Atelier preset, artist and negatives. Tallow asks only when the user has said yes to pictures
 * (frontend.ts): each one is an image generation on the user's own connection, and may cost money.
 *
 * The shared RPC pool: Tallow publishes what it wants on its own endpoint `inlay.pictures.<user>` (the pool makes it
 * `<tallow's id>.inlay.pictures.<user>`), then reading `inlay_illustrator.pictures.<user>` makes Inlay queue them and
 * answers each one's status. Tallow reads again until the picture is ready. Adapted from the sibling project Gambit's
 * src/backend/inlay-pictures.ts; copied, not imported (docs/DESIGN.md, 10).
 *
 * What Inlay's endpoint does not have for a book (so a chapter's picture is asked as a "scene", Inlay's wide event
 * illustration of the moment the text describes): a direction for a book plate, a style hint of its own for a storybook
 * look short of overriding the user's artist with NovelAI tags, and a way to say that the people in the text are not
 * the chat's cast.
 */
import type { SpindleAPI } from "lumiverse-spindle-types";

const OWNER = "inlay_illustrator";
const SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;
/** Inlay's rules for a request (shared-pictures.ts): its id, the chat's id, and at most 2000 characters of text. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:#-]{0,159}$/;
const CHAT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const TEXT_MAX = 2000;
export const POLL_MS = 4000;
const GIVE_UP_MS = 8 * 60_000;
const MAX_QUEUED_MS = 30 * 60_000;
/** One image generation at a time on many accounts: Inlay says so, and it is a wait, not a failure. */
const BUSY = /\b429\b|concurrent|locked/i;
const BUSY_RETRIES = 3;
/** Inlay answers a failure as it is for a minute before it tries again. */
const BUSY_WAIT_MS = 61_000;

export interface PictureRequest {
  /** The chapter's picture id (engine/chapter.ts, pictureId): the id Inlay sees, the same each time it is asked. */
  id: string;
  /** The chat the table was sat down at: Inlay reads its cast. */
  chatId: string;
  /** The moment in words, as Inlay's analyzer reads a chat reply. */
  text: string;
}
interface Status {
  status: "queued" | "running" | "ready" | "failed";
  imageId?: string;
  url?: string;
  error?: string;
}
export type PictureResult = { imageId: string; url: string } | { why: string };

type Pool = Pick<SpindleAPI, "rpcPool">;

export function createPictures(spindle: Pool, log: (m: string) => void = () => {}, o: { pollMs?: number; busyWaitMs?: number } = {}) {
  const poll = o.pollMs ?? POLL_MS;
  const busyWait = o.busyWaitMs ?? BUSY_WAIT_MS;
  /** Per user: the requests not settled yet, which is what the published endpoint holds. */
  const pending = new Map<string, Map<string, { id: string; chatId: string; direction: "scene"; text: string }>>();
  /** Per user: the segment Inlay answered on (the user's id, or "owner"). */
  const answered = new Map<string, string>();
  const waits = new Map<string, Promise<PictureResult>>();

  const users = (userId: string): string[] => {
    const first = answered.get(userId);
    const all = [userId.trim().toLowerCase(), "owner"].filter((u, i, a) => SEGMENT.test(u) && a.indexOf(u) === i);
    return first ? [first, ...all.filter((u) => u !== first)] : all;
  };

  /** Publish the pending list and read Inlay's answer; null when Inlay does not answer at all. */
  async function exchange(userId: string): Promise<Record<string, Status> | null> {
    if (!spindle.rpcPool?.read || !spindle.rpcPool.sync) return null;
    const pictures = [...(pending.get(userId)?.values() ?? [])];
    for (const user of users(userId)) {
      try {
        spindle.rpcPool.sync(`inlay.pictures.${user}`, { version: 1, pictures }, { requires: ["characters"] });
        const answer = (await spindle.rpcPool.read(`${OWNER}.pictures.${user}`)) as { version?: number; pictures?: Record<string, Status> } | null;
        if (answer?.version === 1 && answer.pictures && typeof answer.pictures === "object") {
          answered.set(userId, user);
          return answer.pictures;
        }
      } catch {
        // No pictures endpoint on this segment: Inlay missing, older, or not started.
      }
    }
    return null;
  }

  /** Whether Inlay answers at all for this user (nothing is asked of it). */
  async function ready(userId: string): Promise<boolean> {
    return (await exchange(userId)) !== null;
  }

  /** Ask Inlay for a picture and wait for it: where it is when it is ready, or why there is none. */
  function request(userId: string, req: PictureRequest): Promise<PictureResult> {
    if (!ID.test(req.id)) return Promise.resolve({ why: "not an id Inlay takes" });
    if (!CHAT_ID.test(req.chatId)) return Promise.resolve({ why: "no chat for Inlay to read" });
    const text = req.text.replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
    if (!text) return Promise.resolve({ why: "nothing to draw" });
    const wk = `${userId}\u0000${req.id}`;
    const running = waits.get(wk);
    if (running) return running;
    const wait = (async (): Promise<PictureResult> => {
      const mine = pending.get(userId) ?? new Map();
      mine.set(req.id, { id: req.id, chatId: req.chatId, direction: "scene", text });
      pending.set(userId, mine);
      let until = Date.now() + GIVE_UP_MS;
      // Inlay draws one at a time: waiting in its line is not taking too long, up to a point.
      const last = Date.now() + MAX_QUEUED_MS;
      let busy = BUSY_RETRIES;
      try {
        for (;;) {
          const all = await exchange(userId);
          const st = all?.[req.id];
          if (!all) return { why: "Inlay Illustrator does not answer" };
          if (!st) return { why: "Inlay Illustrator did not take the request" };
          if (st.status === "ready" && st.imageId) {
            log(`book picture ${req.id} ready`);
            return { imageId: st.imageId, url: st.url || `/api/v1/images/${st.imageId}` };
          }
          if (st.status === "failed" && busy > 0 && BUSY.test(st.error ?? "") && Date.now() < until) {
            busy--;
            await new Promise((r) => setTimeout(r, busyWait));
            continue;
          }
          if (st.status === "failed") return { why: `Inlay Illustrator could not draw it: ${(st.error ?? "no reason given").slice(0, 160)}` };
          if (st.status === "queued") until = Math.min(last, Date.now() + GIVE_UP_MS);
          if (Date.now() > until) return { why: "Inlay Illustrator took too long" };
          await new Promise((r) => setTimeout(r, poll));
        }
      } finally {
        mine.delete(req.id);
        waits.delete(wk);
        void exchange(userId).catch(() => null);
      }
    })();
    waits.set(wk, wait);
    return wait;
  }

  return { request, ready };
}

const shared = new WeakMap<object, ReturnType<typeof createPictures>>();
/** One per backend: each publishes its whole list on the same endpoint, so two would keep replacing each other's. */
export function sharedPictures(spindle: Pool, log?: (m: string) => void): ReturnType<typeof createPictures> {
  let p = shared.get(spindle);
  if (!p) shared.set(spindle, (p = createPictures(spindle, log)));
  return p;
}
