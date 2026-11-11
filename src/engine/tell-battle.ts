/**
 * The battle mat in words (docs/COMBAT.md, 6.1 and 3.8): where everyone stands by named zone and by who they are next
 * to, what each has left, and what each foe has chalked; what happened in a step, a line per thing, for the narrator's
 * note and the text tables; and the ledger line. Lines and the router speak in names, never in squares.
 */
import { dist, same, type Pos } from "./grid.js";
import { FOE_KINDS } from "./foekinds.js";
import { has, holdOn, piece, PROP_USE, standing, zoneOf, type Battle, type BattleEvent, type Intent, type Piece, type StateId } from "./battle.js";

const STATE_SAID: Record<StateId, string> = {
  prone: "down on the ground",
  staggered: "staggered",
  exposed: "open to a blow",
  burning: "on fire",
  marked: "marked",
  held: "held fast",
  grabbed: "grabbed",
  pinned: "pinned",
  overwhelmed: "overwhelmed",
  frightened: "frightened",
  blinded: "blinded",
  hidden: "hidden",
  guarded: "guarded",
  inspired: "inspired",
  flustered: "flustered",
  entranced: "entranced",
  enthralled: "enthralled",
  warded: "warded",
  watching: "on watch",
  taunted: "taunted",
};

const INTENT_SAID: Record<Intent["kind"], string> = {
  strike: "a blow at",
  cleave: "a wide swing at",
  charge: "a charge at",
  shot: "a shot at",
  grab: "a grab at",
  squeeze: "to squeeze",
  charm: "a charm at",
  blast: "a blast where",
  hex: "a hex on",
  pounce: "a pounce at",
  web: "a web at",
  carry: "to carry off",
  rally: "to rally its side",
  summon: "to call up help",
};

const nameOf = (b: Battle, id: string): string => (id ? (piece(b, id)?.name ?? id) : "nobody");
const statesOf = (p: Piece): string[] =>
  p.states
    .filter((s) => s.id !== "watching" || p.side === "you")
    .map((s) => {
      const by = s.by && ["grabbed", "pinned", "overwhelmed", "guarded", "taunted", "frightened", "entranced", "enthralled"].includes(s.id) ? s.by : "";
      return by ? `${STATE_SAID[s.id]} by ${by}` : STATE_SAID[s.id];
    });

/** Where a piece is, in words: its zone, and who it stands next to. */
export function whereSaid(b: Battle, p: Piece | Pos, self?: string): string {
  const at = Array.isArray(p) ? (p as Pos) : (p as Piece).at;
  const zone = zoneOf(b, at);
  const near = b.pieces.filter((q) => standing(q) && q.id !== self && !same(q.at, at) && dist(q.at, at) === 1).map((q) => q.name);
  const prop = b.props?.find((x) => !x.used && dist(x.at, at) <= 1);
  const bits = [zone ? `at ${zone}` : "", near.length ? `next to ${near.join(" and ")}` : "", !zone && prop ? `by ${prop.name}` : ""].filter(Boolean);
  return bits.join(", ") || "in the open";
}

/** What a foe has chalked, in words. */
export function intentSaid(b: Battle, i: Intent): string {
  const t = i.target ? nameOf(b, i.target) : "";
  if (i.kind === "rally" || i.kind === "summon") return INTENT_SAID[i.kind];
  if (i.kind === "blast") return `a blast where ${t} stands`;
  return `${INTENT_SAID[i.kind]} ${t}`.trim();
}

/** A piece in a line: name, where, what it has left, its states, and for a foe its chalk. */
export function pieceSaid(b: Battle, p: Piece, ids = true): string {
  const tag = ids ? ` [${p.id}]` : "";
  if (!standing(p)) return `${p.name}${tag}: ${p.down ? "down" : p.overcome ? "overcome" : p.carried ? "carried off" : p.fled ? "gone" : "out"}`;
  const pools = [`Stamina ${p.stamina}/${p.staminaMax}`, p.composure < p.composureMax || p.rail === "composure" || b.pieces.some((q) => q.rail === "composure") ? `Composure ${p.composure}/${p.composureMax}` : ""].filter(Boolean).join(", ");
  const who = p.side === "you" ? (p.hero ? " (you)" : p.ward ? " (to keep safe)" : "") : ` (${p.kind}${p.rank && p.rank !== "soldier" ? `, ${p.rank}` : ""}${p.leader ? ", leads them" : ""})`;
  const st = statesOf(p);
  const chalk = b.intents.find((i) => i.by === p.id);
  return `${p.name}${tag}${who}: ${whereSaid(b, p, p.id)}; ${pools}${st.length ? `; ${st.join(", ")}` : ""}${chalk ? `; chalked ${intentSaid(b, chalk)}` : ""}`;
}

