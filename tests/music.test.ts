/**
 * The music: the library and the search in it (engine/music.ts), a model's choice for a scene (game/music.ts), and the
 * player that must never leave the room silent between pieces (room/music.ts).
 */
import { describe, expect, test } from "bun:test";
import { candidates, FEELS, GENRES, LIBRARY, nearness, pieceCalled, pieceLine, wanted } from "../src/engine/music.js";
import { pickMusic } from "../src/game/music.js";
import type { Ask } from "../src/game/ask.js";
import { newRun } from "../src/engine/run.js";
import { FADE, LEAD, Music, OPENING, STALLED, credit, tuneUrl, type Player, type Tune } from "../src/room/music.js";

describe("the library", () => {
  test("is the composer's whole library, each piece with a file and tags", () => {
    expect(LIBRARY.length).toBeGreaterThan(1000);
    for (const p of LIBRARY) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.file).toMatch(/\.mp3$/i);
      expect(p.seconds).toBeGreaterThanOrEqual(80);
      expect(p.feels.length).toBeGreaterThan(0);
      expect(p.genre.length).toBeGreaterThan(0);
    }
    expect(new Set(LIBRARY.map((p) => p.title.toLowerCase())).size).toBe(LIBRARY.length);
  });
  test("has its own words for feel and genre", () => {
    for (const f of ["Dark", "Calming", "Intense", "Mysterious", "Uplifting"]) expect(FEELS).toContain(f);
    for (const g of ["Soundtrack", "World", "Horror", "Electronica"]) expect(GENRES).toContain(g);
    // A word used once is no vocabulary, and nothing short is offered as music.
    expect(FEELS).not.toContain("Ren Faire");
    expect(GENRES).not.toContain("Stings");
  });
  test("what plays before a scene is read is in it", () => {
    for (const t of OPENING) expect(pieceCalled(t.title)?.file).toBe(t.file);
  });
  test("a file is fetched by its own name, which is not always the title", () => {
    const odd = LIBRARY.find((p) => p.file !== `${p.title}.mp3`)!;
    expect(odd).toBeTruthy();
    expect(tuneUrl(odd)).toBe(`https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(odd.file)}`);
    expect(tuneUrl({ title: "Teller of the Tales", file: "Teller of the Tales.mp3" })).toBe("https://incompetech.com/music/royalty-free/mp3-royaltyfree/Teller%20of%20the%20Tales.mp3");
    expect(credit("Plaint")).toBe('"Plaint" Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/');
  });
});

describe("finding pieces for what a scene wants", () => {
  test("a model's words are kept to what the library knows", () => {
    const w = wanted(["dark", "EERIE", "spooky", "<a feel>"], ["Horror", "Opera"], ["Harp", "x", "low strings!"], "Slow", "a crypt <at> night")!;
    expect(w.feels).toEqual(["Dark", "Eerie"]);
    expect(w.genres).toEqual(["Horror"]);
    expect(w.instruments).toEqual(["harp", "low strings"]);
    expect(w.pace).toBe("slow");
    expect(w.words).not.toMatch(/[<>]/);
    expect(wanted(["spooky"], ["Opera"], [], "", "")).toBeNull();
  });
  test("the nearest pieces are what was asked for", () => {
    const w = wanted(["Dark", "Eerie"], ["Horror"], ["strings"], "slow", "")!;
    const got = candidates(w, [], 14, () => 0);
    expect(got.length).toBe(14);
    for (const p of got) expect(p.feels.some((f) => f === "Dark" || f === "Eerie")).toBe(true);
    expect(got.filter((p) => p.genre === "Horror").length).toBeGreaterThan(7);
    // Nearest first.
    expect(nearness(got[0]!, w)).toBeGreaterThanOrEqual(nearness(got[13]!, w));
  });
  test("a bright tavern and a dread crypt are not given the same pieces", () => {
    const tavern = candidates(wanted(["Bouncy", "Bright"], ["World"], ["lute", "fiddle"], "fast", "tavern dance")!, [], 10, () => 0).map((p) => p.title);
    const crypt = candidates(wanted(["Unnerving", "Dark"], ["Horror"], [], "slow", "crypt")!, [], 10, () => 0).map((p) => p.title);
    expect(tavern.filter((t) => crypt.includes(t))).toEqual([]);
  });
  test("pieces played lately are left out", () => {
    const w = wanted(["Calming", "Relaxed"], ["Soundtrack"], [], "slow", "")!;
    const first = candidates(w, [], 6, () => 0).map((p) => p.title);
    const again = candidates(w, first, 6, () => 0).map((p) => p.title);
    expect(again.filter((t) => first.includes(t))).toEqual([]);
  });
  test("a piece is shown to a model by its title and tags", () => {
    expect(pieceLine(pieceCalled("Teller of the Tales")!)).toBe('"Teller of the Tales"; World; Calming, Mysterious, Relaxed, Somber; Lute, Guitar; 130 beats a minute; 3:32');
  });
});

