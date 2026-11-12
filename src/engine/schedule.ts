/**
 * The world runs on a clock (docs/MOONSHOT.md, 5): appointments, routines, and the things you can do with time.
 *
 * The other side keeps appointments: things that happen at a time, at a place, whether you are there or not. Code
 * holds the schedule and what each step needs; a model words it. Getting in the way changes it: stop the courier and
 * he never arrives, and the masked four act on that. Each change is a branch code already knows. People keep routines
 * too: the barkeep closes at two, the watch changes at eleven. A routine is an opportunity.
 *
 * When you learn of an appointment, the narrator cuts a notch in the burning candle at the height where that hour
 * falls. When the flame gets there, it happens.
 *
 * Pure: facts in, an answer out.
 */

/** One thing that happens at a time and a place. */
export interface Appointment {
  id: string;
  /** The hour of the game's day it happens (it runs past 24 into the next day). */
  at: number;
  /** The place it happens. */
  where: string;
  /** What happens, in a line, for the narrator. */
  what: string;
  /** Who is there. */
  who?: string[];
  /** It happens only if all of these have happened (and not been stopped). */
  needs?: string[];
  /** If any of these happened, this does not. */
  unless?: string[];
  /** If it cannot happen because something it needs was stopped, this one happens instead (a branch code knows). */
  otherwise?: string;
  /** A routine: it happens every day at this hour. */
  daily?: boolean;
  /** How long it lasts, in hours (a quarter of an hour when not said): you can catch it while it goes on. */
  lasts?: number;
  /** A step of the big bad's plan (campaign.ts): it lights the black candle if it happens. */
  front?: boolean;
}

/** Where the schedule stands. */
export interface Schedule {
  appointments: Appointment[];
  /** Ids that happened, with the hour. */
  happened: { id: string; at: number }[];
  /** Ids stopped by the players: they never happen. */
  stopped: string[];
  /** Ids the players know of: each has a notch in the candle. */
  known: string[];
}

export const newSchedule = (appointments: Appointment[], known: string[] = []): Schedule => ({ appointments, happened: [], stopped: [], known });

const done = (s: Schedule, id: string): boolean => s.happened.some((h) => h.id === id);

/** The next time a routine (or a one-off) falls at or after an hour. */
export function nextAt(a: Appointment, from: number): number {
  if (!a.daily) return a.at;
  const day = Math.floor(from / 24);
  const t = day * 24 + (a.at % 24);
  return t >= from ? t : t + 24;
}

/** Whether an appointment can happen, by what it needs and what stops it. */
export function canHappen(s: Schedule, a: Appointment): boolean {
  if (s.stopped.includes(a.id)) return false;
  if ((a.unless ?? []).some((u) => done(s, u))) return false;
  return (a.needs ?? []).every((n) => done(s, n) && !s.stopped.includes(n));
}

/** What happened while time ran from one hour to another. */
export interface Ran {
  schedule: Schedule;
  /** What happened, in order, each with where and whether the players knew of it. */
  events: { a: Appointment; at: number; known: boolean }[];
}

/**
 * Run the clock from one hour to another (5.1). Each appointment that falls in between happens if it can; one that
 * cannot because what it needs was stopped sends on to its "otherwise". Routines happen every day.
 */
export function runClock(s: Schedule, from: number, to: number): Ran {
  let sch: Schedule = { ...s, happened: [...s.happened] };
  const events: Ran["events"] = [];
  const due = (a: Appointment): number[] => {
    if (!a.daily) return a.at > from && a.at <= to ? [a.at] : [];
    const out: number[] = [];
    for (let t = nextAt(a, from + 1e-6); t <= to; t += 24) out.push(t);
    return out;
  };
  // An appointment named as another's "otherwise" is a branch: it happens only in that one's place.
  const branches = new Set(sch.appointments.map((a) => a.otherwise).filter((x): x is string => !!x));
  const times = sch.appointments.filter((a) => !branches.has(a.id)).flatMap((a) => due(a).map((t) => ({ a, t }))).sort((x, y) => x.t - y.t);
  for (const { a, t } of times) {
    if (!a.daily && done(sch, a.id)) continue;
    if (canHappen(sch, a)) {
      sch = { ...sch, happened: [...sch.happened, { id: a.id, at: t }] };
      events.push({ a, at: t, known: sch.known.includes(a.id) });
    } else if (a.otherwise && !sch.stopped.includes(a.id) && (a.needs ?? []).some((n) => sch.stopped.includes(n))) {
      // Only a need that was stopped sends on to the branch: one that has simply not happened yet does not.
      const alt = sch.appointments.find((x) => x.id === a.otherwise);
      if (alt && !done(sch, alt.id) && !sch.stopped.includes(alt.id)) {
        sch = { ...sch, happened: [...sch.happened, { id: alt.id, at: t }] };
        events.push({ a: alt, at: t, known: sch.known.includes(alt.id) });
      }
    }
  }
  return { schedule: sch, events };
}

/** You stop something: it never happens, and what needs it acts on that. */
export const stop = (s: Schedule, id: string): Schedule => (s.stopped.includes(id) ? s : { ...s, stopped: [...s.stopped, id] });

