/**
 * Sits two players down at one table in two real browsers, in a real Lumiverse room, and looks at what each sees.
 *
 * Against the throwaway Lumiverse (scripts/room/start.ts, with scripts/room/forward.ts for the models), after
 * setup.ts has made the room: two headless browsers, each signed in as one account. The host opens the room's chat
 * and sits at the table; the guest joins the room by its id from their own Party tab and sits down; then both write
 * with a real keyboard for two rounds, throw their own dice, and the pictures of both tables go to
 * .artifacts/room-seats/. It checks what check.ts cannot: the room on screen, the room link in a real page, the
 * chat's own message box taking the lines, and the seats as the players see them.
 *
 *   bun --env-file=.env.local scripts/room/seats.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withPage, type Page } from "../browser.js";
import { base, chatId, check, failed, roomId, root, say } from "./setup.js";

const W = 1280, H = 800;
const OUT = ".artifacts/room-seats";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Seat { page: Page; who: string }
const js = JSON.stringify;

async function waitFor(s: Seat, cond: string, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await s.page.run<boolean>(`!!(${cond})`).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}
/** Press the button that says exactly this (its label, its title or its text). */
const press = (s: Seat, label: string): Promise<boolean> =>
  s.page.run<boolean>(`(() => { const b = [...document.querySelectorAll('button,[role=menuitem],[role=tab]')].find((x) => [x.getAttribute('aria-label'), x.title, x.textContent].some((t) => (t || '').trim() === ${js(label)}) || (${js(label)} === 'Sit at the table' && /^Sit at the table/.test((x.textContent || '').trim()))); if (!b) return false; b.click(); return true; })()`);

/** The drawer's own X (the buttons called Close with no words on them; the one with the word closes the room). */
async function closeDrawer(s: Seat): Promise<void> {
  await s.page.run(`(() => { for (const b of document.querySelectorAll('button')) if (b.getAttribute('aria-label') === 'Close' && !(b.textContent || '').trim() && b.getBoundingClientRect().left < innerWidth) b.click(); return 1; })()`);
  await sleep(600);
}

async function signIn(s: Seat): Promise<void> {
  await s.page.cdp("Page.navigate", { url: `${base}/login` });
  await waitFor(s, "document.readyState === 'complete'", 20_000);
  const password = readFileSync(join(root, s.who === "host" ? "owner.txt" : "guest.txt"), "utf8").trim();
  const ok = await s.page.run<boolean>(`fetch("/api/auth/sign-in/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: ${js(js({ username: s.who, password }))} }).then((r) => r.ok)`);
  if (!ok) throw new Error(`${s.who} could not sign in`);
}

/** Sit down at the table from the chat's Extras menu, and listen to everything the narrator says from then on. */
async function sit(s: Seat): Promise<boolean> {
  // Every room that is drawn is listened to (a guest seated late gets a second one): what the narrator says is kept.
  await s.page.run(`(window.heard = [], window.addEventListener("tallow:room", (e) => { const r = (window.room = e.detail); r.ready.then(() => { if (r.desk) ((say) => (r.desk.say = (lines) => (window.heard.push(...[].concat(lines)), say(lines))))(r.desk.say.bind(r.desk)); }); }), 1)`);
  if (!(await waitFor(s, `[...document.querySelectorAll('button')].some((x) => (x.getAttribute('aria-label') || x.title) === 'Extras')`, 30_000))) return false;
  // The Extras menu under the message box; it can take a moment to open, and a click that lands early closes it.
  let sat = false;
  for (let i = 0; i < 8 && !sat; i++) {
    if (!(await s.page.run<boolean>(`[...document.querySelectorAll('button,[role=menuitem]')].some((x) => /^Sit at the table/.test((x.textContent || '').trim()))`))) await press(s, "Extras");
    await sleep(700);
    sat = await press(s, "Sit at the table");
  }
  if (!sat) {
    await s.page.shot(`${OUT}/could-not-sit-${s.who}.jpg`);
    return false;
  }
  if (!(await waitFor(s, "window.room", 60_000))) return false;
  await s.page.run("window.room.ready");
  return true;
}

