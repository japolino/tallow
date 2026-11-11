# Tallow: the moonshot

Written 2026-11-10, after the user's second round of feedback on the loop. A first pass is built: section 14 says what is played now and what is not yet.

> If I sit down and play a tabletop game with a friend, I'll have more freedom to do fun stuff and roleplay as a character than what I currently do with this extension.

> We are playing Pathfinder. I'm the GM, and you're the player, alongside two other players. The goal is to defeat the lich who has been terrorising the country. A rumour says masked people meet in this tavern's alley at midnight. You and your friends are drinking…

> You can best a guy much stronger than you, even if you're a naked guy with panties on your head, by rolling higher than him.

`docs/LOOP.md` already answers the first round: people who remember you, clues on slips, a map you ink in as you learn, six stats, lies, and the other side's plan. **This file keeps all of LOOP.md and goes further.** It takes on what LOOP.md leaves out:

1. **The panties problem.** The die can do anything, so who you are means almost nothing.
2. **The other two players.** A real table has friends at it. Tallow has you, a narrator and some passengers.
3. **Midnight.** The world does not move unless you do. Nothing happens at a time, so you cannot wait, watch, follow or lay an ambush.
4. **The lich.** There is no long story. Each adventure is a one-off, so there is no reason to come back.
5. **The GM's craft.** A good GM cuts the boring parts, gives everyone a turn in the spotlight, warns you before danger lands, and brings old details back. Our narrator only reports what the dice did.
6. **Every world plays the same.** A monster-romance card, a space card and a medieval card all fight with the same four ways, and there is no room to wander off and do something of your own.

In one sentence:

> **Tallow stops being a game you play against a narrator, and becomes a table you sit at.**

---

## 0. The test: the tavern at midnight

Take the user's scene as it is, and ask what three real players would do in the first ten minutes. Each of these happens at real tables all the time:

- Ask the barkeep what is behind the tavern, casually.
- Notice the woman by the stairs who keeps looking at the back door.
- One player slips out to look at the alley *now*, before midnight.
- Argue: lay an ambush, follow them home, or report them to the watch?
- The bard plays, loudly, so the others can move unseen.
- Find whoever the masked people are waiting for, and take their place.
- Do nothing: drink, wait until midnight, and watch from a window.
- Pick a fight with a drunk, because it is funny.

What Tallow can do with that list today: nothing. There is no gate here to pass, so there is no way to play the scene.

**The acceptance test for everything below: every line of that list must be playable, must matter, and must lead somewhere.** Section 9 plays the scene through with the new rules.

---

## 1. Six big moves

| # | The move | What it fixes |
|---|---|---|
| 1 | **Who you are decides what is possible; the die decides how it goes.** Effect and position. | The panties problem. Stats feel like nothing. |
| 2 | **Your skills talk to you.** Every stat is also a way of noticing. It writes in the margin of your notebook. | Stats that only get you past things. Leads handed to you. |
| 3 | **A full table.** Two other players, each with a hero, a way of playing, and their own opinions. | No friends at the table. Nobody to plan with. Nobody covering your weak spots. |
| 4 | **The world runs on a clock.** The other side keeps appointments, and people keep routines, whether you are there or not. | Midnight. Nothing to wait for, watch, follow or ambush. |
| 5 | **A campaign.** A big bad with a plan that spans many stories. Each story is a chapter. | No reason to come back. |
| 6 | **Every world its own game.** A world kit sets what a fight is, what you risk and what gear means; projects let you chase a goal of your own; content is a setting. | Every world playing the same. No room to wander off. |

And one more that holds the others together: **the narrator becomes a GM** (section 6.2).

---

## 2. Move one: who you are decides what is possible

### 2.1 The problem, in numbers

Today a try is the d20 plus a stat of 0 to 4 against 9, 12, 15 or 18 (`src/engine/moment.ts`). The die has twenty faces and the stat moves it by at most four, so the die decides almost everything.

A hero with 0 in the stat that matters, against a "hard" foe (15), gets past at least partly **45%** of the time: 15 to 20 works, 12 to 14 works at a cost. In a contest each good try puts the same two notches on the foe's dial, whoever you are. So the naked man with the panties on his head beats the knight about every other fight. Nothing about him or the knight changes what a good throw can do.

A real GM would not even let him roll. They would say "with your bare hands? You can't hurt him like this. What else do you do?"

### 2.2 The fix: two questions, not one

Every try now has two answers, as in Blades in the Dark's position and effect:

- **How it goes** comes from the die, as now: works better than hoped, works, works at a cost, fails.
- **How much it can do** is the *effect*. It comes from the story, not from the die: who you are against what you face.

**Effect has five steps**, and code sets it before the die is touched:

| Effect | In plain words | In a contest | Outside one |
|---|---|---|---|
| none | You cannot do this. There is no throw for it. | 0 notches | The narrator says what you *could* do instead. |
| limited | A little: a scratch, a foot in the door. | 1 | Part of what you wanted, or it takes longer. |
| standard | What you hoped for. | 2 | As asked. |
| great | More than you hoped for. | 3 | As asked, and a slip or a lead besides. |
| overwhelming | It is over in one stroke. | the whole dial | As asked, with nothing left to settle. |

**The gap sets the effect.** Code counts it from facts it holds:

```
your side   = the stat the try leans on (0 to 4)
            + gear (−1 nothing fit for it · 0 plain · +1 made for it)
            + edges you have (+1 each: an ambush, a weakness you know, the high ground, a key, an ability's verb)
            + help (+1 if another player sets it up)
their side  = their rating at this kind of thing (0 to 6)
gap         = your side − their side
```

| Gap | −3 or worse | −2 | −1 to +1 | +2 | +3 or more |
|---|---|---|---|---|---|
| Effect | none | limited | standard | great | overwhelming |

A line that uses what is there still earns one more notch (`docs/SYSTEMS.md`, 4.1), on top of the effect, but never up from none.

Two rules keep it honest:

1. **A 20 raises effect one step, but never up from none.** A perfect throw can make a good try brilliant. It can never make an impossible one possible.
2. **None is never a dead end.** When the effect would be none, there is no throw. The narrator says so in character and offers two or three things that *would* change the gap. "Your fists won't touch him through that mail. You could go for the lamp, shout for the others, or run."

So the naked man can still run from the knight, and run well with a good throw. To *beat* him he has to change the story: get a sword, get friends, get him drunk, find out about his bad knee. **That is the fun part, and the dice stop skipping it.**

