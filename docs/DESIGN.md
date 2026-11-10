# Tallow: design document

"Tallow" is a working title. The folder name and the extension id (`tallow`) are placeholders until a real name is picked.

Tallow is a tabletop roleplaying game for Lumiverse, played in one 3D room. You sit at a table. Across from you sits the narrator, a figure you only ever see as a shadow. A map lies on the table between you, with small pieces on it: yours, your companions', and the ones the narrator moves. There are no themes or skins. The room is the game.

This document states what is decided. Open questions are listed at the end and nowhere else.

Words used here, in plain terms:

- **Check**: a moment where the game rolls a die to see if something risky works.
- **Stat**: a number on your character sheet that says how good you are at one kind of thing. It is added to the die.
- **Die**: one twenty-sided die. Higher is better.
- **Stop**: one marked place on the map where something stands in your way.
- **Way**: one of the four ways past a stop: talk, sneak, force or pay.
- **Try**: one go at getting past, by one way. Each try is one throw of the die.
- **Card**: something the narrator lays on the table: a stop on the road, a person with you, a thing you won. Never a move you play (section 1.7).
- **Trope**: a familiar kind of story (a rescue, a heist, a courtship) used as the skeleton of an adventure.

---

## 1. The gameplay loop

The loop was agreed before anything was built. Every feature has to serve it.

### 1.1 One moment

1. The narrator sets a situation at a place on the map.
2. You write what your character does, in your own words.
3. The narrator names the check: which stat it tests and how hard it is.
4. One die rolls on the table.
5. The result changes the situation, and a piece moves.

Two rules hold in every moment:

- **A failed roll changes the situation.** It is never "nothing happens, try again". Failing costs something, closes a way through, or makes the trouble worse.
- **How you try matters.** The approach you choose changes the odds and changes what it costs. Talking, sneaking, forcing and paying are different bets.

### 1.2 One adventure (30 to 60 minutes)

- An adventure is one job with a goal.
- The map shows six to ten stops between you and the goal.
- At each stop a person, an obstacle or a fight stands in the way.
- You choose how to get past it: talk, sneak, force, or spend something.
- Getting past costs health, supplies, time or goodwill. Costs carry forward to the next stop.
- Resting heals you, but it costs daylight and lets the trouble ahead grow.
- The last stop is the climax.

### 1.3 The long game

- Finishing an adventure pays experience and loot.
- Levelling up gives a new skill or perk, chosen from a bounded list. Nothing goes outside fixed limits.

### 1.4 Where the decisions are

1. How to get past each stop.
2. Which path to take at a fork. On the table this is two cards the narrator fans out for you to choose between (section 1.7).
3. Whether to press on or rest.
4. What to become at level-up.

If a feature does not feed one of these four decisions or show their results, it does not belong.

### 1.5 The rules of one moment

Built at milestone 2 (`src/engine/moment.ts`) and played in the preview at one made-up stop. The stats and their names are a first proposal (open question 2).

- **Four stats**, each a number from 0 to 4 that is added to the die:
  - *Brawn*: strength and toughness.
  - *Cunning*: quiet feet, quick hands and a straight face.
  - *Charm*: warmth, nerve and a way with people.
  - *Wits*: knowing things, noticing things and doing sums.
- **Four ways through**, each a different bet:

  | Way | Usually tests | Can also test, if the line plainly goes about it that way | Puts at risk |
  |---|---|---|---|
  | Talk | Charm | Brawn (a threat), Cunning (a lie), Wits (an argument) | goodwill |
  | Sneak | Cunning | Wits (finding a way round) | time |
  | Force | Brawn | nothing else | health |
  | Pay | Wits | Charm (sweetening the deal) | supplies |

- **The stop says how hard each way is**: easy, fair, hard or very hard. The die plus the stat must reach 8, 11, 14 or 17. A stop can leave a way out: you cannot talk to a locked gate.
- **Using something that is there helps.** The situation names a few things (a ledger that will not add up, a rope walk under the bridge). A line that uses one makes its way one step easier, once.
- **What the die can say**:
  - A 20 always works, and works better than hoped.
  - Reaching the number works.
  - Falling short by 3 or less works, at a cost.
  - Falling short by more fails.
  - A 1 always fails, and fails badly.
