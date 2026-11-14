/**
 * The table kept under an ordinary chat (game/pricetable.ts, backend/table.ts): anything can be had, and everything
 * is paid for. No stats and no verbs. Code owns every quantity here; models only read and write.
 *
 * - Everything that lasts is a CARD: yours, the place's (free to lean on while you are there), or held against you.
 * - Anything you reach for is a WANT with hurdles (its terms): what stands between you and it. A hurdle needs 2 points.
 * - A TROUBLE is a want held against you: it has a fuse, and when the fuse is out it takes something.
 * - A line is read for the cards it brings to bear. A card that clears a hurdle is 2 points, one that helps 1.
 *   Giving a card up for good is 1 more. Leaning on a card uses it up (a thing) or tires it until a rest (the rest).
 * - With nothing on the table behind a line it is a TRY: it always moves things 1 point, and the die spent on it says
 *   what that costs in hours.
 * - What the player writes as done is done. Whatever their line did not pay for goes on account as a marker (a debt),
 *   and a marker is called in later as a trouble.
 *
 * Found by playing it against real models first (lab/price); the numbers are from those sittings, not from a sim.
 */

export type Side = "you" | "here" | "them";
export type Kind = "thing" | "trait" | "tie" | "fact" | "debt";
export type Fit = "full" | "part" | "none";

export interface Card {
  id: string;
  side: Side;
  kind: Kind;
  name: string;
  /** What it is and what it is good for. */
  text: string;
  /** What comes with it: the narrator's handle on you. */
  catch?: string;
  /** Uses left for a thing; a trait, tie or fact has none and is tired instead. */
  uses: number | null;
  tired: boolean;
}

export interface Term {
  id: string;
  text: string;
  need: number;
  points: number;
  /** What was put toward it, in words, for whoever writes the card it becomes. */
  by: string[];
}

export interface Want {
  id: string;
  whose: "you" | "them";
  name: string;
  text: string;
  size: 1 | 2 | 3;
  terms: Term[];
  /** A trouble's beats left before it takes something. */
  fuse?: number;
  /** What it takes when the fuse is out, in the narrator's words. */
  bite?: string;
  /** The debt this trouble collects, if it is one called in. */
  collects?: string;
  bitten?: number;
}

export interface State {
  seed: number;
  beat: number;
  candle: number;
  wounds: number;
  dice: number[];
  place: { name: string; text: string; finds: number };
  cards: Card[];
  wants: Want[];
  /** Cards won by finishing a want, waiting for a model to write them. */
  toMint: Want[];
  /** The beat each marker was taken on. */
  taken: Record<string, number>;
  /** Which night of the chat this is: the candle is lit again when it burns out (turnNight). */
  night?: number;
  over?: string;
  n: number;
}

export const CANDLE = 20;
export const WOUNDS = 3;
export const DEBTS = 3;
export const FUSE = 4;
export const LANDS = 11;
export const FINDS_A_PLACE = 2;
const POINTS: Record<Fit, number> = { full: 2, part: 1, none: 0 };

/** A small seeded generator, so a sitting can be played again. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function newState(seed: number): State {
  const s: State = { seed, beat: 0, candle: CANDLE, wounds: 0, dice: [], place: { name: "", text: "", finds: 0 }, cards: [], wants: [], toMint: [], taken: {}, n: 0 };
  throwDice(s);
  return s;
}

export function throwDice(s: State): void {
  const r = rng(s.seed + s.beat * 7919 + 13);
  s.dice = [0, 1, 2].map(() => 1 + Math.floor(r() * 20));
}

const nextId = (s: State, p: string): string => `${p}${++s.n}`;

export interface CardDraft { name: string; text: string; catch?: string; kind?: string; uses?: number }

const KINDS: Kind[] = ["thing", "trait", "tie", "fact", "debt"];
const clean = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** A note's brackets left in means the model copied the form, not filled it. */
export const filled = (v: string): boolean => v.length > 1 && !/[<>{}]/.test(v);

