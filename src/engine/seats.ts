/**
 * A table for several: more than one player, each with a character of their own, in one run.
 *
 * The game this one follows keeps one map from each player to the character they own, and plays every action for "the
 * current actor" (its MpTurnCoordinator and GetCurrentActor). This does the same with a chair. A run keeps a seat for
 * every player, and one of them is in the chair: the run's own `who`, `sheet`, `downs`, each person's `feeling`, and
 * what a system keeps for one character (their perks) are always the chair's. Every rule of the game reads those and
 * nothing else, so a line is judged, rolled and written down for whoever is in the chair when it is played, and no
 * rule needed to learn that there is more than one character.
 *
 * What is the whole table's stays where it was: the place, the people, the quests, the factions, the fight, the hour.
 *
 * Pure: nothing here asks a model.
 */
import { MAX_HP, clean, same, type Person, type Run, type Seat, type Sheet } from "./run.js";

/** The seat of the one whose table it is. */
export const HOST = "host";

/** The systems whose state is one character's own, by name (game/systems): swapped with the chair. */
export const OWN_SYSTEMS = ["perks"] as const;

/** Whether a run is a table for several. */
export const isParty = (r: Run): boolean => !!r.seats?.length;

export const seatOf = (r: Run, id: string): Seat | undefined => r.seats?.find((s) => s.id === id);

/** The seat in the chair; undefined in a run for one. */
export const chairOf = (r: Run): Seat | undefined => (r.chair ? seatOf(r, r.chair) : undefined);

/** The seat that plays a character, by the character's name. */
export const seatNamed = (r: Run, name: string): Seat | undefined => r.seats?.find((s) => same(s.sheet.name, name));

/** How someone feels about a character nobody has given them cause to feel anything about. */
const unmet = (p: Person): number => (p.hostile ? -15 : 0);

/** What is the chair's is written back into its seat: the seat is then the whole of that character. */
function keep(r: Run): void {
  const seat = chairOf(r);
  if (!seat) return;
  seat.who = r.who;
  seat.sheet = r.sheet;
  seat.downs = r.downs;
  for (const name of OWN_SYSTEMS) {
    if (r.sys?.[name] !== undefined) seat.own[name] = r.sys[name];
    else delete seat.own[name];
  }
  for (const p of r.people) (p.feels ??= {})[seat.id] = p.feeling;
}

/**
 * Make a run a table for several: the character it has becomes the first seat, in the chair. Nothing else changes.
 * A run that already is one is left as it is.
 */
export function seatFirst(r: Run, id: string, player: string): Seat {
  const have = r.seats?.[0];
  if (have) return have;
  const seat: Seat = { id, player: clean(player, 60), who: r.who, sheet: r.sheet, downs: r.downs, own: {}, since: r.turn };
  r.seats = [seat];
  r.chair = id;
  keep(r);
  return seat;
}

/** A new seat for a character already written (game/partyturn.ts writes the sheet). It does not take the chair. */
export function addSeat(r: Run, d: { id: string; player: string; who: string; sheet: Sheet }): Seat {
  const seat: Seat = { id: d.id, player: clean(d.player, 60), who: d.who, sheet: d.sheet, downs: 0, own: {}, since: r.turn };
  (r.seats ??= []).push(seat);
  return seat;
}

/**
 * Put a seat's character in the chair: the one who was there is kept in their own seat first. Returns the seat, or
 * undefined when there is no such seat (and nothing changes).
 */
export function sit(r: Run, id: string): Seat | undefined {
  const seat = seatOf(r, id);
  if (!seat) return undefined;
  if (r.chair === id) {
    // After a save was read back the chair's own things are copies of its seat's: the run's are the ones that count.
    keep(r);
    return seat;
  }
  keep(r);
  r.chair = id;
  r.who = seat.who;
  r.sheet = seat.sheet;
  r.downs = seat.downs;
  const sys = (r.sys ??= {});
  for (const name of OWN_SYSTEMS) {
    if (seat.own[name] !== undefined) sys[name] = seat.own[name];
    else delete sys[name];
  }
  for (const p of r.people) p.feeling = p.feels?.[id] ?? unmet(p);
  return seat;
}

/** A run as it is saved or sent: the chair's own things written into its seat, so every seat is whole. */
export function settled(r: Run): Run {
  keep(r);
  return r;
}

/** Give a seat to another id (a guest who came back into the room under a new one): everything of theirs goes with it. */
export function reseat(r: Run, from: string, to: string): void {
  const seat = seatOf(r, from);
  if (!seat || seatOf(r, to)) return;
  keep(r);
  seat.id = to;
  if (r.chair === from) r.chair = to;
  for (const p of r.people) {
    if (p.feels && from in p.feels) {
      p.feels[to] = p.feels[from]!;
      delete p.feels[from];
    }
  }
}

/** Those still in the story: everyone seated whose character was not brought down for good. */
export const playing = (r: Run): Seat[] => (r.seats ?? []).filter((s) => !s.out);

/**
 * How much less a deed is worth to each when it is shared, as the game this follows counts it
 * (PlayerCharacter.GetPartyXpMultiplier): 1 for one, about 0.85 for two, 0.75 for three, toward 0.55.
 */
export const partyShare = (n: number): number => (n <= 1 ? 1 : 1 - 0.45 * (1 - Math.pow(2 / 3, n - 1)));

/** Each character at the table in a line, for a model: whose they are and how they stand. */
export function partyText(r: Run): string {
  keep(r);
  return (r.seats ?? []).map((s) => `- ${s.sheet.name}${s.sheet.calling ? `, ${s.sheet.calling}` : ""} (played by ${s.player || "a player"}). Level ${s.sheet.level}, health ${s.sheet.hp} of ${MAX_HP}${s.out ? "; brought down for good" : ""}.`).join("\n");
}
