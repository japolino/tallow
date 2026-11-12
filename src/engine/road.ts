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
  /**
   * How the card's first message opens the night, when a model read that it puts trouble in your way at once
   * (session.ts, openingFor): the road's first stop is then that kind, met head on before anything else. `them` when it
   * is the card's own character who stands there; in a story they walk with you in, they fall in only once it is past.
   */
  opening?: { kind: "fight" | "person"; them: boolean };
}

/** The id the card's own character has in a rescue, as a companion (build.ts). */
export const FRIEND = "friend";

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
  const hub = recipe.shape === "hub";
  // A hub has no forks: every place is one card, and the choice is which to go to next.
  const forks = hub ? 0 : k <= 4 ? 1 : k >= 6 ? 2 : rng() < 0.5 ? 1 : 2;
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
  // The opening, when there is one, is the first stretch: one stop, of the kind the card's first message calls for.
  // On a hub it is a place of its own, met on the way in, before any of the hub's places can be gone to.
  const opens = !!opts.opening && (hub || stretches[0] === "one");
  const slots: string[][] = stretches.map((s, i) => {
    const a = opens && !hub && i === 0 ? opts.opening!.kind : drawKind();
    const first = drawCard(a);
    if (s === "one") return [first];
    // The two sides of a fork are different kinds of trouble where they can be: that is the choice.
    return [first, drawCard(drawKind(a))];
  });
  // At least one person to deal with on the road, when the story has people in it.
  if (!people && weights.person > 0) {
    // Never the opening: its kind is the one the card's first message called for.
    const flat = slots.flat().slice(opens && !hub ? 1 : 0);
    const swap = flat.find((c) => STOP_KINDS[c]!.kind !== "person") ?? flat[0];
    const fresh = pick(rng, ROAD_CARDS.person.filter((x) => !used.has(x)));
    if (swap) for (const s of slots) s.forEach((c, i) => c === swap && (s[i] = fresh));
  }

  const openCard = opens && hub ? drawCard(opts.opening!.kind) : null;

  /* ---- the places, and where they lie on the sheet ---- */
  const words = shuffled(rng, opts.modern ? PLACE_WORDS.now : PLACE_WORDS.old);
  let w = 0;
  const named = (pattern: string): string => pattern.replace("{n}", words[w++ % words.length]!);
  const places: Place[] = [{ id: "start", name: named(START_NAMED[era]), u: 0.08, v: 0.86 }];
  const S = slots.length;
  if (hub) {
    // The hub in the middle of the sheet, its places round it below and to the sides, the end at the top.
    places[0] = { ...places[0]!, u: 0.5, v: 0.6 };
    slots.forEach(([id], i) => {
      const a = ((-25 + (230 * (i + 0.5)) / S) * Math.PI) / 180;
      places.push({ id: id!, name: named(STOP_KINDS[id!]!.named[era]), u: clamp(0.5 + 0.36 * Math.cos(a) + (rng() - 0.5) * 0.04, 0.1, 0.9), v: clamp(0.6 + 0.27 * Math.sin(a) + (rng() - 0.5) * 0.04, 0.12, 0.9) });
    });
  } else slots.forEach((ids, i) => {
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
  places.push({ id: endCard, name: named(STOP_KINDS[endCard]!.named[era]), u: hub ? 0.5 : 0.9, v: 0.13 });
  if (openCard) places.push({ id: openCard, name: named(STOP_KINDS[openCard]!.named[era]), u: 0.66, v: 0.44 });

  /* ---- the roads ---- */
  const roads: [string, string, number][] = [];
  // A hub's places are each a leg out from it; going from one to another is back through the hub, both legs.
  const legs = new Map<string, number>();
  if (hub) {
    const spokes = slots.map(([id]) => id!);
    for (const id of [...spokes, endCard]) legs.set(id, pick(rng, [0.5, 0.5, 0.75]));
    // With an opening, the way in is through it: the hub's places are gone out to from there, as from the hub.
    const gate = openCard ?? "start";
    if (openCard) roads.push(["start", openCard, 0.5]);
    for (const a of [gate, ...spokes])
      for (const b of [...spokes, endCard]) if (a !== b) roads.push([a, b, (a === gate ? 0 : legs.get(a)!) + legs.get(b)!]);
  } else {
    let prev = ["start"];
    for (const ids of [...slots, [endCard]]) {
      for (const p of prev) for (const q of ids) roads.push([p, q, pick(rng, [1, 1, 1.5])]);
      prev = ids;
    }
  }
  /** How many of a hub's places must be done before its end opens: all but two, and never fewer than two. */
  const needs = hub ? Math.max(2, Math.min(S, S - 2)) : 0;

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
  const roadStops = [...(openCard ? [openCard] : []), ...slots.flat()].map((c) => stopOf(c, false));
  const end = stopOf(endCard, true);
  if (opens) {
    const first = roadStops[0]!;
    first.opening = opts.opening!.them ? "them" : "others";
    // The card's own character, met hostile at the start of a story they walk in: they walk with you once it is past.
    if (opts.opening!.them && recipe.part === "friend") first.reward = { joins: FRIEND, says: "When it is over, {friend} falls in beside you, and walks on with you." };
  }

  /* ---- what can be won, and who may walk on with you ---- */
  const loot: Loot[] = [];
  const companions: Companion[] = [];
  // The opening wins nothing of its own: who is met there may walk on with you (build.ts), and that is its reward.
  const order = shuffled(rng, roadStops).filter((s) => !s.opening);
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
  let way: number;
  if (hub) {
    // A careful round of a hub: the places it takes, out and back (the dearer of them, as you cannot know which are
    // cheap before you go), then the end.
    const rounds = roadStops.filter((s) => s.id !== openCard).map((s) => cost(s.id) + 2 * legs.get(s.id)!).sort((a, b) => b - a);
    way = rounds.slice(0, needs).reduce((x, y) => x + y, 0) + legs.get(endCard)! + cost(endCard) + (openCard ? 0.5 + cost(openCard) : 0);
  } else {
    const longest = new Map<string, number>([["start", 0]]);
    for (const [a, b, h] of roads) longest.set(b, Math.max(longest.get(b) ?? 0, (longest.get(a) ?? 0) + h + cost(b)));
    way = longest.get(endCard)!;
  }
  const need = way + 0.5 + (recipe.pace ?? 0);
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
    ...(hub ? { hub: { needs } } : {}),
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
  const climax = new Set(adv.stops.filter((s) => s.climax).map((s) => s.id));
  // A place is gone to once; a hub's end only once enough of its places are done.
  const walk = (at: string, path: string[]): void => {
    // The opening is not one of a hub's places.
    const done = path.filter((id) => !adv.stops.find((x) => x.id === id)?.opening).length;
    const next = adv.roads.filter(([a, b]) => a === at && !path.includes(b) && !(adv.hub && climax.has(b) && done < adv.hub.needs)).map(([, b]) => b);
    if (!next.length) out.push(path);
    for (const b of next) if (out.length < 2000) walk(b, [...path, b]);
  };
  walk(adv.start, []);
  return out;
}

