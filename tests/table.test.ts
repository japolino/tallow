/**
 * What the table shows instead of numbers: the scale that weighs a check, and
 * the narrator's spoken words, and how words are laid out on a page and in a
 * speech. No browser: only the parts that are plain code.
 */
import { describe, expect, test } from "bun:test";
import { nameCheck, resolve, startMoment, WAYS, type Moment } from "../src/engine/moment.js";
import { checkHeading, checkSaid, shutSaid } from "../src/engine/tell.js";
import { fairChance, weigh } from "../src/engine/weigh.js";
import { tipShown } from "../src/room/counters.js";
import { wrapText } from "../src/room/paper.js";
import { passages, wordTime } from "../src/room/voice.js";
import { BRIDGE, YOU } from "../preview/mock.js";

const fresh = (): Moment => startMoment(BRIDGE, YOU, "table");

describe("the scale weighs a check", () => {
  test("the narrator's pan holds more the harder it is, and yours holds your stat", () => {
    const m = fresh();
    for (const way of WAYS) {
      const c = nameCheck(m, { way })!;
      const w = weigh(c);
      expect(w.his).toBe(c.difficulty + 1);
      expect(w.yours).toBe(c.add);
      expect(w.lever).toBe(false);
    }
  });

  test("a thing you use is a weight on your side and one more on the narrator's, so the count of weights still says why", () => {
    const m = fresh();
    const plain = weigh(nameCheck(m, { way: "sneak" })!);
    const roped = weigh(nameCheck(m, { way: "sneak", lever: "ropewalk" })!);
    expect(roped.lever).toBe(true);
    expect(roped.his).toBe(plain.his);
    expect(roped.lean).toBeGreaterThan(plain.lean);
  });

  test("the tilt is the real chance, not a count of weights", () => {
    const m = fresh();
    for (const way of WAYS) {
      const c = nameCheck(m, { way })!;
      const w = weigh(c);
      expect(w.lean).toBeCloseTo((fairChance(c) - 0.5) * 2, 10);
      // A better chance never tips the beam the wrong way.
      expect(Math.sign(w.lean)).toBe(Math.sign(fairChance(c) - 0.5));
    }
  });

  test("after a failure the narrator's pan is heavier and the beam tips further against you", () => {
    const m = fresh();
    const before = weigh(nameCheck(m, { way: "sneak" })!);
    let failed: Moment | null = null;
    for (let i = 0; i < 400 && !failed; i++) {
      const o = resolve({ ...m, seed: `f${i}` }, { way: "force" })!;
      if (!o.past) failed = o.next;
    }
    const after = weigh(nameCheck(failed!, { way: "sneak" })!);
    expect(after.his).toBe(before.his + 1);
    expect(after.lean).toBeLessThan(before.lean);
  });

  test("the tilt stays within the beam's swing", () => {
    const strong = startMoment(BRIDGE, { ...YOU, stats: { ...YOU.stats, charm: 4 } }, "t");
    const w = weigh(nameCheck(strong, { way: "talk", lever: "ledger" })!);
    expect(w.lean).toBeLessThanOrEqual(1);
    expect(w.lean).toBeGreaterThan(0);
  });
});

describe("the beam as it is drawn", () => {
  test("an even chance is level, and a certain one is right down", () => {
    expect(tipShown(0)).toBe(0);
    expect(tipShown(1)).toBe(1);
    expect(tipShown(-1)).toBe(-1);
  });

  test("a chance a little off even can be seen, and never tips the wrong way", () => {
    // 45 in 100 is a lean of -0.1: drawn at more than a quarter of the full tilt, toward the narrator.
    expect(tipShown(-0.1)).toBeLessThan(-0.25);
    for (let lean = -1; lean <= 1; lean += 0.05) {
      expect(Math.sign(tipShown(lean))).toBe(Math.sign(lean));
      expect(Math.abs(tipShown(lean))).toBeGreaterThanOrEqual(Math.abs(lean) - 1e-9);
    }
  });

  test("a better chance always tips the beam further your way", () => {
    let last = -Infinity;
    for (let lean = -1; lean <= 1.0001; lean += 0.01) {
      const tip = tipShown(lean);
      expect(tip).toBeGreaterThan(last);
      last = tip;
    }
  });
});