export function addCard(s: State, side: Side, d: CardDraft, uses?: number | null): Card | null {
  const name = clean(d.name, 60);
  const text = clean(d.text, 220);
  if (!filled(name) || !filled(text)) return null;
  const kind = KINDS.includes(d.kind as Kind) ? (d.kind as Kind) : "thing";
  const c: Card = { id: nextId(s, "c"), side, kind, name, text, uses: uses === undefined ? (kind === "thing" ? 2 : null) : uses, tired: false };
  const ct = clean(d.catch, 160);
  if (filled(ct)) c.catch = ct;
  s.cards.push(c);
  return c;
}

export interface WantDraft { name: string; text?: string; size?: string | number; terms: string[]; fuse?: number; bite?: string }

const sizeOf = (v: unknown): 1 | 2 | 3 => (v === 3 || v === "large" ? 3 : v === 2 || v === "middling" ? 2 : 1);

export function addWant(s: State, whose: "you" | "them", d: WantDraft): Want | null {
  const name = clean(d.name, 70);
  const size = sizeOf(d.size);
  const texts = (Array.isArray(d.terms) ? d.terms : []).map((t) => clean(t, 220)).filter(filled);
  if (!filled(name) || !texts.length) return null;
  const id = nextId(s, whose === "you" ? "w" : "x");
  const w: Want = { id, whose, name, text: clean(d.text, 220), size, terms: [] };
  if (whose === "you") {
    // A small want has one term, a middling two, a large three: a model may not make it cheaper or dearer.
    w.terms = texts.slice(0, size).map((text, i) => ({ id: `${id}.${i + 1}`, text, need: 2, points: 0, by: [] }));
    while (w.terms.length < size) w.terms.push({ id: `${id}.${w.terms.length + 1}`, text: "something more that such a thing would cost", need: 2, points: 0, by: [] });
  } else {
    // A trouble is turned aside by one thing, and the bigger it is the more it takes.
    w.terms = [{ id: `${id}.1`, text: texts[0]!, need: size + 1, points: 0, by: [] }];
    w.fuse = FUSE;
    w.bite = clean(d.bite, 160) || "it takes what it came for";
    w.bitten = 0;
  }
  s.wants.push(w);
  return w;
}

export const card = (s: State, id: string): Card | undefined => s.cards.find((c) => c.id === id);
export const term = (s: State, id: string): { want: Want; term: Term } | undefined => {
  for (const want of s.wants) for (const t of want.terms) if (t.id === id) return { want, term: t };
  // A trouble may be named by its own id.
  const want = s.wants.find((w) => w.id === id && w.terms.length === 1);
  return want ? { want, term: want.terms[0]! } : undefined;
};
export const debts = (s: State): Card[] => s.cards.filter((c) => c.kind === "debt");
export const troubles = (s: State): Want[] => s.wants.filter((w) => w.whose === "them");
export const usable = (c: Card): boolean => c.side !== "them" && !c.tired && (c.uses === null || c.uses > 0);

/** What the reader says a line does. Every id in it is checked here; nothing in it is a number code keeps. */
export interface Ruling {
  happens?: string;
  plays?: { card: string; on: string; fit: Fit; give?: boolean; why?: string }[];
  tries?: { on: string; why?: string }[];
  /** `worked`: the message shows the character paying for it in their own time and labour, so it is billed in hours. */
  declared?: (string | { term: string; cost?: string; worked?: boolean })[];
  wish?: (WantDraft & { instead?: string | null }) | null;
  /** Something small the line uses that the character would plainly have, though it was never dealt. */
  had?: CardDraft | null;
  find?: CardDraft | null;
  ties?: { card: string; text: string }[];
  time?: number;
  rest?: boolean;
  goes?: string | null;
}

export interface Outcome {
  /** Plain facts for the teller and the player: what was spent, what it came to, what moved. */
  ledger: string[];
  /** A try is waiting for a die: which term, and what each die on the rack would come to. */
  wantsDie?: { on: string; name: string }[];
  settled: Want[];
  bit: Want[];
  goes?: string;
}