/** You learn of an appointment: a notch goes in the candle. */
export const learn = (s: Schedule, id: string): Schedule => (s.known.includes(id) || !s.appointments.some((a) => a.id === id) ? s : { ...s, known: [...s.known, id] });

/** The notches in the candle: each known appointment still to come, by its hour. */
export function notches(s: Schedule, now: number): { id: string; at: number }[] {
  return s.appointments
    .filter((a) => s.known.includes(a.id) && !s.stopped.includes(a.id) && (a.daily || !done(s, a.id)))
    .map((a) => ({ id: a.id, at: nextAt(a, now) }))
    .filter((n) => n.at >= now)
    .sort((x, y) => x.at - y.at);
}

/**
 * What is going on at a place at an hour: anything that has started there and not yet finished. A one-off only if it
 * really happened (a branch from the hour it happened in place of another); a routine every day.
 */
export function goingOn(s: Schedule, where: string, hour: number): Appointment[] {
  return s.appointments.filter((a) => {
    if (a.where !== where || s.stopped.includes(a.id)) return false;
    if (a.daily) {
      const t = nextAt(a, hour - (a.lasts ?? 0.25));
      return t <= hour && hour <= t + (a.lasts ?? 0.25) && canHappen(s, a);
    }
    const ran = s.happened.find((h) => h.id === a.id);
    return !!ran && ran.at <= hour && hour <= ran.at + (a.lasts ?? 0.25);
  });
}

/** What the other side meant to do at a place and has not yet done: stopped, once you are past that place. */
export function stoppedAt(s: Schedule, where: string): { schedule: Schedule; stopped: Appointment[] } {
  const gone = s.appointments.filter((a) => a.where === where && !a.daily && !done(s, a.id) && !s.stopped.includes(a.id));
  return { schedule: gone.reduce((x, a) => stop(x, a.id), s), stopped: gone };
}

// ---- Things to do with time (5.2) ----

export type TimeAct = "wait" | "watch" | "follow" | "prepare" | "stretch";

/** A line read into something done with time: the act and, for waiting, the hour named. */
export interface TimeRead {
  act: TimeAct;
  /** The hour to wait until, when one was named. */
  until?: number;
  /** For a long stretch, roughly how long, in hours. */
  hours?: number;
}

const HOUR_WORDS: Record<string, number> = { midnight: 24, noon: 12, midday: 12, dawn: 6, sunrise: 6, dusk: 19, sunset: 19, nightfall: 20, evening: 19, morning: 8 };
const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/** The hour a line names ("until midnight", "till 2", "near eleven"), on or after `now`. */
export function hourNamed(line: string, now: number): number | null {
  const l = line.toLowerCase();
  // An hour word before a noun names a thing, not the hour: "wait for the morning guard to leave" waits for the guard.
  const OK_AFTER = "comes|came|breaks|falls|and|then|or|when|before|to|at|if|so|while|i|we|here|there|for|in|by|on|tomorrow|tonight";
  const clock = clockHour(l, now);
  if (clock !== null) return clock;
  for (const [w, h] of Object.entries(HOUR_WORDS)) {
    const at = new RegExp(`\\b(?:(a quarter past|quarter past|half past|a quarter to|quarter to)\\s+)?${w}\\b(?!\\s+(?!(?:${OK_AFTER})\\b)[a-z]+)`).exec(l);
    if (!at) continue;
    const part = (at[1] ?? "").replace(/^a /, "");
    return later(h + (part === "quarter past" ? 0.25 : part === "half past" ? 0.5 : part === "quarter to" ? -0.25 : 0), now);
  }
  return null;
}

/** An hour named on the clock face ("until a quarter past two", "at 5 o'clock", "till 8:25 pm"), on or after `now`. */
function clockHour(l: string, now: number): number | null {
  const N = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const PART = "(?:(a quarter past|quarter past|half past|a quarter to|quarter to)\\s+)";
  const SAID = "(am|pm|a\\.m\\.|p\\.m\\.|o'clock|o’clock|in the (?:morning|afternoon|evening)|at night|tonight)?";
  // "until a quarter past two", "at 5 o'clock", or "a quarter past two" said on its own.
  const m =
    new RegExp(`\\b(?:until|till|til|to|near|around|about|by|at|rings?|strikes?|chimes?|tolls?)\\s+${PART}?${N}(?::(\\d{2}))?\\s*${SAID}`).exec(l) ??
    new RegExp(`\\b${PART}${N}()\\s*${SAID}`).exec(l);
  if (!m) return null;
  const part = (m[1] ?? "").replace(/^a /, "");
  let h = Number.isNaN(Number(m[2])) ? NUMBERS[m[2]!]! : Number(m[2]);
  let min = m[3] ? Number(m[3]) / 60 : 0;
  if (part === "quarter past") min = 0.25;
  else if (part === "half past") min = 0.5;
  else if (part === "quarter to") (h = (h + 11) % 12 || 12), (min = 0.75);
  const said = m[4] ?? "";
  // "o'clock" says the hour is on the clock face, not which half of the day it is in.
  const pm = /^p|afternoon|evening|night|tonight/.test(said) && h < 12;
  const am = /^a|morning/.test(said);
  if (pm) h += 12;
  if (am && h === 12) h = 0;
  const a = later(h + min, now);
  if (pm || am || h > 12) return a;
  // A bare hour is the next time it comes round, by the clock face.
  return Math.min(a, later(h + min + 12, now));
}

