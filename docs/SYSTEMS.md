# Tallow: the systems skeleton

A proposal, not built. It answers: "deeper systems, not more complicated ones"; "classes, boons, abilities, skills, the silly spell that makes things taste good"; "a proper fight, no buttons, a different board between you and the narrator"; and above all "a general skeleton that models can build skills on, made for each roleplay". The design document (`docs/DESIGN.md`) stays the rulebook; this file says what would change and why, and goes into it once it is agreed.

---

## Built so far

- **Built:** the hero's calling and store (section 2); abilities with their verbs, prices, budget and stock (section 3, `src/engine/abilities.ts`); the forge, where the hero model writes the calling and three abilities and the level-up model writes two from what you did, both checked and fitted by code (`src/game/prompts.ts`); marks and the grade a line earns, held to what code finds in it (section 4, `src/meaning/read.ts`); giving a try everything you have. The reader and the Decision model name the ability, the setup and the grade.
- **Built:** dread, the narrator's moves and temptation (section 5, `src/engine/dread.ts`, the bowl in `src/room/dread.ts`). See "As built" at the end of section 5.
- **Built:** the contest board (section 6, `src/engine/contest.ts`, the leather and dials in `src/room/board.ts`). See "As built" at the end of section 6.
- **Built:** the other kinds of throw (section 7, `src/engine/save.ts`, `src/engine/luck.ts`, the narrator's die in `src/room/luck.ts`, its slips in `src/room/against.ts`). See "As built" at the end of section 7.
- **Balance:** a careful player writing plain lines wins 69 to 81% of roads with contests and the other throws (`ADV=gen:all RUNS=200 bun scripts/adventure.ts`), and is taken out of a contest in 1 to 8% of them; the slips against you and the saves about cancel out. It was the same with contests alone, 71 to 82% with dread and before contests, 76 to 83% before dread, and 69 to 85% with knacks. The simulated player never names a foe, never gives in and is never tempted, because it has no hero.

## 0. The idea in one paragraph

**Code owns a small set of verbs. Models own every word.** Each ability, class, foe and trick is a short record. Its *shape* (what it does at the table, how often, at what price) is built from a fixed list of verbs that code knows how to play and how to price. Its *words* (its name, what it looks like, when it applies, what it costs in the story) are written by a model for this hero, at this card's table, in this card's world. Code checks every record against a point budget, mends one that is too strong, and swaps one it cannot read for a stock one. The same skeleton then makes a hedge-witch's kitchen charm in a fairy-tale card, a lounge singer's hush in a noir card and a pilot's dead-stick landing in a space card, and all three play by the same rules.

The second idea is what makes effort pay: **anything true in the story can become a thing on the table.** A good line, a clever use of a trick, a result that went well: each can leave behind a *mark*, a small handwritten slip that names a fact ("the guards are off at the latrine pit") and can be leaned on later. Today's levers (the things in a scene that make a way a step easier, once) are marks the narrator wrote. In this design the player writes them too, by playing well.

---

## 1. Why the game feels thin now (the root, not the symptoms)

1. **Nothing you do outlasts the roll.** A line is read, a die is thrown, a cost is paid, and the scene is gone. Setting something up for later earns nothing, so there is no reason to.
2. **Who you are is a number, not a verb.** A knack is "a step easier at one way". Two heroes of the same kind play the same. Nothing you have opens a door the stop did not already offer.
3. **The four ways are the whole menu.** Talk, sneak, force, pay. A line that does something else is squeezed into one of them, so the clever thing and the plain thing come out alike.
4. **A failure only takes.** Trouble goes up, a way closes. The narrator never gets to *do* something with your failure, and you never get paid for letting your hero's faults cause trouble.
5. **A fight is a stop that wants two good throws.** There is no back and forth: nobody swings at you, you cannot see how close they are to giving up.

Each section below answers one or more of these.

---

## 2. The hero

### 2.1 A calling (the class)

Written by a model from what you wrote about yourself and the card's world. Checked by code.

| Field | Who decides | What it is |
|---|---|---|
| name | model | "Forge-hand", "Torch singer", "Hedge-witch". Two to three words of our own. |
| line | model | One sentence: what kind of person this is in this world. |
| leans on | model picks, code checks | Two of the four stats. The stat points still add up to 6, each 0 to 4. |
| store | model names, code sizes | The hero's one pool of strength for abilities, named for the calling: *heat*, *nerve*, *favours*, *breath*, *grit*. Code: 3, plus 1 for each level. Filled again when you rest. |
| fault | model | One flaw that can make trouble: "stubborn as iron", "cannot leave a sad story alone". The narrator can tempt it (section 5.2). |
| abilities | model, priced by code | Three to begin with: one trick, and two others (section 3). |

The four kinds of today (courier, sellsword, player, scholar) become the stock callings used when there is no model, and the seed for the model's own.

### 2.2 The store

One pool, under a different name for every calling, shown on the table as a few small things in a dish (embers for *heat*, chips for *nerve*, folded notes for *favours*). It is spent on abilities that ask for it, and on **pushing**: spend 1 before the die to make any try a step easier. Resting fills it. It is the one place where the player chooses how hard to try, so a big moment can be met with everything you have.

### 2.3 Levels

After each story (as now: the knack offer at the end becomes this): two new abilities are dealt face up, **written from what you did in that story**. If you talked your way past three stops and burned a granary, one card leans on talk and one on fire. You keep one. Every second level, one ability you have can be raised instead (it becomes cheaper to use, wider, or stronger), priced by the same budget.

You can carry any number of abilities, but only **five are laid out** at a time; the rest stay in your book. You can change which five at a rest. This keeps the board readable and makes choosing what to bring a decision.

---

## 3. Abilities: one skeleton, any world

### 3.1 The record

```
name        "Kitchen Charm"                         words, by the model
looks like  "you hum over the pot and it tastes      words, by the model
             of whatever you wish for an hour"
shape       trick | knack | gift | rite             from a fixed list
does        flourish | learn | ease | ...           verbs from a fixed list (3.3)
how much    1 | 2 | 3                                 checked by code
when        ways: [talk]  tags: [food, drink]       words to match, by the model
how often   always | once a stop | once a story     from a fixed list
costs       nothing | 1 of the store | a mark for    from a fixed list
            the narrator (5.1)
only if     "only food you have touched"             a limit in words, by the model
```

The model fills it in; code reads only the fixed fields to play it. The narrator is told the fixed fields in plain words and the words of the card for colour: "This ability lets the player roll two dice and keep the better one when they force something made of metal. Describe it as: 'the iron goes soft as wax under your hands'." So the model may dress a skill as anything, but it can only ever *do* what its verbs say. A teleport is, at the table, a *slip* (getting out of a failure) or an *open* (a sneaking way that was not there): the words say teleport, the rules say slip.

### 3.2 The four shapes

| Shape | Plainly | Example |
|---|---|---|
| **Trick** | Always works, needs no die, small, and never solves the problem on its own. Free. Every hero starts with one. | Make food taste and smell of anything. Warm metal by touch. A room goes quiet when you start to sing. |
| **Knack** | Always there when it applies. A small, sure help. | A step easier talking to anyone in uniform. Know one true thing about any lock you look at. |
| **Gift** | Something stronger, paid for from the store. | Spend 1 *heat*: roll two dice when you force something made of metal, keep the better. |
| **Rite** | Once a story, a big thing. | Once a story: a stop's hardest way becomes easy, because you call in the one favour you were saving. |

The trick is the answer to "the stupid spell". It is free and always works because it does nothing in the rules **on its own**. Its worth is what you think of. Use it cleverly towards the goal (sour the guards' stew so they leave the gate) and the reader can let it leave a mark (section 4) that makes the next try easier. A cosmetic power becomes a real one exactly as far as the player is clever with it, which is how it works at a real table.

### 3.3 The verbs (what code knows how to play)

| Verb | Plainly | Price |
|---|---|---|
| flourish | Happens in the story; no rule changes. Can earn a mark if used well. | 0 |
| learn | The narrator must answer one question truly, or turn over something hidden (a lever, a foe's weak spot, the next card). | 1 |
| ease | A try is a step easier. | 1 |
| mark | Put a mark on the scene with one free use (section 4). | 1 |
| sway | One person is a step warmer to you (a talk way is a step easier with them for the rest of the stop; a hostile one may stand aside). | 1 |
| mend | Get back 1 health, supplies or goodwill. | 1 |
| aid | A companion's help counts twice, or you take a cost meant for them. | 1 |
| ward | One cost that would be paid is not. | 2 |
| edge | Roll two dice and keep the better. | 2 |
| open | A way that is shut here, or was never offered, is open for one try. | 2 |
| strike | In a fight or contest, one more notch on a foe's dial (section 6). | 2 |
| guard | In a fight or contest, the next blow aimed at you lands one notch lighter. | 1 |
| slip | After a try fails, it works at a cost instead. | 3 |

**How much** multiplies the price (an *ease* of 2 is two steps). **How often** changes it: *always* costs double, *once a stop* is the plain price, paid from the store is the plain price, *once a story* is half. **When** changes it: one narrow situation takes 1 off, a whole way is plain, anything at all adds 2. A limit in words takes 1 off. Code adds it up (multiply first, then add and take off, then round up), and anything that is not a trick costs at least 1.

**The budget.** A hero's laid-out abilities may cost 6 at level 1, and 2 more each level. No single ability may cost more than 3 plus half the level. A trick always costs 0 and must be *flourish*. A record that comes back over budget is mended, in this order, until it fits: narrow *how often*, then add a store cost, then lower *how much*. If it still cannot fit, or a fixed field cannot be read, it is swapped for a stock ability with the same tags. All of this is code and is tested; no model is asked whether a skill is fair.

### 3.4 What the model is told, and what it may not do

The model is given: what you wrote about yourself, the calling so far, the card's world in a few lines, what you did in the last story (for level-ups), and the verbs with their prices. It answers in the record's shape (JSON) and nothing else. Code then also refuses: names longer than four words; names or wording from any existing game (a short list of well-known spell and feat names is kept as a check); a *when* that matches everything while claiming to be narrow (code counts what it matches); a *looks like* that claims a result ("you win the fight").

**What the world allows.** The card's world gives a few plain facts the forge must keep to: is there magic, how much, what kind of tools, what era. In a world with no magic the trick is a knack of the hands (sleight, a perfume, a voice); the verbs are the same.

---

## 4. Marks: how effort is paid

A **mark** is a short true fact about the scene written on a slip of paper and laid on the table where it belongs: "The guard is drunk." "The hall stinks of rotten eggs." "She owes you one." "The rope bridge is half cut."

- **Where they come from.**
  - The stop deals some at the start (today's levers, unchanged).
  - A trick or ability used cleverly towards the goal (the reader judges *towards the goal*; code checks that the line names the trick and something real in the scene).
  - A try that works better than hoped leaves one.
  - A line written with care leaves one (4.1).
- **Using one.** A line that leans on a mark spends a use: a step easier. A mark made by a good result has one use; the narrator's own levers keep theirs as now. Some marks stay for the whole story ("she owes you one") and can be leaned on at any later stop, once.
- **The narrator's marks.** When a try works at a cost or fails, the narrator may write a mark against you ("the watch knows your face"). It makes certain tries a step harder until something in the story clears it. This replaces the bare *trouble +1* with something you can see and do something about.

### 4.1 Effort, judged fairly

The reader already says which way a line goes. It would also say how *grounded* the line is:

| Grade | What it means | What it earns |
|---|---|---|
| plain | "I attack him." | The try as it is. |
| grounded | It uses something real: a thing in the scene, a mark, a person by name, one of your abilities in its own words. | On a success, it leaves a mark. In a fight, one more notch. |
| inspired | Grounded, *and* it ties two real things together or uses something from an earlier stop. | Also a step easier. |

The model grades; **code checks the grade against facts it holds**: every real thing the line is said to use must be on the table (a lever, a mark, a person on a card, an ability you have, a thing you carry, a stop you passed). A long line that names nothing real stays plain. So writing well pays, padding does not, and a model cannot be flattered into a bonus. At most one inspired grade a stop, so the best play is clever, not long.

---

## 5. The narrator's side

### 5.1 Dread

When a try works at a cost or fails, or an ability's price is "a mark for the narrator", the narrator takes a **dread**: a black stone into a bowl by its hand. It spends them on its own moves: a foe acts out of turn, a new trouble walks in, the deadline creeps forward, a mark against you is written. The bowl is in plain sight, so a full one is a warning. This turns every failure into a thing that will come back, and gives the shadowy narrator something to do with its hands.

### 5.2 Temptation

Once or twice a story, when your calling's **fault** fits the moment, the narrator offers it: "You could let your temper have this one. If you do, take back a *heat*." You write yes or no. Yes: the narrator decides how the fault makes things worse here (a way closes, a person turns cold, a mark against you), and your store gets 1 back. No: nothing. It pays you for playing your hero's flaws, which is the most roleplay a rule can buy.

### 5.3 The narrator's moves

Instead of only taking a cost, a failure lets the narrator do one of a short fixed list (code picks it from the stop and the result; the model tells it): *hurt* (a cost), *shut* (a way closes), *mark* (a mark against you), *show* (a danger is revealed and something will happen if you do not deal with it), *split* (a companion is cut off), *take* (something you carry is lost), *hurry* (the deadline moves). Code decides which; the narrator only says it.

### 5.4 As built

- **Dread.** A try that works at a cost, or fails, drops 1 black stone in a clay bowl by the narrator's right hand; a try that goes badly wrong drops 2. The bowl holds at most 9. The narrator says when it is one short, and when it is full enough.
- **When it is spent.** When you come to a place and the bowl holds 3 or more, the narrator takes 3 out in one reach and makes one move there, before you write.
- **The moves.** *trouble* (one more trouble here), *shut* (the easiest open way closes), *delay* (half an hour lost), *hurt* (1 health), *spoil* (a thing here becomes no use), *sour* (a mark you carry is lost), *cold* (1 goodwill). People more often turn cold and shut doors; obstacles more often delay and hurt; fights more often hurt. Picked by weight and seeded.
- **Never one that would finish you.** A way is shut only while two others stay open; hurt only at 3 health or more; a delay only if it leaves more than an hour before the deadline.
- **Temptation.** Up to twice a story, about one place in three, never at the last place and never when your store is full, the narrator offers your calling's fault ("I know you: you cannot resist an audience"). A model first checks that the fault fits the place. Yes gives 1 back to your store and makes one move here (shut, trouble, cold or delay), with no stones spent. No uses up the offer all the same.
- **The model's part.** It is told the move that was already decided and writes one or two sentences showing it at this place. If it says nothing, a plain line from code says it.
- **Not built from 5.1 to 5.3:** a price of "a mark for the narrator"; *show* and *split*; a foe acting out of turn (still not built with the contest board).

---

## 6. Contests: the board

Used for any back-and-forth: a fight, a chase, a duel of words in a court, out-drinking a smuggler, a dance-off at a ball, holding a door against the dead. Same rules every time; only the words change, written by the model.

### 6.1 What comes out on the table

When a contest starts, the narrator unrolls **a second cloth over the map**, dark leather, and sets on it:

- **On its side**: each foe as a standing piece with a **dial** beside it, a wooden ring with 4, 6 or 8 notches (how much it takes to beat them, from how hard the stop is). For a fight the dial is how close they are to falling or running; in an argument, to giving way; in a chase, to losing you. Any **danger** that is coming is a dial too ("the watch arrives", "the bridge gives way") that fills on its own as the rounds go by.
- **On your side**: your five laid-out abilities, face up, in a fan, so you can see everything you can do. Your store in its dish. Your health (or your nerve, in a contest of words) as a dial of your own.
- Marks go on the leather where they belong.

### 6.2 A round

1. **The narrator shows what is coming.** "The big one pulls back his fist for your face." (A foe's next act is always said before it happens, so you can answer it.)
2. **You write what you do.** Any line. You may use an ability by its words ("I let the iron go soft and twist his blade") or not use one at all. There are no buttons; the cards are there to look at, as a reminder.
3. **The reader reads it**: which way, which ability, which target, which marks, how grounded.
4. **The die.** As now: the balance is loaded and you throw.
5. **What happens.**
   - Works better than hoped: notches on the target's dial (2, or 3 if grounded), and the blow coming at you misses.
   - Works: notches on the dial (1, or 2 if grounded), and the blow is answered (you dodge, block or talk it down).
   - Works at a cost: notches as above, but the blow lands.
   - Fails: no notch, the blow lands, and the narrator takes a dread.
6. **Dangers tick.** Each round, every danger dial fills one notch.

A contest ends when every foe's dial is full (beaten, fled, given way), when yours is (you are *taken out*: captured, knocked down, shamed off the floor; the story goes on, but worse), or when **you give in**: you may stop at any round and say what you lose, the narrator agrees, and you come out with less than you wanted but more than if you had been taken out. Nobody dies unless the story is about that.

### 6.3 Why it is not a separate game

It is the same written line, the same reader, the same die, the same balance and the same costs as any stop. What it adds is something to see (dials that fill), something coming at you (the narrator's shown blow), and a reason to use the board (your abilities lying in front of you).

### 6.4 As built

- **Which places.** Every place that takes more than one good try is a contest: every fight, and the last place of every story. A fight at a person is a *war of words*; at an obstacle, a *struggle*.
- **The dials.** The foes' dials hold 2 notches for every good try the place takes (4 or 6), so a contest is never longer than the place was before. A model may name up to two foes; the second always gets 2 notches. Your own dial holds 4, or as many as all the foes together when that is more (6 at a long last place). The danger's dial holds 1 more than all the foes together and fills 1 a round; when it fills, it is here: one more trouble, a notch on your dial, and its dial is taken away.
- **A try.** Works better than hoped: 3 notches. Works, or works at a cost: 2. One more when the line uses what is there (grounded or better). Fails: none. Notches beyond what the target has left go on to the next foe. The blow coming at you misses on a try that works, lands 1 on a cost or a failure, 2 on a try that goes badly wrong. A line that names a foe goes for that foe; otherwise for the one with the most left.
- **Ways stay open.** A failed way is not shut in a contest, only harder; dread comes as it does anywhere.
- **Taken out.** When your dial fills, or your health runs out: at an ordinary place you come to 2 hours later, beyond it, a supply short, with nothing from it, and word goes ahead (the next place is a step harder). At the last place it is the end of the story.
- **Giving in.** Write that you give in. At an ordinary place you come out whole half an hour later, beyond it, with nothing from it. At the last place it loses the story.
- **The table.** The narrator pushes the roll of leather across the map with one hand, sets down a turned wooden dial for each foe with a small dark piece behind it, a red-stained one for the danger, and a pale one in front of you; a paper slip by each says whose it is. Each notch is a red peg it drops into a hole. A beaten foe's piece is laid on its side. When it is over the dials are taken away and the leather rolled up.
- **The model's part.** It names the foes and the danger, says what is coming before each try, and tells the round, keeping to what code decided. Code decides every number.
- **Not built from 6.1 to 6.2:** your abilities in a fan and your store in its dish on the leather; marks laid on the leather; a foe acting out of turn; giving in by saying what you lose (the loss is fixed: nothing from the place).

---

## 7. More than one kind of throw

All with the same die and the same balance, so nothing new has to be learned:

| Throw | When | How |
|---|---|---|
| a try | You go about something. | As now. |
| two dice, keep the better | An *edge* ability, or a mark that is worth it. | Two dice in the box; the better one counts. |
| two dice, keep the worse | A mark against you that fits. | Two dice; the worse one counts. |
| a save | Something comes at you and you did not answer it: a trap, a poison, a blow in a contest you did not see coming. | The die plus the right stat, to keep the cost off. |
| a push | You spend from your store before throwing. | A step easier. |
| the narrator's die | Pure luck, no stat: "is there a boat at the jetty?" | Thrown by the narrator, in its own pan: high yes, low no. |

### 7.1 As built

- **A mark against you.** A new move of the narrator's, *the slip* ("brand" in code): it writes a thing that has turned against one way still open at the place ("they are watching for you" against slipping by, "word of you has gone ahead" against talking, "they are ready for you" against force, "they know how badly you need this" against paying) and lays the slip on its side of the table. Your next try by that way, at that place or a later one, throws two dice and keeps the worse; then the slip is taken back. At most two at once, never two against the same way. It comes from dread, like the other moves, and from giving in to your fault. An *edge* and a slip on the same try cancel: one die, and the slip is still used up.
- **Saves.** At 12 or more on the die plus your better fitting stat; a 20 always keeps it off, a 1 never does. Two things call for one. When the narrator's move is to *hurt* you, you throw with Brawn or Wits to keep it off (kept off, no health is lost). When the danger in a contest arrives, you throw to keep its notch off your dial: Brawn or Wits in a fight, Charm or Wits in a war of words, Wits or Brawn in a struggle. The danger still makes every way a step harder. You throw it yourself, with the die from the box, after the narrator says what comes at you.
- **The narrator's die.** A pale bone die in a small wooden tray on its side, left of the deck. When you ask whether something is there or is so, and nothing at the place already says, the narrator picks it up and throws it in the tray: 11 or more is yes (one throw in two). A yes is a fact at that place, a card on your side, that makes one try a step easier once; a no is only a no. Once a place, so asking again cannot fish for a yes. Whether a question is one for luck is read by the Decision model when there is one (it must name the fact and the way it would help), else by the rules ("is there", "are there", "could there be", and the like). Asking takes the same quarter of an hour as any question.
- **The table.** The slips are folded once and stood up like little tents, in dark red ink, between the way blocks and the bowl of dread, so they can be read from your chair. The narrator's hand lays each one down, and takes it back when it is used.
- **Not built from the table above:** a mark that is worth two dice keeping the better (an *edge* ability is the only way to it); saves against traps and poisons outside the narrator's moves (a place's own dangers are still a try of yours).

---

## 8. Where it lives in code

| File | What |
|---|---|
| `src/engine/abilities.ts` | The record, the verbs, pricing, the budget, mending, the stock. Pure, seeded, tested. |
| `src/engine/marks.ts` | Marks, their uses, where they lie. Today's levers become marks. |
| `src/engine/contest.ts` | Dials, rounds, the narrator's shown blow, giving in, being taken out. |
| `src/engine/dread.ts` | Dread, the narrator's moves, temptation. |
| `src/game/forge.ts` | The model jobs: the calling, the starting abilities, level-up cards, foes for a contest. Each asks for JSON, is cleaned and priced by code, and falls back to stock. |
| `src/meaning/read.ts`, `src/game/prompts.ts`, `src/game/decisions.ts` | The reader learns to name an ability, marks and the grade. |
| `src/room/board.ts` | The leather, the dials, the fan of ability cards, the dish, the slips. `room.ts` only mounts it. |

Today's knacks map exactly onto the skeleton (a knack, *ease*, one way, once a stop), so nothing in a kept hero is lost.

---

## 9. The same skeleton, two tables

Made-up cards and heroes, to show what the model would write and what code would price.

**A fairy-tale village card. You wrote: "Bram, a blacksmith from the hill farms, slow to anger and slower to forgive."**

- Calling: *Forge-hand*, leans on brawn and wits. Store: *heat* (3). Fault: "stubborn as iron".
- Trick, *Hot Hands*: warm any metal or food you hold by touch. Flourish, always. Price 0.
- Knack, *Know the Make*: when you look over a weapon, lock or tool, learn one true thing about it or who made it. Learn 1, once a stop, narrow (metal things) −1: 0, so it costs the least, 1.
- Gift, *Strike While Hot*: spend 1 heat; when you force anything made of metal, roll two dice and keep the better. Edge 2, from the store, narrow −1. Price 1.
- Total 2 of 6: the forge would be asked to make the gift stronger or add a third.

**A noir city card. You wrote: "Vera. I sing at the Blue Lantern and I know everyone's business."**

- Calling: *Torch Singer*, leans on charm and cunning. Store: *nerve* (3). Fault: "cannot leave a sad story alone".
- Trick, *Hush*: when you start to sing, the room goes quiet and looks at you. Flourish. Price 0.
- Knack, *Heard It All*: in a crowd, you know when someone lies to you. Learn 1, always ×2, narrow −1. Price 1.
- Gift, *Last Call*: spend 1 nerve; one person is a step warmer to you. Sway 1, from the store, whole way. Price 1.
- Rite, *The Song*: once a story, a whole room does what you sing it to: one stop's talk way becomes easy. Ease 3, once a story ×½, needs a stage −1. Price 1.

**The trick at work.** A hedge-witch's *Kitchen Charm* (food tastes of anything) at a guarded gate. You write: "I go round to the cook-fire and charm their stew to taste of the river, so they spend the next hour at the latrine pit." The reader: grounded (the guards and their cook-fire are on the stop's card), used towards the goal. A mark goes down: *the guards are at the latrine pit*, one use. Your next line, "I slip through the gate while they're gone", leans on it: a step easier. No die was thrown for the trick, and it got you past the gate.

**A contest.** A tavern brawl. The narrator's side: *the big drover* (dial of 6), *his two mates* (4), and a danger, *the watch is coming* (4, one notch a round). Your side: your five cards, your health dial, two embers of heat. Round one: "He pulls back his fist for your face." You write: "I catch his wrist with my hot hand and squeeze till he lets go of the bottle." Grounded (your trick, his bottle on the card), a force try with your gift's two dice. It works: two notches on the drover, his punch is answered. The watch's dial ticks to 1.

---

## 10. What I would like you to decide

1. **The core.** Code-owned verbs with model-written words, checked by a point budget (sections 0, 3).
2. **Marks** as the way effort and setting things up are paid, with code checking what a line really uses (section 4).
3. **Dread and temptation** for the narrator: failures come back, and your hero's fault pays you when you let it (section 5).
4. **The contest board** for fights and every other back-and-forth, with nobody dying unless the story is about it (section 6).
5. **The order to build it** (my proposal): abilities and the forge first, with tricks and marks, so every stop gets better at once; then dread and the narrator's moves; then the contest board, which needs the rest.