const dieSaid = (d: number): string => (d >= LANDS ? `${d}: lands clean` : d >= 5 ? `${d}: lands, and burns a notch of the candle` : `${d}: lands the hard way, and burns two notches`);
export const diceSaid = (s: State): string => s.dice.map(dieSaid).join(" | ") || "none left: a rest throws three more";

function lean(s: State, c: Card, give: boolean, led: string[]): void {
  if (give) {
    s.cards = s.cards.filter((x) => x !== c);
    led.push(`${c.name} is given up for good.`);
    return;
  }
  if (c.uses !== null) {
    c.uses--;
    if (c.uses <= 0) {
      s.cards = s.cards.filter((x) => x !== c);
      led.push(`${c.name} is used up.`);
    } else led.push(`${c.name}: ${c.uses} use${c.uses === 1 ? "" : "s"} left.`);
  } else {
    c.tired = true;
    led.push(`${c.name} is leaned on, and is no use again until a rest.`);
  }
}

function credit(s: State, w: Want, t: Term, led: string[], cost = "", worked = false): number {
  const owed = t.need - t.points;
  if (owed <= 0) return 0;
  if (worked) {
    // Work the message shows done is its own price: it is paid in the hours it took, and nothing is owed after.
    const burn = owed * 2;
    s.candle = Math.max(0, s.candle - burn);
    t.points = t.need;
    t.by.push("paid for in the character's own hours and work");
    led.push(`"${t.text}" is done by the character's own work, and paid for in hours: ${burn} notches of the candle.`);
    return burn;
  } else if (debts(s).length < DEBTS) {
    // The player's own words for what it cost are what the marker says, so that is what comes due.
    const said = filled(cost) ? `The player's own price for "${t.text}": ${cost}` : `Owed for "${t.text}", taken on the narrator's account.`;
    const d = addCard(s, "them", { name: `A marker for ${w.name}`, text: said, kind: "debt" }, null);
    if (d) s.taken[d.id] = s.beat;
    t.points = t.need;
    t.by.push(filled(cost) ? `on account, at the player's own price: ${cost}` : "on account: a marker the narrator holds");
    led.push(`On account: the narrator takes a marker${d ? ` (${d.id})` : ""} for "${t.text}"${filled(cost) ? `, at the price the player named: ${cost}` : ""}. It will be called in.`);
  } else {
    const burn = owed * 2;
    s.candle = Math.max(0, s.candle - burn);
    t.points = t.need;
    t.by.push("paid in hours");
    led.push(`The narrator holds ${DEBTS} markers already and lends no more: "${t.text}" is paid in hours, ${burn} notches of the candle.`);
  }
  return 0;
}

/**
 * Plays a ruling. `die` is the die chosen for the tries in it (one die covers one try); with a try and no die,
 * nothing about the try is done and the outcome asks for one.
 */
