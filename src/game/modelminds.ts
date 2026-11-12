/**
 * The jobs of minds.ts done by models, through whatever the host gives: `Ask` (Lumiverse's own generation, inside the
 * extension) and, when the user has one, `Decide` (their Decision model). Every answer is checked (prompts.ts,
 * decisions.ts); if a model cannot be asked, takes too long, or answers with something that does not check, the next
 * one answers instead, and the stand-in last, so the game never stops on a model.
 *
 * Reading a line goes to the Decision model first: a typed answer in about a second, where an ordinary model takes
 * several. Only when it is not sure which way the line goes is the reader model asked, and then the rules.
 */
import { hearFromAnswers, hearMessages, hearQuestions, parseHear } from "./hear.js";
import { parseRoute, routeFromAnswers, routeMessages, routeQuestions } from "./route.js";
import { battleNamesMessages, battleRouteFromAnswers, battleRouteMessages, battleRouteQuestions, battleTellMessages, parseBattleNames, parseBattleRoute } from "./battleroute.js";
import { parseStoryRoute, storyRouteFromAnswers, storyRouteMessages, storyRouteQuestions } from "./storyroute.js";
import type { Ability } from "../engine/abilities.js";
import { rulesHero, type Hero } from "../engine/hero.js";
import { RISK_OPTIONS, RISK_QUESTION } from "../engine/free.js";
import type { Minds } from "./minds.js";
import { standIns } from "./minds.js";
import { contentMessages, parseContentChange, parsePick, pickFromAnswers, pickMessages, pickQuestions, readFromAnswers, readQuestions, type Decide } from "./decisions.js";
import { answerMessages, roamMessages, blowMessages, contestMessages, epilogueMessages, fellowMessages, heroMessages, luckMessages, moveMessages, parseContest, parseLuck, offerMessages, parseHero, parseOffer, parseRead, parseRisk, parseTell, rated, ROAM_TELL, readMessages, riskMessages, tellMessages, VOICED_TELL, type Ask, type Message, type TellContext } from "./prompts.js";
import { refused } from "../engine/content.js";
import { laid, type Keeper, type Told, type Voice } from "./voice.js";
import { parseSceneLine, sceneLineMessages, sceneTellMessages } from "./scenewriter.js";
import { REVISE_MS, reviseScenes } from "./lastingwriter.js";

/** How long a scene's telling may run without a preset, in characters. */
const SCENE_TELL = 900;

export interface ModelMindsOptions {
  /** Give up on a model after this long and use the stand-in (ms). */
  timeoutMs?: number;
  /** Who is at the table, for the teller. Read each time it tells. */
  context?: () => TellContext;
  /** The Decision model, when the host has one. */
  decide?: Decide;
  /** Give up on the Decision model after this long (ms); it is meant to be quick. */
  decideMs?: number;
  /**
   * The card's lore nearest a scene (by the embedding model when there is one, else by the lore's keys), to add to the
   * world the teller is given. Missing, failing or slow: the world is told without it.
   */
  lore?: (text: string) => Promise<string[]>;
  /** Told whenever a stand-in had to answer, and why. */
  onFallback?: (job: string, why: string) => void;
  /**
   * The story's voice (voice.ts): the player's preset as it was when the story began, and the story so far. With it
   * the narrator's prose is written under the preset, as one conversation that grows; without it, as the game's own.
   */
  voice?: Keeper;
}

