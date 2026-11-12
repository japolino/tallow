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
- **Trope**: a familiar kind of story (a rescue, a heist, a courtship). Tropes come in seven families; when you ask for one, the dice pick a story within it (section 3.1).

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

When an adventure ends, the table does not just stop:

1. The narrator says, in two or three sentences, what became of the people and the place: who was saved or lost, what the goal came to, told for the card's own world (the teller model; nothing is said when there is none).
2. A story won is rewarded: two knack cards are laid out and you touch the one to keep, and you keep up to two things still in your hands. They are on your side of the table at the start of the next story.
3. The narrator's hand gathers every card back into the deck: the road, your side, the rival.
4. "Another story?" You write what kind, or that the narrator should choose, or that you are done for tonight. Done, the narrator says goodnight and the room closes.

You stay who you are: the hero, their knacks and what they carry are kept for that chat and that card, with the stories already played, so the next one is a new one. Sitting down again, the narrator says you are back and does not ask who you are. Writing "someone new" when asked for a story makes a new hero. Nothing goes outside fixed limits: a knack comes from the bounded list, and no more than two things are carried.

### 1.4 Where the decisions are

1. How to get past each stop.
2. Which path to take at a fork. On the table this is two cards the narrator fans out for you to choose between (section 1.7).
3. Whether to press on or rest.
4. What to become at level-up.

If a feature does not feed one of these four decisions or show their results, it does not belong.

### 1.5 The rules of one moment

Built at milestone 2 (`src/engine/moment.ts`) and played in the preview at one made-up stop. The stats and their names were a first proposal, since decided (section 11, item 2).

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

- **The stop says how hard each way is**: easy, fair, hard or very hard. The die plus the stat must reach 9, 12, 15 or 18. A stop can leave a way out: you cannot talk to a locked gate.
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
- **The chat stays the story.** Replies in the scene are written by the chat's own model and preset. What the game decided is added as a note at the end of the prompt, so the reply tells the decided outcome in the chat's own voice. Not built yet: at milestone 4 a sitting at the table uses the user's model (through Lumiverse's quiet generation) to build the adventure, read lines and tell results, but writes nothing into the chat (section 11, item 10).
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

You pick a kind of story, or let the narrator choose. There are seven families, and 25 stories within them (`src/content/tropes.ts`):

| Family | Stories |
|---|---|
| A rescue | someone taken; a jailbreak; someone lost; a ransom, with takers who want paying |
| A heist | the vault; stealing back what was stolen; the swap; smuggling something through |
| A mystery | who did it; someone vanished; a haunting; a plot, with plotters |
| A journey | an escort; a message to carry; an escape, with hunters behind; a pilgrimage |
| A hunt | a beast; a bounty; an old score |
| A romance | a courtship; a forbidden love, with a watcher; a secret admirer; an old flame |
| A night to survive | the long night; a siege; a storm |

The dice pick a story within the family you asked for, preferring one you have not played; "you choose" picks a family other than the last one too. So asking for "a mystery" twice gives two different mysteries. Each story is a recipe, not a fixed map: how many stops (a range), the mix of people, obstacles and fights, which ways it leans to (a heist leans to sneaking, a romance to talking), its climax, whether a rival works against you, what may be found and who may join, its weathers, and how tight its clock is. Code lays out a new road from the recipe and the seed (`src/engine/road.ts`): the kinds of card at each stop, the forks, how hard each way is, the levers, the loot, the deadline. Every road is checked by code: it can be won, no card repeats, no more than two fights, at least one person. The builder then moves the whole road into the card's own world: its places, its people, its words (section 9). The narrator is free only in the telling.

The stories are our own short recipes for familiar plots; no list of tropes or its wording is copied. A romance is offered only to a card that can be courted.

### 3.2 Free form