- **What it costs**, in whatever the way puts at risk:

  | Result | Talk, sneak or force | Pay |
  |---|---|---|
  | Better than hoped | nothing, and you gain 1 goodwill | 1 less than the price, and you gain 1 goodwill |
  | Works | nothing | the price |
  | Works at a cost | 1 | the price and 1 more |
  | Fails | 1 | 1 |
  | Fails badly | 2 | 2 |

  For sneaking, 1 is an hour. Every try also takes half an hour, whatever comes of it.
- **A failure changes the situation.** The way that failed is closed at this stop, and every way left is one step harder. When no way is left you are turned back and must take another road. At a stop that takes more than one good try (a fight, the last stop), a way that fails stays open: every miss only makes everything there a step harder, so a single bad throw cannot lock you out of the climax. The clock is what runs out there, and the narrator says how many half-hour tries are left before the deadline when you arrive.
- **Goodwill at nothing.** With no goodwill left, talking is still open but a step harder: nobody much wants to hear you out. (It used to shut talking altogether; the live tests showed one bad throw at the first stop could then shut a talker's best way for the whole adventure.)
- **Things you keep.** A thing you won and kept is used up only by a try it helped that works. One that failed you, you still have.
- **The chances are weighed, and they are the real ones.** Before the die is touched the narrator loads a balance on the table (section 1.6). The code counts, face by face, how many throws out of 100 work, work at a cost, and fail; the balance leans by that count. No number of chances is written anywhere.
- **Reading the line.** A reader says which way the line is, which stat it leans on and which thing it uses. It never says whether the line works, and a line that claims its own result is still only an attempt. A model is asked with a fixed question and its answer is cleaned (`src/meaning/read.ts`); with no model, a list of plain words does the reading. The narrator says aloud how it read the line. If the reading is wrong, the player writes again, plainer, instead of taking a die; nothing has been rolled and it changes no number.
- **The pieces.** The narrator's piece stands on whatever is in your way; yours stands on the last stop you got past. When you get past, the narrator carries its piece to the next stop ahead and yours steps onto the one you cleared. When a try fails, the narrator lifts its piece and sets it down again where it stood. When you are turned back, it carries its piece to the other road. The room's clock moves on by the time the try took, so the light changes and, late enough, the candles come out. The pieces wait until you have sat back from reading the die.
- **What the narrator is told.** Each result also makes a short note for the model that tells the story: what was tried, what must now be true, and what it cost. The player never sees it. The preview has no model, so the narrator says fixed lines.

### 1.6 Playing it at the table

Decided after milestone 2 was first shown: **nothing is on the screen but the room.** No panel, no buttons, no numbers beside the picture. Everything the game needs from you or tells you is a thing on the table or something the narrator does. Built in `src/room/desk.ts`, `counters.ts`, `paper.ts`, `voice.ts` and `drawnhands.ts`; the preview's game is `preview/play.ts`.

- **Your turn is a page.** A small ring-bound notebook lies by your left hand with a pencil on it. Start typing (or click it) and you lean in over it; your hand takes up the pencil and writes what you type, letter by letter. Enter tears the page off and holds it out, and the narrator takes it. The game works the turn out while the page is in the air, so the handing-over covers the wait. Escape, or a click anywhere else, shuts the notebook with your words still on the pad.
- **The narrator speaks.** Its words come up at the foot of the picture a word at a time, over a patch of moving shadow. A click, Space or Enter brings the rest at once. Nothing it says stays on the screen.
- **The balance is the odds.** A two-pan balance stands at the left of the table. For each check the narrator sets dark iron weights in its own pan: more for a harder try. Small pale weights hop into yours: one for each point of the stat the try leans on, and a brass one if you are using something in the scene. Then the beam leans by the real chances: your pan sinking means the try is more likely to work than not (`src/engine/weigh.ts`). While it is loaded you turn your head to it, near enough to count the weights; when the beam has come to rest you look back to the table. A chance only a little off even is drawn tipped further than its share, or it could not be seen; the side that sinks is never wrong.
- **What you carry is on the table.** Red stones for health, coins for supplies, pale seals for goodwill, in three small piles in front of you. The narrator takes what you lose by hand and gives what you gain out of its sleeve. When you pay, your coins are slid across to its side first.
- **The die.** Taking a die is a click on the dice box, or Enter. The throw is as before (section 8).
- **A turn comes back as a page.** After the throw the narrator writes under your line, on the same page: what the try was, what the die showed, what happened and what it cost. It hands the page back and you hold it up to read. A click or Enter sets it down on a pile by your right hand. The pile is the record of the game: click it (or press the up arrow) to pick the top page up again, and the arrow keys turn to earlier pages.
- **For someone who cannot see the room**, the narrator's words and the page in your hands are also given to screen readers, and the notebook is a real text field that happens to be invisible.

### 1.7 Cards

Decided: **cards are what the narrator lays on the table. They are never a hand of moves you play.** Your move is always a line you write (section 2, "No menus on your turn"). A card tells you what is there; it never does the thinking for you. No new rule comes with them: they show the adventure of section 1.2 and the decisions of section 1.4.

- **The road.** At the start of an adventure the narrator deals its stops face down along the map. You can count how many are left. You cannot see what they are.
- **The stop.** When you arrive, the narrator turns that card over. The card is the situation: a person, an obstacle or a fight.
- **Your side.** The companions with you, and anyone you are courting, lie face up by you. Loot and the perks you gain at level-up are dealt to you and kept.
- **The fork.** Where the road splits, the narrator fans two face-down cards and you pick one. This is decision 2 of section 1.4.
- **A level-up.** Every third stop you get past, the narrator deals two knacks face up; you keep one by touching it or writing which (section 6).
- **The art** is described in section 8.1.

Built at milestone 3 (`src/room/tablecards.ts`, `src/room/cardart.ts`, the kinds in `src/engine/cards.ts`).

---

## 2. Principles

- **Models read and narrate. Code decides every number.** A model may read a card, read what you wrote, and tell the story. Every roll, cost and outcome comes from code and seeded dice (dice whose results can be replayed from a seed), so nothing a model says can change a roll.
- **The chat stays the story.** Replies in the scene are written by the chat's own model and preset. What the game decided is added as a note at the end of the prompt, so the reply tells the decided outcome in the chat's own voice. Not built yet: at milestone 4 a sitting at the table uses the user's model (through Lumiverse's quiet generation) to build the adventure, read lines and tell results, but writes nothing into the chat (open question 10).
- **The game explains itself.** The player may never have played a tabletop game. The narrator says what is being asked and what the things on the table mean, in plain words.
- **No screen furniture.** Nothing is drawn over the room but the narrator's words. If the game needs to show or ask something, it is a thing on the table or something the narrator does (section 1.6).
- **No menus on your turn: you write.** A menu of moves lets you skip the part that is fun: thinking of something clever and saying it in your own words. So nothing on your turn is picked from a list, and no card is a move. The four ways (talk, sneak, force, pay) are how the game reads your line; they are not buttons. The notebook is the only way a turn is put in.
- **The room hides every wait.** A 3D room and a narrator across the table can keep you watching while a model is working, so the game never shows a spinner or the word "thinking". Every wait is something that happens at the table, built in three parts: a start, a middle that can go on for any length of time, and an end that plays the moment the answer arrives. A wait of half a second and a wait of thirty seconds must both look meant.
  - *Reading your line*: the narrator takes the torn page, holds it to the candle and reads, its eyes moving along it.
  - *Naming the check*: it sets the weights on the balance one at a time.
  - *Writing the reply*: it writes on the page, or the shadow gathers before it speaks; words that arrive a few at a time are shown as they come.
  - *A slow reply*: it trims a wick, drums its fingers, looks out at the weather.
  - *Building an adventure*: it shuffles and deals the road face down.
  - *Making a picture*: that card stays face down until its art is ready. Art for the stops ahead is made during the stop you are on.

  The work behind a wait starts as early as it can: on Enter, before the page has left your hand; the next stop's card during this stop. And as with the die, whose number is decided before it is thrown, a result is always decided before the room shows it.

