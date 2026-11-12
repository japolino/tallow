# Proposal: model proposes, code checks

Branch `llm-first-proposal`. This proposal applies the `llm-game-architect` skill (`.claude/skills/llm-game-architect/SKILL.md`) to Tallow's core systems. It covers what was audited, what this branch changes, and what is still open.

The rule it applies:

> **Code owns quantities and legality. Models own meaning, and the choice among legal options. Code checks every answer, and falls back only when a model fails.**

Tallow already gets the *numbers* half right: dice, targets, prices, clocks and the sheet all belong to code. What went wrong is that code also made *choices* without looking at the scene, from a seed, a template or a word count. Those choices were:

- which consequence a failure brings
- what the world is like
- who stands at a stop and what hurts them
- which move the narrator makes
- how losing a fight goes

This branch moves each of those choices to a model. Code still owns the menu of legal options, every amount, and the fallback.

## How each change is described

Every change below is described with the skill's three-part gate:

- **Model:** who judges or writes, from what context, and choosing among which options.
- **Code:** what code owns, how it checks the answer, and the fallback.
- **State:** what is read and written, by which single owner, and when.

---

## 1. What this branch changes

### 1.1 The builder writes the world kit (registry entry 3)

The kit is `WorldKit`: its era, fears, power, risks, gear rungs, contests, verbs, hurts, takenOut and wants.

- **Model:** the strong builder writes the kit from the card, the player's premise and the content settings. It answers a `<notes>` shape and picks the nearest stock kit as a base (`like`). New file: `src/game/kitwriter.ts`.
- **Code:** `parseKit` rejects any `{}<>` in a string, and requires a name, an era, fears, all three gear rungs and at least one want. It then runs the existing `checkKit`, which until now had no caller, to hold the mechanical lists to code's menus. Two tries are made. The fallback is the stock kit chosen by `kitFor`, the old path.
- **State:** the kit is written in parallel with the brief. The builder waits for it, so the stops speak in the world's terms ("HOW THIS WORLD PLAYS"), and it is set on the adventure (`fitted`). Free play uses the same kit.

### 1.2 The builder accepts whole units, retries, and leads with the premise (registry 2 and 4)