describe("the narrator says the check aloud", () => {
  test("it names the way, the stat and how hard, and gives no odds", () => {
    const c = nameCheck(fresh(), { way: "sneak", lever: "ropewalk" })!;
    const said = checkSaid(c).join(" ");
    expect(said).toContain("get by unnoticed");
    expect(said).toContain("Grace");
    expect(said).toContain("the rope walk under the bridge");
    expect(said).not.toMatch(/\d+ in 100|out of 100|must reach/i);
  });

  test("every way has words, and paying says its price", () => {
    const m = fresh();
    for (const way of WAYS) expect(checkSaid(nameCheck(m, { way })!).length).toBeGreaterThanOrEqual(4);
    expect(checkSaid(nameCheck(m, { way: "pay" })!).join(" ")).toContain("2 of your supplies");
  });

  test("a shut way is refused in words that say why", () => {
    expect(shutSaid("force", "closed")).toContain("already");
    expect(shutSaid("pay", "cannot_pay", 2)).toContain("2 supplies");
    expect(shutSaid("talk", "not_here")).toContain("no way to talk");
  });

  test("the page of a turn is headed with what the try was", () => {
    expect(checkHeading(nameCheck(fresh(), { way: "talk", lever: "ledger" })!)).toBe("Talk, on your Charm. Easy, with her ledger that will not add up.");
  });
});

describe("the narrator's voice", () => {
  test("a long speech is cut into passages at the ends of sentences, never inside one", () => {
    const speech = "One two three four. Five six seven eight nine. Ten eleven twelve.";
    expect(passages([speech], 5)).toEqual(["One two three four.", "Five six seven eight nine.", "Ten eleven twelve."]);
    expect(passages([speech], 9)).toEqual(["One two three four. Five six seven eight nine.", "Ten eleven twelve."]);
    expect(passages([speech])).toEqual([speech]);
  });

  test("each thing said starts a passage of its own, and a sentence longer than a passage is kept whole", () => {
    expect(passages(["First.", "Second."])).toEqual(["First.", "Second."]);
    expect(passages(["a b c d e f g h."], 3)).toEqual(["a b c d e f g h."]);
    expect(passages([""])).toEqual([]);
  });

  test("a closing quote stays with its sentence", () => {
    expect(passages(['"Go on," she says. "Now." Then she turns away.'], 5)).toEqual(['"Go on," she says. "Now."', "Then she turns away."]);
  });

  test("longer words and the ends of sentences take longer to say", () => {
    expect(wordTime("bridge")).toBeGreaterThan(wordTime("a"));
    expect(wordTime("bridge.")).toBeGreaterThan(wordTime("bridge,"));
    expect(wordTime("bridge,")).toBeGreaterThan(wordTime("bridge"));
    expect(wordTime("x".repeat(40))).toBe(wordTime("x".repeat(12)));
  });
});

describe("writing on a page", () => {
  // A letter is one wide, so a width is a count of letters.
  const wide = (s: string): number => s.length;

  test("a line breaks at a space when the next word does not fit", () => {
    expect(wrapText(wide, "I put my shoulder to the bar", 12)).toEqual(["I put my", "shoulder to", "the bar"]);
  });

  test("a word longer than a whole line is cut where it stops fitting", () => {
    expect(wrapText(wide, "an extraordinarily long word", 8)).toEqual(["an", "extraord", "inarily", "long", "word"]);
  });

  test("nothing typed is lost in the breaking", () => {
    const line = "I climb down and creep across by the rope walk under the bridge";
    expect(wrapText(wide, line, 17).join(" ")).toBe(line);
    for (const l of wrapText(wide, line, 17)) expect(l.length).toBeLessThanOrEqual(17);
  });
});