export function apply(s: State, r: Ruling, die?: number | "skip"): Outcome {
  const led: string[] = [];
  const out: Outcome = { ledger: led, settled: [], bit: [] };
  const answered = new Set<string>();
  s.beat++;

  // A wish first, so the same line can put something toward it. Its terms are named new.1, new.2...
  let wished: Want | null = null;
  const named = (r.wish && typeof r.wish === "object" ? clean(r.wish.name, 60) : "").toLowerCase();
  const already = named ? s.wants.find((w) => w.whose === "you" && w.name.toLowerCase() === named) : undefined;
  // A wish for what is already on the table under the same name is no new want: what is put toward it goes to the old one.
  if (already) wished = already;
  else if (r.wish && typeof r.wish === "object") {
    wished = addWant(s, "you", r.wish);
    // The same thing gone after by another road takes the old want's place.
    const old = wished && r.wish.instead ? s.wants.find((w) => w.id === r.wish!.instead && w.whose === "you" && w !== wished) : undefined;
    if (old) { s.wants = s.wants.filter((w) => w !== old); led.push(`${old.name} is let go: it is gone after another way now.`); }
    if (wished) led.push(`A new want is on the table: ${wished.name} (${["", "small", "middling", "large"][wished.size]}). It takes: ${wished.terms.map((t) => t.text).join("; ")}.`);
  }
  const termOf = (id: string) => {
    const m = /^new\.(\d+)$/.exec(String(id));
    if (m && wished) { const t = wished.terms[Number(m[1]) - 1]; return t ? { want: wished, term: t } : undefined; }
    return term(s, String(id));
  };

  // A small thing they would plainly have is dealt as the line uses it, one a beat, good once.
  let had: Card | null = null;
  if (r.had && typeof r.had === "object") {
    had = addCard(s, "you", { ...r.had, kind: "thing" }, 1);
    if (had) led.push(`Had all along, and on the table now: ${had.name}. ${had.text}`);
  }
  const used = new Set<string>();
  for (const p of r.plays ?? []) {
    const c = p.card === "had" ? had ?? undefined : card(s, p.card);
    const at = termOf(p.on);
    if (!c || !at || used.has(c.id)) continue;
    if (!usable(c)) { led.push(`${c.name} is ${c.side === "them" ? "not yours to play" : "tired"}: it adds nothing.`); continue; }
    if (at.term.points >= at.term.need) continue;
    const fit: Fit = p.fit === "full" || p.fit === "part" ? p.fit : "none";
    if (fit === "none") { led.push(`${c.name} does not bear on "${at.term.text}"${p.why ? `: ${clean(p.why, 120)}` : ""}. It is not spent.`); continue; }
    // Only what is yours can be given up; a thing of the place is only leaned on.
    const give = !!p.give && c.side === "you";
    const pts = POINTS[fit] + (give ? 1 : 0);
    used.add(c.id);
    at.term.points = Math.min(at.term.need, at.term.points + pts);
    at.term.by.push(`${c.name}${give ? " (given up)" : ""}: ${clean(p.why, 120)}`);
    answered.add(at.want.id);
    led.push(`${c.name} ${fit === "full" ? "answers" : "goes part of the way to"} "${at.term.text}"${give ? ", given up for it" : ""} (${at.term.points} of ${at.term.need}).`);
    lean(s, c, give, led);
  }

  const tries = (r.tries ?? []).map((t) => ({ t, at: termOf(t.on) })).filter((x) => x.at && x.at.term.points < x.at.term.need);
  if (tries.length) {
    const x = tries[0]!;
    if (die === undefined) out.wantsDie = [{ on: x.at!.term.id, name: x.at!.term.text }];
    else if (die === "skip" || !s.dice.includes(die)) led.push(`No die is spent on "${x.at!.term.text}": the try is left alone.`);
    else {
      s.dice.splice(s.dice.indexOf(die), 1);
      answered.add(x.at!.want.id);
      // Honest effort always moves things: the die only says what it costs in hours.
      const t = x.at!.term;
      t.points++;
      const toward = `(${t.points} of ${t.need} toward "${t.text}")`;
      if (die >= LANDS) { t.by.push(`a try that landed: ${clean(x.t.why, 120)}`); led.push(`A try, on a ${die}: it lands ${toward}.`); }
      else if (die >= 5) { s.candle = Math.max(0, s.candle - 1); t.by.push(`a try that landed the slow way: ${clean(x.t.why, 120)}`); led.push(`A try, on a ${die}: it lands the slow way, and the candle burns a notch ${toward}.`); }
      else { s.candle = Math.max(0, s.candle - 2); t.by.push(`a try that got there the hard way: ${clean(x.t.why, 120)}`); led.push(`A try, on a ${die}: it gets there the hard way, and the candle burns two notches ${toward}.`); }
    }
  }

  // What the player wrote as already done is so, and is billed: whatever the line did not pay for goes on account.
  /** Hours already charged for work the message shows done: the same stretch of time is not charged twice below. */
  let hours = 0;
  for (const d of r.declared ?? []) {
    const id = String(typeof d === "string" ? d : d?.term);
    const cost = typeof d === "string" ? "" : clean(d?.cost, 160);
    const worked = typeof d !== "string" && d?.worked === true;
    // A want named whole is all of what it still takes; "new" is the want this same line asked for.
    const whole = id === "new" ? wished : s.wants.find((w) => w.id === id && w.terms.length > 1);
    const ats = whole ? whole.terms.map((t) => ({ want: whole, term: t })) : [termOf(id)];
    for (const at of ats) {
      if (!at || at.term.points >= at.term.need) continue;
      hours += credit(s, at.want, at.term, led, cost, worked);
      answered.add(at.want.id);
    }
  }

  // Something small the world gives up to a line that went looking.
  if (r.find && typeof r.find === "object" && s.place.finds < FINDS_A_PLACE) {
    const f = addCard(s, "you", r.find, r.find.kind === "thing" || !r.find.kind ? 1 : null);
    if (f) { s.place.finds++; led.push(`Dealt to you: ${f.name} (${f.id}). ${f.text}${f.catch ? ` The catch: ${f.catch}` : ""}`); }
  }
  for (const t of r.ties ?? []) {
    const c = card(s, t.card);
    const text = clean(t.text, 160);
    if (c && c.kind === "tie" && filled(text)) { c.text = c.text.replace(/\s*\[now:.*\]$/, "") + ` [now: ${text}]`; led.push(`${c.name}: ${text}.`); }
  }

  // Wants met and troubles turned aside.
  for (const w of [...s.wants]) {
    if (!w.terms.every((t) => t.points >= t.need)) continue;
    s.wants = s.wants.filter((x) => x !== w);
    out.settled.push(w);
    if (w.whose === "you") { s.toMint.push(w); led.push(`${w.name} is yours.`); }
    else {
      led.push(`${w.name} is turned aside.`);
      if (w.collects) { s.cards = s.cards.filter((c) => c.id !== w.collects); led.push("The marker it came for is torn up."); }
    }
  }

  // Time.
  const rest = !!r.rest;
  // Anything that moved the table takes a notch at least, whatever the reader made of the time.
  const said = Math.max(0, Math.min(2, Math.round(Number(r.time) || 0)));
  const time = rest ? 3 : Math.max(0, Math.max(said, answered.size ? 1 : 0) - hours);
  if (time) { s.candle = Math.max(0, s.candle - time); led.push(`${time === 1 ? "A notch" : `${time} notches`} of the candle burn${time === 1 ? "s" : ""}: ${s.candle} left.`); }
  if (rest) {
    for (const c of s.cards) c.tired = false;
    if (s.wounds) s.wounds--;
    throwDice(s);
    led.push(`A rest: what was tired is fresh, three dice are thrown anew${s.wounds < WOUNDS ? ", and a wound closes if there was one" : ""}.`);
  } else if (!s.dice.length) { throwDice(s); s.candle = Math.max(0, s.candle - 1); led.push("The rack is empty: three more dice are thrown, and the candle burns a notch for them."); }

  // Troubles left alone come nearer.
  const acted = time > 0 || !!(r.plays?.length || r.tries?.length || r.declared?.length);
  if (acted) for (const w of troubles(s)) {
    if (answered.has(w.id) || w.fuse === undefined) continue;
    w.fuse--;
    if (w.fuse <= 0) out.bit.push(w);
    else led.push(`${w.name}: ${w.fuse} beat${w.fuse === 1 ? "" : "s"} before it takes what it came for.`);
  }
  if (r.goes && typeof r.goes === "string" && filled(clean(r.goes, 80))) out.goes = clean(r.goes, 80);
  if (s.candle <= 0) s.over = "The candle is out.";
  return out;
}

