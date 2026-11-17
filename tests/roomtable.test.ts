import { describe, expect, test } from "bun:test";
import { createTables } from "../src/backend/table.js";
import { readSeatLine, seatLine, type WireLine, type WireRound } from "../src/shared/tablewire.js";
import { open, world } from "./roomworld.js";

describe("sitting down", () => {
  test("a first line carries who sits down and their page", () => {
    const line = seatLine("Tom", "A hedge knight.");
    expect(line.startsWith("(Tom sits down at the table.)")).toBe(true);
    expect(readSeatLine(line)).toEqual({ name: "Tom", page: "A hedge knight." });
    expect(readSeatLine("I sit down at the table.")).toBeNull();
    expect(readSeatLine("(Tom sits down at the table.)")).toEqual({ name: "Tom", page: "" });
  });
});

describe("the host's table", () => {
  test("opening sets the table up and puts it on the narrator's first message", async () => {
    const w = world();
    const t = createTables(w.host);
    const round = await open(t);
    expect(round!.run!.seats!.map((s) => s.sheet.name)).toEqual(["Mira"]);
    expect(w.messages).toHaveLength(1);
    expect(w.messages[0]!.content).toBe("A goblin rummages in a sack by the road.");
    const on = w.own(w.messages[0]!.id) as WireRound;
    expect(on.kind).toBe("round");
    // What travels has no world and no pages in it.
    expect(on.run!.world).toBe("");
    expect(on.run!.seats![0]!.player).toBe("Ana");
    // Opened again, nothing is set up a second time.
    await open(t);
    expect(w.messages).toHaveLength(1);
  });

  test("a chat with no table answers by itself", async () => {
    const w = world();
    expect(await createTables(w.host).before("nope", "normal")).toBeNull();
  });

  test("a round: a guest sits down, both write, and the room's reply is the passage", async () => {
    const w = world();
    const t = createTables(w.host);
    await open(t);
    const first = w.messages[0]!.id;
    // The guest's first line seats them; the host writes in the same round.
    const sat = w.say(seatLine("Tom", "Tom, a hedge knight."), { id: "p2", name: "Tom" });
    const mine = w.say("I sneak past the goblin.");
    const told = await w.reply(t, "Tom rides up as Mira slips by.");
    const all = told!.map((m) => m.content).join("\n");
    expect(told![0]!.content).toContain("played by 2 players");
    expect(all).toContain("Bring Tom into the scene now");
    expect(all).toContain("Mira: I sneak past the goblin.");
    // What was made of each line is on the line.
    const hostLine = w.own(mine) as WireLine;
    expect(hostLine.part.die!.face).toBeGreaterThan(0);
    expect(hostLine.part.check![0]).toContain("sneak past the goblin");
    expect((w.own(sat) as WireLine).part.how).toBe("joined");
    // The run is on the narrator's newest message, and off the one before.
    const last = w.messages.at(-1)!;
    const on = w.own(last.id) as WireRound;
    expect(on.run!.seats!.map((s) => s.sheet.name)).toEqual(["Mira", "Tom"]);
    expect(on.run!.seats![1]!.sheet.items[0]!.name).toBe("Longsword");
    expect(on.parts.map((p) => p.seat).sort()).toEqual(["host", "p2"]);
    expect((w.own(first) as WireRound).run).toBeUndefined();
    expect(on.n).toBe(1);
  });

  test("a line is never played twice, and the table is found again after a restart", async () => {
    const w = world();
    const t = createTables(w.host);
    await open(t);
    w.say("I sneak past the goblin.");
    await w.reply(t, "She slips by.");
    const again = createTables(w.host);
    w.say("I wait.", { id: "p2", name: "Tom" });
    const told = await w.reply(again, "Tom waits.");
    const all = told!.map((m) => m.content).join("\n");
    // Only the new line is this round's; the guest was seated without a page, and their line is played.
    expect(told!.at(-2)!.content).toContain("Tom: I wait.");
    expect(told!.at(-2)!.content).not.toContain("I sneak past the goblin.");
    expect(all).toContain("only its host's character leads it to another place");
    const on = w.own(w.messages.at(-1)!.id) as WireRound;
    expect(on.n).toBe(2);
    expect(on.run!.seats).toHaveLength(2);
  });

  test("a passage told again keeps the round's dice and is read back in the old one's place", async () => {
    const w = world();
    const t = createTables(w.host);
    await open(t);
    const mine = w.say("I sneak past the goblin.");
    await w.reply(t, "She slips by.");
    const face = (w.own(mine) as WireLine).part.die!.face;
    const judges = w.asked.filter((a) => a.messages[0]!.content.includes("referee")).length;
    const told = await t.before("c1", "regenerate");
    const last = w.messages.at(-1)!;
    last.content = "She slips by, quieter this time.";
    await t.after("c1", last.id, last.content);
    expect(told).not.toBeNull();
    expect(w.asked.filter((a) => a.messages[0]!.content.includes("referee")).length).toBe(judges);
    expect((w.own(mine) as WireLine).part.die!.face).toBe(face);
    const on = w.own(last.id) as WireRound;
    expect(on.n).toBe(1);
    expect(on.run!.beats.at(-1)!.story).toBe("She slips by, quieter this time.");
  });

  test("a round with nothing to tell answers the players and tells no story", async () => {
    const w = world();
    const t = createTables(w.host);
    await open(t);
    w.host.deps = () => ({ ask: async (ms) => (ms[0]!.content.includes("referee") ? JSON.stringify({ kind: "ooc" }) : "You have 5 bronze.") });
    w.say("How much money do I have?");
    const told = await w.reply(t, "Mira: You have 5 bronze.");
    expect(told![0]!.content).toContain("Repeat the text");
    const on = w.own(w.messages.at(-1)!.id) as WireRound;
    expect(on.idle).toBe(true);
    expect(on.n).toBe(0);
    expect(on.parts[0]!.reply).toBe("You have 5 bronze.");
  });
});
