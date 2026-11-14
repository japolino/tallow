/**
 * Pictures of the table's props (src/room/props), taken in the props preview page (preview/props.ts, served at /props
 * by scripts/preview.ts and bundled from source, so no `bun run build` is needed). They go to .artifacts/props/.
 *
 *   bun scripts/prop-shots.ts pack            one prop: closed from the chair, closed from close by (to judge how it
 *                                             is made), pointed at, open, a part touched, that part's first choice
 *                                             touched (what it wrote is printed), and the same on a phone held upright
 *   bun scripts/prop-shots.ts pack --fill=20  with a great deal in it (1, 6 or 20; preview/propsamples.ts); the
 *                                             pictures are then named pack-20-...
 *   bun scripts/prop-shots.ts pack --part=tag:rope   which part is touched in the "part" picture (the first, if not said)
 *   bun scripts/prop-shots.ts pack --do=tag:hemp-rope,choice:3,tag:iron-hook,choice:3
 *                                             instead of the part and choice pictures: open it, touch these parts in
 *                                             turn (by the manager's own touch, src/room/props/index.ts) and take one
 *                                             picture, named pack-did; what is then on the pad is printed
 *   bun scripts/prop-shots.ts all             every prop out at once with the map, the cards, the reckoning, your
 *                                             sheets and the notes: the everything-out view, wide and on a phone,
 *                                             and the writing view with all of it out
 *   bun scripts/prop-shots.ts table           the table with no props, for comparing
 *   bun scripts/prop-shots.ts homes           the same with every prop's home and spread marked in its own colour
 *                                             (src/room/props/layout.ts), from the chair and from above
 *
 * TALLOW_PORT picks the port (4191 if not set), so several of these can run at once, each on its own. To look by hand
 * instead: PORT=4191 bun scripts/preview.ts, then http://localhost:4191/props?props=pack&fill=6&open=pack&rest=1.
 *
 * To add a prop's pictures, give it sample data in preview/propsamples.ts; nothing here needs to change. The room is
 * stood still between pictures and wound on by hand (room.advance), so every picture is of an exact moment.
 */
import { withPage, type Page } from "./browser.js";
import { layOf, PROP_KEYS, type PropKey } from "../src/room/props/layout.js";

const PORT = Number(process.env.TALLOW_PORT ?? 4191);
const OUT = ".artifacts/props";
const WIDE = { w: 1280, h: 720 }, PHONE = { w: 390, h: 844 };
const args = process.argv.slice(2);
const what = args.find((a) => !a.startsWith("--")) ?? "all";
const opt = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const fill = Number(opt("fill") ?? 6);
const tag = fill === 6 ? "" : `-${fill}`;

type At = { x: number; y: number } | null;

async function load(page: Page, query: string, size: { w: number; h: number }): Promise<void> {
  await page.size(size.w, size.h);
  await page.cdp("Page.navigate", { url: `http://127.0.0.1:${PORT}/props?${query}` });
  for (let i = 0; i < 300 && !(await page.run<boolean>("!!window.propsReady").catch(() => false)); i++) await page.wait(100);
  await page.run("(room.paused = true, room.advance(4), 1)");
}
const wind = (page: Page, seconds: number): Promise<unknown> => page.run(`(room.advance(${seconds}), 1)`);
const shot = (page: Page, name: string): Promise<void> => page.shot(`${OUT}/${name}.jpg`);
/** Where something of the props is on the screen (src/room/props/index.ts, screenOf): "pack", or "pack:<part>" while it is open. */
const where = (page: Page, of: string): Promise<At> => page.run<At>(`room.desk.props.screenOf(${JSON.stringify(of)})`);
/** Bring the pointer over something of the props and, if asked, touch it. False when it is not on the screen. */
async function point(page: Page, of: string, click: boolean): Promise<boolean> {
  // The view follows the pointer a little: bring it over, let the view settle, and find the thing again.
  let at = await where(page, of);
  for (let i = 0; at && i < 2; i++) {
    await page.mouse("move", at.x, at.y);
    await wind(page, 0.6);
    at = await where(page, of);
  }
  if (!at) return false;
  if (!click) return true;
  await page.mouse("move", at.x, at.y);
  await page.mouse("down", at.x, at.y);
  await page.mouse("up", at.x, at.y);
  return true;
}

