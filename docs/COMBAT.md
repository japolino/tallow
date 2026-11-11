# Combat: design

Status: the five decisions in 9 are taken (each the recommended one). The whole build order (10) is built, with the heat, charm and restraint rules of 11: a fight stop on the road is fought on the battle mat, from your lines to the dice and back onto the trip. 10.1 and 10.2 say what was built and what play showed.

## 0. Where we are, and what is wrong with it

Today a fight is a dial contest (`engine/contest.ts`):
- Every foe is a dial of notches, you are a dial, and a danger dial fills by itself.
- One d20 of yours a round decides everything. A hit puts 2 or 3 notches on a foe; a partial or a fail puts the scripted blow on your dial.
- Foes never roll, never move and never choose. There is no place, no distance, no armour, no hit points of their own and no states (prone, burning, held).
- The kit's `defend` stats are never read.

So the only decision left in a fight is the words. With nothing on the table to answer, "I attack. I slash him. I go berserk." is as good a line as any. That is the real problem: spam is not a writing problem, it is a lack of things to respond to.

This design gives a fight a board, pieces that think, and rules with real numbers. You still play it by writing, never from a menu.

## 1. Principles

1. **The board asks, the prose answers.** Before your turn every foe shows what it is about to do, on the board, in chalk. A good line answers that: step out of the line of fire, knock the brute over before he swings, cut the chandelier above the two archers. "I attack" still works, but it answers nothing.
2. **One message is your whole side's turn.** You write once. Your hero moves and acts, and the companions you name do what you tell them. Those you don't name act in character.
3. **No menus, no action bar.** The only inputs are the notebook and the pieces themselves. You may pick up your own piece and set it down (the hand does it), or touch a foe or a prop to point at it. Everything else is words.
4. **Numbers belong to the engine, words to the models.** As now: models read what a line means and name things. The engine owns every number, every move and every die. Foes move by rules, seeded, so a fight can be replayed and balanced.
5. **The narrator rolls too.** Foes' attacks are thrown openly with the narrator's own dice. The table sees both sides roll.
6. **Everything is on the table.** Hit points are pegs, states are tokens, intents are chalk, terrain is ink. Nothing that matters is hidden in a log.
7. **A fight is short.** 3 to 5 rounds. Minions fall to one hit. Foes break and run when it goes badly for them.

## 2. Scope

- **Fights** (stop kind `fight`, the climax when it is a fight, ambushes in free form) move to the board.
- **Words and struggles stay dial contests**, as now: a war of words and a race against a flood have no use for a grid. A seduction or a grapple in a fight is on the board (section 11).
- A **chase** may come later as a board of its own (a moving strip), not in the first cut.

## 3. The core rules

### 3.1 The numbers you already have

The d20 and the tiers stay exactly as they are (`moment.ts`, `dice.ts`):
- d20 + stat (0 to 4) + gear (−1 to +2) against a target of 9, 12, 15 or 18
- a natural 20 is a crit, a natural 1 a crit fail, and missing by 3 or less is a partial
- edge and bane mean two dice, keep the better or the worse; they cancel, and never stack past one each

### 3.2 What a piece has

Every piece on the board, yours or theirs, has the same handful of numbers:

| | What it is | Yours | A foe's |
|---|---|---|---|
| **Defense** | the target to land a hit on it (its DC) | 10 + grace, +1 with a shield, +2 behind half cover | 9 / 11 / 13 / 15 by difficulty for a soldier; a minion −3, an elite +1 (`FOE_DEFENSE`) |
| **Armor** | taken off every hit that lands | 0 to 2, from what you wear (the gear ladder) | 0 to 3 by type |
| **Stamina** | the hit points of this fight, as pegs | 4 + 2×brawn + level | 1 (minion), 3–5 (soldier), 8–12 (elite), 15–25 (boss) |
| **Resolve** | the will to keep fighting (foes only) | — | breaks at a share of the side, as `breaks` does now |
| **Speed** | tiles moved in a turn | 4, or 5 with grace 3+ | 3 to 6 by type |
| **Attack** | what it adds to its d20 | your stat | its rating, 0 to 6 |

**Stamina and Health are not the same thing.** Stamina is fresh every fight. Health (the red stones, 5 of them) is what lasts across the story:
- Stamina run out means you are **Down**: you fall prone, lose 1 red stone, and a companion may raise you.
- A crit against you takes a red stone straight away, a wound.
- Every one of your pieces Down means you are **taken out**, with today's consequences.