/** One nudge of what a player does without thinking: hurry the narrator along, let go of the die, set a page down. */
async function nudge(s: Seat): Promise<void> {
  const st = await s.page.run<{ speaking: boolean; holding: boolean; mode: string } | null>("window.room && room.desk ? { speaking: room.desk.voice.speaking, holding: room.holding, mode: room.desk.mode } : null").catch(() => null);
  if (!st) return;
  if (st.speaking) await s.page.type(" ");
  else if (st.holding) await s.page.run("room.releaseDie()");
  else if (st.mode === "holding" || st.mode === "reading") await s.page.key("Enter");
}
const heard = (part: string): string => `window.heard && window.heard.some((t) => t.includes(${js(part)}))`;
const last = (s: Seat, n = 4): Promise<string> => s.page.run<string>(`(window.heard || []).slice(-${n}).join(' / ')`).then((t) => t.slice(0, 500)).catch(() => "");
let all: Seat[] = [];
/** Wait until something is so at one seat, while every seat is nudged along. */
async function until(s: Seat, cond: string, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await s.page.run<boolean>(`!!(${cond})`).catch(() => false)) return true;
    for (const x of all) await nudge(x);
    await sleep(200);
  }
  return false;
}
const ASKED = "room.desk.inviting && room.desk.mode === 'idle' && !room.desk.voice.speaking";
async function write(s: Seat, line: string): Promise<boolean> {
  if (!(await until(s, ASKED, 90_000))) return false;
  await s.page.type(line);
  await sleep(300);
  await s.page.key("Enter");
  return true;
}
const shot = (s: Seat, name: string): Promise<void> => s.page.shot(`${OUT}/${name}-${s.who}.jpg`);
const strip = (s: Seat): Promise<string> => s.page.run<string>(`(() => { const out = []; const walk = (root) => { for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) walk(el.shadowRoot); } for (const el of root.querySelectorAll('span')) if (/Everyone writes|round is closed|narrator is telling|Your turn|is writing/.test(el.textContent || '')) out.push(el.textContent); }; walk(document); return out.join(' | '); })()`).catch(() => "");