describe("a model chooses the music for a scene", () => {
  const run = () => {
    const r = newRun(1, "A kingdom of marsh towns and old roads.", "A courier.", "Ash");
    r.place = { name: "The Drowned Chapel", text: "A chapel half under black water." };
    return r;
  };
  const WANT = { scene: "A drowned chapel at night, something moving in the water.", change: true, feels: ["Eerie", "Dark"], genres: ["Horror", "Soundtrack"], instruments: ["choir", "strings"], pace: "slow", words: "drowned chapel dread" };
  const asker = (answers: (string | null)[]): { ask: Ask; asks: string[] } => {
    const asks: string[] = [];
    return {
      asks,
      ask: async (messages) => {
        asks.push(messages.at(-1)!.content);
        const a = answers.shift();
        if (a == null) throw new Error("no model");
        return a;
      },
    };
  };

  test("it says what the music should be, is shown the nearest pieces, and picks among them in order", async () => {
    const { ask, asks } = asker([JSON.stringify(WANT), JSON.stringify({ order: [3, 1, 2], none: false })]);
    const got = (await pickMusic({ ask }, run(), "The water closes over the altar step.", null, [], undefined, () => 0))!;
    expect(asks.length).toBe(2);
    expect(asks[0]).toContain("PLAYING NOW: nothing yet.");
    expect(asks[0]).toContain("The Drowned Chapel");
    const shown = [...asks[1]!.matchAll(/^\d+\. "([^"]+)"/gm)].map((m) => m[1]);
    expect(shown.length).toBe(14);
    expect(got.picked).toBe(true);
    expect(got.pieces.slice(0, 3).map((p) => p.title)).toEqual([shown[2]!, shown[0]!, shown[1]!]);
    // Two more of the nearest follow, so the music goes on in the same vein.
    expect(got.pieces.length).toBe(5);
    expect(new Set(got.pieces.map((p) => p.title)).size).toBe(5);
    for (const p of got.pieces) expect(pieceCalled(p.title)).toBe(p);
  });
  test("when what is playing still suits, nothing changes and nothing more is asked", async () => {
    const { ask, asks } = asker([JSON.stringify({ ...WANT, change: false })]);
    expect(await pickMusic({ ask }, run(), "She goes on reading.", { title: "Lost Time", turns: 2 }, [], undefined, () => 0)).toBeNull();
    expect(asks.length).toBe(1);
    expect(asks[0]).toContain('PLAYING NOW: "Lost Time" (Soundtrack; Somber, Dark; Violas, Cellos, Basses; 55 beats a minute), for 2 turns now.');
  });
  test("with nothing playing, music is chosen whatever the model says about changing", async () => {
    const { ask } = asker([JSON.stringify({ ...WANT, change: false }), JSON.stringify({ order: [1, 2, 3] })]);
    expect((await pickMusic({ ask }, run(), "It begins.", null, [], undefined, () => 0))?.pieces.length).toBe(5);
  });
  test("the piece playing and those played lately are not offered again", async () => {
    const first = asker([JSON.stringify(WANT), JSON.stringify({ order: [1, 2, 3] })]);
    const a = (await pickMusic({ ask: first.ask }, run(), "It begins.", null, [], undefined, () => 0))!;
    const second = asker([JSON.stringify(WANT), JSON.stringify({ order: [1, 2, 3] })]);
    await pickMusic({ ask: second.ask }, run(), "It goes on.", { title: a.pieces[0]!.title, turns: 9 }, a.pieces.slice(1).map((p) => p.title), undefined, () => 0);
    for (const p of a.pieces) expect(second.asks[1]).not.toContain(`"${p.title}"`);
  });
  test("a pick that names no piece on the list is asked for again, then the nearest are taken", async () => {
    const { ask, asks } = asker([JSON.stringify(WANT), JSON.stringify({ order: [99, 0] }), "not json"]);
    const got = (await pickMusic({ ask }, run(), "It begins.", null, [], undefined, () => 0))!;
    expect(asks.length).toBe(3);
    expect(got.picked).toBe(false);
    expect(got.pieces.length).toBe(5);
  });
  test("when not one of them would do, what is playing plays on", async () => {
    const { ask } = asker([JSON.stringify(WANT), JSON.stringify({ order: [], none: true })]);
    expect(await pickMusic({ ask }, run(), "It goes on.", { title: "Lost Time", turns: 9 }, [], undefined, () => 0)).toBeNull();
  });
  test("with no model to ask, or words the library does not know, nothing changes", async () => {
    expect(await pickMusic({ ask: asker([null, null]).ask }, run(), "It begins.", null, [])).toBeNull();
    const odd = JSON.stringify({ ...WANT, feels: ["Spooky"], genres: ["Opera"] });
    expect(await pickMusic({ ask: asker([odd, odd]).ask }, run(), "It begins.", null, [])).toBeNull();
  });
});

