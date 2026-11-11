/**
 * A road laid from a recipe (road.ts) furnished with the living world (docs/MOONSHOT.md, 3 and 5; docs/LOOP.md, 3 and
 * 4): the people at its stops, with moods, wants and things they know; what there is to find out, three clues to each
 * of the story's three keys, one of them perhaps a lie; and the other side's clock, what it does and where, whether
 * you are there or not. A story written by hand (content/tavern.ts) has all of this already, and is left as it is.
 *
 * The words here are plain stand-ins. A model rewrites them for the card's world with the rest of the story
 * (game/build.ts); without one they are played as they are. Pure: the road in, the furnished road out.
 */
import type { Adventure, RoadStop } from "./adventure.js";
import { cardKind } from "./cards.js";
import { KEYS, type Clue, type StoryKind } from "./clues.js";
import { seededRng } from "./dice.js";
import type { Difficulty } from "./moment.js";
import { LIKES, type Like, type Known, type Person, type Threshold } from "./people.js";
import { waysThrough } from "./road.js";
import type { Appointment } from "./schedule.js";

const KINDS: readonly StoryKind[] = ["mystery", "rescue", "heist", "journey", "hunt", "romance", "survival"];

/** The kind of story a road is, for its three keys. */
export const kindOf = (adv: Adventure): StoryKind => adv.kind ?? (KINDS.includes(adv.family as StoryKind) ? (adv.family as StoryKind) : adv.courted ? "romance" : "rescue");

/** Stand-in wants for a person, until a model writes one that fits them. */
const WANTS = [
  "their debt paid before it is called in",
  "word of someone they lost",
  "a thing taken from them brought back",
  "to be rid of the ones you are after",
  "someone to speak for them where it counts",
  "to get out of this place for good",
];

/** Stand-in clue words, three angles on a key, until a model writes the facts themselves. */
const ANGLES = [
  (key: string, end: string) => `What you need to know about ${key} comes back to ${end}.`,
  (key: string, _end: string, here: string) => `Something was seen near ${here} that bears on ${key}.`,
  (key: string, end: string) => `There is a pattern to ${key}, if you look: it leads to ${end}.`,
];

/** Stand-in words for what the other side does, early, then later, then at the end. */
const MOVES = ["the ones you are after pass through, asking after you", "they move what they hold, under guard", "everything is ready at the end of the road, and they wait for you there"];

const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** Whether a stop is one where someone with a mind of their own can be met (not the end, not the one courted). */
const meetable = (s: RoadStop, adv: Adventure): boolean => s.kind === "person" && !s.climax && !s.person && !(adv.courted && s.card === adv.courted.card);