---

## 3. Modes

### 3.1 Trope mode (the game)

You pick a trope: heist, rescue, mystery, escort, hunt, siege, survive the night, courtship, and so on. The game builds a custom adventure for the selected card from that trope's skeleton: the goal, the kinds of stops, and the climax. All of that is fixed up front. The narrator is free only in the telling.

Only tropes the card can support are offered. A card with one person in one room is not offered a siege.

### 3.2 Free form (second priority)

The room, the dice and the map follow a free roleplay. There is no goal. When something risky happens, the game calls a check.

---

## 4. The map

Two levels only, both lying on the table.

- **Region sheet**: the adventure's stops and the paths between them.
- **Place sheet**: one location with three to six spots in it.

The stops of the region sheet are dealt onto it as cards, face down until you reach them (section 1.7). Entering a building means the narrator slides a place sheet over the region map and the camera leans in. A card that takes place in a single room skips the region sheet.

Pieces show which stop or spot you are in. There is no square-by-square movement and no grid tactics.

Built so far: the region sheet only, drawn for each adventure (its title, stops and roads) once the adventure is built. Place sheets are not built. A fight is, for now, a stop like any other that takes two good tries, each one that works settling one of the foes; it is played with the same written lines and the same die, not a separate turn-based engine (open question 5).