No story and no goal: only the world, and whatever you write that you do in it. It is offered with the stories ("or no story at all"), and asked for in plain words ("free form", "no story, I just want to roam"). It is theatre of the mind: the narrator lays no map and stands up no pieces; the places are in its notebook, which you see by writing "notebook". The table holds the die, the scale, your counters, your abilities and the cards of who is with you (the card's own character, for a card that is a person).

What a line is, a model decides, not its words: whether it is something said or done, a try, going somewhere, a rest or a wait, a goal of your own or work at one, taking on something going on, or a word to the narrator (the notebook, stopping). The Decision model answers in about half a second, else the reader model; the word rules only play when there is no model. Most of what you write is simply answered, all of it: the narrator takes up what you say and do, at the length you wrote it, and may bring in the people and small things a place has, but never settles anything risky. It never leads you: the night goes where you take it. If the narrator gives no answer, even asked twice, it says so plainly, no time passes, and what you wrote is kept for its next answer. Only something that could go wrong calls for the die, and asking someone for what they could refuse counts ("I ask the bouncer to let me in"): the Decision model says, else the reader model, else the words, with the same scale, stats, prices and clock as a story; after the throw the place is as it was, so each risky thing is its own. Going somewhere takes half an hour, and a new place is told once and kept, with whatever else you did on arriving answered too. A goal of your own, work at it, and a wait are the world's, as in a story, and the narrator still answers the rest of the line; a level comes every three things that worked.

The night begins at a place written for the card's world, with a name the notebook keeps ("the Byte Bar on Ninth Street"); without a model, at a place the narrator names in the opening, if it names one. Two threads are going on in the world from the start, written for the card's world when there is a model (code checks each, and its stock makes up any that do not check), each on its own clock: one moves every six hours, the other every ten. They are never put to you: the narrator knows of them, as they now stand, brings one in only where it fits what you do, and if you go after someone or something in one, it is there to be found (talk to the woodsman outside the walls, and he answers); the notebook has them for whoever looks. Left alone, a thread takes a step each time, quietly, and at its last step it is over. Take one on ("I'll look into the missing people", "thread 2") and the narrator asks whether to play it out now; if so it is a story of its kind, built and played on its own road (the map comes out for it), and then you are back where you were, some hours on. Who you are, your goals and what they pay off are kept as you go, and a sitting left in free form is taken up where you were (`engine/free.ts`, `game/free.ts`).

### 3.3 A story of scenes, played with a hand of dice

When there is a model to write it, a story is no longer drawn from the 25 recipes. The builder writes the whole story for this card, this player and what they asked for: a title, a goal, a clock, and exactly three scenes that build (`src/game/scenewriter.ts`). Nothing is handed to it to fill in. A scene is not a gate with a way past it; it is a situation: who is here, what they are doing right now, what they want from you, and what happens if you do nothing. Each scene says what you are here to get done, what closes on you as it goes wrong, what happens to you if it closes altogether, two or three things really in the scene, and what getting through leaves you with. Code checks the story whole and gives it its ids, its difficulties and its clock (`checkSceneStory` in `src/engine/hand.ts`); a story that does not check is asked for once more, and then a road story from section 3.1 is played instead. Campaigns, and a table with no model, still play road stories.

The rules of a scene are few, and code owns all of them (`src/engine/hand.ts`):

- **Your dice are thrown before you choose.** Three d20 lie on a rack in front of you. Each thing you try spends one of them; when the last is spent, three more are thrown. The dice come from the story's seed, so a story left and taken up again has the same ones.
- **What a die comes to depends on what you spend it on.** A reader says what your line leans on (a stat), how much it risks (slight, real or grave), what is at stake (health, supplies, goodwill or hours) and what happens to you if it goes wrong. Code adds the stat to the die against the scene's difficulty: 9, 12, 15 or 18, the same targets as everywhere, one step (3) easier when the line uses a thing in the scene, an ability of yours, or something an earlier scene left you. So a 9 is a clean success at what you are good at and a failure at what you are not. A line that risks nothing (a question, a look, harmless talk) spends no die and takes no time.
- **The stake is said before you commit.** The narrator says what the try leans on, what it risks, what happens if it falls short, and what each die on the rack would come to. Then you touch a die, or write its number, or write something else and the try is left alone.
- **Two dials.** Getting through a scene takes 5 steps; it closes on you in 4. A slight risk that lands is 1 step, a real one 2, a grave one 3; a success at a cost is a step less and closes the scene by 1; a failure closes it by 1 (2 if grave) and costs you what was at stake. A natural 20 opens it a step; a natural 1 closes it one more. Whichever dial fills first ends the scene. The dials are the contest's own (`src/room/board.ts`).
- **No bonus for a clever line: a trade.** When the die you chose falls one band short, you may give something up to lift it a step, at code's price: a wound (1 health) or 2 supplies. Never for a 1 or a 20.
- **What a scene takes stays taken.** A scene that closes on you is not replayed. What it took is written down and stays true for the rest of the story; you come to four hours later, a health down, and half of what had closed on you follows you into the next scene. Only the last scene loses the story. Getting through a scene leaves you its boon, good once.
- **The clock.** A try takes half an hour, the way between scenes an hour, a rest three (it heals 2, eats a supply, and sweeps your dice up for new ones). The story has 12 hours.

Who decides what: the builder writes the story; the reader says what a line is (`sceneLine` in `src/game/modelminds.ts`), and its answer is checked against the table (a stat you have, a thing that is there, a die that is on the rack); code prices the try, offers the trade, moves the dials and the clock; the narrator tells each beat from a note of what must be true, and never settles a scene that is not over (`src/engine/tell-hand.ts`, `src/game/scenes.ts`). The word rules read a line only when no model answers.

The numbers were set by simulation (`bun run scripts/hand.ts`, the stock story in `src/content/scenes.ts`, 2000 stories a player): a player who weighs the dice wins about 95 in 100, a plain one 78, one whose lines are mostly read as slight risks 73, one who stakes everything every time 53, one who never risks more than a little 23 (the clock beats them), and one who spends the dice as they lie without looking 47. A plain player makes about nine tries a story.

With real models (`bun --env-file=.env.local scripts/play-real.ts`, a made-up card): the builder takes 27 to 63 seconds over a story, so it is given four minutes for its two tries. The first check of a story measured its phrases (a thing to use in at most 60 characters, a loss in 240) and threw away one real story in two for a phrase a few characters over, so the table fell back to a road story and the new loop was never seen. The check now refuses a story only for a part that is missing, a note's brackets left in, the wrong number of scenes, fewer than two things to use, or a part far past anything asked for; a title that must fit a card is cut back to whole words, a fourth thing is left out, and a picture not on the list is replaced. Four of four real stories then checked, and two whole sittings played with no fallback. A story that is not taken tells why (`fellBack`; the browser console in Lumiverse). The reader is told that a threat is one step of the scene going wrong, never the scene lost, after a real sitting in which the stake said was "he escapes" and the narrator told it so in a scene that then went on.

**What a try can win that stays won** (`src/engine/lasting.ts`, `src/engine/tell-lasting.ts`, `src/game/lastingwriter.ts`). A great roll used to win the scene and nothing else: talk a girl into coming along, a dragon into sparing you, a villain into saying she is good now, and the next scene had forgotten it. Now a try can be after something of the player's own that is still true when the scene is over. The reader says so, and says it in the story's words: what becomes true (someone joins you, someone is won to your side or set against you, a promise or debt, a thing that is yours now, a fact in the world changed), who it is about, how big an ask it is (small: a favour; large: a change of life or loyalty; huge: against their nature), a lesser version, how failing goes down with them, and the catch: what comes with it by the nature of who or what is involved. Asking someone something they could refuse is always a try; the game never refuses an ask, it prices it.

- **The price is code's.** An ask is a step harder than the scene when it is large and two when huge, a step easier for each step the one asked stands with you and harder for each against you (standing runs from -2 to 2, and is kept by name). A small ask is won by one landing, a large by two steps of landings, a huge by four, so a huge one takes more than one landed try. The stake is said before a die is chosen, with what landing makes true and what comes with it.
- **What a die comes to.** A clean landing moves the ask as far as it would move the scene and leaves them thinking better of you; a landing at a cost moves it a step less, and if that is the landing that wins it, it wins the lesser version; a failure costs you a step with them, a botch two, and someone brought to -2 is set against you (a card on the narrator's side). An ask spends a die, takes half an hour, and closes the scene on you at a cost or on a failure, as any try does. It moves no step through the scene, unless it is to win over the one in the way here (to come along or to take your side): won over, they are not in the way any more, so a landing moves the scene as a try at it would, at the ask's harder price (`countsThrough`). Anyone is known by more words or fewer ("Vesna", "Vesna of the Locks" are one person, `samePerson`).
- **It stays true.** What was won is kept on the hand (`HandState.lasting`), saved with the sitting, and told as true to every telling, every reading and the epilogue after. The scenes not yet come to are written again by a model to fit it (in the background, waited for before the next scene), checked scene by scene as the builder's are; a scene whose new writing does not check stays as it was, and why is told.
- **Someone who goes with you** is a card on your side, leaned on like a thing in the scene (a step easier, once a scene); leaned on in a try that falls short, they think less of you. They speak and act as themselves, and may disagree. One who has come to think too little of you (below 1) leaves as a scene opens; one set against you turns on you, and that closes the scene on you a step. Whoever is with you at the end of a story is with you at the start of the next (`Kept.company`, `companyKept`), and the builder of that story is told so.
- **The catch comes due by code's rule**: as the next scene opens, it costs what the reader said it costs (1, or 2 for a huge ask) and closes that scene on you a step (none for a small ask), never so far that the scene is over before you act; a model tells what it looks like. Won in the last scene, it comes due at the first scene of the next story.
- **Walking away** is a line the reader can say. The price is said first and the player confirms: the scene is left undone and leaves nothing, all that had closed on you follows you and a step more, and walking away from the last scene gives up the story.

Another feature reads what stands with `whatStands(trip)` in `src/engine/lasting.ts`: who is with you (and whether what came with them is still owed), how everyone met stands with you, everything won, and who left or turned.

The numbers with a player who asks (`bun run scripts/hand.ts`, the asker, dreamer and walker, who otherwise play as the plain player): spending the first try of every scene on a large ask of the first scene's ferry keeper until she comes along, it is won in 96 stories in 100 after 1.2 asks, she is still with you at the end in 90, and the story is won 73 times in 100 against the plain player's 78. A huge ask of her (to take your side against the men who paid her) takes 2.6 asks, is won in 56, sets her against you in 18, and the story is won 61 times. Walking away from a scene that has nearly closed on you wins 75 against 78: it is a way out, not a better way through.

With real models (`scripts/play-real.ts` with a made-up card and lines that recruit the lock-keeper, try to win the most dangerous one over, take the villain along on her word, and ask for a toll forgiven; it now prints the cards given and taken, takes "DIE:" lines for which die to spend, and counts calls by job): every ask was read with what it was after, its size and a catch that fit (the keeper's absence noticed by the magistrate; the magistrate's oath to forgive the toll, and the favours she will want for it), and nothing fell back. A recruit landed and gave a companion card; a small ask landed at a cost and won only its lesser version (a notched stick, not a real token); a grave ask to win the keeper over for good fell short, she thought less of you and left as the next scene opened; the epilogue told what was won and what was still owed for it. An ask adds no call to a turn (the reader's answer is longer: 1.2 to 2.2 seconds against 1.0 to 1.4); each thing won adds one call to write the scenes ahead again, 12 to 74 seconds in the background, and the next scene waited 29 and 35 seconds for it in two sittings. Six things came of those sittings: the reader names someone as the scene does ("Vesna of the Locks"), so a name is one person in more words or fewer; recruiting the very person in the way left the scene's goal (persuade her to lift the lever) to be done with her already in your boat, so winning over the one in the way now counts toward getting through; the narrator kept a companion in the boat after she had left, so whoever goes is taken out of what the narrator is told at once; "I finish it" was once read as walking away, so the reader is told plainly it is not; a line written where the game asked to trade or to rest was lost, so it is now played next; and the reader once went on with the keeper's ask, by its id, in a try to have the magistrate forgive a toll, so an ask named by its id is taken only for the same person, and otherwise the try is played as a try at the scene and says why. In a third sitting the magistrate gave her word and came along, a companion card on your side, and a botched ask set the keeper against you (a card on the narrator's side), who then worked the gate against you in the last scene as the scenes written again had her do.

Not in it yet: forks and hubs, clues, the other side's schedule, the rival, other players at the table, the dread bowl, the narrator's own die, the battle mat, projects, margin notes, level-ups in the middle of a story, and the Decision model as a faster first reader. Each is still there for road stories. Free talk that moves no die still cannot change how someone stands with you (that would be a bonus a line argues itself into), and an ask of anyone but the one in the way never moves the scene. A line answering the walk-away, trade or rest question with something else is played next; a line written where a die is asked for already was.

### 3.4 The narrator's book

The narrator keeps a book for each hero at each card, and it stands on the shelf behind it. At a rest between scenes, when a story ends (won or lost), and when the player stops for the night (in a story, or after a night of free form), the narrator takes the book down, lays it open by its right hand and writes a short chapter in it with a pen; the ink comes up line by line while the model writes, and when the chapter is in, the book shuts and goes back on the shelf, a little brighter for a while. Nothing waits for it: play goes on while it is written, and the hands leave the pen whenever the game wants them. A chapter that came due while the book was busy is written as soon as it is free.

A chapter is not a recap. It is what the player did not see: the people they dealt with, a little later or somewhere else, what they did and said once the player had gone, and what they felt. The player's character appears only as others see or talk about them. At a rest or a stop it is set where the player is not; at an ending, afterwards. It decides nothing (no treasure, wounds, debts or promises of the player's), but what it says of the others is true from then on: its facts (three at most) are told briefly to the rest of the story's tellings and to the next story's builder at this card (`established` in `src/engine/chapter.ts`).

What a chapter is written from is gathered in one place, `chapterMaterial` in `src/engine/chapter.ts`: the story and where it stands, the hero as others see them, what happened since the last chapter scene by scene (or stop by stop), the people met, companions, what worked, what it cost, what was carried away, what the narrator said aloud, and what earlier chapters established. Its `more` is where anything else goes. A mark kept in the book says where the last chapter of a story left off, so the next one starts there. The model writes it in a plain form (a title, the chapter, its facts, one sentence for a picture), under the story's voice when it has one (`src/game/chapterwriter.ts`); JSON, markdown or a bare chapter with no marks are read too, and a long one is cut back to whole paragraphs, never refused. It is refused only when there is nothing to read, when it is a refusal, or when it crosses the table's content lines (`playable`, `contentRules`). A slow or failed chapter arrives late or not at all, with why, on the fallback reporting (`fellBack`); there is no template chapter.

The book is kept in the backend's per-user storage (`userStorage`, `books/<character>/<chat>-<hero>.json`), not localStorage: it is one small JSON a book, grows for as long as the player plays, should follow them to another browser, and stays in their own Lumiverse. A book keeps its last 80 chapters.

To read it, the player clicks the book on the shelf when the table is idle. It comes down into their hands and opens at its newest chapter: a front page, then for each chapter a title page and its text, with a running head and a folio. Clicking the right or left half turns a page (or the arrow keys, Page Up and Down, the space bar, or the wheel); clicking the middle, Escape or Enter puts it back. On an upright phone the book shows one page at a time and slides across to the other page of a spread. There is no menu and no overlay; what is on the page is also given to screen readers.

**Pictures**, optional and off until the player says yes. When Inlay Illustrator answers, the player is asked once whether the book may have pictures (they cost money), and the choice is in the drawer under "Pictures". When allowed, one picture is asked for each chapter through Inlay's shared pictures (`inlay.pictures.<user>`, `direction: "scene"`, the chapter's picture sentence, checked against the content lines), polled until it is ready, and drawn on the chapter's title page (`src/backend/pictures.ts`). Without pictures, or while one is painted, the page says so and the book reads the same.