/** Furnish a laid road: people, clues and the other side's clock. A road that has them already is left alone. */
export function furnish(adv: Adventure): Adventure {
  if (adv.clues?.length || adv.appointments?.length) return adv;
  const rng = seededRng(`furnish:${adv.seed}:${adv.trope}`);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const kind = kindOf(adv);
  const keys = KEYS[kind];
  const end = adv.stops.find((s) => s.climax);
  const endName = end ? (adv.places.find((p) => p.id === end.id)?.name ?? end.name) : "the end of the road";
  const name = (id: string): string => adv.places.find((p) => p.id === id)?.name ?? id;

  // The people: someone at every stop where a person stands in the way (the end and the one courted aside).
  const met = adv.stops.filter((s) => meetable(s, adv));
  const places = adv.stops.filter((s) => !s.climax && s.kind !== "person");
  const people = new Map<string, Person>();
  for (const s of met) {
    const likes = [...LIKES].sort(() => rng() - 0.5).slice(0, 3) as Like[];
    const talk = s.ways.talk?.difficulty ?? 1;
    people.set(s.id, {
      id: `p-${s.id}`,
      name: `the ${lower(cardKind(s.card).title).replace(/^(the|a|an) /, "")}`,
      wants: pick(WANTS),
      likes: likes.slice(0, 2),
      dislikes: likes.slice(2),
      attitude: "wary",
      resolve: Math.max(1, Math.min(3, talk)) as Difficulty,
      knows: [],
      sense: 1 + Math.floor(rng() * 2),
    });
  }

  // What there is to find out: three true clues to each key, spread over at least two sources (a person, or a place
  // seen once you are past it), so no single stop missed on a fork loses a key.
  const sources: { person?: string; place: string }[] = [...met.map((s) => ({ person: `p-${s.id}`, place: s.id })), ...places.map((s) => ({ place: s.id }))];
  const clues: Clue[] = [];
  const told = new Map<string, Known[]>();
  const thresholds: Threshold[] = ["open", "guarded", "secret"];
  if (sources.length) {
    for (const k of [0, 1, 2] as const) {
      for (let i = 0; i < 3; i++) {
        // Each key's three clues at three sources running on from the key's own (two when there are only two).
        const src = sources[(k + i) % sources.length]!;
        const id = `c${k}${i}`;
        const clue: Clue = { id, key: k, text: ANGLES[i]!(keys[k], endName, name(src.place)), from: src.person ? { person: src.person } : { place: src.place } };
        // The first clue to the first key says where it all ends: it inks that place on the map.
        if (k === 0 && i === 0 && end) clue.points = endName;
        clues.push(clue);
        if (src.person) told.set(src.person, [...(told.get(src.person) ?? []), { clue: id, at: thresholds[Math.min(2, (told.get(src.person) ?? []).length)]! }]);
      }
    }
    // With two people or more, the second one lies about the last key; a clue seen at a place proves it.
    const liar = met[1];
    const proof = clues.find((c) => c.key === 2 && c.from?.place);
    if (liar && proof) {
      const pid = `p-${liar.id}`;
      const lie: Clue = { id: "c2x", key: 2, false: true, truth: proof.id, against: [proof.id], text: `It has nothing to do with ${endName}: look somewhere else for ${keys[2]}.`, from: { person: pid } };
      proof.against = [...(proof.against ?? []), lie.id];
      clues.push(lie);
      told.set(pid, [{ clue: lie.id, at: "open" }, ...(told.get(pid) ?? [])]);
      const p = people.get(liar.id)!;
      people.set(liar.id, { ...p, lie: { clue: lie.id, truth: proof.id, skill: 2, why: "the ones you are after pay for their silence" } });
    }
  }
  for (const [stop, p] of people) people.set(stop, { ...p, knows: told.get(p.id) ?? [] });

  // The other side's clock: three moves, one after another, at places further down the road, between the start and the
  // deadline. The last is their plan come to its end: it drops a stone in the narrator's bowl.
  // Its first moves are at places on every way through, when there are any, so they never fall on the branch of a fork
  // you did not take and go unheard.
  const later = adv.stops.filter((s) => !s.climax).slice(1);
  const paths = waysThrough(adv);
  const common = later.filter((s) => paths.length > 0 && paths.every((p) => p.includes(s.id)));
  const chosen = [...common.slice(-2)];
  for (const s of [...later].reverse()) if (chosen.length < 2 && !chosen.includes(s)) chosen.push(s);
  const firsts = later.filter((s) => chosen.includes(s));
  const at = [...firsts, ...(end ? [end] : [])].slice(-3);
  const span = adv.deadline.hour - adv.startHour;
  const appointments: Appointment[] = at.map((s, i) => ({
    id: `move${i + 1}`,
    at: Math.round((adv.startHour + span * (0.35 + 0.25 * i)) * 4) / 4,
    where: s.id,
    what: MOVES[i + (3 - at.length)]!,
    who: ["the ones you are after"],
    ...(i > 0 ? { needs: [`move${i}`] } : {}),
    lasts: 0.5,
    ...(i === at.length - 1 ? { front: true } : {}),
  }));
  // Somebody knows the second move: hearing it cuts a notch in the candle.
  const tellsOf = clues.find((c) => c.key === 1 && c.from?.person && !c.false);
  if (tellsOf && appointments.length > 1) tellsOf.tells = appointments[appointments.length - 2]!.id;

  return {
    ...adv,
    kind,
    stops: adv.stops.map((s) => (people.has(s.id) ? { ...s, person: people.get(s.id)! } : s)),
    ...(clues.length ? { clues } : {}),
    ...(appointments.length ? { appointments } : {}),
  };
}