---

## 5. The party

- You always build one character of your own.
- You can go alone or recruit up to two companions from the selected card or its lorebook.
- Companions are not decoration. They cover checks you are weak at, and they have opinions that cost or earn you something.

Built: a companion makes one of your stats count one higher while they are with you, and likes one way through and hates another. When you get past a place by the way they like, word gets about and you gain a goodwill; by the way they hate, you lose one. The narrator says all this when they join. In a rescue built from a card, the card's own character walks with you from the start; one more companion can join on the road.

---

## 6. Building a character

One character, built up front: a class, stats, skills and perks. Every choice is made within fixed limits, so nothing gets too strong or too far-fetched. Skills are sized by a point budget in code, not by a model.

Built at milestone 4 (`src/engine/hero.ts`), with no menu: the narrator asks who you are, and you write it. A model (or, with none, a list of plain words) reads what you wrote into one of four kinds of person (a courier, a sellsword, a player, a scholar), with your name and a sentence of who you are. It may move your stat points to fit what you wrote, but the four stats always add up to 6, each 0 to 4: code checks it and keeps the kind's own spread if the model's does not add up.

- **Knacks** (perks). Each kind starts with one. A knack belongs to one way through: once at each stop, a try that goes that way and uses nothing in the scene is a step easier, as if it used a thing there. There are eight.
- **Levelling up.** Every third stop you get past, two knacks you do not have are dealt face up, for two different ways when there are two. You keep one.

---

## 7. Romance

- Romance is allowed.
- **Courtship** is a trope. Its stops are moments with one person and its obstacles are social. Failing changes something real (a rival gains ground, a door closes). It is never just a meter going up.
- A companion's bond can also turn romantic.
- Explicit scenes are an opt-in switch per chat, off by default. When on, they are written by the chat's own preset.
- Explicit scenes are never offered with anyone read as a child. The rule is copied from the sibling project (`src/engine/card/child.ts` there).
- A courtship is never offered for a card whose character is read as a child; that card is offered only the rescue. The rule reads the card's own words: an age under 18 (in figures or in words) means a child; an age of 18 or more, with none under it, means an adult whatever the back story says; with no age given, the singular words for a child or a baby do. Plural words ("children" in a list of dislikes, or of a city's people) are not about the character. Tried against eight of the user's own cards: the first version shut out three adult cards this way; this one shuts out none of them.
- The adventure builder is told to keep everything non-explicit and leave out anything sexual or hateful the card carries, whatever the trope. A courtship is told as a fairy tale would tell it.

---

## 8. The room has jobs

The room is not scenery. Each part of it tells you something about the game.

