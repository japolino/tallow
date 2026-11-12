---
name: llm-game-architect
description: Architecture rules for LLM-driven games and interactive fiction (TTRPG engines, narrators, Lumiverse/Spindle extensions). Use before designing or changing any mechanic, state flow, line reader, content builder, consequence, NPC behaviour or setup step — whenever you are about to decide what a model does versus what code does. Built from the mistakes and fixes in Tallow's commit history.
---

# LLM game architect

Rule of thumb from Tallow: **code owns quantities and legality; models own meaning and choice among legal options; code checks every answer and falls back only on failure.**

Tallow began with "models read and narrate, code decides every number" (docs/DESIGN.md). The numbers half was right. The mistake was stretching it into "code also decides *which* thing happens": which consequence a failure brings, what stands at a stop, what world a card is in, what shape the night takes. Code made those choices from a seed, a template or a word count, without looking at the scene, and play felt generic and deaf. Almost every later fix moved a *choice* to a model while leaving the *numbers* in code.

## 1. Core architectural rules

### Who decides what

| Decision | Owner | How |
|---|---|---|
| What a player's line means: its kind, way, stat, target, who it's handed to, which option they picked | Decision model (typed `choice`, ~0.5 s), then the fast reader as JSON | Offer only the options the current state allows. Code checks the answer against state (is the way open, is the lever present, is the target alive). |
| Which of several legal outcomes fits the fiction: the failure's stake, the consequence move, which NPC reacts, whether a line lands with a person | Fast reader or Decision model, judged from the scene, the stop and who is present | Code supplies the legal menu and validates the pick. Code's default is the fallback, never the first path. |
| Creative content: places, stops, people, things to use, card titles, clues, threads, world kit, opening setup | Strong model (builder) | Give it the fixed *shape* (ids, kinds, difficulties, prices) plus notes on what to write. Never stock text to rewrite. |
| Numbers: dice, targets, difficulties, prices, costs, clocks, budgets, odds | Code, seeded | A model never sets or changes a number. A line cannot argue itself a bonus. |
| State: the sheet, clock, map, who is where, what is closed or spent | Code, one owner per value | One setter per value (`clockTo`, `sheetKept`). Models propose; code applies. |
| Hard rules: a 1 always fails, paying always costs supplies, minors never in heat or dark scenes | Code | Safety checks block if *either* the model or the code says so (a union, never one overruling the other). |
| UI, rendering, tag stripping, markup cleanup, JSON parsing | Code | Deterministic. |

### Banned patterns (each one appeared in Tallow and had to be undone)