await withPage({ serve: false, tag: "a", width: W, height: H }, async (hostPage) => {
  await withPage({ serve: false, tag: "b", width: W, height: H }, async (guestPage) => {
    const host: Seat = { page: hostPage, who: "host" }, guest: Seat = { page: guestPage, who: "guest" };

    // The host: the room's chat, the Party tab (so Lumiverse knows this browser hosts the room), and the table.
    await signIn(host);
    await host.page.cdp("Page.navigate", { url: `${base}/chat/${chatId}` });
    await waitFor(host, `[...document.querySelectorAll('button')].some((x) => (x.getAttribute('aria-label') || x.title || x.textContent || '').trim() === 'Multiplayer')`, 30_000);
    await press(host, "Multiplayer");
    check(await waitFor(host, "/Hosting/.test(document.body.innerText)", 20_000), "the host's Party tab shows the room being hosted");
    // The drawer is put away again, as a player would: it is drawn over the room.
    await closeDrawer(host);
    check(await sit(host), "the host sits down and the room is drawn");
    all = [host];
    check(await until(host, heard("Write what you do"), 240_000), `the host's table is set and the opening said (${await last(host, 3)})`);
    await shot(host, "01-opening");

    // The guest: their own browser, the room joined by its id from the Party tab, and the table.
    await signIn(guest);
    await guest.page.cdp("Page.navigate", { url: `${base}/` });
    await waitFor(guest, `[...document.querySelectorAll('button')].some((x) => (x.getAttribute('aria-label') || x.title || x.textContent || '').trim() === 'Multiplayer')`, 30_000);
    await press(guest, "Multiplayer");
    await waitFor(guest, `document.querySelector('input[placeholder="paste invite code"]')`, 15_000);
    await guest.page.run(`document.querySelector('input[placeholder="paste invite code"]').focus()`);
    await guest.page.type(roomId);
    await sleep(300);
    await press(guest, "Join");
    check(await waitFor(guest, `location.pathname.includes(${js(chatId)}) && /In room/.test(document.body.innerText)`, 20_000), "the guest joins the room by its id and is taken to its chat");
    await closeDrawer(guest);
    check(await sit(guest), "the guest sits down and the room is drawn");
    all = [host, guest];
    // A guest who joined before Tallow had loaded in their browser was never told of the room, and sits at an empty
    // table: they are told to join again, and joining again from the Party tab seats them without another word.
    if (await until(guest, `${heard("A table is already set")} || ${heard("join it again: I will seat you")}`, 60_000) && !(await guest.page.run<boolean>(heard("A table is already set")))) {
      say("the guest joined before Tallow had loaded, and was told to join again");
      const box = `document.querySelector('input[placeholder="paste invite code"]')`;
      for (let i = 0; i < 20 && !(await guest.page.run<boolean>(`!!${box}`)); i++) {
        // The Party tab, and in it Leave: only then is there a box to join by.
        if (!(await press(guest, "Leave"))) await press(guest, "Multiplayer");
        await sleep(700);
      }
      await guest.page.run(`${box}.focus()`);
      await guest.page.type(roomId);
      await sleep(300);
      await press(guest, "Join");
      await sleep(1500);
      await closeDrawer(guest);
      check(await until(guest, heard("A table is already set"), 60_000), "leaving the room and joining it again seats the guest at the host's table by itself");
    }
    check(await until(guest, heard("A table is already set"), 60_000), `the guest finds the host's table (${await last(guest, 2)})`);
    check(await until(guest, heard("You sit down as Brother Fenn"), 60_000), `the guest's seat line goes in by itself through the chat's own message box (${await last(guest, 2)})`);
    say(`the line over the host's room: "${await strip(host)}"; over the guest's: "${await strip(guest)}"`);
    await shot(guest, "02-sitting-down");

    // Round one: the host writes, and with the guest's seat line that is everyone.
    check(await write(host, "I crouch by the overturned cart and look for whoever was driving it."), "the host writes a line on the pad");
    check(await until(host, `${heard("I take it you mean")} || ${heard("Brother Fenn")}`, 240_000), `the host's line reaches the table and is judged (${await last(host, 3)})`);
    await shot(host, "03-check");
    check(await until(guest, heard("You are seated"), 240_000), `the guest is told they are seated (${await last(guest, 2)})`);
    check(await until(host, "room.desk.lastTurn && room.desk.lastTurn.writing.mine", 300_000), "the host's round is written out beside their pad");
    check(await until(guest, "room.desk.lastTurn", 120_000), "and the guest's");
    const story = await host.page.run<string>("room.desk.lastTurn.writing.his.join(' ')");
    check(/Fenn/.test(story), `the passage on the host's table brings the guest's character in (${story.slice(0, 160)}…)`);
    const sheets = await guest.page.run<string>("JSON.stringify(room.desk.sheetPages ?? room.desk.pages ?? '')").catch(() => "");
    say(`guest's sheets: ${sheets.slice(0, 200)}`);
    await shot(host, "04-round-one");
    await shot(guest, "04-round-one");

    // Each looks to the side at the other: the pointer taken to the left edge of the view, with a real mouse.
    await until(host, "!room.desk.voice.speaking", 60_000);
    await until(guest, "!room.desk.voice.speaking", 60_000);
    for (const s of all) {
      await s.page.mouse("move", W / 2, H / 2);
      await s.page.mouse("move", 24, H / 2 - 20);
    }
    await sleep(1600);
    check((await host.page.run<number>("room.aside")) === -1, "the host turns to the left and sees the guest sitting there");
    check((await guest.page.run<number>("room.aside")) === -1, "the guest turns to the left and sees the host");
    await shot(host, "06-looking-at-the-other");
    await shot(guest, "06-looking-at-the-other");
    for (const s of all) await s.page.mouse("move", W / 2, H / 2);
    await sleep(700);
    check((await host.page.run<number>("room.aside")) === 0 && (await guest.page.run<number>("room.aside")) === 0, "and both turn back to the table when the pointer comes back");
    check(await until(guest, heard("to look at who sits beside you"), 30_000), "how to look at the others was said");

    // Round two: both write; each throws their own die and hears the other's.
    check(await write(guest, "I hurry up, puffing, and bring my staff down hard on the nearest threat."), "the guest writes a line on the pad");
    check(await write(host, "I put my back to the cart and jab my spear at whatever comes at me."), "the host writes again");
    check(await until(guest, `window.heard.some((t) => /^[0-9]+ on the die/.test(t))`, 300_000), `the guest throws their own die (${(await last(guest, 6)).match(/(^| \/ )\d+ on the die[^/]*/)?.[0] ?? ""})`);
    check(await until(host, `window.heard.filter((t) => /^[0-9]+ on the die/.test(t)).length >= 2`, 300_000), "the host throws theirs, a second time");
    check(await until(guest, `window.heard.some((t) => /^Ysolde: .* on the die/.test(t))`, 300_000), "the guest hears the host's roll read out");
    check(await until(host, `window.heard.some((t) => /^Brother Fenn: .* on the die/.test(t))`, 300_000), "the host hears the guest's");
    check(await until(guest, "room.desk.lastTurn && room.desk.lastTurn.writing.mine && room.desk.lastTurn.writing.mine.includes('puffing')", 300_000), "the guest's round is written out beside their pad, with their own line");
    check(await until(host, "room.desk.lastTurn && room.desk.lastTurn.writing.mine && room.desk.lastTurn.writing.mine.includes('jab my spear')", 300_000), "and the host's second line went in from the pad: the keyboard stayed at the table after the first");
    const boxes = await Promise.all(all.map((s) => s.page.run<string>("document.querySelector('textarea')?.value ?? ''")));
    check(boxes.every((b) => !b.trim() && b.length < 3), `nothing was typed into the chat's own message box behind the room (${boxes.map((b) => b.length).join(", ")} characters)`);
    say(`the line over the host's room: "${await strip(host)}"; over the guest's: "${await strip(guest)}"`);
    await shot(host, "05-round-two");
    await shot(guest, "05-round-two");
    for (const s of all) if (s.page.problems.length) say(`${s.who}'s console: ${[...new Set(s.page.problems)].filter((p) => /tallow|Tallow/.test(p)).slice(0, 6).join(" | ").slice(0, 600) || "nothing from Tallow"}`);
  });
});
say(failed.length ? `${failed.length} FAILED:\n  ${failed.join("\n  ")}` : "ALL OK: two players sat at one table in two real browsers.");
process.exit(failed.length ? 1 : 0);