### 2.3 Position: how bad it is if it goes wrong

The other half of the pair. Code sets it from where you stand:

| Position | When | A failure means |
|---|---|---|
| controlled | You have time, cover, or the upper hand. | A setback: time lost, a way closes. |
| risky (most tries) | A fair fight, an open question. | A cost, as now. |
| desperate | Outmatched, cornered, out of time. | A bad cost: two blows, something lost for good. |

**You can trade one for the other**, as you could at any table: "I go all in." Take one step worse position for one step better effect, or the reverse ("I go carefully"). That is a real decision on most tries, and it costs nothing to learn.

### 2.4 Being good at something means you do not flub it

Today a hero with 4 in a stat fails one throw in four like anyone else. Two small rules make skill feel like skill:

- **Sure hands.** With 3 or 4 in the stat a try leans on, a plain failure becomes *works at a cost*. A 1 still goes badly wrong.
- **Let it ride.** A throw stands until the situation really changes, as in Burning Wheel. Failing to persuade the guard means he is not persuaded. Asking again in other words gets no new throw. Bringing him a bribe, a friend of his, or proof does.

### 2.5 Foes are people too

Every foe gets a short record in the same shape as everyone else in the story:

| Field | Example: the grave-knight |
|---|---|
| ratings | fighting 5, frightening 4, talking 1, noticing 2 |
| hurt by | fire, holy things, sunlight (each +1 to anyone using them) |
| wants | to deliver the box before dawn |
| breaks when | its dial is half full and the box is safe: it withdraws |

**Most foes break before they die.** Hired swords run at half their dial. Cultists give themselves up when their leader falls. This makes a fight something you can talk your way out of halfway through, and gives you prisoners, and prisoners give you leads.

### 2.6 Where the fight happens

The contest leather gets three **zones** marked on it in chalk: *close*, *near* and *far*, with things in them (a table to hide behind, a lamp, a door). Your piece and theirs stand in one zone each. Reaching someone takes a line. Cover is an edge. A lamp is something to throw. There is no grid and no counting of squares, only enough to make "I kick the table over and get behind it" mean something.

### 2.7 Why this is the payoff loop

This is how investigation and fighting join up, which LOOP.md wanted and could not quite reach. **The keys you find are edges.** Knowing the lich's true name, holding its phylactery, knowing the grave-knight hates fire: each moves the gap. A story's end is hard because the gap is wide, and it gets easier exactly as far as you found things out. Nobody beats the lich by rolling high. You beat it by having done the work.

---

## 3. Move two: your skills talk to you

### 3.1 Every stat is a way of noticing

LOOP.md's six stats are kept: Brawn, Grace, Charm, Guile, Wits, Sense. The new idea is that **each stat notices something different**. So every stat finds clues, not only Sense:

| Stat | Gets you past things by | Notices |
|---|---|---|
| Sense | spotting, catching lies | what is there: a hidden door, wet boots on a dry night, a hand on a knife |
| Wits | knowing, searching, piecing together | what it means: whose sigil that is, that the ledger is forged |
| Guile | lying, bluffing, disguise | lies and liars: "that is a practised lie; he has been asked before" |
| Charm | winning people, persuading | what people want: "she isn't afraid of you. She's afraid *for* someone" |
| Grace | sneaking, climbing, quick hands | ways in and out: the drainpipe, the loose shutter, the back stair |
| Brawn | forcing, enduring, frightening | danger and what breaks: "the big one is the least dangerous man here" |

So a high-Guile hero and a high-Sense hero walk into the same tavern and **see different taverns**. That is what the user meant by stats for "discovering cues, uncovering investigations, lying to characters, characters lying to you".

### 3.2 The margin

When the narrator sets a scene, every hidden thing has a number, as in LOOP.md (5.2). Code compares each with your stats and, where you are good enough, **your hero writes it in the margin of your notebook**: in pencil, in your own hand, with the stat in small capitals before it.

> SENSE — the woman by the stairs has looked at the back door four times.
> GUILE — the barkeep's "nothing back there but bins" came too fast.

It is the same idea as Disco Elysium's skills speaking to you, done with the room's own things. Nothing is drawn over the room: it is a note on a page you already hold. The margin is filled while the narrator speaks, so it costs no wait.

- **Only what you are good enough to notice.** A hero with Sense 1 never sees the wet boots. A friend at the table might (section 4).
- **The margin can be wrong in one way.** Your hero's **fault** (`docs/SYSTEMS.md`, 2.1) gets a voice too, once or twice a story, giving bad advice in your own hand. A proud hero's margin says "BRAWN — you could take him." The narrator knows it is the fault talking. You are not told. Following it is the same temptation as now, and pays back your store.
- **Notes become slips.** Leaning on a margin note in a line ("I ask her who she's afraid for") makes it a slip on the table (LOOP.md, 4.2), heard or seen depending on what it was.

### 3.3 Lying goes both ways

LOOP.md lets people lie to you. Here **you can lie to them**, and you are not always told whether it worked.

When a line is a lie, code throws behind the narrator's hand: your Guile against their Sense. A person who sees through you may **play along**, believe nothing, and act on it later (the masked men leave by another way; the barkeep sends a boy to warn someone). Your Sense, or a friend's, may catch a sign of it ("SENSE — he smiled at the wrong moment"). Lying is now a real bet with a hidden result, as it is at a table.

---

## 4. Move three: a full table

### 4.1 Two other players

Two more seats at the table, one to your left and one to your right. **Each is a player, not a companion.** The difference matters:

| | A companion today | A player |
|---|---|---|
| Who they are | a card on your side and a stat point | a hero with a calling, six stats, abilities, a store and a fault, the same as yours |
| How they play | likes one way, hates another | a *way of playing*: the careful planner, the one who kicks doors in, the one who talks to everyone, the joker, the one who wants the treasure |
| What they say | nothing, mostly | things in character, and things across the table out of character ("Can we not walk into a dark alley blind, for once?") |
| What they do | help your rolls | act: notice, plan, argue, go off on their own, throw their own die, fail, cause trouble |
| What they want | nothing | a want and a secret of their own, which can become a story |

**Where they come from.** This is where Tallow can do something no other tabletop game can: **the card's character can be one of the players.** The person you have been chatting with in Lumiverse sits at the table beside you, with a hero built from their card, and plays the adventure with you in their own voice. The second seat is someone from the card's world or lorebook, or someone the model invents. A card that is a whole world (DESIGN.md, 11.23) fills both seats from its people.