/** How many things of the place are kept on the table at once. */
export const HERE_MOST = 4;

/** With nobody to ask which die: the lowest that lands clean, else the highest there is. */
export function autoDie(s: State): number | "skip" {
  const ok = s.dice.filter((d) => d >= LANDS).sort((a, b) => a - b);
  return ok[0] ?? [...s.dice].sort((a, b) => b - a)[0] ?? "skip";
}

/** Things of the place as the story now shows them: added to what is here, the oldest going when there are too many. */
export function addHere(s: State, drafts: readonly CardDraft[]): Card[] {
  const added: Card[] = [];
  const known = new Set(s.cards.map((c) => c.name.toLowerCase()));
  for (const d of drafts.slice(0, HERE_MOST)) {
    if (!d || typeof d !== "object" || known.has(clean(d.name, 60).toLowerCase())) continue;
    const c = addCard(s, "here", d, d.kind === "thing" || !d.kind ? 1 : null);
    if (c) (added.push(c), known.add(c.name.toLowerCase()));
  }
  const here = s.cards.filter((c) => c.side === "here");
  for (const old of here.slice(0, Math.max(0, here.length - HERE_MOST))) s.cards = s.cards.filter((c) => c !== old);
  return added;
}

/**
 * Under a chat a night does not end the story. When the candle is out, or the character has three wounds, the night
 * turns: a new candle, new dice, what was tired fresh again. Returns what to tell, or nothing when the night goes on.
 */