---

## 4. The map

Two levels only, both lying on the table.

- **Region sheet**: the adventure's stops and the paths between them.
- **Place sheet**: one location with three to six spots in it.

The stops of the region sheet are dealt onto it as cards, face down until you reach them (section 1.7). Entering a building means the narrator slides a place sheet over the region map and the camera leans in. A card that takes place in a single room skips the region sheet.

Pieces show which stop or spot you are in. There is no square-by-square movement and no grid tactics.

Built so far: the region sheet only, drawn for each adventure (its title, stops and roads) once the adventure is built. Place sheets are not built. A fight is, for now, a stop like any other that takes two good tries, each one that works settling one of the foes; it is played with the same written lines and the same die, not a separate turn-based engine (section 11, item 5).

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

- **Abilities** (replacing the old knacks; docs/SYSTEMS.md, 3). Each hero starts with a trick and two others, written for them by the hero model and priced by code. A knack among them works by itself on a try that fits.
- **Levelling up.** Every third stop you get past, two abilities are dealt face up, written from what you did (or from the stock, with no model). You keep one, and your store grows by one.

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

### 8.2 The sound

- **Real recordings, not made ones.** Every sound in the room is a recording from Freesound (CC0, or CC BY with credit), trimmed and brought to one loudness, and shipped inside Tallow (`assets/sounds/`, listed in `src/room/soundfiles.ts`). Nothing is fetched for them and no account or key is needed. Each sound has two to five takes, and one is picked at random, a little faster or slower, every time, so the table never repeats itself exactly. A stand-in made in code plays only until the recordings are ready.
- **What is always there.** A low room tone, the fire while the candles burn, rain and wind with the weather (the wind gusting), crickets on a quiet night, and thunder after each flash. Each is a long loop faded over its own start, so it has no seam.
- **The table.** The die shaken in your hand and thrown across the wood, a card dealt and laid down, the deck shuffled, the pencil on the page, the page torn off, a piece set down, a token, a weight in the pan, a stone dropped in the bowl, the leather map unrolled and rolled up, a match struck for the candles, a hand slammed on the table.
- **Music.** Kevin MacLeod's pieces from incompetech.com, streamed while they play and crossfaded with the moment: the road, a place, a contest, the night, the end. Turn the music to 0 and nothing is fetched.
- **Settings live in the drawer.** Mute, and master, music and sounds levels; the full list of who made the music and the recordings is there and in `CREDITS.md`. Nothing plays before your first click or key press.

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
   - the rules that belong to a whole adventure: resting, running out (section 11, item 9), and fights (section 11, item 5).

   Every turn is still a line written in the notebook. Nothing in this milestone adds a list to pick from. Built: the rescue and the courtship (`src/content/adventures.ts`), the director that plays a whole adventure at any table (`src/game/director.ts`), the room's table (`src/game/roomtable.ts`), and two scripts: `bun run adventure` plays it as text, `bun run table` plays it in the room in a real browser. Fights are the simple kind of section 4.