### 4.2 Who speaks, and when: the spotlight

Others who have tried AI players at the table found the same failure: every player speaks every turn, says much the same thing, and drifts from who they are. So **code decides who speaks, not the model.**

After each of your lines, code scores each other player:

```
wants to speak = touches them (the scene meets their want, their best stat, their fault)
               + how long since they last spoke
               + how talkative their way of playing is
               + a little seeded chance
```

- At most **one** other player speaks after a line, usually. Often nobody does.
- Both speak only when you ask the table ("What do you two think?") or before a big decision (4.4).
- A player who has said nothing for a while gets nudged up, so nobody fades out.
- They are told **only facts code holds** about themselves: their sheet, their want, what they have seen, what they think of you. No long chat history to drift in.

### 4.3 What they can do

| They | Example | Who decides |
|---|---|---|
| notice | Their own margin, said aloud: "Don't look now. Wet boots, and it hasn't rained." | Code, by their stats. This is how a friend covers what you cannot see. |
| advise | "I wouldn't. He's lying, and he's not good at it." | Code picks the fact; the model words it. |
| help | Set up your try: an edge for you, at a risk to them. | You ask, or they offer; code prices it. |
| take a try | The one with Grace 4 climbs the wall; the one with Charm sings. | You hand it over ("Mira, you do the talking"), or they step in when it is plainly theirs. |
| go off alone | "I'll be on the roof." The narrator cuts between you. | They suggest it; you can say no. |
| refuse | "I'm not burning a man's house down for a hunch." | Their way of playing and their attitude toward you. |
| fail | Their throws fail too, and the trouble that comes of it is yours to deal with. | Code, as for you. |

**Splitting up.** When players go to different places, the narrator cuts between them as a GM would, each scene in turn by the clock (section 5). You play your hero; theirs play themselves, and you see how it went. This is the only way to be in the alley and at the bar at once, and it is the most "real table" thing there is.

### 4.4 The table talks

Before a big move (the ambush, going into the crypt, accepting a deal), the narrator sits back and says "Talk it over." Each other player gives their idea in a line or two, out of character, and they may disagree. You decide, or put it to a vote. The planning before a heist is half the fun at a real table, and now there is someone to plan with.

### 4.5 They feel about you, and about each other

The other players have an attitude toward you on LOOP.md's five steps, and toward each other. Overrule them every time and they go cold. Back them when it costs you and they go close. Two of them can fall out. A bond can turn into a romance (DESIGN.md, 7). This is a story that runs under every adventure, and it is the one players remember.

---

## 5. Move four: the world runs on a clock

### 5.1 Appointments

LOOP.md gives the other side a plan dial that ticks every two hours. Here the other side keeps **appointments**: things that happen at a time, at a place, whether you are there or not.

```
at 12:00   the masked four meet in the alley behind the tavern
           they wait a quarter of an hour for a courier with a box
           if the courier comes: they take the box down the sewer grate to the old chapel
           if not: they suspect a trap, send one back to the tavern to look, and leave
at 1:30    the box reaches the chapel, unless it was stopped
at 4:00    the rite at the chapel begins (the lich's next step)
```

Code holds the schedule and what each step needs. The model words it. Getting in the way changes it: knock out the courier and he never arrives, and the masked four act on that. Each change is a branch code already knows.

**People keep routines too.** The barkeep closes at two. The watch changes at eleven. The priest prays alone at dawn. A routine is an opportunity.

### 5.2 New things you can do with time

| You | What happens | Time |
|---|---|---|
| wait | "We nurse our drinks until near midnight." The light and the candles move on in the room; anything you would notice while waiting happens. | until the time you name |
| watch | Stake out a place: you see what happens there, and are seen if you throw badly. | as long as you stay |
| follow | Keep after someone at a distance, a throw at each turn of the way. | their road's hours |
| prepare | Lay the ambush, bar the door, swap the box: an edge or better position when the time comes. | half an hour or more |
| split up | Each player somewhere else at the same hour (4.3). | each their own |
| a long stretch | Travel, a night in the archive, a day asking round the market: told in a few lines, with one throw for how it went. | hours or days |

So "we wait at the window until midnight" is one of the strongest lines in the game, not a wasted turn. That is the user's tavern.

### 5.3 The candle with a notch in it

The room already shows time: the light through the windows and the candles burning down (DESIGN.md, 8). Appointments go on the candles. **When the narrator learns of an appointment, or tells you of one, it takes a small knife and cuts a notch in the burning candle at the height where that hour will fall.** You can watch the flame creep down to it. When it gets there, it happens.

You learn of appointments by finding them out: the rumour gives the first one, a slip gives the next. The ones you do not know of happen without a notch, and you hear of them after.

---

## 6. Move five: a campaign, and the narrator as a GM

### 6.1 The big bad

A campaign is one long threat across many stories: the lich, the plague, the usurper, the rising sea. Code holds it as a short record, after Apocalypse World's fronts:

| Field | The lich |
|---|---|
| what it wants | to rise as the undying king on the longest night |
| its steps, in plain sight | six: the graves are opened; the bishop is bought; the grave-knights ride; the river turns; the city falls silent; the longest night |
| its hands | a lieutenant or a cult for each story: the masked four, the bought bishop, the grave-knights |
| its weakness, in three keys | where its heart is kept; its true name; the rite that unbinds it |
| when it acts | one step after every story you do not set it back, and when you fail badly near it |

**Each story is a chapter**, built from the campaign and not picked at random. The tavern rumour is the first. What you found, who you won over and who hates you all carry on. The three keys to the lich are spread over the chapters, so every chapter moves you toward the end even when it goes badly.

**On the table:** a black candle at the narrator's right hand, with six rings scored on it. It is lit only when the lich takes a step, and burns down one ring each time. When it is out, it is the longest night. It is the clock of the whole campaign, it is made of tallow, and the game is named for it.

**The finale** is the lich itself, under the rules of section 2. With all three keys, the gap is fair and it is the best fight you have had. With none, the effect is none against it, and the only way out is to run, or to die buying time for someone else. Single stories, played on their own, stay as they are now.

### 6.2 The narrator is a GM

Each of these is a rule code can hold or a thing the narrator's model is told every time:

- **Yes, or roll.** Anything plausible is allowed. Only what is risky or resisted gets a die. "You can't" always comes with "but you could".
- **Cut to what matters.** Safe travel and shopping are a line, not a scene (5.2, *a long stretch*).
- **Share the spotlight.** The narrator turns to a player who has not had a moment ("Sable, what are you doing while this goes on?").
- **Warn before it lands.** The contest already shows the blow coming. Outside one too, danger is shown before it hits ("the floor creaks under the second man").
- **Bring things back.** Code keeps a short list of details that were set up and not used: a name dropped, a locked drawer, a promise. When there is a chance, the narrator is told to bring one back. This is what makes a story feel planned.
- **Ask the players.** "What does Aldous know about this sigil, from his time at the abbey?" The answer is kept and becomes true (LOOP.md, 2.1, *say it's so*).
- **Anyone made up who matters gets a record.** If the model invents the stable boy in passing and you talk to him, he gets a record at once (LOOP.md, 3), so he is the same boy tomorrow.

---

## 7. Move six: every world its own game

The user, after reading the first draft: a card set in a monster-romance world should fight with its own kind of moves, the way a space card fights with laser cannons and blades of light, a medieval card with swords and crossbows, and a high-fantasy card with fireballs and fancy sword techniques. And a group should be able to wander off mid-story to hunt treasure, open a shop selling English breakfasts, or train an army of ants to ruin a season's crops.

The skeleton already allows all of this: code owns a few verbs and every number, and models own the words (`docs/SYSTEMS.md`, 0). What was missing is a way for a **world** to set its own stakes, and a way to work at a **long goal of your own**.

### 7.1 The world kit

Every card gets a **world kit**: a short record of how this world plays. The builder writes it from the card and its lorebook, picking from fixed lists, and code checks every field. A field that does not check falls back to the nearest **stock kit**: medieval, high fantasy, modern, space, monster romance. A card with no model gets a stock kit, told apart by the card's own words, the way a road is now (DESIGN.md, 11.19).

| Field | Who decides | What it is |
|---|---|---|
| what the world is | model, from a fixed list of plain facts | magic or none, and how much; the era and its tools; what people fear |
| the seventh stat | model picks from a fixed list, or none | Arcana, Tech, Faith, Psi, Allure, … (7.3) |
| what you risk | model picks and names, code sizes | which dials exist and what they are called: health, shields, composure, nerve, reputation |
| the gear ladder | model writes, code places | what counts as nothing, plain and made-for-it in this world, for fighting, for getting about and for getting in |
| contest kinds | model picks from a fixed list | which back-and-forths this world has, and which stats attack and defend in each (7.2) |
| signature verbs | model picks, code prices | the verbs this world's abilities lean on (7.4) |
| what hurts what | model writes, code tags | the kinds of thing foes in this world are weak to |
| taken out means | model picks from a fixed list | wounded, captured, killed, claimed, shamed, exiled; held to the content settings (7.6) |
| what threats want | model writes | your death, your gold, your silence, you |

The kit is shown on your first page, in a few lines, and the narrator says each part the first time it matters ("In this world, a fight is won by breaking their composure, not their bones").

### 7.2 Fights in four worlds

The same rules, the same die, the same gap. Only what the dials mean and what the gear is change.

| | Medieval, no magic | High fantasy | Space | Monster romance |
|---|---|---|---|---|
| seventh stat | none | Arcana | Tech | Allure |
| your dial | health | health | health and shields | composure |
| gear | everything: no armour, leather, mail, plate; knife, sword, crossbow | matters, and magic can stand in for it | blaster, rifle, energy blade; a mech, a ship | charms, enchanted things, what you wear |
| signature verbs | reach (the crossbow at the far zone), guard (a shield wall) | sweep (a fireball takes a whole zone), bind (held still) | reach, sweep (the autocannon), guard (shields) | drain (their composure feeds yours), bind (entranced) |
| contest kinds | fight, duel, siege | fight, a duel of spells | firefight, dogfight, breaking into a system | **the fight is a seduction**; chases and struggles as anywhere |
| hurt by | being flanked, outnumbered, the high ground | the opposite element, holy things, true names | ion against shields, a pulse against drones | each monster's own weakness: a kind of attention, a relic, being out-teased at her own game |
| taken out | wounded, captured, killed | as medieval | as medieval | claimed, by the content settings |

In the monster-romance world, a lamia is beaten by outlasting her composure with moves of your own, under the same gap as a sword fight. A novice against an elder of her kind has **none** effect: the panties rule again. You need an edge (her weakness, a charm, a friend), or you need to run. It is a real fight, in that world's currency.

### 7.3 The seventh stat

Decided by the user (2026-11-10): only in worlds with that kind of power.

LOOP.md's six stats are kept in every world. **A world with its own kind of power adds one more**, named by the kit: Arcana, Tech, Faith, Psi, Allure. Stats then add up to 9 over seven, instead of 8 over six. A world without one has no seventh stat at all, so gear and Brawn carry more weight there; the lack is part of how the world feels.

The seventh stat does the same two jobs as the others (3.1): it gets you past things, and it notices.

> ARCANA — the ward on this door is old, and half of it is broken.
> TECH — that turret sweeps every ten seconds, left to right.
> ALLURE — she's more interested in you than she's letting on.

### 7.4 New verbs, scale and the ladder

**Four new verbs** for the ability list (`docs/SYSTEMS.md`, 3.3), priced by the same budget. The prices are a first guess, for the simulated player to settle:

| Verb | Plainly | Price |
|---|---|---|
| reach | Strike a foe in the far zone. | 1 |
| bind | A foe's next blow does not come. | 2 |
| sweep | Your notches go on every foe in one zone, not only one. | 3 |
| drain | Notches off a foe's dial come back off yours. | 3 |

**Scale joins the gap** (2.2): a person, a squad, a vehicle, a ship, an army. Each step of scale between you and what you face is ±1. One man with a rifle against a gunship is none. A blade of light cuts through a squad, but not a starship.

**Code owns the ladder.** Whatever the words say, gear is −1, 0 or +1. A +2 needs a price from a fixed list: it is rare, it runs out, it draws attention. So "my laser cannon does infinite damage" plays as a +1 weapon. The model can make a fireball look as grand as it likes; it can only do what its verbs say.

### 7.5 Projects: wandering off on purpose

A **treasure hunt** needs nothing new. A rumour of treasure is a lead that inks a place onto the map (LOOP.md, 4.3), and the builder makes a small side situation for it, with its own people and appointments.

A **long goal** needs one new thing: a **project**, after Blades in the Dark's long-term projects.

- **You name the goal**, in a line: "I want to open a shop that sells English breakfasts."
- **Code sizes it** by ambition: a clock of 4, 6, 8 or 12 segments. The gap still counts (2.2): an ambition far beyond who you are needs more segments, or edges.
- **The narrator says what it needs**, three or four things, each a scene or one throw over a long stretch (5.2).
- **It takes the story's time**, and the other side uses that time. Wandering off is always allowed, and it always costs something.
- **A failure brings a complication**, not a dead end: a rival, a debt, a law, the thing turning on you.
- **The other players have opinions** (4.5), and may help, refuse or leave.
- **It pays off as something the other rules use**, from a fixed list:

| Payoff | What it does |
|---|---|
| income | a supply at the start of every chapter |
| a place | somewhere safe; and people talk there, so you overhear appointments (5.1) |
| people | a faction or a crowd starts friendly, or someone joins you |
| a weapon | an edge you can bring to one fight, or a move against the big bad's plan |
| a name | how a whole town or faction treats you |

**The breakfast shop** (6 segments). Rent the empty bakery from the widow who owns it: a scene. Find eggs and bacon: a supply run. Get the recipe right: a Kitchen-Charm sort of trick is an edge. Opening day: a war of words with the tavern across the street. **Pays off:** income, and a place. Drovers talk over breakfast, so your silly shop becomes the best ear in town.

**The ant army** (8 segments). Work out that it can be done: Wits, a question to the narrator. Catch a queen: Grace, at night, in a field. Train them: long stretches, with throws. **Scale is the gap:** one colony against a season's crops is limited (one field); a whole valley's harvest needs a bigger project. **Pays off:** a weapon, aimed at something real, the lich's grain or the lord's tax harvest. **Comes back:** hunger, angry farmers, maybe a new step on the campaign's candle. Aldous will not help starve people, and likes you a little less.

**A whole campaign can be a sidetrack.** If you want a quiet game about running a shop, its big bad is the rival across the street, and the same rules play it.

### 7.6 Content settings

The community this lives in is adults only, and adult themes are welcome. So content becomes a setting per chat, not a filter built into the builder. This replaces DESIGN.md section 7's "keep everything non-explicit" whenever the settings say so.

| Setting | Off (the default) | On |
|---|---|---|
| heat | the scene fades at the door | explicit, written by the chat's own model and preset |
| dark themes | everyone in an intimate scene is willing | dubious and unwilling themes, where the world kit calls for them: monsters that hunt and claim, a captured rival, a villain's lair |
| let the dice decide | a die decides whether your hero is caught; what happens next is your choice | lose the contest, and the scene goes the way the world says |
| lines and veils | none | the tabletop safety tool, used as tuning: *lines* never appear, *veils* happen off-screen. Set once, kept for the chat |

With the settings on, the builder stops removing adult material from the card and lorebook, and the world kit may use it as stakes: taken out can mean claimed, a threat's want can be you, a corruption track can sit on your hero beside the fault. Characters played by the AI can be unwilling when dark themes are on and the world fits it. Mechanically it is the same contest of composure, chase or capture as anything else: code decides who has the upper hand; your model writes what follows.

Two rules hold whatever the settings:

1. **Nobody read as a child, ever.** Today the rule reads only the card's own character (DESIGN.md, 7). The moonshot invents whole casts: other players, monsters, the woman by the stairs. So **every person record gets an age band**, checked by code with the same rule. Nobody without a clear adult band is ever in a scene with heat or dark themes, whatever a model writes. This lands in the same step as the settings, not later.
2. **A refusal never breaks the game.** Some providers and models refuse or tone down this content whatever Tallow asks. When a reply comes back refused or empty, the narrator draws a veil ("…and the candle gutters"), every number stands, and play goes on. How far a scene really goes is the user's own preset's business.

---

## 8. Who decides what

The principle is unchanged: **models read and narrate; code decides every number.**

| | Code | Model |
|---|---|---|
| Effect and position | counts the gap from ratings, gear, edges and help; sets position from the scene | names what a foe is good at and hurt by, from a fixed list |
| A try that can't be made (effect none) | refuses the throw, picks what would change the gap | says it in character, with the options |
| The margin | decides what each stat notices, by number | words each note |
| Lies, theirs and yours | throws behind the hand, decides who believes what | words the lie, and the tell |
| Other players | their sheets, who speaks, what they know, their throws, their attitude | their words, in their voice, from facts code gave them |
| Appointments and routines | the schedule, what each step needs, how interference changes it | words each event |
| The campaign | the threat's steps, the keys, when it acts | words the threat and its hands for the card's world |
| The world kit | checks every field against its fixed list, places gear on the ladder, prices verbs, falls back to a stock kit | picks and words the fields from the card and its lorebook |
| Projects | sizes the clock, picks the payoff from its list, decides complications | words the goal's needs and what comes of them |
| Content | holds the settings and every person's age band; keeps lines out of the builder's work | writes the scene, within the settings, in the chat's own preset |
| What is real | only slips, records and the schedule | anything else it says is colour |

---

## 9. The tavern, played

Two other players are at the table. **Brother Aldous** (left), a hedge-priest; his player is a careful planner. Sense 3, Wits 3, Charm 1. **Sable** (right), a duellist and the card's own character; her player talks to everyone and kicks doors in. Grace 3, Charm 3, Guile 2. You are **Kest**, a sellsword: Brawn 3, Sense 2, Guile 2, Grace 1. Brawn 3 means sure hands when forcing.

It is 9:40 at night in the Lantern & Lamb. The black candle has not been lit. The narrator cuts a notch in the table candle, low down: midnight.

> **NARRATOR** The Lantern & Lamb is full of drovers and pipe smoke. Somewhere out back, at midnight, masked people meet. That is all the rumour says. What do you do?

In your margin, in pencil:

> SENSE — the woman by the stairs has looked at the back door four times.

And Aldous, across the table, out of character:

> **ALDOUS** Two hours to midnight. I'm not walking into an alley blind. I'll go look at it now, while it's empty.

You let him. The narrator will cut to him in a moment. You write: *I go to the bar, order another, and ask the keeper what's out back, like I don't care.*

That is talk with no risk: no die. The keeper starts wary.

> **NARRATOR** *(lifting the keeper's card like a mask)* "Bins and rats, friend. Nothing for you."

> GUILE — that came too fast. He's been asked before, and he's been paid to say it.

A slip goes down, *the keeper was paid to say the alley is nothing*, marked with a question. The narrator turns to the left.

> **NARRATOR** Meanwhile, Aldous. The alley is narrow and stinks. What do you do there?

Aldous's player writes, by itself: *I look the alley over, especially the ground.* That is a search, on Wits 3, controlled position, nobody about. His die shows 13: it works.

> **NARRATOR** Chalk on the sewer grate: a hand with seven fingers. Fresh.

His margin is his own, but he says it aloud when he comes back in:

> **ALDOUS** That sign is the lich's. I've seen it on a grave at the abbey. They're not meeting in the alley. They're going *under* it.

A lead: the narrator inks the sewer onto the map, with a dotted line toward the old chapel. Sable, who has said nothing for a while, is scored up and speaks:

> **SABLE** The woman by the stairs. I'm buying her a drink.

You hand it to her. Sable's player writes: *I sit down by her and tell her she looks like she's waiting for someone who's late.* The woman likes plain honesty (code knows; you don't). Her attitude goes from wary to friendly. What the woman knows is a secret, kept for people she is close to, so Sable presses with Charm: risky, standard effect. The die shows 16.

> **NARRATOR** *(the woman's card raised)* "My Tomas. He carries for them. A box, tonight. He said if he wasn't back by one, to burn his letters. I don't even know what's in it."

A new appointment: Tomas, with a box, coming to the alley at midnight. The narrator cuts another notch, a hair above the first. The table talks (4.4):

> **ALDOUS** Take Tomas before he gets there. Keep the box, follow them to the chapel.
> **SABLE** No. I put on Tomas's coat, hand them an empty box, and we see where they go.
> **NARRATOR** Kest?

You choose Sable's plan, with Aldous's half: catch Tomas first, gently, for the woman's sake. Aldous goes quiet; his attitude to you does not move, but he says "Fine. But if this goes wrong, it was her idea."

At 11:40 you catch Tomas at the corner (Brawn, controlled, sure hands: it works). He gives up the box and the word they use. Sable puts on his coat. *We wait at the window until midnight.* The narrator lets the candle burn; the room darkens; the flame touches the notch.

> **NARRATOR** Four come up out of the grate. Three in cloth masks. The fourth is taller, in black mail, and its mask is its face.

Sable gives the word and holds out the empty box. Guile 2 against the leader's noticing 2, behind the narrator's hand. You are not told. The leader takes the box, and weighs it in its hand.

> SENSE — it knows.

You write: *I go for the tall one with my sword.* The contest leather comes down. The grave-knight fights at 5. You: Brawn 3, a plain sword 0, no edge. The gap is −2: **limited**. One notch a good try, against a dial of six. Your sure hands mean you will not miss cleanly, but you are in a desperate position, and what comes back will hurt.

> **NARRATOR** That is a lot of man for one sword. You could, though. Or there is a lamp on the wall behind you, and the dead do not love fire.

You write: *I tear the lamp off its hook and smash it across its chest.* The lamp is fire, which it is hurt by: an edge. The gap is now −1: **standard**. Aldous, unasked, steps in to help: *I hold up the abbey's sign and say the words for the dead.* Holy, another edge: +1. The gap is 0: **standard**, and Aldous's help has made your position merely risky. The die shows 14: it works. Two notches, and one more because the line used what was there: three, and it burns.

The three cultists break at once (half their dials were never needed: their leader is burning). Two run; Sable trips the third. The grave-knight, half its dial gone and the box in its hand, does what its record says: it withdraws down the grate.

**The black candle is not lit tonight.** The box was empty. But the knight is going back to the chapel, and the rite is at four. You have a prisoner who knows the way, a woman whose man you spared, a keeper who lied to you, Aldous a little sour, and two notches still on the candle that you cut yourself.

### What the table could have done instead

Every one of these is played by the same rules, and leads somewhere:

- **Gone to the watch.** The watch captain is the bought bishop's man. He "sends men", who never come, and someone now knows your faces.
- **Waited on the roof.** You see them, they don't see you, and you follow the knight to the chapel without a fight, with nothing in hand.
- **Let Tomas deliver the box.** The rite has what it needs. The black candle is lit at four, whatever else you do tonight.
- **Picked a fight with the drunk.** A brawl, the watch comes, and the masked four hear of it and come later and more careful. Funny, and it cost you.
- **Done nothing but drink.** At midnight the meeting happens. At one, the woman burns the letters. At four, the candle is lit. The world went on without you.

---

## 10. What changes from LOOP.md

| LOOP.md | Here |
|---|---|
| People with attitude, patience, wants, lies, voices | **Kept.** Also: you can lie to them and not know if it worked (3.3). |
| Clues on slips, three to a key, the inked map | **Kept.** Margins make clues come from every stat (3). |
| Six stats | **Kept.** Each one is also a way of noticing (3.1), and a world with its own power adds a seventh (7.3). |
| Passive noticing as a narrator line | **Becomes the margin** of your notebook, in your hand (3.2). |
| Contests unchanged | **Changed:** effect and position, the gap, sure hands, foes that break, zones (2). |
| The other side's plan dial | **Becomes appointments** on a schedule, notched on the candle (5). |
| Companions who can join | **Become players** at their own seats (4). |
| The world remembers between stories | **Becomes a campaign** with a threat across stories (6.1). |
| The narrator as a character | **Kept,** and given a GM's craft (6.2). |
| Every card plays the same rules in the same words | **Each world gets a kit** for its fights, stakes and gear; projects for goals of your own; content as a setting (7). |

---

## 11. The risks, plainly

- **More model calls.** Other players add at most one short call per line, and most lines none (4.2). The Decision model picks who speaks and what kind of line it is in about a second. Splitting up doubles the scenes, not the calls per scene.
- **The wait.** The room already hides waits; the other players' hands give it more to do (one writes in their notebook while the narrator speaks).
- **Players who drift or all sound alike.** Code holds who they are and what they know; they are given facts, not a long history. Each has a voice line and a way of playing, chosen to be unlike the other.
- **Players who take over.** They speak at most once a line, never decide for you, and step back when you are playing well. You can always say "let me handle this".
- **Too much to learn.** Nothing here is a menu or a number on screen. The player is told one new thing at a time, the first time it matters: "you can't do that, but you could…"; "that's your hero noticing, in the margin"; "Aldous has an idea"; "the narrator cut a notch: something happens at that hour".
- **A schedule that can be solved is real work for code**, like the truth of LOOP.md. Hand-make the tavern first, as the river road was hand-made before roads were generated.
- **The balance numbers.** The simulated player must learn to wait, watch, split up and change the gap, or the win rates mean nothing. It needs a new bot.
- **The d20.** One could also make the die less swingy (two dice added, say). This proposal keeps the d20 the room is built around: effect does the work, and the die only says how it goes.
- **A world kit a model gets wrong.** Every field is from a fixed list and checked; one that does not check takes the stock kit's. The worst case is a world that plays like the nearest stock one, not a broken one.
- **Projects that swallow the story.** The other side's clock keeps running while you work, so a project is always a trade. The narrator says so the first time ("While you bake, the rite goes on").
- **Content the model will not write.** Handled by the veil (7.6): the game never stalls on a refusal.
- **People the builder invents.** Each one needs an age band before heat or dark themes can touch them (7.6). This is checked by code, and tested, in the step that adds the settings.

---

## 12. Build order (proposed)

Each step can be played and judged on its own, and the first is small.

1. **Effect and position**, on today's roads and contests. Ratings for foes, the gap, "you can't, but you could", sure hands, let it ride, foes that break. This fixes the panties problem straight away, with no new content.
2. **LOOP.md's people and "anything you write is played"**, with six stats, the seventh where the world has one, and **the margin**.
3. **World kits:** fights in the world's own currency, the gear ladder, scale, the four new verbs, the stock kits. **Content settings** in the same step, with the age band on every person.
4. **One other player** at a seat, with the spotlight rules, table talk and handing a try over. The card's character first.
5. **The tavern, by hand:** appointments, routines, waiting and watching, the notched candle, clues and the inked map. One handmade night, played until it is good.
6. **The second player and splitting up.**
7. **Projects**, with the breakfast shop as the first one played.
8. **Generated situations** with schedules, from the recipes, checked by code to be solvable; side situations such as a treasure hunt.
9. **The campaign**, the black candle, chapters and the finale.

## 13. For the user to decide

1. **Effect and position** (section 2): who you are decides what a throw can do; a 20 cannot make the impossible possible; "none" is a "but you could", never a dead end.
2. **The margin** (section 3): every stat notices something different, and your hero writes it in your notebook. Should your fault get its lying voice there too?
3. **Two other players** (section 4), with the card's character as one of them. One seat first, or both at once? Should they talk across the table out of character as well as in it?
4. **Appointments** and the notched candle (section 5), in place of LOOP.md's plan dial.
5. **The campaign** (section 6.1), with the black candle, as a mode beside single stories.
6. **World kits** (sections 7.1 to 7.4): each world sets what a fight is, what you risk and what its gear means. *Decided:* a seventh stat only where the world has its own kind of power (Arcana, Tech, Allure, …); none in a world without one.
7. **Projects** (section 7.5): long goals of your own, on a clock, paid off in things the other rules use.
8. **Content settings** (section 7.6): heat, dark themes, letting the dice decide, lines and veils; an age band checked on every person.
9. **The build order** (section 12): effect and position first, since it is small and fixes combat today.

## 14. What is built (2026-11-10)

Every system above has its own rules file, pure and tested, and the director calls them through one world layer (`src/engine/world.ts`) at four points: when a story begins, when you come to a place, when you write a line that tries nothing, and when the clock runs. `src/content/tavern.ts` is section 0's night, by hand, and uses all of them; `ADV=tavern bun run adventure` plays it as text.

| Move | Rules | Played now | Not yet |
|---|---|---|---|
| 2. Effect and position | `engine/effect.ts` | Ratings, the gap, the effect ladder, position, bold and careful, sure hands, "you can't, but you could", foes that break | |
| 2. Six stats, and a seventh | `engine/moment.ts`, `engine/hero.ts` | Brawn, Grace, Charm, Guile, Wits, Sense; the seventh only in a world with that kind of power, named by the kit; old saves read into the six | |
| 3. The margin | `engine/margin.ts`, `room/paper.ts` | Notes by stat, written in the notebook; your fault at most twice a story; a fellow's notice goes in too | |
| 4. A full table | `engine/seats.ts`, `engine/world.ts` | The spotlight (at most one speaks; everyone when you ask the table), what they say chosen by code and voiced by a model, notices aloud; talking it over at the climax; a vote ("let's vote"), whose plan is an edge for the way the table chose; handing a try to a player ("Brannoc, you take this"), thrown on their stats; going a player's way or against it (overruled three times running, they go cool; backed when it was desperate, they warm); splitting up ("Ysolde, keep watch on the alley"), with "cut to" when something happens there, and what they saw when you regroup | |
| LOOP.md 3. People | `engine/people.ts` | Attitude on five steps, likes and dislikes once a visit, threats cost, patience, how they feel counts in talking them round, they tell only what code released, a hunch on a lie; lying to them (your Guile against their Sense, thrown behind the narrator's hand: believed, they open a step further this once; seen through, they play along and tell you nothing) ; pressing them (a throw: Brawn to frighten, Charm or Guile otherwise, against their resolve), reading them (Sense against their skill at lying, on the thing you name or the last thing they said, once a visit; a lie caught marks the slip), favours (ask what they need: a clock of 4, and done they are close and tell everything) | |
| LOOP.md 4. Clues and the map | `engine/clues.ts` | Slips heard, doubted, seen, proved and torn; a clue that points somewhere inks it down the map's margin; two slips laid together on a Wits throw; keys known; at the end of the story every key you hold is an edge on every try | |
| 5. The clock | `engine/schedule.ts` | Appointments with needs, unless and otherwise; routines; the clock runs on the road, on questions and on tries; wait, watch, follow, get ready, a long stretch; notches when you learn of one; a step of the big bad's drops a stone in the bowl; the notches cut into the tall candle in the room, at the height each hour falls, gone as the flame passes them | |
| 6. The campaign | `engine/campaign.ts`, `game/session.ts` | Ask for a campaign when choosing a story: a big bad written by a model from the card's world while you write who you are (checked by code; the stock fronts fill in what is missing), six rings, a step after every story you do not set it back, keys carried on, its brief given to the models; the black candle at the narrator's right hand, six rings scored, lit while the big bad takes a step; the last story, when the candle is out or you hold all three keys, with the big bad itself at the end of the road rated at the top of the scale, every key you carried an edge | |
| 7. World kits | `engine/kit.ts` | The kit chosen from the card's words (held to our own day when the card is), the seventh strength, the kit on the first page, the four fight verbs (reach, bind, sweep, drain) in contests; a fight thrown in the kit's own currency (a seduction on Charm and Allure where you risk your composure, a firefight on Grace and Tech where you risk your shields), said once; your gear read from what you carry against the kit's ladder (fighting for force, getting in for sneaking), at most +1 without a price paid | |
| 7.5 Projects | `engine/project.ts` | A goal named in a line becomes a clock of 4, 6, 8 or 12; a long stretch spent on it throws once; complications, never dead ends; what a finished project pays off, kept from story to story: income (a supply every story), a place (people talk there, and you overhear one of the other side's plans), people (everyone starts a step warmer), a weapon (an edge in the next fight, then spent), a name (a step warmer with whoever you talk to) | |
| 7.6 Content settings | `engine/content.ts` | Heat, dark themes, lines and veils (kept per browser under `tallow:content`); the default limits in every prompt replaced by what the story allows; only clear adults in a scene with heat or dark themes; a refused or line-crossing reply is played as the veil; set at the table in your own words before a story ("heat on", "no dark themes", "let the dice decide", "line: spiders", "veil: torture", "clear the lines"), written in the notebook's margin and kept for the next sitting | |

Nothing in the last column is left. Playing three real cards (2026-11-10) found that a story built from a card had none of the living world: no fellows, no people with minds of their own, no clues and no other side's clock, so the full table, pressing, reading, favours, the casebook and the notched candle never switched on in it. Now every laid road is furnished (`engine/furnish.ts`): a person with a want, likes, a resolve and things they know at every stop where someone stands in the way; three clues to each of the story's three keys, spread over people and places, and a lie when there are two people to tell one; and three moves on the other side's clock, the last a stone in the bowl. The model that rewrites the story for the card writes their words too (`game/build.ts`), and their age band is read from those words by code. Everyone walking with you, the card's own character first, has a seat at the table (`seated` in `engine/world.ts`), a companion who joins on the road too. A vote, talking it over, pressing, reading, asking what someone needs, sending a player off or waiting for an hour is read by the world before it is read as a try, and a vote with nobody to vote with says so. A second round with the same cards (2026-11-11) found the table now alive, and fixed what still slipped: doing what someone asked (or working at a goal of your own) works its clock, an hour or a stretch at a time, and a goal not finished goes on into the next story; talk at the table takes no time, anything done in the story says the hour it leaves you at, and calling everyone back takes half an hour; a move of the other side is said once, and one you came too late for is found when you get there; slips can be laid together by number; a clue inks a place by the name the card's world gave it; a try handed to a player is thrown on the stat they are best at, and named as theirs; and the builder hears what the player asked for, and the campaign so far. An audit of the machines hidden in the code (2026-11-11) made the line router one table of rows (`ROWS` in `engine/world.ts`): a line read as a try is taken from it only by the rows that may take one (a vote, asking the table, a player sent off, pressing, reading, a favour, two slips, work on a project, a wait on its own), and goes back to being a try when they have nothing to say; a try with a wait in it is thrown, and a player sent somewhere not on the map asks where. Words in front of the person there are said to them, but a look round or a question about the place is the narrator's or luck's. The hour is set in one place (`clockTo` in `engine/adventure.ts`), so time past the deadline loses the job however it was spent; giving in, a question that asks to try, a try handed to a player, the hour a line names and asking the table each read only what they mean. A second audit fixed what it found under the stops, the campaign and the models: the hero prompt now gives the real stat budget, and a spread that misses it is put right rather than swapped for the kind's; a failure saved by sure hands or a slip costs the price, never the dearer price of half-working, and a 1 always fails, as the narrator now says; a chapter won stops the step the big bad was about to take, so the next loss takes the steps after it, and the campaign's first chapter is built with its big bad (written from what the player asked for), with friends, enemies and each chapter's trouble carried in the brief; clues come only for getting past a place, not for being taken out of the fight or turned back, and a favour finished mid-fight waits until it is over; the trip's sheet is the one that counts (`sheetKept`), so the next try keeps what changed on it; and a lie is flagged by the same hunch however it reaches you. Its second half fixed the rest: a scouting player is sent only to a place with something still to find; arriving where you got first stops what the other side meant to do there, and the candle's notch is scraped off; one-offs are going on only once they really happened; what you have to go on is shown again after every try and on resume, with the map and the candle's notches; a card set in Hell gets Hell's era, fears and foes (checked like a model's kit) rather than kingdoms and towers, and a ship among the stars no longer makes a card of an older age; content set at the table is read setting by setting ("heat on, no limits" is heat on), a story named in the same line is still taken, and a line drawn on a word is not crossed by a longer word; the black candle stands again on resume; every line a model writes, the epilogue too, keeps to what the game allows; and a rest is offered when your store is spent, not only when you are hurt. A third round with the same three cards (2026-11-11) found the living world working, and the misreads left in loose words: an hour said on the clock face ("until a quarter past two", "5 o'clock", "a quarter to midnight") and a length of time ("half an hour", "another hour", "a couple of hours") are now read as said; a question, a reading or pressing is never an hour's work on a favour, whatever it names, and putting in more time on a goal is; "press" is pressing a person only when it is said to one, and a place with nobody of its own to press takes it as a try; a try handed to a player with no way named is thrown the way they are best at; a player is sent to the place named, by its whole name, and at a fork goes down one way while you take the other; arriving at the end of the road with no time for a try ends the story there; running out of time takes one step of the big bad's, and only being taken out at the end of the road takes two; each chapter opens with the black candle; and a notch is cut only for what is still to come. Maps now come in shapes (2026-11-11). A road is still walked from one end to the other; a **hub** (`shape: "hub"` on a recipe, `hub` on the adventure) is a place you go out from and come back to: its places are each a leg out, going from one to another is back through it, they are done in any order, and the end opens once all but two of them are done (never fewer than two), so the last ones are a choice between more to go on and the other side's hours. The mysteries and the vault are cased from a hub; the narrator names the places by number and says when the end opens, and more than two are picked by name or number rather than from two cards in the narrator's hands. A region (places with roads between them, gone back to) and a site (a building's rooms inside one place) are next.

Balance, with the simple player that plays to its strengths (it does not vote, split up, press or court favours, so it plays none of the table's new moves): every story is won 84 to 99 times in 100 (`ADV=gen:all RUNS=100 bun run adventure`; the pilgrimage is the hardest; it was 74 to 99 before the roads were furnished, since the clues the people on the road give up are now edges at the end), and the tavern 99.

