/**
 * One moment, played as text. It prints only what the screen would say, in
 * the order the screen says it, so it can be read the way a new player would
 * read it. No browser, no room, no model.
 *
 *   bun scripts/moment.ts                      a set line for each try
 *   bun scripts/moment.ts "I pay the toll"     your own lines, one for each try
 *   SEED=abc bun scripts/moment.ts             choose the dice (the same seed throws the same faces)
 *   NOTE=1 bun scripts/moment.ts               also print the note the narrator's model would be given
 */
import { randomSeed } from "../src/engine/dice.js";
import { nameCheck, resolve, startMoment, type Moment } from "../src/engine/moment.js";
import { ASK, changeLines, checkLines, endLines, HINT, KIND_SAYS, narratorNote, rollLines, sheetLines, statLines, STATS_NOTE, UNCLEAR, wayLines } from "../src/engine/tell.js";
import { rulesRead } from "../src/meaning/read.js";
import { BRIDGE, ROAD, TOLD, WHO, YOU } from "../preview/mock.js";

const given = process.argv.slice(2);
const lines = given.length ? given : ["I offer to put her sums right if she lifts the bar", "I climb down to the rope walk and creep across", "I put my shoulder to the rotten post", "I pay the toll"];
const seed = process.env.SEED ?? randomSeed();
const say = (text = ""): void => console.log(text);
const list = (items: string[]): void => items.forEach((t) => say(`  ${t}`));

let m: Moment = startMoment(BRIDGE, YOU, seed);
say(`${m.stop.name.toUpperCase()}. ${KIND_SAYS[m.stop.kind]}`);
say();
say(m.stop.situation);
say();
say(WHO);
list(statLines(m));
say(`  ${STATS_NOTE}`);

for (const line of lines) {
  if (m.over) break;
  say();
  say("What you carry:");
  list(sheetLines(m));
  say("The ways through:");
  list(wayLines(m));
  say();
  say(`${ASK} ${HINT}`);
  say(`> ${line}`);
  const read = rulesRead(line, m);
  const check = read && nameCheck(m, read);
  if (!read || !check) {
    say(read ? "That way is not open to you here." : UNCLEAR);
    continue;
  }
  say();
  list(checkLines(check));
  const o = resolve(m, read)!;
  say();
  list(rollLines(o));
  say();
  say(`The narrator: ${TOLD[o.check.way][o.tier === "partial" ? "cost" : o.past ? "past" : "fail"]}`);
  say();
  list(changeLines(o));
  if (process.env.NOTE === "1") say(`\n  (The narrator's model would be told: ${narratorNote(o)})`);
  m = o.next;
}

say();
if (m.over) list(endLines(m, ROAD.nextName, ROAD.otherName));
else say("(The lines ran out before the moment was over.)");
say(`\nDice seed: ${seed}`);