- **Regex or word lists as the main reader of meaning.** This covers intent, line kind, fork choice, story kind, card type, setting or era, romance asks, times, targets and objections. They may only be the last fallback, used when no model answers or none is sure, and measured against a case file (`tests/route-cases.ts`, `scripts/bench-route.ts`).
- **A regex deciding whether the model gets asked** (`yieldRead` gated the "giving in" question), or running ahead of the model (`forkSplit` before `byMeaning`).
- **Words overruling a model's answer** (`worldScore >= WORLD_SURE` beating the KIND pick). If the model misreads, ask it a better question with better context. Don't add a counter-rule.
- **A word count choosing a creative frame** (`kitFromWords` picking one of five stock world kits; `MODERN`/`OLDEN` regex for the era).
- **A fixed table mapping action to consequence** (`WAY_COST`: talk always costs goodwill, even facing a hungry pack).
- **A model asked to "rewrite this template keeping the same things"**. It copies the template's ideas into every world.
- **Field-by-field fallback that mixes model and stock text in one unit** (a model's scene next to stock lever names).
- **Placeholders that can pass as real values**. Wrap every note in `<angle brackets>` and reject any value containing `{}<>`.
- **Building a step before its inputs exist** (the setup written before the hero page; the player's first answer thrown away).
- **"Only when the player says the magic word"** (a roll only when the line said "check").

### How mechanics and state decisions should be built

1. **Context in, legal menu out.** Every judgment call gets the scene, who is present, what the player asked for, who they are, and the options code allows *right now*. Never ask in a vacuum, and never offer options the state forbids.
2. **Propose, check, fall back per unit.** The model answers with ids and short text. Code checks ranges, ids, lengths and legality. A unit (a stop, a read, a kit) is accepted whole or replaced whole. Retry once before using stock.
3. **Consequences come from the fiction.** A failure is something done *to* the player by who or what is there: they are hurt, held up, lose face, or lose what they carry. The model picks the kind and a few words of what happens, and code sets the amount. Say the stake *before* the roll, then make the narrator play it out. A failure is never "time wasted talking".
4. **The player's own words travel.** Their first answer (the premise) and their character page go into every later prompt that builds or judges: setup, builder, stakes, narration.
5. **Shape fits genre.** A mystery or heist is a hub you case in any order; a chase is a road. Don't force every story into one structure, and don't let a seeded menu override what the player asked for.
6. **The world reacts.** State changes carry through: getting somewhere first stops the other side's plan there, winning a chapter stops the big bad's next step, clues are offered only where something is to be got past.
7. **Losing plays out.** Being beaten takes you to one of the world's own outcomes (captured, wounded, claimed where allowed), shown going the winners' way. It is not a silent reset.
8. **One owner per value, and simulate the balance.** Find hidden duplicate machines (two clock setters, two sheets) and merge them. Tune fights and stories with a sim (Tallow: stories won 82 to 100 times in 100; a fight one step under its place's difficulty; a companion counts as half a fighter).
9. **Bench every reader against real models**, with a case file of real lines. Keep the score in the commit (Tallow: story lines 97/97 on the Decision model, 98.9% to 100% on Flash Lite).

## 2. Anti-pattern registry (from Tallow's history)

Each entry is **bad decision → correct pattern**, with the commits.

1. **Failure cost fixed by the chosen way.** `WAY_COST` (6f11367): a failed talk always cost goodwill. A player who failed to talk down a hungry pack of wolf-girls got "she sneers, you lose an evening chattering", and nothing happened to them. docs/SYSTEMS.md even said code picks the consequence move. → 2882928: the reader and the Decision model judge `stake` and `threat` from who stands there. Code checks them against `COST_KINDS` and requires a real threat line, and `stakeOf` falls back to `WAY_COST`. The narrator states the stake before the roll and makes it happen.
2. **Stops copied from stock templates.** `layRoad` picked stop kinds by seed, and the builder was told to "keep the same things to use" (6f11367 onward). Each field fell back to stock separately, and 60% usable was enough. The same warden, with keys on his desk and a hidden debt, turned up in a dungeon card and a tower card, and every card wore a stock title ("The Toll-Keeper"). → 2882928: `designOf` sends only the stop's shape and `<notes>`. The model invents who is there, one thing to use per way, a teaser and the card's title (`face`). Code keeps a stop only when it is whole.
3. **World kit by word counts.** `kitFromWords` picks one of five stock kits, and the era was a `MODERN`/`OLDEN` regex (a934d9d), which once counted "spaceship" as an older age. A dungeon-builder card and a tower-climbing card were both described as "castles, villages and roads". → Patched with more regex in 29aa880, which is the wrong direction. The right pattern: the builder writes the kit and code checks it with `checkKit`, which already exists and is unused. **Still open.**
4. **The player's ask flattened into a seeded menu.** The story kind was a pick from seven tropes, and a failed pick fell back to the narrator choosing ("I want to open a ramen stand at the bottom of the tower" became "a mystery"). Free-form setup came from the card alone, before the hero was known (43a87dd). → 6606cd7: the first answer becomes the night's premise, kept all night, and the build starts when the hero page is written, from both. **Still open:** the kind pick itself often fails its check.
5. **Line kinds read by regex tables.** `byWords` (43a87dd) and `ROWS` in `world.ts` (a934d9d/29aa880): "make a check to see if somebody is watching" became a goal, a perception check became a talk try, "done for tonight" became a wait that ran out the clock, and a long tale in a fight became giving in. → 5beb046 and 7a493e2: one Decision `choice` over the kinds that fit the place, then reader JSON, with words last, benched against case files.
6. **The rule depended on the player's vocabulary, and the stat came from the contest, not the action.** A check only when the line said "check" (`calledRead`, 5beb046), and a dash out of a war of words rolled on charm. → d7d6fb4: any line that tries to notice what could be missed is a check, asked for or not; a forceful try may use the stat the line actually leans on.
7. **Hidden duplicate machines and rules that broke their own promises.** Several clock setters, several sheets counting, the hero prompt giving the wrong stat budget, sure hands costing *more* than the price, a 1 not always failing, clues offered where nothing was to be got past, the other side's plan going ahead after you got there first (a934d9d). → 29aa880: one `clockTo`, one `sheetKept`, the hard rules enforced in code, and world state that reacts to what the player does.
8. **One structure for every genre, and losing that went nowhere.** Mysteries and heists were laid as forked roads (fixed by 576f8bb: hubs you case in any order). Being taken out of a contest had no outcome of its own (fixed by 2cb8f24: the world kit's own `takenOut`, shown going the winners' way). The correct pattern is the battle router (90c8d2f), right from day one: Decision model, then reader JSON, then words, then a check against the board. Balance was tuned by simulation.

## 3. Pre-implementation gate

Before writing code for any new mechanic, system or feature, output this split and wait if anything in it is unclear:

- **Model role:** which model (Decision `choice`, fast reader JSON, or strong builder) judges or writes what, from which context (scene, who is present, the player's premise and character page), choosing among which legal options.
- **Code role:** which numbers and hard rules code owns, how it checks the model's answer (ids, ranges, whole-unit acceptance, `<note>` rejection), and what the fallback is when no model answers (and that it is *only* a fallback).
- **Game state flow:** which state values this reads and writes, the single owner of each, when in the turn it runs (after its inputs exist), and how the world reacts afterwards (what the narrator says before and after, and what other systems see the change).

If the split shows a regex, word list, seed or fixed table making a judgment or creative call, redesign it as model-proposes, code-checks before writing anything.