export function turnNight(s: State): string[] {
  if (!s.over) return [];
  const led: string[] = [];
  if (s.wounds >= WOUNDS) {
    s.wounds = 1;
    led.push("Three wounds: the character is laid low and loses the rest of the night. They come round with one wound still on them.");
  } else led.push("The candle is out: the night is over.");
  s.candle = CANDLE;
  s.night = (s.night ?? 1) + 1;
  for (const c of s.cards) c.tired = false;
  throwDice(s);
  delete s.over;
  led.push("Let time pass in the story: it is the next day, or the next quiet stretch. A new candle is lit, and what was tired is fresh.");
  return led;
}

/** What a trouble may take, by code's rule: the model picks one and words it. */
export function bites(s: State, w: Want): { id: string; said: string }[] {
  const o: { id: string; said: string }[] = [{ id: "wound", said: "it hurts the character: one wound" }, { id: "hours", said: `it costs them the night: ${1 + w.size} notches of the candle` }];
  for (const c of s.cards.filter((c) => c.side === "you" && c.kind !== "debt")) o.push({ id: `take:${c.id}`, said: `it takes ${c.name} from them for good` });
  if (debts(s).length < DEBTS && !w.collects) o.push({ id: "marker", said: "it leaves them owing: the narrator takes a marker" });
  return o;
}

export function bite(s: State, w: Want, pick: string): string {
  const legal = bites(s, w).map((b) => b.id);
  const id = legal.includes(pick) ? pick : "wound";
  let said: string;
  if (id === "wound") { s.wounds++; said = `${w.name} takes blood: a wound (${s.wounds} of ${WOUNDS}).`; }
  else if (id === "hours") { s.candle = Math.max(0, s.candle - 1 - w.size); said = `${w.name} takes the night: ${1 + w.size} notches (${s.candle} left).`; }
  else if (id === "marker") { const d = addCard(s, "them", { name: `A marker left by ${w.name}`, text: "Owed for what it could not take there and then.", kind: "debt" }, null); if (d) s.taken[d.id] = s.beat; said = `${w.name} leaves you owing: the narrator takes a marker.`; }
  else { const c = card(s, id.slice(5))!; s.cards = s.cards.filter((x) => x !== c); said = `${w.name} takes ${c.name} from you.`; }
  w.bitten = (w.bitten ?? 0) + 1;
  if (w.collects) s.cards = s.cards.filter((c) => c.id !== w.collects);
  // A large trouble stays for a second bite; anything else has had what it came for.
  if (w.size === 3 && w.bitten < 2) { w.fuse = FUSE; said += " It is not done with you."; }
  else s.wants = s.wants.filter((x) => x !== w);
  if (s.wounds >= WOUNDS) s.over = "Three wounds: the night is taken from you.";
  if (s.candle <= 0) s.over = "The candle is out.";
  return said;
}

/**
 * Whether a marker comes due now: never with a trouble already on the table, never in the two beats after it was
 * taken, always on arriving somewhere, and otherwise more likely the more is owed. The oldest marker first.
 */