This keeps the whole story economy (health, rest, the force way's cost) as it is, and gives a fight a scale of its own.

### 3.3 Landing a hit

You roll d20 + stat against the target's Defense:

| Tier | What happens |
|---|---|
| crit | the weapon's damage + 2, and its trait's state (see 3.5) |
| success | the weapon's damage |
| partial | 1 damage, and you are **Exposed** (the next attack on you has edge) |
| fail | nothing, and you are Exposed |
| crit fail | nothing; you are Exposed and drop prone or drop what you hold |

Armor comes off what lands, but a blow that lands always does at least 1.

Weapons are kept to a few kinds, so damage is a small count of pegs:

| Kind | Damage | Trait |
|---|---|---|
| light (dagger, fists) | 1 | quick: +1 to hit |
| blade (sword, axe) | 2 | — |
| heavy (maul, greatsword) | 3 | slow: −1 to hit, knocks prone on a crit |
| reach (spear, whip) | 2 | hits 2 tiles away |
| ranged (bow, pistol) | 2 | range 6; bane when a foe is next to you |
| thrown (knife, bottle, chair) | 1 | range 4; staggers on a crit |
| power (spell, tech, faith…) | 2 | range 5, rolled on power; its state comes from the ability |

The builder maps what the hero carries onto these kinds, as `gearFrom` does now.

### 3.4 The foe's roll

When a foe's chalked intent comes due, the narrator throws one die per attacking foe, all in one handful, and each die lands by its piece. The roll is d20 + its Attack against your Defense, with the same tiers turned round:

| Tier | What happens to you |
|---|---|
| crit | its damage, and 1 red stone (a wound) |
| success | its damage |
| partial | a graze: 1 damage |
| fail | it misses |

You defend by **where you are and what you did**, not by a defense roll: out of the chalked line, behind cover, guarded by a companion, the attacker knocked down or staggered first.

### 3.5 States

A short list, each a token the narrator's hand sets beside a piece, each with one plain rule and a length in rounds:

| State | Rule |
|---|---|
| **Prone** | −2 Defense against anyone next to it; standing up costs half its move |
| **Staggered** | its chalked intent is wiped: it loses that attack. This is the answer to a telegraph |
| **Exposed** | the next attack on it has edge |
| **Marked** | every attack on it has edge until the end of next round |
| **Burning** | 1 damage at the end of each round; spreads to anything flammable next to it |
| **Held** | cannot move; bane on attacks at anyone but who holds it |
| **Frightened** | must move away from what frightens it; bane against it |
| **Blinded / in smoke** | bane on its attacks; can't be shot at through the smoke |
| **Hidden** | can't be targeted until found; its first attack has edge and crits on 19–20 |
| **Guarded** | an ally takes the first attack meant for it |
| **Inspired** | edge on its next roll |

Tiles can carry states too: **slick** (a grace roll to cross, or fall prone), **burning**, **smoke**, **rubble** (half move).

### 3.6 Edges the board gives

The engine works these out from where things are, never from what the player claims. Each one shows as a weight on the scale before you throw, so you can see why the odds are what they are:

- **Flanking:** an ally on the far side of your target gives edge.
- **High ground:** attacking down from a balcony, stairs or a cart gives edge.
- **Cover:** a target behind half cover has +2 Defense against ranged attacks (3.2).
- **A weakness named:** saying what hurts it (`hurtBy`) gives edge, as now.
- **The scene used well:** a grounded or inspired line raises effect one step, as now. On the board that means +1 damage or a state.
- **Outnumbered:** two or more foes next to you means bane on anything but attacking them.
- **"He's ready for that":** the same plain move against the same foe twice running gives bane. It is mild and spoken aloud, and it only exists so that the third "I slash him" reads the fight. It can be turned off.

### 3.7 A turn

Each of your pieces gets one **Move** (up to its speed) and one **Act**. In any order:
- **Strike or shoot** a target in reach or range.
- **Shove:** brawn against its Defense; it is pushed 1–2 tiles. Into a hazard, a pit, a fire, another foe or another foe's chalk line, that is where shoving shines.
- **Grapple:** brawn; on a success it is Held.
- **Use a prop** (see 4.3).
- **Guard:** stand by an ally and make them Guarded, or hold a doorway.
- **Watch:** strike the first foe that comes next to you before it acts.
- **Aid:** a companion's next roll has edge.
- **Talk** (the talk way): taunt (its next intent must target you), intimidate (damages Resolve, not Stamina), demand surrender (works on a broken side), parley (stops the fight if the story allows).
- **Hide** (the sneak way): behind cover or in smoke, grace or guile against the best foe sense. On a success you are Hidden.
- **An ability** from your store (see 3.9).
- **Dash:** a second Move instead of an Act.
- **Engaged:** getting out of reach of a foe you stand next to is **breaking off**, and it takes your Act. Without this, "strike and step out of the chalk" dodged every blow for free.
- **Break away:** leave the board from an edge tile; when everyone is off, you have fled.

Speaking is free; it only costs the Act when it aims to change a foe.

### 3.8 The round

A round goes like this:

1. **Their move, shown** *(after your last message)*. Each foe moves by its kind (5) and chalks its intent: an arrow for a charge, an arc for a cleave, a line for a shot, a circle for an area, a hand for a grab. A token stands beside it (sword, bow, flame, shield, skull). The narrator says it in a line or two.
2. **Your turn.** You write. Your pieces move and act in the order the line says; you throw your own die, and companions throw theirs. Pieces that move out of chalk are safe from it: off a shot's line, off a charge's path, out of a cleave's arc. A strike, and a cleave's mark, follows its mark while the mark is still in the foe's reach, so the way out of a blade is to break off (3.7) or to stop the blow. A foe staggered, knocked down, shoved or killed loses its intent.
3. **Their blows land.** Every intent still standing resolves against where things are now. An attack aimed at a tile hits whoever stands on it, a foe included. The narrator throws his handful.
4. **The end of the round.** Burning ticks, clocks fill (today's danger dial becomes a board event: the gate opens in 3, the fire reaches the powder, the tide covers the low tiles), and broken foes run.

Then back to 1. Steps 3, 4 and the next step 1 play out together after you send your message. That is the moment the user asked for: you send, and their pieces move on their own.

### 3.9 Skills, buffs, debuffs

The ability verbs already in `abilities.ts` become what they plainly mean on the board. The store (2 + level uses, refilled at rest) stays the resource:

| Verb | On the board |
|---|---|
| reach | strike from 2 tiles, or pull a foe 1 tile toward you |
| bind | Held on a hit |
| sweep | hit every foe next to you |
| drain | heal Stamina equal to the damage dealt |
| ward | an ally (or you) is Guarded and takes −1 damage this round |
| edge | edge on this roll |
| mark | the target is Marked |
| sway | taunt or frighten, by the ability's tags |
| mend | an ally regains 2 Stamina, or is raised from Down |
| aid | a companion acts again this turn (once a fight) |
| open | a foe loses 2 Armor for the fight, or cover is smashed |
| slip | move through foes freely this turn, or turn a fail into a partial |
| learn | reveal a foe's next two intents and its weakness |
| flourish | Inspired, and Resolve damage to every foe that sees it |

Level-ups keep offering two ability cards, written by the model from these verbs. Buffs are Inspired, Guarded, Hidden and ward; debuffs are the states in 3.5.

## 4. The board

### 4.1 The mat

When a fight opens, the narrator unrolls the battle mat over the map: today's leather board, now stitched into squares.
- **Size:** 8×6 for a skirmish, up to 12×9 for a climax. Squares, not hexes (see the decisions in section 9).
- **Terrain** is inked in: walls, water, pits, height (hatched), doors, an edge you can flee from.
- **Named zones:** every arena has 4 to 8 named places: "the bar", "the balcony", "behind the cart", "the well". Lines and the reader speak in names, never in coordinates (see 6).

### 4.2 The pieces

- **Yours:** the hero and each companion in the party. Companions sent elsewhere (`at`) aren't on the board.
- **Theirs:** small figures in a handful of silhouettes (humanoid, big, beast, swarm, caster, flyer, construct). Each has a tag with its name and a peg rail for its Stamina. Minions are pawns.

### 4.3 Props

A prop is a template with fixed rules, given a name by the model to fit the world. A fantasy inn's brazier is a cyberpunk bar's shorted power cell. The builder picks 2 to 5 for each arena from what the place is:

| Template | Examples | Used | What it does |
|---|---|---|---|
| **toppler** | shelf, statue, server rack | shove (brawn) | falls in a line of 3: 2 damage and Prone to all there; leaves rubble that gives cover |
| **hanging** | chandelier, cargo net, crane load | cut or shoot it (grace / ranged) | drops on 2×2: 3 damage, Held for a round |
| **spill** | oil, ale barrels, coolant | kick or shoot it | a 3×3 slick zone; burning if fire touches it |
| **fire** | brazier, lantern, hearth | throw or kick it | burning tiles, light changes |
| **cover** | table, crate, cart | flip or hide behind it | half cover; can be smashed (3 Stamina) |
| **choke** | door, gate, bridge, ladder | bar it, open it, cut it | changes who can get where |
| **throwable** | bottles, chairs, stones | throw | 1 damage; staggers on a crit |
| **hazard** | pit, deep water, cliff edge, rail | shove someone in | minions are out; others take 3 and are Prone |
| **height** | balcony, stairs, roof | climb (1 extra move) | high ground |

Props glint faintly when one is in reach of a piece. That is the board's way of offering, instead of a menu.

### 4.4 The other side's aims

Not every fight is "kill them all." The story's holds and danger dial become an objective:
- **Escape:** get N pieces off a given edge.
- **Protect:** someone survives (a captive, a cart, a ritual stone).
- **Grab:** carry a thing off the board.
- **Hold:** last N rounds.
- **Stop it:** reach a prop and act on it before a clock fills.

Every fight also ends when their side breaks (Resolve), when they surrender to a demand, or when you give in, as now.

## 5. How the foes move

### 5.1 Kinds

Each foe has a kind. A kind is a way of moving, a target it prefers and two or three intents it chooses from:

| Kind | Moves | Prefers | Intents |
|---|---|---|---|
| **brute** | straight at it; charges 2× in a line | whoever hit it last | charge (knockback), cleave (arc of 3), slam (prone) |
| **skirmisher** | to the tile that flanks; hits, then backs off 2 | the one already engaged | flank strike, hit-and-run, trip |
| **shooter** | keeps 4–6 tiles away; climbs; backs off when someone is next to it | whoever is not in cover | aimed shot (a line), volley (2 targets, −1 each), pin (Held) |
| **caster** | blinks up to 4; keeps behind allies | clusters of you | blast (a circle), hex (Marked / Frightened), summon (2 pawns) |
| **guardian** | between its charge and the nearest threat | whoever threatens its charge | interpose (makes it Guarded), shield wall (cover to allies next to it), hook (pull 2) |
| **leader** | stays back; keeps out of sight | — | command (an ally acts twice), rally (raises Resolve), flee when hurt |
| **pack** | surrounds; leaps | whoever is alone | pounce (leap 3, Prone), drag (pull someone away from the group) |
| **swarm** | fills tiles around a target | the nearest | engulf (1 damage from each one next to it) |
| **lurker** | hides; comes out behind | shooters, casters, the hurt | ambush (edge, crit on 19–20), grab and drag |
| **boss** | its phases | its own phases | at half and at a quarter Stamina, a new set of intents and an arena change |

### 5.2 How it chooses

The engine scores every tile a foe could reach, on what its kind wants:
- getting at its preferred target
- flanking, height, cover
- staying out of hazards, chalk and fire
- keeping its range

It takes the best, with a seeded tie-break, and picks the intent that suits where it ends up. This is the same seeded randomness as the dice. It is fast, fair and testable, and the balance sim can play it.

### 5.3 Answering you

What you just did changes what they do next. That is the "against the one you prompted to attack":
- **The foe you hit** turns on you, unless it is staggered, broken or a shooter with a better shot.
- **Its guardian** steps between you and it.
- **Its leader** commands the others onto you.
- **The pack** goes for whoever is now alone.
- **Shooters** switch to the one who just came out of cover.
- **Hiding** makes seekers search: a sense roll against your guile, chalked as a cone.
- **Fire** makes everyone path round it, except the brute.
- **A leader killed, or half the side down,** is a Resolve check: minions break and run off the edge.

## 6. From prose to actions

### 6.1 The battle router

This works like the story router (`game/storyroute.ts`), model-first and checked by the engine. One Decision call, else the reader as JSON, else the words. It is told:
- the board in words: each piece, where it is by named zone ("by the bar, next to the brute"), its Stamina, states and intent
- the props and zones in reach
- the line

For each of your pieces the line names or implies, it answers:
- **move to:** a named zone or an anchor: next to X, behind X, the far side of X (to flank), out of X's line, onto Y (a height); or stay
- **act:** strike, shoot, shove, grapple, prop, guard, watch, aid, talk, hide, ability, dash, break away, give in
- **at:** the target piece, or the prop, or the ally
- **how:** the stat, the way, the ability, a weakness named

Unnamed companions act by their style:
- a brawler engages the closest threat
- a planner flanks or uses a prop
- a talker taunts or works on Resolve
- a joker staggers
- a treasure-hunter goes for the thing to grab

A cold companion may refuse an order (`objectsBy` already asks).

### 6.2 Then the engine

The engine turns anchors into tiles and paths, and checks reach, range and line of sight. When a line can't be done, the narrator says so and offers the nearest thing, as `couldInstead` does: "You can't reach the archer this turn. You can get behind the cart, and be on her next turn." The edges come from geometry (3.6), not from the line.

A piece you set down by hand overrides where the line said it went.

### 6.3 Short lines are fine

"Again, on the brute" works: the target comes from the last turn, and the move from the nearest tile next to it. The game never demands long prose. It only rewards lines that use the board.

### 6.4 A round, played

> *The chalk:* the brute has an arrow straight at Vypra (a charge). The shooter on the balcony has a line through you.
> *You write:* "I kick the oil barrel toward the brute and dive behind the bar. Vypra, light it."
> *The router:* hero, move to behind the bar, act prop (the spill) toward the brute. Vypra, act prop (the lantern) at the spill.
> *The engine:* the bar puts you out of the shooter's line, and the shot is wiped. You roll brawn against 12 for the barrel: a success, the tiles under the brute go slick. Vypra rolls grace against 9: the lantern lands, and the slick turns to fire.
> *Their blows land:* the brute charges across the slick. Its grace roll fails: it is Prone and Burning, and the charge is wasted. The shooter has no line, so it climbs down.
> *The end of the round:* the brute takes 1 from the fire. The bandits' Resolve takes a hit from the sight of it.
> *Their next move, shown:* the shooter flanks round the bar. The brute, standing, chalks a cleave on the bar.

## 7. The table: animation and camera

Built in the existing room (three.js, step tracks in `room/track.ts`, the narrator's hands, `pieces.glb`), with the flat 2D room drawing the same board from above.

- **Opening:** the narrator unrolls the mat over the map, tips foe figures out of his sleeve onto their tiles, and his hand sets yours down. The camera leans to a new **MAT** view, about 50° over the board.
- **Your moves:** your drawn hand reaches out across the table. The camera follows it: a short dolly toward the piece, and the hand lifts the piece, arcs it over, sets it down with a small tap and a puff of dust. It is the same whether the line moved it or you dragged it; when you drag, the hand follows the pointer.
- **Their moves:** the narrator's hand, in the style of the kind:
  - a brute slides in a straight line and thuds
  - a skirmisher hops in an arc
  - a shooter is pushed back
  - a pounce is lifted and dropped
  - a blink goes under the cloak and comes out elsewhere
- **Intents:** his finger draws chalk on the leather (arrows, arcs, lines, circles) and stands a token beside the figure. Wiped intents are smudged away.
- **Blows:** a hit figure wobbles or tips. Pegs are pulled from its rail. State tokens are set beside it. A downed minion is knocked flat and swept into the narrator's cloak.
- **Props:** the chandelier drops, oil spreads as a decal, fire uses the candle flame particles, a toppled shelf falls as a piece of the board.
- **Dice:** you throw yours, as now. Companions' dice tumble in from their side. The narrator's handful lands one die by each attacker.
- **Camera rules:**
  - no move longer than about a second
  - always back to the seat when you write
  - you can lean and look round (the existing lean view)
  - a reduced-motion setting cuts the moves to cuts

## 8. Where it goes in the code

| Piece | Where |
|---|---|
| Battle state, rules, the round (pure, seeded) | new `engine/battle.ts`: Battle, Piece, Tile, Zone, Prop, State, Intent, Action; `startBattle`, `yourTurn`, `theirTurn` (their blows, the end of the round and their next move), `theirMove`, `playRound` |
| Foe kinds and their scoring | new `engine/foekinds.ts` |
| Prop templates | in `engine/battle.ts` (`PROP_USE`, what each template does when used) |
| The arena from a stop | `engine/arena.ts`: eight arena templates (tavern, street, woods, bridge, hall, cave, camp, ruin) picked by the stop's words, laid out by seed; the model only names the props and foes (`battleNames`), the numbers come from the templates and `engine/encounter.ts` |
| The fight stop on the trip | `engine/battletrip.ts`: which stops go to the mat, the side (you and the companions with you), the foes' kinds by world and content settings, opening the fight, and its end mapped back as a try's end (won, taken, gave in; red stones; hours; loot; level) |
| Prose → actions | `game/battleroute.ts` (Decision questions, reader JSON, word fallback, then a check that keeps only what is on the board), with its tests in `tests/battle-route.test.ts` |
| Playing a round | `director.ts`, `atBattle`: chalk said, a line read, orders, your die, their turn, the narrator's tell, until the fight ends |
| The narrator's words | `engine/tell-battle.ts`: the events as lines in the second person, the chalk, the number a throw needs, the opening and the end |
| The table | `room/battlemat.ts`: the leather unrolled over the map, its squares, walls, cover, ground and zones inked; pieces in pale and dark wood (the hero banded red) slid along their paths, wobbled when hit, laid down, swept off; prop rings and chalk arrows. `Table.battle(b, events)` drives it (`game/roomtable.ts`); `preview/?mat=1` plays a sample fight on it. The flat room has no mat yet: there the fight is the board in words |
| Kits | `KitContest.defend` finally means something: which stat sets your Defense in that world (reflexes in a cyberpunk world, grace or brawn in a fantasy one) |
| Balance | `scripts/battle.ts` (`bun run battle`): a player that reads the board against one that hits the nearest foe. Target: sensible play wins 85–95%, fights last 3–5 rounds, and losing can still play out |

## 9. Decisions to make first

1. **Stamina per fight, Health across the story** (recommended), or one pool of hit points for everything. The first keeps rest, the force way's cost and the red stones as they are. The second means rebalancing the whole story layer.
2. **Squares** (recommended: easy to read on leather, easy to say "next to"), or hexes.
3. **The narrator throws for the foes, in the open** (recommended), or you roll to defend instead.
4. **Fights only on the board, words and struggles stay dials** (recommended), or every contest on a board.
5. **The "he's ready for that" bane** for a repeated plain move: on (recommended, mild), or off.

**Taken:** all five as recommended. Stamina per fight and Health across the story; squares; the narrator throws for the foes in the open; fights only on the board, words and struggles stay dials; the bane on (and `readyForThat: false` turns it off).

## 10. Build order

1. **The engine:** grid, pieces, Defense, Armor, Stamina, move and act, the telegraph-then-blows round, four states (Prone, Staggered, Exposed, Burning), three kinds (brute, shooter, swarm), seeded, with tests and the balance sim. Played on a plain board.
2. **Prose to actions:** the battle router, anchors, companions acting by style, cases and the bench on real models.
3. **Props and terrain:** the templates, arenas from the builder, objectives, the other kinds, the rest of the states.
4. **The table:** the mat, figures, the hands, chalk, the camera, dice by the handful; the flat room.
5. **Depth:** abilities as battle verbs, level-up cards for them, boss phases, Resolve and surrender, the polish.

Each step is playable on its own. Step 1 alone already makes a fight a fight.

### 10.1 Step 1, as built

- `engine/grid.ts`: squares, eight ways round, lines, sight, cover, the reach of a move (past your own side, never through theirs).
- `engine/battle.ts`: pieces (`yourPiece`, `foePiece`), the round (`startBattle` shows their first move; `yourTurn`, `theirTurn`, `playRound`), strike, shoot, shove, dash, break away, the four states (Prone, Staggered, Exposed, Burning), Down and red stones, won, taken and fled, the "ready for that" bane, events for the narrator and the table, and `boardText`, the plain board.
- `engine/foekinds.ts`: brute (whoever hurt it last; charges across open ground, cleaves two of you), shooter (keeps its distance and a clear line, backs off, picks whoever is out of cover; speed 3, so a dash catches it), swarm (the nearest; gets round it to flank).
- `engine/encounter.ts`: a seeded plain mat and foes bought from a threat budget (`sideSize × (1.5 + 0.75 × difficulty) + 1`; minion 1, soldier 2, elite 4).
- `engine/tactics.ts`: `readOrder` reads the board (out of the chalk, onto the flank, finish the hurt, shove the one about to swing); `plainOrder` hits the nearest one. The sim plays both; a companion with no word from the player can fall back on `readOrder`.
- `tests/battle.test.ts`: the numbers, the chalk and the ways to answer it, the states, the edges, the kinds, the end of a fight, and that a seed replays the same fight.

What the sim showed, and what changed for it:
- Foe Defense at 9/12/15/18 made a very hard fight run past fifteen rounds: now 9/11/13/15.
- An elite's extra armour made a blade useless against it: elites no longer add armour, and a blow that lands does at least 1.
- Strike-then-step-away dodged every blow: hence Engaged (3.7), and strikes that follow their mark.
- A shove every round locked a brute out of the fight forever: "ready for that" also covers a repeated shove.
- A shooter as fast as you could be chased forever: shooters move 3.
- A lone elite can still be kept off by breaking off every round. Nobody lands anything; the sim counts it as kept away, as good as getting away.

`bun run battle`, 200 fights a cell (a level 1 hero with brawn 3, grace 2, a blade, armour 1; "three" adds a heavy-weapon fighter and an archer):

| | difficulty | reads the board: won / lost / kept away | rounds to win | hits the nearest: won / lost | rounds to win |
|---|---|---|---|---|---|
| solo | 0 | 98 / 2 / 0 | 4.8 | 90 / 11 | 5.0 |
| solo | 1 | 97 / 4 / 0 | 5.1 | 83 / 18 | 5.3 |
| solo | 2 | 74 / 20 / 7 | 7.4 | 50 / 50 | 8.6 |
| solo | 3 | 49 / 23 / 28 | 9.7 | 17 / 81 | 11.0 |
| three | 0 | 100 / 0 / 0 | 3.5 | 100 / 0 | 3.8 |
| three | 1 | 100 / 0 / 0 | 5.0 | 93 / 7 | 6.1 |
| three | 2 | 100 / 0 / 1 | 6.9 | 61 / 38 | 9.3 |
| three | 3 | 96 / 0 / 5 | 10.3 | 21 / 79 | 12.7 |

Reading the board is worth a great deal, which is the point. Fights at difficulty 2 and 3 still run long (7 to 10 rounds against the 3 to 5 aimed for); props, abilities and Resolve (foes that break and run) in steps 3 and 5 are what should shorten them, and the numbers get another pass then.

### 10.2 Steps 2 to 5, and 11, as built

- **Prose to actions** (`game/battleroute.ts`). The router asks a model what kind of line it is (act, ask, yield, stop) and what each of your pieces does, by meaning, as the story router does; failing that, a reader's JSON; failing that, plain words. Whatever comes back is checked against the board: an act not on offer, a target or an anchor that isn't there, falls away. Anchors (stay, away, edge, `zone:`, `next:`, `behind:`, `flank:`) become tiles by scoring every tile the piece can reach. A strike or a talk with nobody named goes at whoever chalked at you, else the nearest foe. Companions the line doesn't name act by their style (brawler, planner, talker, joker, treasure), the same style their seat has in the story.
- **Props, terrain, the other kinds** (`engine/arena.ts`, `engine/battle.ts`, `engine/foekinds.ts`). Topplers, hanging things, spills, fire, cover, chokes, throwables, hazards, height and prizes; slick, burning, rubble and smoke ground; aims (hold, protect, grab, stop) and the danger clock; the kinds beyond the first three, among them the charmer, ensnarer and captor of 11.4, gated by the content settings.
- **The table** (`room/battlemat.ts`), as in section 8.
- **Depth.** Abilities as battle verbs (reach, bind, sweep, drain, ward, mend, mark, learn), paid from the store or once a fight; bosses that change phase at half Stamina and call help; Resolve, breaking, taunt, intimidate, demand and parley; guard, watch and hide.
- **On the road** (`engine/battletrip.ts`, `director.ts`). A fight stop goes to the mat unless a dial contest there has already begun (`DirectOptions.battles: false` turns the mat off). The fight's difficulty is the force difficulty plus the trouble you are in. Winning clears the stop and pays its reward; taken out at an ordinary place, you come to beyond it with less; giving in leaves you whole with nothing. At the last place, losing or giving in ends the story. A fight takes a quarter of an hour plus a tenth for each round.
- **A round limit.** A fight that reaches round 20 (`ROUND_LIMIT`) is worn out: the side with more of its Stamina left carries it ("worn down"). Before it, a player who only steps out of the chalk could dance with a brute forever: the blow lands on the tile, so stepping aside every round dodged every blow and nothing ever ended.

`bun run battle` after all of it, 100 fights a cell, same heroes as above:

| | difficulty | reads the board: won / lost | rounds to win | hits the nearest: won / lost | rounds to win |
|---|---|---|---|---|---|
| solo | 0 | 100 / 0 | 5.0 | 94 / 6 | 5.3 |
| solo | 1 | 99 / 1 | 5.2 | 88 / 12 | 5.7 |
| solo | 2 | 80 / 20 | 8.3 | 57 / 43 | 8.7 |
| solo | 3 | 67 / 33 | 9.0 | 29 / 71 | 7.8 |
| three | 0 | 100 / 0 | 3.7 | 100 / 0 | 3.9 |
| three | 1 | 100 / 0 | 4.8 | 97 / 3 | 6.1 |
| three | 2 | 99 / 1 | 6.6 | 61 / 39 | 8.2 |
| three | 3 | 98 / 2 | 10.1 | 21 / 79 | 9.6 |

Nobody is kept away any more: the round limit settles those fights.

What play on three real cards showed (a monster-girl world, a hell of imps and princes, a cyberpunk city; real models reading the lines), and what changed for it:
- The router read every line right, by meaning: "step out of the line of that blow and cut at whoever chalked it" became a strike at the one who had chalked, "again" a struggle when held, "how hurt are they?" a question that costs no round. It also once aimed a shove at a prop: a target must now be the kind its act takes (a blow at a foe, a guard for a friend).
- The second place on the road set four soldiers against the hero and one companion: a story try weighs your strength in one throw, a fight is a dozen. A fight is now one step under its place's difficulty (the last place keeps the full step), and a companion counts as half a fighter in the foes' budget. The same fights now bring two foes.
- With the hero down and a companion still standing, the companion and the foes stepped out of each other's chalk for fifteen rounds. Now the rest of your side has three rounds (`HERO_DOWN_ROUNDS`) to win or raise you; then they drag you clear, and the fight is lost.
- Down or Overcome, the player was still asked "What do you do?" and the teller had the hero lunging: now the narrator says you are out of it and your line can only move the others, and the teller is told the hero does nothing.
- The narrator spoke of himself as "the narrator": he unrolls the leather himself now, as he turns the cards.
- In the monster-girl world a sellsword with no Charm who answered with his blade lost his Composure in three or four rounds to a charmer. That is the world working as 11 says, and the opening tells you how a fight is won there; the cyberpunk fight, answered the same way, was won in four rounds.

## 11. When a fight is not about bones: heat, charm and restraint

Some worlds, and some characters, don't fight to wound. The `monster-romance` kit is already there ("A seduction is a fight"): its power is **Allure**, its risk is **composure**, and its contests are seduction (charm or Allure against sense), struggle (brawn against brawn or grace), chase and words. Being taken out can already mean **claimed**, under the content settings. The board takes all of that as rules, not flavour.

### 11.1 Two rails, not one

A kit says which rail or rails a fight wears down. Every attack says which one it hits.
- **Stamina:** bones and blood, as in 3.2.
- **Composure:** the will to resist. Desire, charm, being worn down. It has its own guard:
  - **Poise**, the target to land a charm on: 10 + sense, or 10 + Allure for a creature of it.
  - **Will**, what comes off each charm that lands, the way Armor comes off a blow: from what you carry (the kit's gear: a holy relic, an enchanted ring).

Every piece has both rails, shown as two rows of pegs in different colours. A brawl in a tavern is all Stamina. A night in the monster-girl woods is mostly Composure. The two can mix: a lamia can bite *and* coil.

Composure at 0 is **Overcome**, the Composure side of Down. Your side all Down or Overcome means you are taken out, and what that means is the kit's `takenOut` (`claimed`, `captured`…) under the content settings (11.5).

### 11.2 Playing a succubus (or any charmer)

With Allure as your power, your attacks hit their Composure:
- **A look, a word, a touch:** a charm at range (Allure against Poise), or adjacent with edge.
- **States you deal:**
  - **Flustered:** bane on all its rolls.
  - **Entranced:** it must move toward you, and can't attack you without a sense roll first.
  - **Enthralled:** for one round it is yours. You move it and it acts for you; it can even step into its own side's chalk.
- **Your ability verbs fit as they are:** sway is entrance or frighten; drain feeds on what you take from them and heals your Stamina; mark is the one you've chosen; flourish is a display every foe that sees it must answer.
- **A foe Overcome** yields, or is yours for the rest of the fight, by what the story allows. A whole side Overcome is a win, and the story goes on with them however the scene goes.
- **Foes ready for you:** an inquisitor's holy symbol, a jealous rival, a lover who has seen it all before. They get kinds with Will, warding intents, and states that hit back (Exposed when you overreach).

### 11.3 Restraint: being caught and worn down

Grapple and Held (3.5) become a ladder, for both sides:

| Step | What it means | How it comes |
|---|---|---|
| **Grabbed** | can't move; can still act | a grab or coil that lands |
| **Pinned** | can't move; can only struggle, talk or use an ability | a second round held, or a crit grab |
| **Overwhelmed** | can only struggle; each round costs Composure (or Stamina) without a roll | a third round, or a crit while Pinned |

While you are held, the holder's intent each round is to **wear you down**: Composure (or Stamina) off you, and the hold one step tighter. Your turn is how you answer it:
- **Struggle:** brawn or grace against its hold. A success loosens it one step; a crit throws it off and leaves it Prone.
- **Talk your way out:** charm or guile against its Poise. Its grip slackens, or it's Flustered.
- **Your companions** can pry it off (shove, strike it, a ward on you) or draw it away (taunt). That gives the side someone to save.
- **An ability:** slip out, a ward, open its hold.

Resisting is the play. Every round you hold out is a round your companions get to act, and every step you climb back is a die you threw.

### 11.4 Kinds for these worlds

These join the kinds in 5.1, named by the world's model: a lamia, a slime, an arachne, a succubus, a harpy flock.

| Kind | Moves | Prefers | Intents |
|---|---|---|---|
| **ensnarer** | slow; stays near its lair tiles | whoever is alone or hurt | coil or engulf (Grabbed), web at range (Held, then reel in 2), squeeze (wear down) |
| **charmer** | keeps 2–4 away; draws you in | the one with the least Poise | allure (Composure at range), beckon (Entranced), kiss (Composure adjacent, with edge) |
| **captor** | grabs and makes for the edge | the hero first | grab, drag (pulls you 2 tiles while it moves), carry off. A piece carried off the board is *taken*: rescue it, or that is the scene |
| **flock** | swoops and lifts | shooters and the light | snatch (lift and drop 3 tiles away), distract (Flustered), pile on (each one next to you wears you down) |

Monster-girl foes rarely want you dead. Their kinds score capturing above killing, so a fight against them feels like holding out and getting each other free, not like trading blows.

### 11.5 The content settings decide (`engine/content.ts`)

Nothing here gets round the settings the chat has:
- **Heat or dark themes on, and every piece involved a clear adult** (the minor check, `sceneHeat`, `sceneDark`): the charm and restraint kinds, states and intents are offered, and Overcome can mean claimed.
- **Heat off:** the same rules play out as fatigue and charm, and a defeat fades at the door.
- **Dark themes off:** no unwilling or dubious outcome. A foe Overcome yields; you Overcome are spared, or let go.
- **Let the dice decide off:** being Overcome means a die decides whether you are caught, and what happens next is your choice, as now.
- **Lines and veils** still bind every intent's name and every word the narrator writes: what must never appear doesn't, and what is veiled happens off-screen.
- **Losing plays out**, as it already does: Overcome is not a game over away from the climax. The scene goes the world's way, and the story carries on from where it leaves you.

### 11.6 What it adds to the build

Nothing needs to change in the core. A second rail, Poise and Will, the restraint ladder and four kinds are data and a few rules in `engine/battle.ts` and `engine/foekinds.ts`, gated by `content.ts`. It fits in step 3 (props, terrain, the other kinds) of the build order, and the monster-romance kit becomes the first world it is tested in.