4. **The character builder, companions from the card, and running inside Lumiverse** against a real card. Built:
   - the sitting (`src/game/session.ts`): the narrator greets you by the card's character, asks which story (only those the card can support), starts building the adventure at once, and asks who you are while it builds;
   - the builder (`src/game/build.ts`): the trope's made-up adventure is the skeleton, and every id, number, road and kind of card in it is kept; the model writes only the words, for the card's world, and code checks each field, keeping the skeleton's words for any that do not check. If fewer than 60% of them check, twice, the made-up adventure is played with the card's character in their part;
   - the hero (section 6), the model's three jobs with their checks and stand-ins (`src/game/prompts.ts`, `src/game/modelminds.ts`), and the Spindle extension (`src/frontend.ts`, `src/backend.ts`, `spindle.json`; built into `dist/` by `bun run build`);
   - a live-test stepper (`bun run live`) that plays a sitting against a real card one model answer at a time, so a person or another model can answer as the model and as the player. Eight of the user's cards were played through it; what they found is fixed or listed in section 11.

5. **The moonshot, first pass** (`docs/MOONSHOT.md`): effect and position, six stats and a seventh, the margin, people, clues and the inked map, the other side's clock, projects, world kits, content settings, other players at the table, and the campaign, put together by `src/engine/world.ts`. `src/content/tavern.ts` is the tavern at midnight, by hand. What is played now and what is not yet: MOONSHOT.md, section 14.

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
| Model routing: a connection and reasoning per role, the Decision model, embeddings | copied and cut down, with no settings drawer (`src/meaning/models.ts`, `src/backend/models.ts`) |
| Lorebook entries picked by meaning | written anew, smaller: a few entries for the builder (`src/game/lore.ts`) |
| Story-beat reading of a written line | copied and reshaped for the four ways (`src/meaning/read.ts`) |
| Prompt-suffix helper | not needed yet: nothing is written into the chat (section 11, item 10) |
| Rule for who is read as a child | copied (`src/engine/card/child.ts`), then narrowed (section 7) |
| The overlay a room is shown in | copied from the sibling chess extension and renamed (`src/frontend/overlay.ts`) |