/** The whole board in words, for the router and the narrator (6.1). */
export function boardWords(b: Battle, ids = true): string {
  const yours = b.pieces.filter((p) => p.side === "you");
  const theirs = b.pieces.filter((p) => p.side === "them" && (standing(p) || p.out || p.overcome));
  const props = (b.props ?? []).filter((x) => !x.used || x.template === "choke");
  const lines = [
    `Round ${b.round}.`,
    "Your side:",
    ...yours.map((p) => `- ${pieceSaid(b, p, ids)}`),
    "Theirs:",
    ...theirs.map((p) => `- ${pieceSaid(b, p, ids)}`),
    props.length ? "On the mat:" : "",
    ...props.map((x) => `- ${x.name}${ids ? ` [${x.id}]` : ""} (${x.template}: ${PROP_USE[x.template].says})${whereProp(b, x.at)}`),
    b.zones?.length ? `Places: ${b.zones.map((z) => z.name).join(", ")}.` : "",
    b.objective ? `Aim: ${objectiveSaid(b)}.` : "",
    b.broken ? "Their side has broken and is running." : b.resolve !== undefined && b.resolveMax ? `Their nerve: ${b.resolve} of ${b.resolveMax}.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const whereProp = (b: Battle, at: Pos): string => {
  const z = zoneOf(b, at);
  return z ? `, at ${z}` : "";
};

export function objectiveSaid(b: Battle): string {
  const o = b.objective;
  if (!o) return "beat them";
  if (o.kind === "escape") return `get ${o.need} of you off the edge of the mat`;
  if (o.kind === "hold") return `hold out until the end of round ${o.rounds}`;
  if (o.kind === "protect") return `keep ${nameOf(b, o.piece)} safe`;
  if (o.kind === "grab") return `take ${b.props?.find((x) => x.id === o.prop)?.name ?? "the prize"} and get it off the mat`;
  return `reach ${b.props?.find((x) => x.id === o.prop)?.name ?? "it"} and act on it before the end of round ${o.rounds}`;
}

const TIER_SAID = { crit_success: "a crit", success: "a hit", partial: "a graze", fail: "a miss", crit_fail: "a fumble" } as const;
const ROLL_SAID: Record<string, string> = { strike: "strikes at", shot: "shoots at", shove: "shoves", cleave: "swings wide at", charge: "charges", charm: "works a charm on", grapple: "grapples", struggle: "struggles against", talk: "talks to", hide: "tries to hide", prop: "uses", grab: "grabs at", squeeze: "squeezes", blast: "blasts", hex: "hexes", pounce: "pounces on", web: "webs", slick: "keeps footing on the slick", watch: "strikes, on watch, at" };

/** What happened in a step, a line per thing, in names: for the narrator's note and for a text table. */
export function eventLines(b: Battle, ev: readonly BattleEvent[]): string[] {
  const out: string[] = [];
  const n = (id: string) => nameOf(b, id);
  for (const e of ev) {
    switch (e.e) {
      case "move":
        if (e.style === "stand") out.push(`${n(e.piece)} gets up.`);
        else if (e.path.length > 1) out.push(`${n(e.piece)} ${e.style === "charge" ? "charges" : e.style === "run" ? "runs" : e.style === "fly" ? "flies" : e.style === "pounce" ? "leaps" : e.style === "drag" ? "is dragged" : "moves"} ${whereSaid(b, e.path[e.path.length - 1]!, e.piece).replace(/^at /, "to ").replace(/^in the open$/, "into the open")}.`);
        break;
      case "intent":
        out.push(`${n(e.intent.by)} chalks ${intentSaid(b, e.intent)}.`);
        break;
      case "wiped":
        out.push(`${n(e.piece)}'s blow is wiped (${e.why}).`);
        break;
      case "roll": {
        const at = e.at === e.by || e.at === "them" ? "" : ` ${n(e.at)}`;
        const verb = ROLL_SAID[e.what] ?? e.what;
        out.push(`${n(e.by)} ${verb}${e.what === "prop" ? ` ${b.props?.find((x) => x.id === e.at)?.name ?? e.at}` : at}: ${e.natural}${e.add >= 0 ? "+" : ""}${e.add} vs ${e.target}, ${TIER_SAID[e.tier]}${e.why.length ? ` (${e.why.join(", ")})` : ""}.`);
        break;
      }
      case "hit":
        out.push(`${n(e.piece)} loses ${e.damage} ${e.rail === "composure" ? "Composure" : "Stamina"} (${e.left} left).`);
        break;
      case "state":
        out.push(`${n(e.piece)} ${e.on ? "is" : "is no longer"} ${STATE_SAID[e.state]}${e.on && e.by ? ` by ${n(e.by)}` : ""}.`);
        break;
      case "pushed":
        out.push(`${n(e.piece)} is thrown back.`);
        break;
      case "wound":
        out.push(`${n(e.piece)} loses a red stone.`);
        break;
      case "down":
        out.push(`${n(e.piece)} goes down.`);
        break;
      case "overcome":
        out.push(`${n(e.piece)} is overcome.`);
        break;
      case "out":
        out.push(`${n(e.piece)} is out of the fight.`);
        break;
      case "fled":
        out.push(`${n(e.piece)} is off the mat.`);
        break;
      case "carried":
        out.push(`${n(e.by)} carries ${n(e.piece)} off the mat.`);
        break;
      case "burn":
        out.push(`${n(e.piece)} burns.`);
        break;
      case "heal":
        out.push(`${n(e.piece)} gets back ${e.amount} ${e.rail === "composure" ? "Composure" : "Stamina"}.`);
        break;
      case "prop":
        out.push(`${b.props?.find((x) => x.id === e.prop)?.name ?? e.prop} comes into it.`);
        break;
      case "ground":
        if (e.on) out.push(`The ground goes ${e.ground === "burning" ? "up in flames" : e.ground}.`);
        break;
      case "resolve":
        out.push(e.by > 0 ? `Their nerve shakes (${e.left} left).` : `Their nerve steadies (${e.left}).`);
        break;
      case "broken":
        out.push("Their side breaks and runs.");
        break;
      case "phase":
        out.push(`${n(e.piece)} changes: it comes on harder.`);
        break;
      case "arrive":
        out.push(`More of them come: ${e.pieces.map(n).join(", ")}.`);
        break;
      case "learn":
        out.push(`${n(e.piece)}: it ${e.says}.`);
        break;
      case "talk":
        out.push(`${n(e.by)} ${e.kind === "taunt" ? "taunts" : e.kind === "intimidate" ? "tries to cow" : e.kind === "demand" ? "demands they surrender" : "calls for a parley"}${e.at ? ` ${n(e.at)}` : ""}.`);
        break;
      case "ability":
        out.push(`${n(e.by)} uses an ability (${e.does})${e.at ? ` on ${n(e.at)}` : ""}.`);
        break;
      case "cant":
        out.push(`${n(e.piece)} can't: ${e.why}.`);
        break;
      case "over":
        if (e.how === "dragged clear") out.push("With you down, the others drag you clear: the fight is lost.");
        else if (e.how === "worn down") out.push(`The fight drags on until one side is spent: it is ${e.result === "won" ? "theirs that gives out first, and the fight is won" : "yours that gives out first, and the fight is lost"}.`);
        else out.push(e.result === "won" ? `The fight is won${e.how && e.how !== "beaten" ? ` (${e.how})` : ""}.` : e.result === "taken" ? `The fight is lost${e.how && e.how !== "beaten" ? ` (${e.how})` : ""}.` : e.result === "fled" ? "You got away." : e.result === "yielded" ? "You give in." : "They agree to talk.");
        break;
      case "miss":
        break;
    }
  }
  return out.map(youSaid);
}