export function debtDue(s: State, arriving = false): Card | null {
  if (troubles(s).length) return null;
  const all = debts(s);
  // With as many markers out as the narrator will hold, the oldest is called at once.
  if (all.length >= DEBTS) return all[0]!;
  const d = all.filter((c) => s.beat - (s.taken[c.id] ?? 0) >= 2);
  if (!d.length) return null;
  if (arriving) return d[0]!;
  const r = rng(s.seed + s.beat * 31 + 5)();
  return r < 0.25 * d.length ? d[0]! : null;
}

export function arrive(s: State, name: string, text: string, follows = false): void {
  s.cards = s.cards.filter((c) => c.side !== "here");
  // A trouble that is not collecting a debt is left behind with the place it stood in; under a chat, where the scene
  // moves whenever the story does, it follows (`follows`), and walking off is a play like any other.
  if (!follows) s.wants = s.wants.filter((w) => w.whose === "you" || !!w.collects);
  s.place = { name: clean(name, 80), text: clean(text, 300), finds: 0 };
}

const cardLine = (c: Card): string => `  ${c.id} ${c.name}${c.uses !== null ? ` (${c.uses} use${c.uses === 1 ? "" : "s"})` : ""}${c.tired ? " (tired)" : ""}: ${c.text}${c.catch ? ` | catch: ${c.catch}` : ""}`;

/** One line of where things stand, for a transcript. */
export function brief(s: State): string {
  const wants = s.wants.filter((w) => w.whose === "you").map((w) => `${w.name} ${w.terms.map((t) => (t.points >= t.need ? "#" : t.points ? "+" : "-")).join("")}`);
  const tr = troubles(s).map((w) => `${w.name} (${w.terms[0]!.points}/${w.terms[0]!.need}, in ${w.fuse})`);
  const mine = s.cards.filter((c) => c.side === "you").map((c) => `${c.name}${c.uses !== null ? ` x${c.uses}` : ""}${c.tired ? " (tired)" : ""}`);
  return `[candle ${s.candle} | wounds ${s.wounds} | dice ${s.dice.join(",") || "-"} | markers ${debts(s).length}]\n[yours: ${mine.join("; ") || "nothing"}]\n[after: ${wants.join("; ") || "nothing"}]${tr.length ? `\n[trouble: ${tr.join("; ")}]` : ""}`;
}

/** The table as text: what the player sees, and what every model is given. */
export function table(s: State): string {
  const mine = s.cards.filter((c) => c.side === "you");
  const here = s.cards.filter((c) => c.side === "here");
  const theirs = debts(s);
  const wants = s.wants.filter((w) => w.whose === "you");
  const tr = troubles(s);
  const o: string[] = [];
  o.push(`CANDLE ${s.candle} of ${CANDLE} | WOUNDS ${s.wounds} of ${WOUNDS} | DICE ${s.dice.join(", ") || "none"}`);
  o.push(`PLACE: ${s.place.name}. ${s.place.text}`);
  o.push("YOURS:", ...(mine.length ? mine.map(cardLine) : ["  nothing"]));
  o.push("HERE (free to lean on while you are here):", ...(here.length ? here.map(cardLine) : ["  nothing"]));
  o.push("WHAT YOU ARE AFTER:");
  if (!wants.length) o.push("  nothing yet");
  for (const w of wants) { o.push(`  ${w.id} ${w.name}${w.text ? `: ${w.text}` : ""}`); for (const t of w.terms) o.push(`    ${t.id} [${t.points >= t.need ? "met" : `${t.points}/${t.need}`}] ${t.text}`); }
  o.push("ACROSS THE TABLE (the narrator's):");
  if (!tr.length && !theirs.length) o.push("  nothing");
  for (const w of tr) o.push(`  ${w.id} TROUBLE ${w.name}: ${w.text} | it wants: ${w.terms[0]!.text} [answered ${w.terms[0]!.points}/${w.terms[0]!.need}] | in ${w.fuse} beat${w.fuse === 1 ? "" : "s"}: ${w.bite}`);
  for (const c of theirs) o.push(`  ${c.id} MARKER ${c.name}: ${c.text}`);
  return o.join("\n");
}