/**
 * How long a line says, in hours: "half an hour", "an hour and a half", "two hours", "a couple of hours", "45 minutes".
 * Null when it names no length of time.
 */
export function hoursNamed(line: string): number | null {
  const l = line.toLowerCase();
  if (/\b(a |one )?quarter of an hour\b|\b15 min(ute)?s?\b|\bfifteen minutes\b/.test(l)) return 0.25;
  if (/\bhalf an hour\b|\bhalf-hour\b|\b30 min(ute)?s?\b|\bthirty minutes\b/.test(l)) return 0.5;
  if (/\b(45|forty-five) min(ute)?s?\b|\bthree quarters of an hour\b/.test(l)) return 0.75;
  if (/\ban hour and a half\b|\bone and a half hours\b|\b1\.5 hours\b/.test(l)) return 1.5;
  const many = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|couple of|a few|few)\s+(?:more\s+|full\s+|long\s+)?hours\b/.exec(l);
  if (many) {
    const w = many[1]!;
    const n = Number.isNaN(Number(w)) ? (NUMBERS[w] ?? (/couple/.test(w) ? 2 : 3)) : Number(w);
    return n + (/^ and a half\b/.test(l.slice(many.index + many[0].length)) ? 0.5 : 0);
  }
  if (/\b(an|one|another|a full|a whole)\s+(more\s+)?hour\b/.test(l)) return 1;
  return null;
}
const later = (h: number, now: number): number => {
  const day = Math.floor(now / 24) * 24;
  let t = day + (h % 24);
  while (t <= now) t += 24;
  return t;
};

/** Whether a line does something with time, and what. */
export function timeRead(line: string, now: number): TimeRead | null {
  const l = line.toLowerCase();
  if (/\b(wait|waits|nurse|bide|sit tight|hang back|linger|stay put|keep watch until)\b/.test(l)) {
    const until = hourNamed(line, now);
    if (until !== null) return { act: "wait", until };
    const hours = hoursNamed(line);
    return { act: "wait", ...(hours !== null ? { hours } : {}) };
  }
  if (/\b(watch|stake out|keep an eye on|keep watch|observe)\b/.test(l)) return { act: "watch" };
  if (/\b(follow|tail|shadow|trail)\b/.test(l)) return { act: "follow" };
  if (/\b(prepare|lay an ambush|set an ambush|set a trap|lay a trap|bar the door|get ready|swap the|set up)\b/.test(l)) return { act: "prepare" };
  if (/\b(spend the (day|night|morning|evening)|all day|all night|for days|for a week|travel to|ask around|ask round|search the archive)\b/.test(l)) {
    const hours = /\bweek\b/.test(l) ? 7 * 24 : /\bdays\b/.test(l) ? 48 : /\b(day|night)\b/.test(l) ? 10 : 4;
    return { act: "stretch", hours };
  }
  return null;
}

/** How long a time act takes, in hours, from now: until the hour named, or its usual length. */
export function timeTaken(r: TimeRead, now: number): number {
  if (r.act === "wait") return r.until !== undefined ? Math.max(0.25, r.until - now) : (r.hours ?? 1);
  if (r.act === "prepare") return 0.5;
  if (r.act === "watch") return 1;
  if (r.act === "follow") return 1.5;
  return r.hours ?? 4;
}

/** An hour as a clock says it: "midnight", "half past one", "2 in the afternoon". */
export function hourSaid(h: number): string {
  const t = ((h % 24) + 24) % 24;
  const whole = Math.floor(t);
  const min = Math.round((t - whole) * 60);
  const name = whole === 0 ? "midnight" : whole === 12 ? "noon" : `${whole % 12}`;
  const part = whole === 0 || whole === 12 ? "" : whole < 12 ? " in the morning" : whole < 18 ? " in the afternoon" : " at night";
  if (min === 0) return `${name}${part}`;
  if (min === 30) return `half past ${name}${part}`;
  if (min === 15) return `a quarter past ${name}${part}`;
  // A quarter to noon or to midnight is said by the hour it comes to, with no part of the day after it.
  if (min === 45) return whole + 1 === 24 ? "a quarter to midnight" : whole + 1 === 12 ? "a quarter to noon" : `a quarter to ${(whole + 1) % 12}${part}`;
  return `${name}:${String(min).padStart(2, "0")}${part}`;
}

/**
 * What happens, as a model wrote it, said after the hour the narrator has already given: without the hour written in it
 * again ("... at 7:15 pm") and without its own full stop, so the line reads once.
 */
export const whatSaid = (what: string): string =>
  what
    .replace(/\s+(?:at|by|around)\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|noon|midnight)(?=\s*(?:[,.;!]|$))/gi, "")
    .replace(/[\s.!;,]+$/, "");
