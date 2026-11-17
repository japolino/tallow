/** A room in memory for tests: its messages, its files, and models that answer from fixed sheets. */
import type { Message, Role } from "../src/game/ask.js";
import { createTables, type ChatMsg, type TableHost } from "../src/backend/table.js";
import { wireOf } from "../src/shared/tablewire.js";

export const SETUP = {
  place: { name: "Forest road", text: "A damp road." }, name: "Mira", calling: "Thief",
  attributes: ["dexterity", "cunning", "charisma", "intelligence", "strength"],
  skills: [{ name: "Stealth", level: 4 }, { name: "Lockpicking", level: 3 }, { name: "Lying", level: 3 }, { name: "Climbing", level: 2 }, { name: "Running", level: 1 }],
  abilities: [{ name: "Soft Step", text: "Makes no sound for a moment.", tier: 1 }],
  items: [{ name: "Lockpicks", text: "Bent.", quality: "common", qty: 1 }],
  money: 5, coin: "bronze", people: [{ name: "Goblin", text: "Rummaging.", power: 2, hostile: false }],
  opening: "A goblin rummages in a sack by the road.",
};
export const SEAT = { ...SETUP, name: "Tom", calling: "Hedge knight", attributes: ["strength", "charisma", "dexterity", "cunning", "intelligence"], skills: [{ name: "Swordplay", level: 4 }, { name: "Riding", level: 3 }, { name: "Brawling", level: 3 }, { name: "Courtesy", level: 2 }, { name: "Tracking", level: 1 }], items: [{ name: "Longsword", text: "Notched.", quality: "common", qty: 1 }] };
export const JUDGE = { kind: "action", act: "sneak past the goblin", target: null, item: null, item_named: false, needs_item: null, ability: null, ability_named: false, verdict: "challenge", reason: "It may hear.", attribute: "dexterity", skill: "Stealth", for: [], against: [], scores: { physical: 0, likelihood: 0, item: null, ability: null, other: null } };

export function world() {
  const messages: ChatMsg[] = [];
  const files = new Map<string, string>();
  const asked: { role: Role; messages: Message[] }[] = [];
  let n = 0;
  const host: TableHost = {
    messages: async (_c, tail) => messages.slice(-tail).map((m) => structuredClone(m)),
    append: async (_c, content) => {
      const id = `m${++n}`;
      messages.push({ id, role: "assistant", content, extra: null, metadata: {} });
      return id;
    },
    setOwn: async (_c, id, own) => {
      const m = messages.find((x) => x.id === id)!;
      m.metadata = own === null ? {} : { tallow: structuredClone(own) };
    },
    setContent: async (_c, id, content) => void (messages.find((x) => x.id === id)!.content = content),
    load: async (u, p) => files.get(`${u}/${p}`) ?? null,
    save: async (u, p, d) => void files.set(`${u}/${p}`, d),
    loadIndex: async () => JSON.parse(files.get("index") ?? "{}") as Record<string, string>,
    saveIndex: async (i) => void files.set("index", JSON.stringify(i)),
    deps: () => ({
      ask: async (ms, role) => {
        asked.push({ role, messages: ms });
        const sys = ms[0]!.content;
        if (role === "builder") return JSON.stringify(sys.includes("new player sits down") ? SEAT : SETUP);
        if (sys.includes("referee")) return JSON.stringify(JUDGE);
        if (sys.includes("records")) return JSON.stringify({ minutes: 3 });
        return "A summary of what has happened so far, long enough to be kept as one.";
      },
    }),
    log: () => undefined,
  };
  const say = (content: string, guest?: { id: string; name: string }): string => {
    const id = `m${++n}`;
    messages.push({ id, role: "user", content, extra: guest ? { mp: { participantId: guest.id, displayName: guest.name, personaName: guest.name } } : {}, metadata: {} });
    return id;
  };
  /** The room's reply: what the host's Lumiverse does around a generation. */
  const reply = async (t: ReturnType<typeof createTables>, text: string, type = "normal"): Promise<Message[] | null> => {
    const told = await t.before("c1", type);
    const id = `m${++n}`;
    messages.push({ id, role: "assistant", content: text, extra: null, metadata: {} });
    await t.after("c1", id, text);
    return told;
  };
  const own = (id: string) => wireOf(messages.find((m) => m.id === id)!.metadata);
  return { host, messages, files, asked, say, reply, own };
}

export const card = async () => ({ world: "w", who: "Mira, a thief.", name: "Mira", retell: true });
export const open = (t: ReturnType<typeof createTables>) => t.open({ userId: "u1", chatId: "c1", card, seed: 5, rules: {}, player: "Ana" });
