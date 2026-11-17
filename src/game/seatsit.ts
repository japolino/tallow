/**
 * One player's place at a table for several, played in the room (the game itself is the host's: backend/table.ts).
 *
 * The same table as a sitting for one (runsit.ts), seen from one seat: you write what you do and hand it over; the
 * narrator says what it takes you to mean and what the die must show, and you throw (the face was decided by the
 * host); the passage is told for everyone; and your sheets are written out again as they now stand. Nothing here
 * decides anything, and nothing here asks a model: what is said and shown comes from the host, on the messages of
 * the room (shared/tablewire.ts), through a link to it (frontend/roomlink.ts). The host's own table is one of these too.
 */
import { ATTRIBUTES, type Run } from "../engine/run.js";
import { seatOf, sit } from "../engine/seats.js";
import { hourOf } from "../engine/upkeep.js";
import type { WirePart, WireRound } from "../shared/tablewire.js";
import { seatLine } from "../shared/tablewire.js";
import { allSheets, inOrder, RUN_HOW, RUN_NOTES } from "./runsit.js";
import { showsOf } from "./runturn.js";
import type { RunDeps } from "./system.js";
import type { Table, Written } from "./table.js";

/** What happens at the table, as the room brings it. */
export type SeatEvent =
  /** A line was judged: what was made of it. Every player's comes, your own and the others'. */
  | { type: "line"; part: WirePart }
  /** The narrator's passage for the round, as it was first told. */
  | { type: "passage"; text: string }
  /** The round is written down: the run as it now stands, and the whole of what was told. */
  | { type: "round"; round: WireRound; text: string }
  /** Whose turn it is changed. */
  | { type: "turn" };

/** The room, as one seat needs it. */
export interface SeatLink {
  /** This player's seat: "host", or a guest's id in the room; null while the room has not said. */
  me(): string | null;
  /** The table as it last stood, and what the narrator last told; null when there is none yet. */
  state(): { round: WireRound; text: string } | null;
  /** Hand a line to the room. `why` says, in the narrator's words, what stopped it. */
  send(line: string): Promise<{ ok: true } | { ok: false; why: string }>;
  /** Whether a line could be handed over now, and if not, why (in the narrator's words). */
  may(): { ok: true } | { ok: false; why: string };
  /** The next thing that happens. */
  next(): Promise<SeatEvent>;
}

export interface SeatSitOptions {
  table: Table;
  link: SeatLink;
  /** For what the systems put on the table (nothing is asked of a model through it). */
  deps: RunDeps;
  /** Who this player sits down as, when they have no seat yet: their persona's name and page. */
  persona: { name: string; who: string } | null;
  /** Set while the sitting should go on; the loop ends when it turns false. */
  alive: () => boolean;
}

export const SEAT_THROW = "Take the die and throw when you are ready.";
/** Said once, when someone first sits beside you. */
export const SEAT_LOOK = "Take the pointer to the left or the right edge of the view to look at who sits beside you; bring it back, or touch a key, to turn to the table again.";
export const SEAT_WAIT = "The others have the table for a moment. I will bring you in as soon as there is room.";
const paragraphs = (t: string): string[] => t.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);

/** The run as this seat sees it: their own character in the chair. A seat not taken yet sees the host's. */
export function mine(run: Run, me: string | null): Run {
  const r = structuredClone(run);
  if (me && seatOf(r, me)) sit(r, me);
  return r;
}

