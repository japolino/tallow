/**
 * Laying out the road for a story (docs/DESIGN.md, 3.1): from a recipe (content/tropes.ts) and a seed, a map of
 * places and roads, the stops on it and what stands at each, how hard every way is, what can be won, who walks with
 * you, the rival and the clock. Every number is decided here, by seeded dice, so the same story and seed give the same
 * road, and two sittings of the same story do not.
 *
 * The words it writes are plain and general ("{place}" filled in, "{friend}" left for the builder to fill with whoever
 * walks with you or is courted). A model rewrites them for the card's world (src/game/build.ts); without one, these are
 * the words said.
 *
 * The shape: where you set out, then a run of stretches, each one stop or a fork of two side by side, then the last
 * stop. Any way through passes one stop per stretch.
 */
import type { Adventure, Companion, Loot, Place, RoadStop, Sky } from "./adventure.js";
import { seededRng, type Rng } from "./dice.js";
import { WAYS, type Difficulty } from "./moment.js";
import { ratingFor, type Foe } from "./effect.js";
import { clock } from "./tell.js";
import { LOOT_KINDS, PLACE_WORDS, ROAD_CARDS, START_NAMED, STOP_KINDS, WALKERS } from "../content/stopkinds.js";
import type { Recipe } from "../content/tropes.js";

export interface RoadOptions {
  /** A card set in our own times: city names and things. */
  modern?: boolean;
}

/** Names for a rival who is one person, before a model names them. */
const RIVAL_NAMES = ["Corvin", "Mallory", "Severin", "Ysolde", "Garrick", "Lisette", "Anselm", "Rhoswen"];
/** The one courted, on a world card that names nobody (a card's own character is named by the builder). */
export const COURTED_STAND_IN = "{friend}";

/** The hours a deadline is said by, when it falls near one: first light, noon, nightfall, midnight. */
const ANCHORS: [number, string][] = [6, 12, 19, 24, 30, 36, 43, 48].map((h) => [h, h % 24 === 6 ? "first light" : h % 24 === 12 ? "noon" : h % 24 === 19 ? "nightfall" : "midnight"]);

/** Hours a stop is reckoned to cost on top of the road: a little for coming to it, then for each good try it takes a
 * try or two, more where even the easiest way is hard. */
const PER_STOP = 0.2;
const PER_TRY = 0.4;
const PER_STEP = 0.4;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
function shuffled<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const fill = (s: string, vars: Record<string, string>): string => s.replace(/\{(place|end|start|deadline|rival)\}/g, (m, k: string) => vars[k] ?? m);

type Kind = "person" | "obstacle" | "fight";

/** What each kind of foe on the road is hurt by: each one a line really uses is an edge (effect.ts). */
const HURT_BY: Record<string, string[]> = {
ambush: ["numbers", "height"],
hound: ["fire", "noise"],
sentries: ["noise", "numbers"],
keep: ["fire", "numbers"],
warden: ["name", "numbers"],
guardian: ["holy", "name"],
gate: ["fire"],
water: ["height"],
climb: ["height"],
fire: ["water", "numbers"],
};