- **The light is the clock.** The game's time of day sets the light in the room: morning, noon, a golden hour near the end of the day, night by candle. Spending daylight is something you can see.
- **The candles are a second clock.** As the daylight goes, the narrator takes new candles out of its sleeve, sets them out and lights them. They burn down through the night, the wax running and pooling, and gutter out as stubs by morning. The cold stubs stand on the table all day. So at night, when the windows are dark, how much candle is left tells you how much night is left. On a day dark enough to need them, the candles are set out early.
- **Weather shows physically.** Whatever the weather is in the story, you can see and feel it at the table.
  - *Snow*: the light turns cold and grey, snow falls past the windows and banks on the sills, the glass frosts, your breath fogs and the view shivers.
  - *Rain*: a grey day, streaks of rain outside, drops running down the glass.
  - *Storm*: the day goes nearly as dark as night, rain is driven sideways, lightning lights the whole room through the windows for an instant, and the thunder that follows shakes the table.
  - *Fog*: the trees outside fade to nothing, the room goes pale and flat, and wisps of fog creep in low near the windows.
  - *Wind*: leaves fly past the windows, the candle flames lean and flutter, and a corner of the map lifts.

  The room slides from one kind of weather to the next; it never switches.
- **The narrator reacts.** The figure across the table watches the die, follows the pieces, and answers what you do. Its arms are jointed, so it can pinch a page, grasp a weight, carry a thing across the table, strike a light, and make small gestures of its own (drum its fingers, tap, steeple its hands, flick, slam the table).
- **The narrator's hands fill the waits.** Whatever the game is waiting for, the narrator is doing something at the table for exactly that long (section 2, "The room hides every wait"). Built so far: the page is handed across while your line is read, the weights go on one at a time, and the narrator writes on the page before it hands it back. Not built yet: a middle that can last any length of time, the idle gestures used for slow replies, words shown as they arrive, and the dealing of the road.
- **The cards are what the narrator lays down.** The road ahead, dealt face down along the map; the stop you are at, turned over; the people with you and the things you have won, face up by you; two cards fanned at a fork (section 1.7). Built at milestone 3.
- **The map is where you are.** You can lean in over it to see the stops and your piece, and sit back again.
- **The die is the check.** You look down, take a die from the box by your hand, shake it by moving the pointer, and let go with a click. It rolls on the table where you can see it; your eyes follow it, you lean in over it long enough to read the number, and you sit back. The number it shows is the number the code rolled before you let go; the throw only shows it.
- **The notebook is your turn, and the pages are the record.** You write on it, hand the page over, get it back written on, and keep it (section 1.6).
- **The balance is the odds, and the counters are what you carry.** Both are loaded and changed by the narrator's own hands (section 1.6).
- **The pieces are who is where.** Yours is a small carved walker in a hat, with a staff and a pack, in old ivory with a blue band; a companion's is the same, smaller, with a green band. The narrator's is a small copy of itself in black glass with a red band: a robed figure under a hood, with two small lights where the eyes would be. The narrator moves its own piece by hand: it reaches out, lifts the piece by its head, carries it and sets it down.

### 8.1 The look

- **Dark, close and a little wrong.** A cabin at a table, lit by two windows and a few candles. Most of the room is lost in shadow. The picture is drawn slightly coarse, with grain, a heavy darkening at the edges, and a glow round anything bright.
- **The narrator is a shape, not a face.** A hooded figure in cloth that light barely touches, with long gaunt hands resting where the candles can find them.
- **Drawn things are flat.** The narrator's eyes are a 2D drawing in the dark of the hood: pale shapes with small dark pupils, redrawn a few times a second so they move like an animated drawing. They follow the die and the pieces, narrow, widen and blink, sometimes one at a time. Your own hand is drawn the same way: a right hand seen palm up, every part with its own dark outline (sleeve, wrist, palm, four fingers, thumb). Closed on the die, the fingers curl over it and show their nails; let go, the hand flings open and shows its palm. The hand that writes is drawn too, seen from above with the first finger and thumb closed on the pencil; the pencil itself is a solid thing, drawn between the back of the hand and the finger and thumb, as the die sits in the other hand. A page you hold up is held by two drawn thumbs at its lower corners. A drawn hand is the size a hand would be at the distance it has reached to, with its sleeve running off the bottom of the picture. Everything else in the room is solid.
- **The cards are our own.** A tarot-style set: a framed figure, a title banner, flat inks and gold. About 22 kinds of card (the toll-keeper, the locked door, the ambush, and so on) are drawn once and used by every adventure. Only people who come from the character card get a portrait made for them, set in the same frame, with its own picture prompt written for that style. No existing deck's art or card names are copied.
- **Sculpted where it matters.** The room, the map, the die and the small props are built in code. The narrator's mantle (real cloth dropped over a seated figure and left to fall), its hood (thick cloth with a brim, round a hollow that takes no light), its hands and jointed arms, and the pieces on the map are made by Blender scripts kept in `models/`, so they can be rebuilt. If a model file is missing the room uses a plainer shape built in code.
- **It runs on what you have.** The room watches how long its frames take. On a slow machine it draws less, a step at a time: a coarser picture first, then no candle shadows, then smaller sun shadows, then no dust in the air. It keeps its own pace whatever the frame rate, so a throw takes as long as it should. On an upright phone you sit further back, so the candles at both ends of the table stay in the picture.