/* ------------------------------------------------- the player ------------------------------------------------- */

/** Stands in for an <audio> element: it plays when told to, at the pace the test moves time. */
class Fake implements Player {
  src = "";
  volume = 1;
  preload = "";
  currentTime = 0;
  paused = true;
  ended = false;
  /** Whether the file is arriving: false stands for a network that has stopped. */
  arriving = true;
  private fns: Record<string, (() => void)[]> = {};
  constructor(public duration: number) {}
  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {}
  removeAttribute(): void {
    this.src = "";
  }
  addEventListener(type: string, fn: () => void): void {
    (this.fns[type] ??= []).push(fn);
  }
  fire(type: string): void {
    for (const fn of this.fns[type] ?? []) fn();
  }
  move(dt: number): void {
    if (this.paused || this.ended || !this.arriving || !this.src) return;
    this.currentTime = Math.min(this.duration, this.currentTime + dt);
    if (this.currentTime >= this.duration) (this.ended = true), (this.paused = true);
  }
  get heard(): boolean {
    return !this.paused && !this.ended && !!this.src && this.volume > 0;
  }
  get title(): string {
    return decodeURIComponent(this.src.split("/").pop() ?? "").replace(/\.mp3$/, "");
  }
}

function room(lengths: number[] = []) {
  const made: Fake[] = [];
  const titles: string[] = [];
  let t = 1000;
  let level = 0.5;
  const m = new Music(
    () => {
      const f = new Fake(lengths[made.length] ?? 200);
      made.push(f);
      return f;
    },
    () => t,
    () => true,
    () => level,
  );
  /** Time goes by, a tenth of a second at a time; `every` is called after each. */
  const pass = (seconds: number, every?: (at: number) => void): void => {
    for (let i = 0; i < Math.round(seconds * 10); i++) {
      t += 100;
      for (const f of made) {
        if (f.src && !titles[made.indexOf(f)]) titles[made.indexOf(f)] = f.title;
        f.move(0.1);
      }
      m.step();
      every?.((t - 1000) / 1000);
    }
  };
  return { m, made, titles, pass, setLevel: (v: number) => (level = v) };
}
const tunes = (...names: string[]): Tune[] => names.map((title) => ({ title, file: `${title}.mp3` }));