/** A narration under a preset may be long: it is given longer before the stand-in answers. */
const VOICED_MS = 120_000;

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
  const ask: Ask = (messages, role, opts) => ask0(rated(messages, { ...known, ...o.context?.() }.content), role, opts);
  const plain = standIns(0);
  const ms = o.timeoutMs ?? 60_000;
  const fell = (job: string, why: unknown): void => o.onFallback?.(job, why instanceof Error ? why.message : String(why));
  // The teller is given the player's own words, whole, and who is at the table.
  let lastLine = "";
  let known: TellContext = {};
  const dms = o.decideMs ?? 8000;
  const decided = async (what: string, q: { state: unknown; questions: Parameters<Decide>[2] }) => (o.decide ? await within(o.decide(what, q.state, q.questions, dms), dms + Math.min(2000, dms)).catch(() => null) : null);
  // The teller's context for a scene: who is at the table, the card's world, and the lore nearest what is happening.
  const LORE_WAIT = 2500;
  const scene = async (text: string, extra: Partial<TellContext> = {}): Promise<TellContext> => {
    const base: TellContext = { ...known, ...o.context?.(), ...extra };
    if (!o.lore || !text.trim()) return base;
    const near = await within(o.lore(text.slice(0, 2000)), LORE_WAIT).catch(() => [] as string[]);
    const add = near.filter((e) => e && !(base.world ?? "").includes(e.slice(0, 80))).map((e) => `Lore: ${e}`).join("\n");
    return add ? { ...base, world: [base.world, add].filter(Boolean).join("\n") } : base;
  };
  /** The story's voice, when it has one. Asked for before a narrator's job is written, so the job knows which it is. */
  const voiceNow = async (): Promise<Voice | null> => (o.voice ? await o.voice.now().catch(() => null) : null);
  /**
   * A narrator's job, asked: under the story's voice when it has one (the job's own rules and facts last, with the
   * story's content settings in them), else as it is. The answer is made fit to say, or null.
   */
  const narrated = async (v: Voice | null, job: Message[], max?: number): Promise<string | null> => {
    if (!v) return parseTell(await within(ask(job, "teller"), ms), max);
    const text = await within(ask0(laid(v, rated(job, { ...known, ...o.context?.() }.content)), "teller", v.snapshot.parameters ? { parameters: v.snapshot.parameters } : undefined), Math.max(ms, VOICED_MS));
    return parseTell(text, Math.max(max ?? 0, VOICED_TELL));
  };
  /** What was told goes into the story so far (never a refusal: it would be read back every turn after). */
  const kept = (told: Told, said: string): string => {
    if (said && !refused(said)) o.voice?.said(told, said);
    return said;
  };
  return {
    know(who, company, content) {
      known = { who, with: company, ...(content ? { content } : {}) };
    },
    async fellow(brief, m) {
      try {
        const s = parseTell(await within(ask(fellowMessages(brief, m, await scene(`${m.stop.situation}
${lastLine}`, { line: lastLine })), "teller"), ms));
        if (s) return kept({ at: m.stop, must: `One of the company speaks. ${brief}` }, s);
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
        const r = parseRead(await within(ask(readMessages(line, m, { ...known, ...o.context?.() }.who), "reader"), ms), m);
        if (r === "none") return "none";
        if (r) return r;
        fell("reader", "answer did not check");
      } catch (e) {
        fell("reader", e);
      }
      return plain.read(line, m);
    },
    async tell(out, stop, note, more) {
      const line = lastLine || out.check.attempt;
      const told: Told = { at: stop, wrote: line, must: note };
      try {
        const v = await voiceNow();
        const s = await narrated(v, tellMessages(out, stop, note, more, await scene(`${stop.situation}
${line}`, { line, voiced: !!v })));
        if (s) return kept(told, s);
        fell("teller", "empty answer");
      } catch (e) {
        fell("teller", e);
      }
      return kept(told, await plain.tell(out, stop, note, more));
    },
    async answer(line, m, note) {
      const told: Told = { at: m.stop, wrote: line, ...(note ? { must: note } : {}) };
      try {
        const v = await voiceNow();
        const s = await narrated(v, answerMessages(line, m, await scene(`${m.stop.situation}
${line}`, { voiced: !!v }), note));
        if (s) return kept(told, s);
        fell("answer", "empty answer");
      } catch (e) {
        fell("answer", e);
      }
      return kept(told, await plain.answer(line, m, note));
    },
    async roam(line, m, note) {
      // Free play has nothing to fall back on but the narrator, so a failed answer is asked for once more.
      for (let i = 0; i < 2; i++) {
        try {
          const v = await voiceNow();
          const s = await narrated(v, roamMessages(line, m, await scene(`${m.stop.situation}
${line}`, { voiced: !!v }), note), ROAM_TELL);
          if (s) return kept({ at: m.stop, wrote: line, ...(note ? { must: note } : {}) }, s);
          fell("roam", "empty answer");
        } catch (e) {
          fell("roam", e);
        }
      }
      return "";
    },
    async route(line, ctx) {
      if (o.decide) {
        const got = routeFromAnswers(await decided("route", routeQuestions(line, ctx)), ctx);
        if (got) return got;
      }
      try {
        const r = parseRoute(await within(ask(routeMessages(line, ctx), "reader"), ms), ctx);
        if (r) return r;
        fell("route", "answer did not check");
      } catch (e) {
        fell("route", e);
      }
      return null;
    },
    async storyRoute(line, ctx) {
      if (o.decide) {
        const got = storyRouteFromAnswers(await decided("story route", storyRouteQuestions(line, ctx)), ctx);
        if (got) return got;
      }
      try {
        const r = parseStoryRoute(await within(ask(storyRouteMessages(line, ctx), "reader"), ms), ctx);
        if (r) return r;
        fell("story route", "answer did not check");
      } catch (e) {
        fell("story route", e);
      }
      return null;
    },
    async battleRoute(line, ctx) {
      if (o.decide) {
        const got = battleRouteFromAnswers(await decided("battle route", battleRouteQuestions(line, ctx)), line, ctx);
        if (got) return got;
      }
      try {
        const r = parseBattleRoute(await within(ask(battleRouteMessages(line, ctx), "reader"), ms), ctx);
        if (r) return r;
        fell("battle route", "answer did not check");
      } catch (e) {
        fell("battle route", e);
      }
      return null;
    },
    async battleNames(place, foes, props) {
      try {
        return parseBattleNames(await within(ask(battleNamesMessages(place, foes, props, await scene(place.situation)), "teller"), ms));
      } catch (e) {
        fell("battle names", e);
      }
      return { foes: {}, props: {} };
    },
    async battleTell(place, note) {
      try {
        const v = await voiceNow();
        const s = await narrated(v, battleTellMessages(place, note, await scene(`${place.situation}
${note}`, { voiced: !!v })));
        if (s) return kept({ at: place, must: note }, s);
        fell("battle tell", "empty answer");
      } catch (e) {
        fell("battle tell", e);
      }
      return "";
    },
    async sceneLine(line, ctx) {
      lastLine = line;
      const c = { ...ctx, who: ctx.who ?? { ...known, ...o.context?.() }.who };
      // The line's whole reading is one answer, kept whole or asked once more: there is no stock reading worth having.
      for (let i = 0; i < 2; i++) {
        try {
          // A try kept whole whose ask did not check is played at the scene, and says so.
          const r = parseSceneLine(await within(ask(sceneLineMessages(line, c), "reader"), ms), c, (why) => fell("scene line", `the try was kept, but not what it was after: ${why}`));
          if (r) return r;
          fell("scene line", "answer did not check");
        } catch (e) {
          fell("scene line", e);
        }
      }
      return null;
    },
    async sceneTell(at, note, wrote) {
      const told: Told = { at, ...(wrote ? { wrote } : {}), must: note };
      for (let i = 0; i < 2; i++) {
        try {
          const v = await voiceNow();
          const s = await narrated(v, sceneTellMessages(at, note, wrote, await scene(`${at.situation}
${wrote ?? ""}`, { voiced: !!v })), SCENE_TELL);
          if (s) return kept(told, s);
          fell("scene tell", "empty answer");
        } catch (e) {
          fell("scene tell", e);
        }
      }
      return "";
    },
    async sceneRevise(story, from, truths) {
      const got = await reviseScenes((m, role) => within(ask(m, role), REVISE_MS), story, from, truths, (why) => fell("scene revise", why));
      if (!got.length) fell("scene revise", "no scene written again checked: the scenes stay as they were");
      return got;
    },
    async content(line, s) {
      try {
        const r = parseContentChange(await within(ask(contentMessages(line, s), "reader"), Math.min(ms, 20_000)), s);
        if (r) return r;
        fell("content", "answer did not check");
      } catch (e) {
        fell("content", e);
      }
      return null;
    },
    async hear(line, p) {
      if (o.decide) {
        const got = hearFromAnswers(await decided("hear", hearQuestions(line, p)), p);
        if (got) return got;
      }
      try {
        const r = parseHear(await within(ask(hearMessages(line, p), "reader"), Math.min(ms, 20_000)), p);
        if (r) return r;
        fell("hear", "answer did not check");
      } catch (e) {
        fell("hear", e);
      }
      return null;
    },
    async risky(line, m) {
      if (o.decide) {
        const got = pickFromAnswers(await decided("pick", pickQuestions(RISK_QUESTION, line, { ...RISK_OPTIONS })), { ...RISK_OPTIONS });
        if (got) return got === "yes";
      }
      try {
        const r = parseRisk(await within(ask(riskMessages(line, m), "reader"), ms));
        if (r !== null) return r;
        fell("risky", "answer did not check");
      } catch (e) {
        fell("risky", e);
      }
      return null;
    },
    async move(m, note) {
      try {
        const v = await voiceNow();
        const s = await narrated(v, moveMessages(m, note, await scene(`${m.stop.situation}
${note}`, { voiced: !!v })));
        if (s) return kept({ at: m.stop, must: note }, s);
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
        const s = parseTell(await within(ask(blowMessages(m, c, foe, await scene(`${m.stop.situation}
${foe.name}`)), "teller"), ms));
        if (s) return kept({ at: m.stop, must: `${foe.name} is about to act; it has not landed yet.` }, s);
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
        const v = await voiceNow();
        const s = await narrated(v, epilogueMessages(t, { ...known, ...o.context?.(), voiced: !!v }));
        if (s) return kept({ must: `The story is over (${t.over === "won" ? "won" : "lost"}). What became of everyone afterwards.` }, s);
        fell("epilogue", "empty answer");
      } catch (e) {
        fell("epilogue", e);
      }
      return null;
    },
    // Any question by meaning: the Decision model when it is sure, else the reader model, else null and the rules.
    async pick(question: string, text: string, options: Record<string, string>, task?: string) {
      if (o.decide) {
        const got = pickFromAnswers(await decided("pick", pickQuestions(question, text, options, task)), options);
        if (got) return got;
      }
      try {
        const said = await within(ask(pickMessages(question, text, options, task), "reader"), Math.min(ms, 20_000));
        const r = parsePick(said, options);
        if (r) return r;
        // An honest "unclear" is an answer, not a failure: the rules decide, and nothing fell back.
        if (!/"pick"\s*:\s*"unclear/i.test(said)) fell("pick", `answer did not check: ${said.replace(/\s+/g, " ").slice(0, 80)}`);
      } catch (e) {
        fell("pick", e);
      }
      return null;
    },
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