/** A line about your own piece ("you"), put in the second person: "you strikes" is "You strike", "you's" is "Your". */
export function youSaid(line: string): string {
  const l = line.replace(/\byou's\b/g, "your");
  const up = l.charAt(0).toUpperCase() + l.slice(1);
  const fix = (v: string) => (v === "is" ? "are" : v === "has" ? "have" : v === "was" ? "were" : /ies$/.test(v) ? v.slice(0, -3) + "y" : /(sh|ch|x|ss|o)es$/.test(v) ? v.slice(0, -2) : /[^s]s$/.test(v) ? v.slice(0, -1) : v);
  // "you" as a subject: at the start, or after a comma, "so" or "and" ("..., so you moves up").
  return up.replace(/(^|, so |, and |; )([Yy]ou) (\w+)\b/g, (_, pre: string, you: string, v: string) => `${pre}${you} ${fix(v)}`);
}

/** How the mat is set out, said when it is unrolled: who stands against you, and how a round goes. */
export function battleOpenSaid(b: Battle, climax: boolean): string[] {
  const foes = b.pieces.filter((p) => p.side === "them" && standing(p));
  const named = [...new Set(foes.map((p) => p.name.replace(/ \d+$/, "")))];
  return [
    `I unroll the leather over the map. ${climax ? "This is the last of it. " : ""}Against you: ${named.join(", ")}.`,
    "Before you write, every one of them shows in chalk what it is about to do. One line from you is your whole side's turn: where you go, what you do, and what you tell the others. Answer the chalk.",
  ];
}

/** Said before you write each round: what the chalk shows, and the question. */
export function chalkSaid(b: Battle): string[] {
  const lines = chalkLines(b).map(youSaid);
  const hero = b.pieces.find((p) => p.hero);
  const out = hero && !standing(hero) && b.pieces.some((p) => p.side === "you" && !p.hero && standing(p));
  const ask = out ? `You are ${hero!.overcome ? "overcome" : "down"}, out of it: your line can only tell the others what to do, or give in.` : "What do you do?";
  return lines.length ? [`In chalk: ${lines.join(" ")}`, ask] : [`Nothing of theirs is chalked. ${ask}`];
}

/** Said before your die: what your hero is trying, and what it takes. */
export function rollAsk(b: Battle, e: Extract<BattleEvent, { e: "roll" }>): string {
  const verb = ROLL_SAID[e.what] ?? e.what;
  const at = e.what === "prop" ? ` ${b.props?.find((x) => x.id === e.at)?.name ?? e.at}` : e.at === e.by || e.at === "them" ? "" : ` ${nameOf(b, e.at)}`;
  const need = e.target - e.add;
  return youSaid(`you ${verb}${at}: you need ${Math.max(2, need)} or more on the die${e.edge ? ", with an edge (two dice, the better)" : ""}${e.bane ? ", against a bane (two dice, the worse)" : ""}.`);
}

/** What the end of a fight comes to, said. */
export function battleOverSaid(b: Battle, o: { cleared: boolean; taken: unknown; gaveIn: boolean; wounds: number; climax: boolean }): string[] {
  const out: string[] = [];
  if (o.cleared) out.push(b.over === "parley" ? "They put up their weapons and talk. You are past them." : b.overHow === "broken" ? "They break and run. The way is yours." : b.overHow === "surrender" ? "They throw down their weapons. The way is yours." : "The last of them falls. The way is yours.");
  else if (o.taken === "end") out.push("You go down at the last of it, and the story goes their way.");
  else if (o.taken) out.push(b.overHow === "carried" ? "They carry you off the mat. You come to later, somewhere beyond, with less than you had." : "You go down. You come to later, beyond this place, with less than you had.");
  else if (o.gaveIn) out.push(o.climax ? "You give in, at the last of it, and the story goes their way." : b.over === "fled" ? "You get away from them, with nothing to show for it." : "You give in. They let you go, with nothing.");
  if (o.wounds) out.push(`It cost you ${o.wounds === 1 ? "a red stone" : `${o.wounds} red stones`}.`);
  out.push("I roll up the leather.");
  return out;
}

/** What each foe has chalked, a line each: what the player has to answer. */
export function chalkLines(b: Battle): string[] {
  return b.intents.map((i) => `${nameOf(b, i.by)}: ${intentSaid(b, i)}.`);
}

/** The ledger line under the board: each of your side's pools, the foes left, the store. */
export function battleLedger(b: Battle): string {
  const yours = b.pieces
    .filter((p) => p.side === "you")
    .map((p) => `${p.name} ${standing(p) ? `${p.stamina}/${p.staminaMax}${p.composure < p.composureMax ? ` · ${p.composure}/${p.composureMax}` : ""}` : p.down ? "down" : p.overcome ? "overcome" : "gone"}`)
    .join(" · ");
  const left = b.pieces.filter((p) => p.side === "them" && standing(p)).length;
  return `Round ${b.round} · ${yours} · ${left} of them standing${b.store !== undefined ? ` · store ${b.store}` : ""}`;
}

/** Whether a piece is held anywhere on the ladder, said: for the router to know struggling is the act on offer. */
export const heldSaid = (p: Piece): string | null => {
  const h = holdOn(p);
  return h ? `${p.name} is ${h.hold} by ${h.by}` : has(p, "held") ? `${p.name} is held fast` : null;
};

/** What a kind does, in a line: for the router and the "learn". */
export const kindSaid = (p: Piece): string => (p.kind ? FOE_KINDS[p.kind].says : "");
