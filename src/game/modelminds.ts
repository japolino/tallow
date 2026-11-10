/**
 * The two jobs of minds.ts done by a model, through whatever `Ask` the host gives (Lumiverse's own generation, inside
 * the extension). Every answer is checked (prompts.ts); if the model cannot be asked, takes too long, or answers with
 * something that does not check, the stand-in answers instead, so the game never stops on a model.
 */
import { rulesHero, type Hero } from "../engine/hero.js";
import type { Minds } from "./minds.js";
import { standIns } from "./minds.js";
import { heroMessages, parseHero, parseRead, parseTell, readMessages, tellMessages, type Ask, type TellContext } from "./prompts.js";

export interface ModelMindsOptions {
  /** Give up on a model after this long and use the stand-in (ms). */
  timeoutMs?: number;
  /** Who is at the table, for the teller. Read each time it tells. */
  context?: () => TellContext;
  /** Told whenever a stand-in had to answer, and why. */
  onFallback?: (job: string, why: string) => void;
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((done, fail) => {
    const t = setTimeout(() => fail(new Error(`no answer in ${Math.round(ms / 1000)} s`)), ms);
    p.then(
      (v) => (clearTimeout(t), done(v)),
      (e) => (clearTimeout(t), fail(e)),
    );
  });

export function modelMinds(ask: Ask, o: ModelMindsOptions = {}): Minds & { hero(line: string, hour?: number): Promise<Hero> } {
  const plain = standIns(0);
  const ms = o.timeoutMs ?? 60_000;
  const fell = (job: string, why: unknown): void => o.onFallback?.(job, why instanceof Error ? why.message : String(why));
  // The teller is given the player's own words, whole, and who is at the table.
  let lastLine = "";
  let known: TellContext = {};
  return {
    know(who, company) {
      known = { who, with: company };
    },
    async read(line, m) {
      lastLine = line;
      try {
        const r = parseRead(await within(ask(readMessages(line, m), "reader"), ms), m);
        if (r === "none") return null;
        if (r) return r;
        fell("reader", "answer did not check");
      } catch (e) {
        fell("reader", e);
      }
      return plain.read(line, m);
    },
    async tell(out, stop, note, more) {
      try {
        const s = parseTell(await within(ask(tellMessages(out, stop, note, more, { ...known, ...o.context?.(), line: lastLine || out.check.attempt }), "teller"), ms));
        if (s) return s;
        fell("teller", "empty answer");
      } catch (e) {
        fell("teller", e);
      }
      return plain.tell(out, stop, note, more);
    },
    async hero(line, hour) {
      try {
        const h = parseHero(await within(ask(heroMessages(line), "hero"), ms), hour);
        if (h) return h;
        fell("hero", "answer did not check");
      } catch (e) {
        fell("hero", e);
      }
      return rulesHero(line, hour);
    },
  };
}