---

## 9. Build order

Each milestone ends with something the user can look at.

1. **The room, no rules.** A local preview page with the table, the narrator, a map, two pieces, a die, a clock control and a weather control. Built.
2. **One moment of the loop**, in the preview with mock data, with unit tests for the rules. Built (section 1.5): one made-up stop, no model, and a script that plays it as text. First shown with a page of text beside the room; rebuilt to be played at the table with nothing else on the screen (section 1.6).
3. **One adventure in trope mode** (a rescue and a courtship), for a made-up test card. Before anything is built in the room: a script that plays the whole adventure using only what the table would say and show, and prints it as text, read as a new player would. Then, at the table:
   - the road dealt face down along the map, and each stop's card turned over on arrival (section 1.7);
   - a fork as two fanned cards to choose between;
   - companions, anyone being courted, loot and perks as cards on your side;
   - the card set of section 8.1, with made-up people standing in for a character card's;
   - every wait given its start, its middle of any length and its end (section 2), with a stand-in for the model that can be made slow on purpose, so that the long waits can be looked at;
   - the rules that belong to a whole adventure: resting, running out (open question 9), and fights (open question 5).

   Every turn is still a line written in the notebook. Nothing in this milestone adds a list to pick from. Built: the rescue and the courtship (`src/content/adventures.ts`), the director that plays a whole adventure at any table (`src/game/director.ts`), the room's table (`src/game/roomtable.ts`), and two scripts: `bun run adventure` plays it as text, `bun run table` plays it in the room in a real browser. Fights are the simple kind of section 4.
4. **The character builder, companions from the card, and running inside Lumiverse** against a real card. Built:
   - the sitting (`src/game/session.ts`): the narrator greets you by the card's character, asks which story (only those the card can support), starts building the adventure at once, and asks who you are while it builds;
   - the builder (`src/game/build.ts`): the trope's made-up adventure is the skeleton, and every id, number, road and kind of card in it is kept; the model writes only the words, for the card's world, and code checks each field, keeping the skeleton's words for any that do not check. If fewer than 60% of them check, twice, the made-up adventure is played with the card's character in their part;
   - the hero (section 6), the model's three jobs with their checks and stand-ins (`src/game/prompts.ts`, `src/game/modelminds.ts`), and the Spindle extension (`src/frontend.ts`, `src/backend.ts`, `spindle.json`; built into `dist/` by `bun run build`);
   - a live-test stepper (`bun run live`) that plays a sitting against a real card one model answer at a time, so a person or another model can answer as the model and as the player. Eight of the user's cards were played through it; what they found is fixed or listed in section 11.

---

## 10. Code carried over from the sibling project

Copied, not imported, so the two projects can change separately.

| Piece | Status |
|---|---|
| Seeded dice (`src/engine/dice.ts`) | copied |
| Turn-based battle engine and what it needs | not copied: fights are stops that take two good tries (section 4) |
| Skill point budget | written anew, smaller (`src/engine/hero.ts`) |
| Card reader | written anew for what this game reads (`src/game/card.ts`) |
| Model roles and fallbacks | written anew: four roles, each checked, each with a stand-in (`src/game/prompts.ts`, `src/game/modelminds.ts`) |
| Story-beat reading of a written line | copied and reshaped for the four ways (`src/meaning/read.ts`) |
| Prompt-suffix helper | not needed yet: nothing is written into the chat (open question 10) |
| Rule for who is read as a child | copied (`src/engine/card/child.ts`), then narrowed (section 7) |
| The overlay a room is shown in | copied from the sibling chess extension and renamed (`src/frontend/overlay.ts`) |