describe("the music in the room", () => {
  test("the next piece is brought in before the one playing ends, so there is never a silence between them", () => {
    const { m, made, titles, pass } = room([100, 100, 100]);
    m.attach();
    let silent = 0;
    pass(230, (at) => {
      if (at > 1 && !made.some((f) => f.heard)) silent++;
    });
    expect(silent).toBe(0);
    expect(made.length).toBeGreaterThanOrEqual(3);
    // The opening pieces, in order.
    expect(titles.slice(0, 3)).toEqual(OPENING.slice(0, 3).map((t) => t.title));
    expect(m.now.heard.map((t) => t.title)).toEqual(titles.slice(0, m.now.heard.length));
    m.dispose();
  });
  test("it is started with the end of the piece playing still to come, and is at full before that end", () => {
    const { m, made, pass } = room([100, 100]);
    m.attach();
    pass(100 - LEAD - 1);
    expect(made[1]?.paused ?? true).toBe(true);
    pass(1.5);
    expect(made[1]!.paused).toBe(false);
    pass(FADE + 1);
    expect(made[1]!.volume).toBeCloseTo(0.5);
    expect(made[0]!.ended).toBe(false);
    m.dispose();
  });
  test("a new list takes over only once its first piece is really sounding; until then the old plays on", () => {
    const { m, made, pass } = room();
    m.attach();
    pass(20);
    expect(made[0]!.volume).toBeCloseTo(0.5);
    m.play(tunes("Lost Time", "Plaint"));
    made[1]!.arriving = false;
    pass(6);
    // Asked to play, but nothing of it has come yet: the old piece is untouched.
    expect(made[1]!.title).toBe("Lost Time");
    expect(made[0]!.volume).toBeCloseTo(0.5);
    expect(m.now.title).toBe("Teller of the Tales");
    made[1]!.arriving = true;
    pass(FADE + 1);
    expect(m.now.title).toBe("Lost Time");
    expect(made[1]!.volume).toBeCloseTo(0.5);
    expect(made[0]!.paused).toBe(true);
    m.dispose();
  });
  test("a piece that cannot be fetched is given up and the next tried, with the old one playing all the while", () => {
    const { m, made, pass } = room();
    m.attach();
    pass(10);
    m.play(tunes("Lost Time", "Plaint", "Relent"));
    made[1]!.fire("error");
    let silent = 0;
    pass(8, () => {
      if (!made.some((f) => f.heard)) silent++;
    });
    expect(silent).toBe(0);
    expect(made[2]!.title).toBe("Plaint");
    expect(m.now.title).toBe("Plaint");
    m.dispose();
  });
  test("a piece that stops arriving in the middle is replaced", () => {
    const { m, made, pass } = room();
    m.attach();
    pass(30);
    made[0]!.arriving = false;
    pass(STALLED + 3);
    expect(made.length).toBe(2);
    expect(m.now.title).toBe(OPENING[1]!.title);
    m.dispose();
  });
  test("a list that begins with the piece playing lets it play on, and the rest follow it", () => {
    const { m, made, titles, pass } = room([60, 60, 60]);
    m.attach();
    pass(5);
    m.play(tunes("Teller of the Tales", "Plaint", "Relent"));
    pass(5);
    expect(made.length).toBe(1);
    pass(60);
    expect(titles[1]).toBe("Plaint");
    m.dispose();
  });
  test("a list is played round again when it has been played through", () => {
    const { m, titles, pass } = room([40, 40, 40, 40, 40]);
    m.play(tunes("Plaint", "Relent"));
    m.attach();
    pass(150);
    expect(titles.slice(0, 5)).toEqual(["Plaint", "Relent", "Plaint", "Relent", "Plaint"]);
    m.dispose();
  });
  test("turned down to nothing, nothing is fetched; turned up again, it plays", () => {
    const { m, made, pass, setLevel } = room();
    setLevel(0);
    m.attach();
    pass(5);
    expect(made.length).toBe(0);
    setLevel(0.4);
    m.attach();
    pass(FADE + 1);
    expect(made.length).toBe(1);
    expect(made[0]!.volume).toBeCloseTo(0.4);
    setLevel(0);
    pass(1);
    expect(made[0]!.src).toBe("");
    m.dispose();
  });
});