/** Lay out the road for a story. */
export function layRoad(recipe: Recipe, seed: string, opts: RoadOptions = {}): Adventure {
  const rng = seededRng(`road:${recipe.id}:${seed}`);
  const era = opts.modern ? 1 : 0;
  const n = recipe.stops[0] + Math.floor(rng() * (recipe.stops[1] - recipe.stops[0] + 1));
  const k = n - 1;
  const forks = k <= 4 ? 1 : k >= 6 ? 2 : rng() < 0.5 ? 1 : 2;
  const singles = k - forks * 2;
  // The first stretch is one stop, so the road starts with something met head on; the rest fall as they may.
  const stretches: ("one" | "fork")[] = singles > 0 ? ["one", ...shuffled(rng, [...Array(singles - 1).fill("one"), ...Array(forks).fill("fork")])] : Array(forks).fill("fork");

  
/* ---- the cards: what stands at each stop ---- */
  const rivalCard = recipe.rival?.card;
  const endChoices = recipe.climax.cards.filter((c) => c !== rivalCard);
  const endCard = pick(rng, endChoices.length ? endChoices : recipe.climax.cards);
  const used = new Set<string>([endCard, ...(rivalCard ? [rivalCard] : [])]);
  let fights = 0, people = 0;
  const weights = recipe.mix;
  const drawKind = (not?: Kind): Kind => {
    const ks = (["person", "obstacle", "fight"] as Kind[]).filter((x) => x !== not && weights[x] > 0 && !(x === "fight" && fights >= 2) && ROAD_CARDS[x].some((c) => !used.has(c)));
    if (!ks.length) return (["person", "obstacle", "fight"] as Kind[]).find((x) => ROAD_CARDS[x].some((c) => !used.has(c)))!;
    const total = ks.reduce((s, x) => s + weights[x], 0);
    let r = rng() * total;
    for (const x of ks) if ((r -= weights[x]) < 0) return x;
    return ks[ks.length - 1]!;
  };
  const drawCard = (kind: Kind): string => {
    const c = pick(rng, ROAD_CARDS[kind].filter((x) => !used.has(x)));
    used.add(c);
    if (kind === "fight") fights++;
    if (kind === "person") people++;
    return c;
  };
  const slots: string[][] = stretches.map((s) => {
    const a = drawKind();
    const first = drawCard(a);
    if (s === "one") return [first];
    // The two sides of a fork are different kinds of trouble where they can be: that is the choice.
    return [first, drawCard(drawKind(a))];
  });
  // At least one person to deal with on the road, when the story has people in it.
  if (!people && weights.person > 0) {
    const flat = slots.flat();
    const swap = flat.find((c) => STOP_KINDS[c]!.kind !== "person") ?? flat[0]!;
    const fresh = pick(rng, ROAD_CARDS.person.filter((x) => !used.has(x)));
    for (const s of slots) s.forEach((c, i) => c === swap && (s[i] = fresh));
  }

  /* ---- the places, and where they lie on the sheet ---- */
  const words = shuffled(rng, opts.modern ? PLACE_WORDS.now : PLACE_WORDS.old);
  let w = 0;
  const named = (pattern: string): string => pattern.replace("{n}", words[w++ % words.length]!);
  const places: Place[] = [{ id: "start", name: named(START_NAMED[era]), u: 0.08, v: 0.86 }];
  const S = slots.length;
  slots.forEach((ids, i) => {
    const t = (i + 1) / (S + 1);
    const u = 0.08 + t * 0.82;
    const v = 0.84 - 0.66 * t + (rng() - 0.5) * 0.1;
    if (ids.length === 1) places.push({ id: ids[0]!, name: named(STOP_KINDS[ids[0]!]!.named[era]), u: clamp(u, 0.1, 0.88), v: clamp(v, 0.12, 0.88) });
    else {
      const c = clamp(v, 0.28, 0.72);
      const up = rng() < 0.5;
      ids.forEach((id, j) => places.push({ id, name: named(STOP_KINDS[id]!.named[era]), u: clamp(u + (j ? 0.03 : -0.03), 0.1, 0.88), v: c + ((j === 0) === up ? -0.17 : 0.17) }));
    }
  });
  places.push({ id: endCard, name: named(STOP_KINDS[endCard]!.named[era]), u: 0.9, v: 0.13 });

  /* ---- the roads ---- */
  const roads: [string, string, number][] = [];
  let prev = ["start"];
  for (const ids of [...slots, [endCard]]) {
    for (const p of prev) for (const q of ids) roads.push([p, q, pick(rng, [1, 1, 1.5])]);
    prev = ids;
  }

  /* ---- who stands against you (docs/MOONSHOT.md, 2.5) ---- */
  // A fight, and the last place, have a foe: rated at each way from how hard it is there, with what it is hurt by.
  // Hired blades and sentries break at half their dial; a hound, and whatever holds the last place, fight to the end.
  const foeAt = (card: string, ways: RoadStop["ways"], kind: RoadStop["kind"], end: boolean): Foe | undefined => {
    if (kind !== "fight" && !end) return undefined;
    const ratings: Foe["ratings"] = {};
    for (const w of WAYS) if (ways[w]) ratings[w] = ratingFor(w, ways[w]!.difficulty) + (end ? 1 : 0);
    const hurtBy = HURT_BY[card] ?? ["numbers"];
    return { ratings, hurtBy, ...(!end && (card === "ambush" || card === "sentries") ? { breaks: 0.5 } : {}) };
  };

  /* ---- the stops ---- */
  const lean = recipe.lean;
  const stopOf = (card: string, end: boolean): RoadStop => {
    const sk = STOP_KINDS[card]!;
    const roadKind = !["keep", "fire"].includes(card);
    const ways: RoadStop["ways"] = {};
    for (const way of WAYS) {
      const base = sk.ways[way];
      if (!base) continue;
      const jitter = end ? 0 : rng() < 0.2 ? 1 : rng() < 0.25 ? -1 : 0;
      const d = clamp(base.difficulty + (lean[way] ?? 0) + jitter + (end && roadKind ? 1 : 0), 0, 3) as Difficulty;
      ways[way] = { difficulty: d, ...(way === "pay" ? { price: end ? 3 : base.price ?? 1 } : {}) };
    }
    // Always one way that is fair or easier, and (on the road) one that is hard: there is a choice to make.
    const open = WAYS.filter((x) => ways[x]);
    const easiest = open.reduce((a, b) => (ways[b]!.difficulty < ways[a]!.difficulty ? b : a));
    if (ways[easiest]!.difficulty > 1) ways[easiest]!.difficulty = 1;
    if (!end && open.every((x) => ways[x]!.difficulty < 2)) {
      const other = open.filter((x) => x !== easiest);
      const harder = other.length ? pick(rng, other) : easiest;
      ways[harder]!.difficulty = 2;
    }
    const levers = shuffled(rng, sk.levers.filter((l) => ways[l.way])).slice(0, rng() < 0.3 ? 3 : 2).map((l) => ({ id: l.id, way: l.way, name: l.name, words: l.words }));
    const name = places.find((p) => p.id === card)!.name;
    const kind = end ? recipe.climax.kind : sk.kind;
    const holds = end ? recipe.climax.holds : sk.kind === "fight" ? 2 : 1;
    const foe = foeAt(card, ways, kind, end);
    return {
      id: card,
      name,
      card,
      kind,
      situation: fill(sk.situation, { place: name }),
      teaser: sk.teaser,
      ways,
      levers,
      ...(holds > 1 ? { holds } : {}),
      ...(end ? { climax: true } : {}),
      ...(foe ? { foe } : {}),
    };
  };
  const roadStops = slots.flat().map((c) => stopOf(c, false));
  const end = stopOf(endCard, true);

  /* ---- what can be won, and who may walk on with you ---- */
  const loot: Loot[] = [];
  const companions: Companion[] = [];
  const order = shuffled(rng, roadStops);
  const kinds = shuffled(rng, LOOT_KINDS);
  for (const s of order.slice(0, Math.min(recipe.loot, kinds.length, order.length))) {
    const lk = kinds[loot.length]!;
    loot.push({ id: lk.card, name: lk.name[era], card: lk.card, way: lk.way, words: lk.words });
    s.reward = { loot: lk.card, says: lk.says };
  }
  if (recipe.joins) {
    const free = order.filter((s) => !s.reward).sort((a, b) => Number(b.kind !== "obstacle") - Number(a.kind !== "obstacle"));
    const at = free[0];
    if (at) {
      const wk = pick(rng, WALKERS);
      companions.push({ id: "walker", name: wk.name, card: "companion", who: wk.who, stat: wk.stat, likes: wk.likes, dislikes: wk.dislikes });
      at.reward = { joins: "walker", says: `When it is over, ${wk.name} falls in beside you. "I am coming with you," they say.` };
    }
  }

  /* ---- the weather ---- */
  const sky = pick(rng, recipe.skies);
  for (const s of [...roadStops, end]) {
    const other = recipe.skies.filter((x) => x !== sky);
    if (other.length && rng() < (s === end ? 0.5 : 0.3)) s.weather = (s === end && other.includes("storm") ? "storm" : pick(rng, other)) as Sky;
  }

  /* ---- the clock: enough for a careful way through, and not much more ---- */
  const stops = [...roadStops, end];
  const cost = (id: string): number => {
    const s = stops.find((x) => x.id === id);
    if (!s) return 0;
    // An easy stop is passed in a try or two; a hard one takes more, and every good try it holds for is another.
    const easiest = Math.min(...WAYS.filter((x) => s.ways[x]).map((x) => s.ways[x]!.difficulty));
    return PER_STOP + (s.holds ?? 1) * (PER_TRY + easiest * PER_STEP);
  };
  const longest = new Map<string, number>([["start", 0]]);
  for (const [a, b, h] of roads) longest.set(b, Math.max(longest.get(b) ?? 0, (longest.get(a) ?? 0) + h + cost(b)));
  const need = longest.get(endCard)! + 0.5 + (recipe.pace ?? 0);
  let hour = Math.ceil((recipe.start + need) * 2) / 2;
  let when = clock(hour);
  const anchor = ANCHORS.find(([a]) => a >= hour - 1 && a <= hour + 0.5);
  if (anchor) [hour, when] = anchor;

  /* ---- the words, until a model writes better ones ---- */
  const startName = places[0]!.name;
  const vars = { end: end.name, start: startName, deadline: when };
  const fb = recipe.fallback;
  const rivalName = fb.rivalName ?? pick(rng, RIVAL_NAMES);
  const rival = recipe.rival ? { name: rivalName, card: recipe.rival.card, who: fb.rivalWho ?? recipe.rival.brief, max: recipe.rival.max, lost: fill(fb.rivalLost ?? "{rival} has won.", { ...vars, rival: rivalName }) } : undefined;

  return {
    id: recipe.id,
    title: fill(fb.title, vars),
    trope: recipe.id,
    family: recipe.family,
    part: recipe.part,
    brief: recipe.brief,
    goal: fill(fb.goal, vars),
    who: "You are a traveller who has come this way tonight.",
    seed: Math.floor(rng() * 100000),
    places,
    start: "start",
    roads,
    stops,
    startHour: recipe.start,
    deadline: { hour, name: when, lost: fill(fb.lost, vars) },
    ...(recipe.part === "courted" ? { courted: { name: COURTED_STAND_IN, card: "beloved", who: "the one you have come for" } } : {}),
    ...(rival ? { rival } : {}),
    companions,
    loot,
    won: fill(fb.won, vars),
    weather: sky,
  };
}

/** Every way through a road, as the list of stops passed: for checks. */
export function waysThrough(adv: Adventure): string[][] {
  const out: string[][] = [];
  const walk = (at: string, path: string[]): void => {
    const next = adv.roads.filter(([a]) => a === at).map(([, b]) => b);
    if (!next.length) out.push(path);
    for (const b of next) walk(b, [...path, b]);
  };
  walk(adv.start, []);
  return out;
}

