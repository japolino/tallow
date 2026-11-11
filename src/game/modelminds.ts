/**
 * The jobs of minds.ts done by models, through whatever the host gives: `Ask` (Lumiverse's own generation, inside the
 * extension) and, when the user has one, `Decide` (their Decision model). Every answer is checked (prompts.ts,
 * decisions.ts); if a model cannot be asked, takes too long, or answers with something that does not check, the next
 * one answers instead, and the stand-in last, so the game never stops on a model.
 *
 * Reading a line goes to the Decision model first: a typed answer in about a second, where an ordinary model takes
 * several. Only when it is not sure which way the line goes is the reader model asked, and then the rules.
 */
import type { Ability } from "../engine/abilities.js";
import { rulesHero, type Hero } from "../engine/hero.js";
import type { Minds } from "./minds.js";
import { standIns } from "./minds.js";
import { pickFromAnswers, pickQuestions, readFromAnswers, readQuestions, type Decide } from "./decisions.js";
import { answerMessages, blowMessages, contestMessages, epilogueMessages, fellowMessages, heroMessages, luckMessages, moveMessages, parseContest, parseLuck, offerMessages, parseHero, parseOffer, parseRead, parseTell, rated, readMessages, tellMessages, type Ask, type TellContext } from "./prompts.js";

export interface ModelMindsOptions {
  /** Give up on a model after this long and use the stand-in (ms). */
  timeoutMs?: number;
  /** Who is at the table, for the teller. Read each time it tells. */
  context?: () => TellContext;
  /** The Decision model, when the host has one. */
  decide?: Decide;
  /** Give up on the Decision model after this long (ms); it is meant to be quick. */
  decideMs?: number;
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

export function modelMinds(ask0: Ask, o: ModelMindsOptions = {}): Minds & { hero(line: string, hour?: number, world?: string): Promise<Hero> } {
  // Every message goes out with the story's content settings in place of the default limits (content.ts).
  const ask: Ask = (messages, role) => ask0(rated(messages, { ...known, ...o.context?.() }.content), role);
  const plain = standIns(0);
  const ms = o.timeoutMs ?? 60_000;
  const fell = (job: string, why: unknown): void => o.onFallback?.(job, why instanceof Error ? why.message : String(why));
  // The teller is given the player's own words, whole, and who is at the table.
  let lastLine = "";
  let known: TellContext = {};
  const dms = o.decideMs ?? 8000;
  const decided = async (what: string, q: { state: unknown; questions: Parameters<Decide>[2] }) => (o.decide ? await within(o.decide(what, q.state, q.questions, dms), dms + Math.min(2000, dms)).catch(() => null) : null);
  return {
    know(who, company, content) {
      known = { who, with: company, ...(content ? { content } : {}) };
    },
    async fellow(brief, m) {
      try {
        const s = parseTell(await within(ask(fellowMessages(brief, m, { ...known, ...o.context?.(), line: lastLine }), "teller"), ms));
        if (s) return s;
        fell("fellow", "empty answer");
      } catch (e) {
        fell("fellow", e);
      }
      return "";
    },
    async read(line, m) {
      lastLine = line;
      const quick = readFromAnswers(await decided("reader", readQuestions(line, m)), m);
      if (quick !== undefined) return quick;
      try {
        const r = parseRead(await within(ask(readMessages(line, m), "reader"), ms), m);
        if (r === "none") return "none";
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
    async answer(line, m, note) {
      try {
        const s = parseTell(await within(ask(answerMessages(line, m, { ...known, ...o.context?.() }, note), "teller"), ms));
        if (s) return s;
        fell("answer", "empty answer");
      } catch (e) {
        fell("answer", e);
      }
      return plain.answer(line, m, note);
    },
    async move(m, note) {
      try {
        const s = parseTell(await within(ask(moveMessages(m, note, { ...known, ...o.context?.() }), "teller"), ms));
        if (s) return s;
        fell("move", "empty answer");
      } catch (e) {
        fell("move", e);
      }
      return "";
    },
    async contest(m, kind) {
      try {
        const names = parseContest(await within(ask(contestMessages(m, kind, { ...known, ...o.context?.() }), "teller"), ms));
        if (names.foes || names.danger) return names;
        fell("contest", "answer did not check");
      } catch (e) {
        fell("contest", e);
      }
      return {};
    },
    async luck(line, m) {
      try {
        return parseLuck(await within(ask(luckMessages(line, m), "reader"), ms), m);
      } catch (e) {
        fell("luck", e);
      }
      return null;
    },
    async blow(m, c, foe) {
      try {
        const s = parseTell(await within(ask(blowMessages(m, c, foe, { ...known, ...o.context?.() }), "teller"), ms));
        if (s) return s;
        fell("blow", "empty answer");
      } catch (e) {
        fell("blow", e);
      }
      return "";
    },
    async offer(hero, have, deeds, level, room, world) {
      try {
        const got = parseOffer(await within(ask(offerMessages(hero, have, deeds, level, room, world), "hero"), ms), have, room, `${level}`);
        if (got.length === 2) return got;
        fell("offer", got.length ? "only one ability checked" : "answer did not check");
      } catch (e) {
        fell("offer", e);
      }
      return [] as Ability[];
    },
    async epilogue(t) {
      try {
        const s = parseTell(await within(ask(epilogueMessages(t, { ...known, ...o.context?.() }), "teller"), ms));
        if (s) return s;
        fell("epilogue", "empty answer");
      } catch (e) {
        fell("epilogue", e);
      }
      return null;
    },
    ...(o.decide
      ? {
          async pick(question: string, text: string, options: Record<string, string>, task?: string) {
            return pickFromAnswers(await decided("pick", pickQuestions(question, text, options, task)), options);
          },
        }
      : {}),
    async hero(line, hour, world) {
      try {
        const h = parseHero(await within(ask(heroMessages(line, world), "hero"), ms), hour);
        if (h) return h;
        fell("hero", "answer did not check");
      } catch (e) {
        fell("hero", e);
      }
      return rulesHero(line, hour);
    },
  };
}