- **Model:** `designOf` sends only shape and notes. The frame asks for:
  - a title of 2 to 6 words
  - whose story it is and why it matters
  - won and lost lines

  Each stop asks for:
  - a face (the card's title), a situation, a teaser and levers
  - the person standing there, in the same unit as the scene
  - `fails` per way: the stake and the threat
  - `hurt_by` when a foe stands there, chosen from the kit's own `hurts`

  The player's premise ("WHOSE STORY IT IS") and the kit go into the prompt. The stock "Brant" companion no longer appears in it.
- **Code:** `applyWords` builds units, and each unit is accepted whole or replaced whole. The units are frame, `stop:<id>`, `companion:<id>`, part, rival and case. Stock text that falls back is passed through `renamed()`, so stock place names never leak. A second ask is sent with `redo: missing`, and `mergeWords` keeps units the first answer got right. If the frame is still not whole, the whole skeleton is the fallback.
- **State:** `Built.missing` lists the units that fell back. It is logged and asserted in tests.

### 1.3 The big bad is accepted whole, with notes (builder #6)

- **Model:** `frontMessages` uses a notes shape instead of the old lich example. It asks for exactly six steps and three keys.
- **Code:** `frontWhole` returns the front or null; it is never merged field by field. There are two tries inside `FRONT_MS`, then the stock front.

### 1.4 A free premise from one line (builder #7)

`freePremise` keeps the first answer as the premise when it has one word or more; it used to need three or more. A one-word ask ("heist") now travels into every later prompt.

### 1.5 A stop's own stakes (registry 1 and mechanics #1)

- **Model:** the builder writes `fails[way] = {stake, threat}` with the scene. The reader can override it per line, for example when a line plainly faces something else. Both the reader and the Decision model now see the built stakes in their context.
- **Code:** `stakeOf` resolves the stake in this order:
  1. pay is always supplies
  2. the line's stake, when the line says what would happen (it faces something else)
  3. the stop's stake
  4. a bare stake picked with nothing said (the Decision model's)
  5. `WAY_COST`, as the last fallback

  The live replay showed why step 4 sits below the stop. The Decision model picked "goodwill" (0.65) for sneaking past armed dredgers, and that bare pick was beating the stake the builder had written with the scene.

  `threatOf` uses the stop's threat only when the stakes agree. `riskSaid` states the risk before the throw. Stakes are checked against `COST_KINDS`, and a threat must be plain text of at least 6 characters.
- **State:** `Check.costs` and `Check.threat` hold the stake and threat. The narrator says them before the roll, and `resolve` charges the stake.

### 1.6 Goodwill lost in front of someone is lost with them (mechanics #3)

- **Code:** in `resolve`, a goodwill failure at a stop where someone stands (`Moment.person`, set by `worldArrive`) costs at most 2. It is charged to that person, not to the sheet. The outcome carries `turned`, and `warm` drops by the same amount, so talking to them gets harder. `attempt` then moves that person's attitude in `trip.people` (`moveAttitude`). The world's goodwill is unchanged.
- **State:** each value has one owner. `trip.people[id].attitude` belongs to the person; `sheet.goodwill` belongs to the world. The narrator says "X turns against you: a step colder".

### 1.7 Losing plays out, in contests and on the battle mat (registry 8 and mechanics #4)

- **Model:** the Decision model is asked how losing goes in this scene and with these winners. Its options are the world's own `takenOut` (`TAKEN_CHOICE`), minus "killed". A shared helper, `howLost`, serves both contests and the battle mat.
- **Code:** `takenOutOf` uses the chosen means only when it is in the pool; otherwise the seed draws one. `takenToll` sets what each means costs:

  | Means | Cost |
  |---|---|
  | wounded | health drops to 1 |
  | captured | loses the last thing kept, else +2 hours |
  | shamed | −1 goodwill |
  | claimed, exiled | +2 hours |

- **State:** the toll is applied and saved, and its line is said and passed to the teller. At the last place the story is over, so no toll is charged.

### 1.8 The narrator's moves are chosen from the scene (mechanics #2)

- **Model:** the Decision model chooses the dread move, and the move a given-in flaw brings. Its options are `movesHere`: only the moves that can happen now and would not finish the player, described by `MOVE_SAID`. The context is the place, who stands there, the player, the world, and why the move is happening.
- **Code:** `pickMove(…, chosen)` uses the model's kind only when it is legal. What the move touches (which way is shut, which thing is spoiled, the save) stays code's. The seeded weighted pick is the fallback.

### 1.9 Picks that check (reading audit)

- `parsePick` now reads back any of these to the option's id:
  - an id, quoted or bare, in any case
  - a number
  - the option's full words, or the words before its colon

  An honest `unclear` returns null, never a guess. A failed parse is logged with the raw answer.
- Fork options are keyed `left` and `right`, and hub options by the number shown on the map. Hubs used to have hidden `0`-based keys under `1.`-based labels, so they were off by one. `byMeaning` maps a key to its position.
- The story-kind pick gets the card as context. It also offers `own`, for a premise that none of the kinds fits ("open a ramen stand at the bottom of the tower"). `own` plays as `any`, with the premise carried through.
- `worldScore >= WORLD_SURE` no longer overrules the model's world/person answer. `KIND_MS` went from 4 s to 12 s, so the Decision model (8 s) plus the reader can answer before the words decide.
  - The first live replay showed what the overrule had been hiding. A card that calls itself a "Simulation" and lists the AI's duties came back "person" (0.94), so the companion was named after the card.
  - The fix is a better question, not the counter-rule. The task now names the cues: calls itself a simulation, game or system; tells the AI how to run the story; is named after a place.
- The story's shape (the recipe) is chosen by a model from the player's own words and the card, among the recipes of the kinds allowed. The seeded draw is used only for a bare kind ("a hunt") or when no model answers. The narrator says "built around what you asked for" instead of reading out a stock plot that contradicts the ask.
- Free play no longer quits on any short line matching a "done" regex. "Goodnight, Mara" said in the story is the router's call; only the notebook command skips the model.

### 1.10 Readers with context (reading audit)

- The fast reader gets the whole line (2000 characters, up from 400), plus:
  - who the player is
  - who stands at the stop
  - the built stakes
  - what hurts what stands there

  It is told never to answer `power` when the hero has none.
- The Decision reader offers `power` only to a hero who has it. It used to never offer it. It also sees who stands there, the built stakes, and the whole line.
- The reader names the foe weaknesses a line uses (`hurts`) and its approach (`trade`: bold or careful). Code keeps only weaknesses the foe really has. `hurtsUsed` and `tradeOf`, the word lists, are now fallbacks.
- `checkedGrade` still caps a model's grade, but the reader's checked ids (a real lever, an ability the player has) count toward it. A line that uses a thing without repeating its name is no longer marked down.

### Tests

There are 606 tests, all passing, and `tsc` is clean. New tests:

- `tests/llmfirst.test.ts`: the pick parser, stop stakes and the risk line, `turned`, takenOut with a chosen means plus its toll, reader hurts and trade, grades earned by id, chosen dread moves, and builder `hurt_by`.
- `tests/kitwriter.test.ts`: the kit shape and its checks.

Existing tests were updated for whole units, and the fork case file for visible keys.

---

## 2. What is still open, in priority order

### P1: these change how play feels

1. **`forkSplit` still reads before the model.** At a fork, the director's own regex ("send Vypra left") runs before the meaning pick. Move it into the pick: add a `split` option per companion, or a small Decision question for "who goes where" that runs only when a companion is named.
2. **A warmed-up person cannot reopen a closed talk way.** `warm` changes how hard talking is, but a way closed by failure stays closed. A person whose attitude climbs back to friendly should reopen talk. This needs a design call on how often that may happen.
3. **Companion likes move global goodwill.** `battleEnd` and `attempt` adjust `sheet.goodwill` when a companion likes or dislikes a way. The single-owner rule says that belongs to the companion's own attitude, like 1.6.

### P2: correctness and duplicate machines

4. **The free-form companion is stock.** `playFree`'s companion is not written by the builder. Give it the same `companion:<id>` unit as stories.
5. **Project size is read by regex** in free play. Ask the router instead, with the ladder as legal options.
6. **Seats reactions come from tables.** How the other seats react is a fixed table. Let the teller choose from the legal reactions.
7. **Battle `namedIn`** matches names by words. Have the battle router return a target id, checked against the board.
8. **Appointments don't change state.** This is a code issue, not a model one, but it breaks "the world reacts". Let a missed appointment close or warn its stop. (The world clock's dread is now capped at `DREAD_MAX` on this branch, like failures.)

### P3: housekeeping

9. `worldScore` and `WORLD_SURE` remain exported but no longer decide anything. Remove them once the bench shows the model alone is enough.
10. The `SETTING` pick still clamps the kit's era. The kit writer now writes the era, so reconcile the two by letting the kit's era win when both answer.

---

## 3. Risks

- **Latency.**
  - The kit is written in parallel with the brief, and the builder waits for both. On a slow builder this adds to the first-turn wait. The kit has its own 25-second cap and falls back to the stock kit.
  - The dread move and the losing-means picks add a Decision call (about 0.5 s) only when there are two or more legal options.
  - The world/person pick can now wait up to 12 s at the start of a sitting, behind the read wait.
- **Whole-unit strictness.** Rejecting partial stops means more fallbacks when a model drops one field. The retry with `redo` mitigates this, and `Built.missing` makes it visible. Watch the rate in live logs.
- **Turned instead of charged.** A failed talk with someone present no longer lowers world goodwill, but it makes that person harder to talk round.
  - The sim (`ADV=gen:all RUNS=100 bun run adventure`, stand-in readers) shows the net effect is slightly *harder*: a few points on stories with many people in them. Conspiracy went 80→76%, forbidden 89→83%, escape 94→88%. Most stories are within 1 to 3 points.
  - The overall range is 70 to 98% won, against 71 to 98% on the base commit.
  - If that is too much, let warmth recover when you help the person (`wants`), or charge one step instead of two.
- **Model-chosen moves.** A model may favour the same move ("trouble"). Weights are no longer the only spread. If the bench shows a skew, pass the recent moves in the context and ask for variety.

## 4. Bench and test plan before merging

1. `bun test` and `bun run typecheck`: both green on this branch.
2. `scripts/bench-route.ts` against the story case file. The fork and hub cases now use visible keys.
   - On this branch, `--fork` scored 16/16 on the Decision model (median 349 ms) and 16/16 on Flash Lite (median 819 ms).
   - Run `--story` too, and report the score per model in the merge commit, as the skill requires.
3. Live replays with `scripts/play-real.ts` on real cards: the tower ramen premise, the moor hunt stakes, the harrowmere free play and the erotrap. Check that:
   - the kit's era and fears match the card
   - stop titles are not stock
   - a failed talk against a dangerous foe costs health and says so before the roll
   - losing a fight names how it goes
   - `fell(...)` fallbacks are rare
4. The story sim, for the win rate after 1.6 and 1.7.

## 5. What the live replays on this branch showed

These were run with `scripts/play-real.ts` on the user's own cards. The cards and transcripts stay out of the repo.

- **Tower card, premise "open a ramen stand at the bottom instead of climbing".**
  - Before the fixes, the card came back as a "person", the companion was named after the card, and the content reader made "climbing the tower" a never-show line.
  - After them, the card is a world (1.00) and the story pick is `own` (0.97). The content settings are untouched. Every build was framed around the ramen cart: a stolen stock cauldron and a rival caterer, a syndicate coming to smash the stall, a journey to claim the last licensed food stall.
  - Because the player wrote "surprise me", the kind is left to the narrator, which is the honest reading. The premise still shapes the frame.
- **Monster card, a hunt on the moor road, played by a cook who cannot fight.**
  - The kit and stops were in the card's world: a mob of torch-bearing locals as the rival, a ferryman, canal dredgers. No stop had a stock title.
  - This run surfaced the bare-stake problem fixed in 1.5. Sneaking past armed dredgers risked "goodwill" from a 0.65 Decision pick.
- **Harrowmere free play** (an isekai premise, "done for tonight" to end): the kit was written, there were no fallbacks, and leaving was routed by the model.
- **Fork bench:** 16/16 on both the Decision model and Flash Lite with the visible keys.

**Still slow.** When the builder's first answer misses a unit, the retry adds 25 to 35 s before the first place. In one run it asked three times. Showing the frame while the stops are redone would hide most of that.