export async function seatSit(o: SeatSitOptions): Promise<void> {
  const { table, link, deps } = o;
  table.theatre?.(true);
  let run: Run | null = null;
  const lay = (r: Run): void => {
    const shows = inOrder(showsOf(deps, r));
    // Everyone at the table, on a page of its own: who plays whom, and how each stands.
    const party = (r.seats ?? []).length > 1 ? [{ heading: "At the table", his: r.seats!.map((s) => `${s.sheet.name}${s.sheet.calling ? `, ${s.sheet.calling}` : ""}${s.player ? ` (${s.player})` : ""}: level ${s.sheet.level}, health ${s.sheet.hp}${s.out ? "; brought down for good" : ""}.`) }] : [];
    table.sheets?.([...allSheets(deps, r, shows), ...party]);
    table.show?.(shows);
    table.clock(hourOf(r));
    // The others, beside you: each wears the picture of their place at the table, the same at every player's table.
    table.party?.((r.seats ?? []).map((s, i) => ({ id: s.id, name: s.sheet.name, picture: i, out: !!s.out })).filter((s) => s.id !== link.me()));
  };
  /** How to look at the others is said once, the first time there is someone to look at. */
  let shownHow = false;
  const lookHow = (r: Run): string[] => {
    if (shownHow || !table.party || !(r.seats ?? []).some((s) => s.id !== link.me())) return [];
    shownHow = true;
    return [SEAT_LOOK];
  };
  const seated = (): boolean => !!run && !!link.me() && !!seatOf(run, link.me()!);

  // The table as it stands.
  const at = link.state();
  if (at?.round.run) {
    run = mine(at.round.run, link.me());
    lay(run);
    const before = run.beats[run.beats.length - 1];
    table.notes?.(before ? { his: paragraphs(before.story) } : { heading: run.place.name || "How it begins", his: paragraphs(run.opening || at.text) });
    const others = (run.seats ?? []).filter((s) => s.id !== link.me()).map((s) => s.sheet.name);
    await table.say(seated()
      ? [`We are ${before ? "in the middle of things" : "about to begin"}${run.place.name ? `, at ${run.place.name}` : ""}${others.length ? `, with ${others.join(" and ")}` : ""}.`, RUN_HOW, RUN_NOTES, ...lookHow(run)]
      : [`A table is already set${run.place.name ? `, at ${run.place.name}` : ""}${others.length ? `: ${others.join(" and ")} ${others.length === 1 ? "is" : "are"} here` : ""}.`]);
  } else await table.say(["The table is not set yet. Its host sets it by sitting down first."]);

  // A player with no seat takes one with their first line, which carries their character's page.
  let asking = false;
  const takeSeat = async (): Promise<void> => {
    if (seated() || asking || !run || !link.me()) return;
    if (!link.may().ok) return;
    asking = true;
    const who = o.persona ?? { name: "", who: "" };
    const sent = await link.send(seatLine(who.name, who.who));
    if (!sent.ok) asking = false;
  };
  if (run && !seated()) {
    await takeSeat();
    await table.say([asking ? `You sit down${o.persona?.name ? ` as ${o.persona.name}` : ""}. Give me a moment to write your sheet.` : SEAT_WAIT]);
  }

  let writing: Promise<{ w: Written }> | null = null;
  let event: Promise<{ e: SeatEvent }> | null = null;
  /** My own line of the round being played, and whether its die was thrown. */
  let myLine = "";
  let myPart: WirePart | null = null;
  const others: string[] = [];
  let said = "";
  /** How each line judged this round was taken, everyone's: a round of nothing but answers tells no story. */
  let kinds: string[] = [];

  while (o.alive()) {
    writing ??= table.write().then((w) => ({ w }));
    event ??= link.next().then((e) => ({ e }));
    const got = await Promise.race([writing, event]);
    if (!o.alive()) return;

    if ("w" in got) {
      writing = null;
      const line = got.w.line.trim();
      await got.w.given;
      if (!line) {
        void table.aside();
        continue;
      }
      if (!seated()) {
        void table.aside();
        await takeSeat();
        await table.say([asking ? "Your sheet is still being written. I will bring you in with the next of the story." : SEAT_WAIT]);
        continue;
      }
      const may = link.may();
      const sent = may.ok ? await table.wait("read", link.send(line)) : may;
      if (!sent.ok) {
        void table.aside();
        await table.say([sent.why]);
        continue;
      }
      myLine = myLine ? `${myLine}\n${line}` : line;
      continue;
    }

    event = null;
    const e = got.e;
    if (e.type === "turn") {
      if (!seated()) await takeSeat();
      continue;
    }
    if (e.type === "line") {
      const p = e.part;
      kinds.push(p.how);
      if (p.seat !== link.me()) {
        // Another player's throw is read out in a line: everyone sees every die at a table.
        if (p.die) others.push(`${p.name}: ${p.die.said}`);
        continue;
      }
      myPart = p;
      if (p.how === "answered") {
        void table.aside();
        if (p.reply) await table.say([p.reply]);
      } else if (p.how === "joined") {
        await table.say(["You are seated. I am bringing you into the story now."]);
      } else if (p.check && p.die) {
        await table.say([...p.check, SEAT_THROW]);
        await table.throwDie(p.die.face);
        await table.say([p.die.said]);
      } else void table.aside();
      continue;
    }
    if (e.type === "passage") {
      // The narrator's message of a round with nothing to tell is only the answers, each already said to its player.
      if (kinds.length && kinds.every((h) => h === "answered")) continue;
      said = e.text;
      await table.say([...others.splice(0), ...(myPart?.aside ? [myPart.aside] : []), ...paragraphs(e.text)]);
      continue;
    }
    // The round is written down.
    const r = e.round.run;
    if (!r) continue;
    run = mine(r, link.me());
    asking = false;
    lay(run);
    kinds = [];
    if (e.round.idle) {
      // Nothing was told: the narrator's message was the game's answers, and each was said to the one it was for.
      myLine = "";
      myPart = null;
      continue;
    }
    if (!said) await table.say([...others.splice(0), ...paragraphs(e.text)]);
    const part = e.round.parts.find((x) => x.seat === link.me()) ?? myPart;
    const changes = part?.changes ?? [];
    const after = said && e.text.startsWith(said) ? e.text.slice(said.length).trim() : "";
    const rolls = e.round.parts.filter((x) => x.die).map((x) => `${x.seat === link.me() ? "" : `${x.name}: `}${x.die!.said}`);
    const lines = e.round.parts.filter((x) => x.seat !== link.me() && x.how === "played" && x.line).map((x) => `${x.name}: ${x.line}`);
    table.notes?.({ ...(myLine ? { mine: myLine } : {}), ...(part?.heading ? { heading: part.heading } : {}), his: [...lines, ...rolls, ...(part?.aside ? [part.aside] : []), ...paragraphs(e.text), ...changes] });
    const how = lookHow(run);
    if (after || changes.length || how.length) await table.say([...paragraphs(after), ...changes, ...how]);
    if (part?.die && part.heading) await table.page({ heading: part.heading, his: [part.die.said, ...paragraphs(e.text), ...changes] });
    else void table.aside();
    if (seatOf(run, link.me() ?? "")?.out) await table.say(["Your character's story has ended. You can stay and watch the others."]);
    else if (run.over) await table.say(["This story is over: everyone at the table was brought down."]);
    else if (run.sheet.points > 0 && seated()) await table.say([`You have ${run.sheet.points} points to place among ${ATTRIBUTES.join(", ")}. Write where they go.`]);
    myLine = "";
    myPart = null;
    said = "";
  }
}