---

## 11. Open questions, and what was decided

Most of the first questions have been settled by building and playing; each says what was decided and why, so it can be
undone on purpose. What is still open is marked **Open**.

1. **The name.** Decided for now: it stays "Tallow". It is short, it is ours, and it fits a room lit by candles. Renaming later costs only the words.
2. **Stats.** Decided: four, Brawn, Cunning, Charm and Wits, each 0 to 4 (section 1.5). Every way past a thing maps to one of them, and the hero is made from your own words without a sheet to fill in.
3. **How costs are shown at the table.** Decided: physical counters the narrator gives and takes (section 1.6). Red stones are health, coins are supplies, pale seals are goodwill. Your stats are written on the first page and show as the pale weights in your pan; they get no other place, so the near edge of the table stays clear.
4. **Who moves your piece.** Decided: the narrator moves its own piece by hand, and yours goes by itself. Your hand is for writing and for the die; moving your own piece would be a step with no decision in it.
5. **Fights in the room.** Decided: a fight is a stop that takes two good tries (section 4), told as a fight. A turn-based fight of its own is not in this version: it would be a second game inside the first.
6. **Models.** Decided: no downloaded asset packs. The narrator, the pieces and the room are sculpted by script or built in code, so nothing in the room belongs to anyone else.
7. **Which weather the story uses.** Decided and built: an adventure has a weather on the road, and a place may have its own, shown outside the window while you are there. The river road is clear, with fog at the ford, wind on the tor and a storm at the keep; the city road is rain, with wind on the roofs and a storm at the tower; the courtships are clear. Heat is not needed.
8. **Free form.** Built (section 3.2): theatre of the mind, a die only for what could go wrong, and threads that become stories. Threads and the start place are written for the card's world. **Open:** people with minds of their own met in free form. The "scenes" shape is built as its own kind of story (section 3.3, item 28).
9. **Running out.** Kept as built (section 1.5): at no health you go down and come to two hours later with 1; at no supplies paying is closed where it costs anything; at no goodwill talking is a step harder. Turned back at a stop that is not the last, you go the long way round it, for hours and a supply. For the user to judge in play.
10. **Where the words go.** Decided for this version: in the room only, spoken by the narrator and written on the pages (section 1.6). A sitting writes nothing into the Lumiverse chat, so a game never disturbs a chat or the chat's own model. **Open:** whether the end of an adventure should be offered to the chat as a note, which would be the user's choice each time.
11. **How exact the balance should be.** Decided: it leans by the real chances and shows no number. The count would turn every try into sums; the lean is enough to choose by.
12. **Ways that are closed.** Decided and built: four wooden blocks stand at the far edge of the table, Talk, Sneak, Force and Pay (`src/room/ways.ts`). At a place the narrator stands up the ways there are; a way that fails is tipped over by its hand; when the place is behind you, all four are laid down. A glance across the table says what is still open.
13. **The table on an upright phone.** Decided and built: on a screen held upright you sit further back and higher, so the whole width of the table stays in the picture (the notebook at one end, the dice box at the other) and the table, seen more from above, fills more of the height; the narrator's words come up in the dark below the table. Writing, the balance and the die each have a nearer view of their own, which fills the screen. Played through in the checks at phone size (`PHONE=1 bun run table`), not yet on a real phone.
14. **What you know at a fork.** Decided and built: the narrator says of each card what kind of trouble it is, and one line more: whether someone there may walk on with you or there is something to be had, whether it takes more than one good try, and which way looks easiest (`forkHint` in `src/engine/tell-adventure.ts`). A companion still says which they would rather take.
15. **Where the cards lie.** Decided as built: a stop's card lies face down on its place on the map and is turned face up when you reach it; the cards on your side (who is with you, what you carry, your knacks) lie in a row by the counters at the near edge.
16. **The 22 kinds of card.** Decided: the 22 in `src/engine/cards.ts`. People: the Toll-Keeper, the Innkeeper, the Miller, the Warden, the Guardian, the Rival, the Beloved, the Fellow Traveller. Things in the way: the Barred Gate, the High Water, the Steep Way, the Throng, the Contest. Fights: the Ambush, the Hound, the Watch. Places: the Keep, the Bonfire. Things kept: the Key, the Token, the Lantern, the Purse. They are old-fashioned on purpose, as tarot is, and stand for modern things too (the Barred Gate is a locked door, the Throng a packed street).
17. **Which waits are long.** **Open.** The reader of your line, the story's model and the builder each take a different time on a real machine, and nothing has been played inside Lumiverse with a real model yet. Every wait already has the room's own middle to hide in (the narrator shuffles, reads, muses); which of them need a longer one is to be measured there. With a Decision model the reading of a line should take about a second (item 22).
18. **How hard it should be.** Decided for now: the numbers to reach are 9, 12, 15 and 18 (easy, fair, hard, very hard), one step lower for a thing used, a knack or a companion's point. A careful player who writes plain lines wins about 70 to 77% of the time on every road and every fork (`bun run adventure`). The live tests had seven of eight players winning easily; this is a little harder. For the user to judge in play.
19. **A road for every card.** Decided and built: the road is laid out by code from the story's recipe (section 3.1), with old-world names for a card set in another age or world and city names for a card set in our own times, told by the words it uses (phones, cars, a city, a hospital, a band...). The first two hand-made adventures (the river road and the fair, and the city) are kept for the checks and for `?adventure=rescue`. With a Decision model the card is asked of it first, while the narrator greets you; the words decide when there is none or it cannot tell. The builder still moves either into the card's own world.
20. **Questions to the narrator.** Decided and built: a line that asks something ("what does she want?") or only looks ("I look around") is answered from the scene in a few sentences, with no die. It takes a quarter of an hour of the night, which the narrator says the first time, and changes nothing else.
21. **Leaving the table.** Decided and built: a sitting left before its end (the ✕, or a reload) is kept for that chat and that card. Sitting down again, the narrator asks whether to go on or begin a new one, and lays the table out as it was. It is kept before every try, so leaving never takes back a throw.
22. **The user's own models, used as far as they go.** Decided and built. Every model is the user's, through Lumiverse, and every one is optional past the first:
    - *Each job on its own connection.* The builder may think first when its model can (it runs once, while you write who you are); the reader, the hero and the teller never do, because they are asked while you wait. Each falls back to the default connection when its own fails. There is still nothing to set in the room: the rule of nothing on screen but the room (1) is for the game, not for the settings, which live outside it. Tallow's drawer tab in Lumiverse ("Tallow", `src/frontend/drawer.ts`) has a button to sit down, the permissions with a button to allow the missing ones, and a connection and a thinking choice (auto, think first, answer straight away) for each job, with the Decision and embedding connections; the choices are kept in Tallow's user storage (`models.json`), and anything not chosen is "auto".
    - *The Decision model* ("decisions" permission), when the user has one, answers small typed questions in about a second: what kind of line it is, in a story as in free form (a try, a check that gets you past nothing, called for when you search, listen or try to remember even if you never ask for a roll, stopping for tonight, words to the person there, a look round, a question for luck, pressing or reading them, a favour, a wait, getting ready, a goal, the table's moves, giving in); which way a line tries, the stat it leans on and the thing it uses; and every written choice: a rescue or a courtship, go on or begin anew, rest or press on, which card at a fork or a level. Only a sure answer is taken. When it is unsure, or there is none, the reader model reads the line, and the rules read it last; the choices go to the rules' own words. Nothing it says can open a shut way or use a thing for the wrong way.
    - *The card's lorebook* ("world_books"): a few of its entries go to the builder, so the adventure has more of the card's world. Always-on entries and ones the card names rank first; with an embedding model ("embeddings") the entries nearest the card in meaning are kept even when the card does not name them.

    The extras (since joined by the player's personas and preset, items 27 and on) are asked for once, with the reason, the first time you sit down; a no is kept, and the game is whole without them.
23. **A card that is a world.** Decided and built: some cards are not a person but a land, a town or a game that narrates many people. Then the narrator says the story is set there, and nobody in it is called by the card's name: the companion in a rescue and the one courted are people of that world, taken from the ones the card names or invented by the builder (a plain stand-in name when there is no model). It is told by the card's own words (a narrator, NPCs, factions, races; few of one person's looks and age: `looksLikeWorld` in `src/game/card.ts`), and with a Decision model the card is asked of it first, for a few seconds at most, before the greeting.
24. **More than one story a sitting.** Decided and built (section 1.3): an ending, a reward, the table cleared, and "Another story?". The hero is kept per chat and card. Played in the checks (`bun scripts/ending.ts`), not yet with a real model.
25. **Stories that do not repeat.** Decided and built: seven families, 25 recipes, and a road laid out new from each (section 3.1). With the seed and the forks, the same story is not the same road twice. A careful player wins about 70 to 80% of every recipe (`ADV=gen:all bun run adventure`).
26. **The card's own world.** Decided and built: the builder is told to put the stops at places the card or its lorebook names and to fill them with its people, factions and words, and the card is given to the teller too, for the telling, the answers and the ending. How well it does is the model's; it is to be judged with a real model in Lumiverse.
27. **The narrator writes under the player's preset.** Decided and built, not yet played with a real preset in Lumiverse. The narrator's prose was short and plain by the game's own rule (60 words a telling), whatever the player's chats read like. Now, when a story begins, the chat's active preset is read once (the "presets" extra; only read) and kept for that story: its style, its length, its voice, what it allows to be shown, and its settings for the model (`src/game/preset.ts`). Two passes decide what of it does not come along. Code leaves out by structure: the slots the game fills itself (the chat's history, world info, the persona, the scenario), blocks only for another kind of reply, a prefill, blocks that read the live chat, sealed blocks. The reader model leaves out by meaning, with a reason from a fixed list for each: a status panel, a list of choices, playing the player's character, a thinking template, markup, rules of the block's own (dice, stats, time), a block that only says whose voice to reply in. Its answer is kept whole or not at all; with none, everything structure kept stays, since the game's rules come last and win. The host fills the macros once, so nothing in it changes later.
    A narration under it is one conversation (`src/game/voice.ts`): the preset's blocks from before the chat, a fixed frame, the story so far turn by turn, the preset's blocks from after the chat, and last this turn's rules and what must be true. Everything but the end is the same bytes from one turn to the next, so the provider's prompt cache holds; Lumiverse places the cache marks. The snapshot and the story so far are kept beside the sitting and taken up again with it; a new story takes the preset anew. A night of free form and a story begun inside it each have their own. The game's content settings, lines and veils are in the last message and are checked after as before. Without a preset, the permission, or a chat, the narrator is as it was. Short beats (a move against you, a blow about to land, a companion's line) stay short.
28. **Stories without recipes or card kinds as templates.** Decided and built (section 3.3), played through in the checks without a model (`bun test tests/hand.test.ts`, `bun run build && bun scripts/hand-sit.ts`) and not yet with a real one. A road story was a line of gates: one line got you past a stop, and every stop was one of 22 kinds of card laid out by a recipe, so every world got the same wardens and toll-keepers and the builder could only reword them. A story with a model is now the model's own three scenes, and it is played with a hand of dice thrown in advance, where the choice is which die to spend on which risk. The recipes and the kinds are kept for the road stories that still play (campaigns, a table with no model, a model that gave no story that checks); the 22 card faces are kept as pictures a scene's card may have. **Open:** whether three scenes in a line is enough shape (a hub to work in any order, a scene the player's own failure adds), carrying the other side's schedule over, and whether the trade's prices are right once real players use it.
    Decided and built since: what a try can win that stays won (section 3.3, `src/engine/lasting.ts`). Great rolls won nothing lasting: a girl talked into coming along, a dragon or a villain won over, and the next scene had forgotten them. A try can now be after something of the player's own; the reader names it, its size and its catch in the story's words, code prices it, keeps it, makes its catch come due, and the scenes ahead are written again to fit it. Companions are one kind of it: a card on your side, a rule to lean on, a voice of their own, a standing that can make them leave or turn, and a place in the next story. **Open:** whether a large ask is too easily won with the best die (96 in 100 in the simulation, for a story won 5 times in 100 less), whether the catch should sometimes come later than the next scene, and how a companion acts in a road story (they are kept, not played there).

29. **The narrator's book.** Decided and built (section 3.4), with tests (`bun test tests/chapter.test.ts`) and real models (`scripts/play-real.ts`, a made-up card, five sittings). A chapter at a rest, at an ending (won or lost), at a stop and after a night of free form was written every time and none was refused. The first prompt asked only for "what the player did not see", and a chapter at a stop came back set in the scene the player had just left, from the companion's side: a retelling. Each point now says where to set it (at a rest or a stop, somewhere the player is not, at that hour; at an ending, afterwards), and every chapter since has been aftermath among the others: the bailiff and the clerk the player had robbed, deciding to hunt them; the lamplighter scuffing out the player's blood before the watch saw it; the Tollmaster signing the sentence after a lost story, and the next story's builder writing a story about breaking free of that sentence. A rest that ran the clock out wrote a rest chapter just before the ending's; a rest that leaves no time now writes none. Stored in the backend's per-user storage, not localStorage (section 3.4). **What tries have won reaches the book** (item 28, `chapterMaterial`): whoever was won to come along is listed with how they came and what came with them, what else a try made true and whoever has been set against the player are listed too, and a rest or a stop may set its chapter among the companions while the player's character sleeps or is out of earshot (`tests/book-lasting.test.ts`; played once against real models, where a companion won in the first scene had her watchers set on her in the rest's chapter). **Pictures** are tested against a fake shared-pictures pool only, not yet against a real Inlay Illustrator; what its API lacks for a book (a direction for a book plate rather than a chat scene, a style hint short of the user's own tags, a way to say the people drawn are not the chat's cast) is noted in `src/backend/pictures.ts`. **Open:** whether players read the book, whether a chapter at every rest is too many, and whether the established facts should be shown to the player somewhere besides the book.