async function one(page: Page, key: string): Promise<void> {
  for (const [size, pre] of [[WIDE, ""], [PHONE, "phone-"]] as const) {
    await load(page, `props=${key}&fill=${fill}`, size);
    const name = (n: string): string => `${key}${tag}-${pre}${n}`;
    await shot(page, name("closed"));
    if (PROP_KEYS.includes(key as PropKey)) {
      // From close by, a little to the side of the chair's line to it: how it is made, which the chair is too far to show.
      const h = layOf(key as PropKey, !!pre).home;
      await page.run(`(room.lookFrom([${h.x * 0.8}, 0.3, ${h.z + 0.42}], [${h.x}, 0.03, ${h.z}], 30), room.advance(0.1), 1)`);
      await shot(page, name("near"));
      await page.run("(room.lookFrom(null), room.advance(0.1), 1)");
    }
    const at = await where(page, key);
    if (!at) {
      console.log(`${key}: nothing of it is on the table (no sample data yet?)`);
      return;
    }
    if (!pre) {
      await point(page, key, false);
      await shot(page, name("hover"));
    }
    await point(page, key, true);
    await wind(page, 2.5);
    await shot(page, name("open"));
    const parts = await page.run<string[]>("room.desk.props.partsOf()");
    const steps = opt("do")?.split(",").filter(Boolean);
    if (steps) {
      for (const id of steps) {
        const done = await page.run<boolean>(`room.desk.props.touch(${JSON.stringify(id)})`);
        if (!done) console.log(`${key} ${pre || "wide"}: nothing to touch called ${id} (there is: ${(await page.run<string[]>("room.desk.props.partsOf()")).join(" ")})`);
        await wind(page, 0.9);
      }
      await shot(page, name("did"));
      console.log(`${key} ${pre || "wide"}: after ${steps.join(", ")} the pad says ${JSON.stringify(await page.run("room.desk.draft"))}`);
      continue;
    }
    const part = opt("part") ?? parts[0];
    if (part) {
      await point(page, `${key}:${part}`, true);
      await wind(page, 1.5);
      await shot(page, name("part"));
      // Its first choice, if touching it laid choices out: what that wrote on the pad is said here.
      if (await point(page, `${key}:choice:0`, true)) {
        await wind(page, 2);
        await shot(page, name("choice"));
        console.log(`${key} ${pre || "wide"}: the first choice of ${part} wrote ${JSON.stringify(await page.run("room.desk.draft"))}`);
      }
    }
    console.log(`${key} ${pre || "wide"}: open=${await page.run("room.desk.props.openKey")} parts=${parts.slice(0, 8).join(" ")}${parts.length > 8 ? ` (+${parts.length - 8})` : ""}`);
  }
}

async function table(page: Page, props: string, name: string, more = ""): Promise<void> {
  for (const [size, pre] of [[WIDE, ""], [PHONE, "-phone"]] as const) {
    await load(page, `props=${props}&fill=${fill}&rest=1${more}`, size);
    await wind(page, 6);
    await shot(page, `${name}${tag}${pre}`);
    // From above, to see what lies where.
    await page.run("(room.lookFrom([0, 2.1, 0.02], [0, 0, -0.1], 42), room.advance(0.1), 1)");
    await shot(page, `${name}${tag}${pre}-above`);
    await page.run("(room.lookFrom(null), room.advance(0.1), 1)");
    // And with the notebook open: nothing may lie over it.
    await page.type("I ");
    await wind(page, 2);
    await shot(page, `${name}${tag}${pre}-writing`);
  }
}

await withPage({ port: PORT, width: WIDE.w, height: WIDE.h }, async (page) => {
  if (what === "table") await table(page, "", "table");
  else if (what === "all") await table(page, "all", "all-out");
  else if (what === "homes") await table(page, "", "homes", "&homes=1");
  else await one(page, what);
  const bad = page.problems.filter((p) => !/GPU stall|GL Driver|WebGL|fell back/.test(p));
  if (bad.length) console.log(`the page complained: ${bad.slice(0, 6).join(" | ")}`);
});
console.log(`pictures in ${OUT}/`);
process.exit(0);