---

## 11. Open questions

1. **The name.** "Tallow" is a placeholder.
2. **Stats.** Built with four as a first proposal: Brawn, Cunning, Charm and Wits, each 0 to 4 (section 1.5). Whether these are the right four, and the right names, is not decided.
3. **How costs are shown at the table.** Decided: physical counters that the narrator gives and takes (section 1.6). Still open: what the counters look like (red stones, coins and pale seals are a first proposal), and whether your stats should have a place on the table too. For now your stats are written on the first page you are handed and show as the pale weights in your pan.
4. **Who moves your piece.** The narrator moves its own piece by hand. Yours still hops by itself; whether your drawn hand should move it is not decided. Whether the narrator's piece should always stand for what is in your way (as in section 1.5) is also not confirmed.
5. **Fights in the room.** For now a fight is a stop that takes two good tries (section 4). Whether it should become a turn-based fight of its own, and how that would look on the table (a place sheet with pieces, or something else), is not decided.
6. **Models.** The narrator's mantle, hood and hands and the pieces are sculpted by script; the rest is built in code. Whether to use any downloaded asset packs (for the books, the candlestick, the dice box) is not decided.
7. **Which weather the story uses.** Snow, rain, storm, fog and wind are built. Which of them an adventure calls for, and whether heat is needed, is not decided.
8. **Free form.** Second priority; not designed beyond section 3.2.
9. **Running out.** Built as a first proposal: at no health you go down and come to two hours later with 1; at no supplies paying is closed where it costs anything; at no goodwill talking is a step harder (section 1.5). Turned back at a stop that is not the last, you go the long way round it, for hours and a supply. Whether these are the right rules is for the user to judge in play.
10. **Where the words go.** Decided for the table: in the room, spoken by the narrator and written on the pages (section 1.6). How this meets the Lumiverse chat is still not decided: whether a page is also a chat message, whether the adventure's end is written into the chat as a note for the chat's own model, and which of the two the story's model writes into. At milestone 4 a sitting writes nothing into the chat.
11. **How exact the balance should be.** It leans by the real chances but shows no number. Whether a player wants the count as well (said by the narrator, or written on the page) is not decided.
12. **Ways that are closed.** A way that has failed is closed at that stop. The narrator says so and it is written on the turn's page, but nothing standing on the table shows which ways are still open.
13. **The table on an upright phone.** The room sits small in the middle of a tall screen, and the balance and the notebook stand near the edges of the picture. Not designed yet.
14. **What you know at a fork.** The two cards are face down, and a choice between two things you know nothing about is not a decision. What you are told about each before you pick (a line from the narrator, the kind of stop shown on the card's back, what a companion thinks) is not decided.
15. **Where the cards lie.** The near edge of the table already holds the notebook, the counters, the pile of pages and the dice box, and the balance stands at the left. Where the cards on your side go, and how a stop's card lies with the pieces on the map, is not designed.
16. **The 22 kinds of card.** Which kinds, and what each is called, is not decided. They must cover the stops of every trope in section 3.1.
17. **Which waits are long.** The reader of your line, the story's model and the picture maker each take a different time on a real machine. Which waits need a middle that can last, and which are always short, is to be measured at milestone 4. Not measured yet: the live tests answered by hand, and nothing has been played inside Lumiverse with a real model.
18. **How hard it should be.** In the live tests, seven of eight players won, most of them easily at the early stops, and two found the last stop a wall (fixed in part: a failed way stays open there now). The text playthrough wins about 83% of the time with plain lines. The numbers (8, 11, 14, 17 to reach; one step for a thing used, a knack or a companion's point) are a first proposal, and whether the early stops should be harder is for the user to judge in play.
19. **A made-up skeleton for every card.** The builder moves the rescue's river road and the courtship's fair into the card's own world, keeping every stop's shape. For a card set somewhere very different (a modern school, a world with no roads), the shape still shows through: a ford, a toll, a festival. More skeletons per trope, chosen by the card's setting, would fit better.
20. **Questions to the narrator.** A line that asks something ("what does she think?") or does nothing ("I wait") gets the answer that it does not get you past, and a reminder of what does. Whether the narrator should answer questions about the scene, without it costing a try, is not decided.
