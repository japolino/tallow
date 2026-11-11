# Tallow: the loop, rethought

A proposal, not built. It answers the user's verdict after playing (2026-11-10): easy to understand, but slightly boring. "I can't imagine doing adventures outside of the novelty of it." In particular:

- You cannot build rapport with anyone. You cannot flatter someone in one turn and ask them for something in the next.
- It feels linear: A to B.
- Leads are handed to you. Nothing tells you *where* to go next.
- The narrator never speaks as a character, and nobody else speaks in their own voice. Everything is told in the third person.
- The stats are only for getting past things. In classic tabletop games, most of a character's skills are for noticing clues, working out what happened, lying to people, and catching people lying to you.

`docs/DESIGN.md` stays the rulebook and `docs/SYSTEMS.md` the systems skeleton. This file says what would change in the core loop and why, and goes into them once it is agreed. Everything already built (the die, the balance, contests, dread, abilities, the room) is kept and given more to do.

---

## 1. What is actually wrong

The visible problems are symptoms. The cause is one decision made at milestone 2: **every place is a gate, and one good throw opens it.**

Here is a real played mystery, seed `05ecdd99`. The card at the inn says the innkeeper "knows everything that passes on this road… for two supplies they might remember what you need." The player writes "I ask them kindly to let me by". One die later they are past, and the innkeeper is gone from the story. A mystery is played as seven gates in a row, and nobody ever investigates anything.

Everything the user found follows from that:

| What it feels like | Why |
|---|---|
| No rapport | A person is a lock. Once it is open you have left, so there is no "next turn" in which a kind word could pay off. |
| A to B | The road decides where you go. A fork is the only choice, and it is a choice between two unknowns. |
| Leads are handed to you | No information exists in the game for you to find. The goal is said at the start, and the places come to you in order. |
| Nobody has a voice | A person exists for exactly one check, so there is nothing for them to say. The model only tells what the die did. |
| Stats only for passing | There is nothing to notice, read or work out, so there is nothing for a noticing stat or a reading stat to do. |
| The best move is boring | At a gate the winning move is to find the easiest way and say it plainly. Cleverness earns little more than a plain line. |

### What makes a tabletop adventure satisfying

Every change below is measured against six things. The current game has the first two and almost none of the rest.

1. **Risk.** Dice, and real costs. *We have this.*
2. **Pressure.** A clock, and someone working against you. *We have this.*
3. **Discovery.** There is something hidden, and you find it out by your own effort. *Missing.*
4. **People.** Others want things, remember what you did, and can deceive you or be won over. *Missing.*
5. **Agency.** You decide where to go and what matters, and the story bends to it. *Barely: the forks.*
6. **Payoff.** What you found and who you won over make the ending easier, so a plan comes together. *Missing.*

---

## 2. The new core, in one sentence

> **Every hour you spend finding things out makes the end easier, and gives the other side an hour.**

A story is no longer a road of gates. It is a small world of places and people with a truth hidden in it. You decide where to look, whom to talk to and whom to believe. The other side's plan moves forward while you do. You can go to the end whenever you like, and what you have learned decides how hard it is.

The loop at each scale:

- **A line.** You write what you do: talk, look, ask, lie, read someone, act. Most lines need no die. A die comes out when there is risk or someone resists.
- **A place.** A scene with people and things in it. You stay as long as you like, and every action takes time. You leave when you choose, not when a die says so.
- **A story.** Follow leads from place to place, gather what the end needs, decide when you know enough, and go.
- **Between stories.** The people of the card's world remember you.

### 2.1 Anything you write is played

The user's own words: "if I sit down and play a tabletop game with a friend, I'll have more freedom to do fun stuff and roleplay as a character than what I currently do with this extension." At a real table you can sing in the tavern, steal a pie, start a bar fight, flirt with the barmaid, or sulk in a corner in character, and the friend running the game *does something with it*. Today Tallow squeezes every line into one of four ways past a gate, and treats a line that is none of them as a question.

The new rule: **every line gets an answer that changes something, and the story is allowed to wander.** The narrator sorts each line into one of three kinds:

1. **Nothing at stake.** Singing, eating, looking out of the window, a joke, a mood. No die. The narrator plays it out and the world reacts in character: the room goes quiet for your song, and a man by the fire starts to hum along. It can leave a small fact behind (a slip: "the fiddler liked your song"), or move someone's attitude when it touches what they like (3.1). Playing your character is never wasted.
2. **Something at stake.** Anything risky or resisted, not only the four ways: picking a pocket, climbing onto the roof, out-drinking the smith, a card game, a dance. The reader names which of the six stats it leans on (5.1) and what could go wrong. Code sets the difficulty from the place and the person, and you throw. What happens is chosen by code from a short fixed list: someone's attitude moves; a slip is gained (a fact, or a lead); time is lost; a cost is paid; trouble starts (a new person, a chase, a contest, a guard who now watches you); something is taken or given. The model tells it.
3. **Trouble you make on purpose.** You start the bar fight, you set fire to the barn, you shout the accusation in the square. That is allowed. Code turns it into a contest, a move of the other side's plan, or a change in how a whole place treats you. Consequences are real, but the game never says no.

Two more things give you room to roleplay:

- **Say it's so.** Once in a while you can add a small fact about the world or your own past: "I know the miller, we grew up on the same street." Spend 1 of your store and it becomes true and gets a slip, as long as it does not hand you a key outright (code checks). The miller now starts at friendly, and has a reason to be. This is how a player at a real table shapes the story, not only reacts to it.
- **Your hero's nature pays.** Your hero's calling, drive and fault (`docs/SYSTEMS.md`, 2.1) are on your first page. A line that plays them out when it costs you something (pride when it would be wiser to bow, pity for the wrong person) earns your store back, as giving in to temptation already does. The narrator will sometimes ask you a question about your hero ("What does Wren see, looking at the Hall for the first time?"), and the answer is kept and used.

None of this needs a menu. You write what your character does, as at a friend's table, and the code underneath only makes sure every number stays fair.

---

## 3. People

Every person in a story is a short record. Code holds the numbers and the model writes the words, as with abilities (`docs/SYSTEMS.md`, 3).

| Field | Who decides | What it is |
|---|---|---|
| name, look, voice | model | How they speak: "clipped and dry, calls everyone 'friend'", "rambles, laughs at her own jokes". |
| wants | model writes, code tags | One thing they want now ("the debt on the inn forgiven"). |
| fears | model writes, code tags | One thing they are afraid of. |
| likes / dislikes | model picks from a fixed list | Two of each: flattery, plain honesty, coin, a good story, their trade talked of with respect, music, being left alone, threats, pity, gossip… |
| attitude | code | How they feel about you, on five steps (3.1). |
| resolve | code | How hard they are to push past what they would freely do. Easy, fair, hard or very hard, as now. |
| patience | code | How many lines they will hear in one visit before they want you gone (3.2). |
| knows | code | Which clues they hold, and at what attitude they will share each (3.3). |
| a lie | code decides, model words it | At most one thing they will lie about, and why (3.4). |

### 3.1 Attitude: rapport you can build

Five steps. The person's card on your side of the table shows where they stand: the narrator moves a small bead along a notched edge of the card.

| Step | They will | Talking them round is |
|---|---|---|
| Hostile | refuse, lie, maybe warn others about you | two steps harder |
| Cold | answer only what anyone could see | a step harder |
| Wary (most start here) | tell what is open knowledge | as it is |
| Friendly | tell what they would only tell a friend | a step easier |
| Close | tell their secrets, do you a favour, maybe join you | two steps easier |

**What moves it, with no die.** Each of these counts at most once per person per visit, so they cannot be repeated for profit:

- A line that fits something they like: +1. Praise the stew of an innkeeper who likes her trade respected.
- A line that touches what they want: +1. Offering to help with what they want also opens a favour (3.5).
- A gift they value: +1.
- A line that hits something they dislike: −1. Flatter a man who likes plain honesty, and he trusts you less.
- A threat: −1, even when it works.
- A lie of yours that comes to light: −2, at once and for good.

Code decides all of this. The model (the Decision model when there is one) only reads the line: who it is said to, what kind of line it is (small talk, praise, an offer, a question, a threat, a lie, a plea), and which of the person's likes or dislikes it touches. Code checks that answer against the person's actual list. A line cannot be argued into a bonus.

This is the rapport the user asked for. Praise the cook this turn, and next turn the question about the cellar is a step easier, and she tells you more than she would have.

### 3.2 Patience

A person hears 3 lines in a visit, one more if friendly and two more if close. A line that moves them, or asks something they will answer, does not use up patience. Repeating yourself, or a line that interests them in nothing, does. When their patience runs out they end it in their own words ("I have a room to clean"), and you can try again after an hour or more has passed. This keeps conversations from being fished for answers, and it makes a short visit with a good opening line worth more than a long one.

### 3.3 What they know, and when they tell it

Each clue a person holds has a threshold: **open** (wary is enough), **guarded** (friendly), **secret** (close), or **never** (only pressing or proof gets it out of them).

To get something above where they stand, you can **press**. That is a die, the way talk is now: Charm to persuade, Guile to bluff, Brawn to frighten. The difficulty is set by their resolve and shifted by their attitude, so the rapport you built makes the press easier. Frightening someone works now and costs you later: one step of attitude when it is over.

### 3.4 They can lie

Some people lie: to protect themselves, someone they love, or the guilty one. The lie is a real clue in the game, written on a slip like any other, and it points the wrong way. Code knows it is false; you do not.

Three ways to catch it:

1. **A hunch, with no die.** If your Sense is at least the liar's skill at lying, the narrator adds, unasked: "something in how she says it does not sit right." The slip is laid down marked with a question.
2. **Reading them.** Write that you watch them closely and ask yourself whether they mean it. Throw on Sense. Works: you are told plainly whether that last thing was true. Fails: "you cannot tell". You are never told a false answer.
3. **Proof.** Two slips that cannot both be true. Lay them together in a line ("the innkeeper says the cart left at dusk, but the miller's boy saw it at noon") and throw on Wits. Works: the false one is torn in half and the liar is caught.

A caught liar is **leverage**. Confronted with the proof, they give up the true clue at once, but their attitude drops a step unless you let them save face.

### 3.5 Favours

What a person wants is also a small job: fetch the debt-note from the moneylender, find out who has been stealing the hens. It is a lead to another place (section 4). Doing it raises them to close, and close people do things for you: give their secret, walk with you, or turn up at the end when you need them.

### 3.6 Their own voice

People speak for themselves, in the first person, in their own voice: "You've a face I'd remember, friend. And I don't." The narrator speaks for itself too (section 8).

**Code decides what they reveal; the model decides how they say it.** The model is told the person's voice and attitude, and the exact facts code has released this turn (which may include their lie). It writes their reply. It can add colour, but **only what is on a slip is a clue**: a fact the model invents in passing changes nothing, because only the narrator's slips count. That is how "models read and narrate, code decides" holds in a conversation.

---

## 4. Finding things out: clues, leads and the map

### 4.1 The truth, and the three things the end needs

Each story hides a **truth**, which code lays out from the story's recipe and the seed, and the model words for the card's world. The end needs **three keys**: three things to know or have. What the keys are depends on the kind of story:

| Story | The three keys |
|---|---|
| A mystery | who did it; how it was done (the proof); where they will be |
| A rescue | where they are held; a way in; who guards them, and when |
| A heist | a way in; the guards' habits; the secret of the lock |
| A journey | the safe road; who is following; the word or paper that gets you through |
| A hunt | its lair; its weakness; what draws it out |
| A romance | what they long for; the old wound; the rival's lie |
| A night to survive | what the danger wants; its weak point; who among you can be trusted |

### 4.2 Clues, three to a key

Every key has **at least three clues**, in three different places or people, so missing one never locks the story. Some clues are things you see; some you are told. A few are lies (3.4). Code checks every story before it is played: every key can be found, the false clues can be caught, and the end can be reached with no keys at all (only very hard).

A **clue** is a slip the narrator writes and hands you, in its own hand, a line long: "Muddy cart tracks on the north road, made at dusk." A slip is in one of four states:

| State | How it gets there | On the table |
|---|---|---|
| heard | someone told you | laid down plain |
| doubted | a hunch or a reading says it may be false | laid down with a question mark inked on it |
| seen | you found it with your own eyes | laid down with a small wax drop: it is sure |
| proved | two clues agree on it | pinned, with the key's word underlined |

A key is **known** when it has one proved clue, or two that agree.

### 4.3 Leads say where

Most clues point somewhere: a place or a person. **When you get a clue that points to a place you have not been, the narrator inks that place onto the map with a pen, and lays the slip on it.** The map starts with only a few places on it: where you are, the place the trouble is, and one or two others. It fills in as you learn. Where to go next is never handed to you. It is written on the slips in front of you, and you choose which to follow.

This answers "leads are delivered to you instead of where": the leads are the map.

### 4.4 Clues are also leverage

A slip is a fact you can lean on, as levers are now. "I show him the cart tracks" makes pressing him a step easier, once. Marks (`docs/SYSTEMS.md`, 4) and clues become one thing: a slip of true fact on the table, which can point somewhere, be leaned on, or both.

---

## 5. Six stats, and three kinds of throw

### 5.1 The stats

Four stats cannot hold noticing, reading people and lying apart from charm and sneaking. Six can, and each still says one plain thing:

| Stat | Plainly | Used for |
|---|---|---|
| Brawn | strength and toughness | forcing, enduring, frightening by size |
| Grace | quiet and quick | sneaking, climbing, quick hands |
| Charm | warmth and nerve | winning people over, persuading, performing |
| Guile | a straight face | lying, bluffing, disguise, cheating at cards |
| Wits | a quick mind | searching a place, knowing things, piecing clues together |
| Sense | a keen eye and a feel for people | noticing what is there, telling when someone lies, reading a mood |

Each is still 0 to 4. They add up to 8 instead of 6. Two heroes now play differently even at a gate. A high-Sense hero sees more on the page and catches liars. A high-Guile one talks through doors with lies, at the risk of being found out.

### 5.2 Three kinds of throw

All of them use the same die and the same balance.

1. **Open**: you throw, as now. For acts with a cost if they fail: pressing, sneaking, forcing, searching, reading someone.
2. **Without a throw**: your stat against a fixed number, for things you would not know you had missed. On entering a place, every hidden thing whose number is at most 10 + your Sense is simply noticed. The narrator mentions it ("you notice the hearth was swept, but only on one side"). A sharp hero sees more, and the player sees why the stat matters.
3. **Hidden**: the narrator's own throw, behind its hand. When you search a spot and find nothing, it is either because there is nothing there or because you missed it, and you are not told which. The narrator cups its hand over the pale die in its tray, rattles it, looks, and says only what you found. This is the classic tension of searching, and it gives the narrator a creepy little ritual.

---

## 6. A place is a scene, not a gate

A place has **people** (none to three), **spots** (two to four things to look at, each with what is to be found there and how hard it is to find), and sometimes an **obstacle** (something between you and part of the place, played with the four ways as now).

What a line can do there, and what it costs in the story's time:

| You | Die? | Time |
|---|---|---|
| talk with someone: small talk, praise, offers, questions | no | ten minutes |
| press someone: persuade, bluff, frighten | yes, open | ten minutes |
| read someone | yes, open (Sense) | none (part of talking) |
| look a spot over closely | yes; finding nothing is a hidden throw | half an hour |
| put two slips together | yes, open (Wits) | ten minutes |
| get past an obstacle: talk, sneak, force, pay | yes, as now | half an hour |
| ask the narrator about what is plainly there | no | none |
| go somewhere else on the map | no | the road's hours |
| rest | no | three hours |

**You leave when you choose.** Nothing ends a scene except you, a contest (which still ends the way contests do), or the other side's plan.

---

## 7. Freedom, and the other side

### 7.1 Go anywhere you know of

There is no road and no fork. Any place inked on the map can be reached, at the hours the roads between take. The place where it ends is often on the map from the start. **You can go there whenever you like.** Every key you are missing makes the end a step harder and leaves one way of dealing with it shut.

So the question in every story is the one in section 2: *do I know enough yet?*

### 7.2 The other side's plan

Whoever works against you (the guilty one, the takers, the beast, the storm) has a plan of five or six steps, kept on the contest board's dial on the narrator's side. It moves a step every two hours of story time, and a step for some failures, which dread can also spend. Each step is a real change that the narrator tells as it happens:

- a clue is destroyed ("the ledger goes into the fire");
- a person leaves town, or is silenced;
- a guard is doubled;
- the prisoner is moved;
- the deadline comes closer.

The rival's dark seals and the deadline become this one thing. Like dread now, it is in plain sight, so you can see the other side coming.

---

## 8. Voices

### 8.1 The narrator is a character

It speaks in the first person, always, as itself: a dry, patient, slightly wicked host who enjoys your trouble, keeps score, and remembers you between stories. It describes the scene to you in the second person ("you smell smoke"). It comments on what you do ("Kind words for a woman who just lied to you. Interesting."). It teases a full bowl of dread. It is pleased when you are clever.

Its **rules voice** is kept short. Each rule is said in full only the first time it matters in a sitting, and in a few words after that. The pages carry the details for anyone who wants them. Most of what you hear should be the story and the people, not the bookkeeping.

### 8.2 People speak for themselves

When someone speaks, **the narrator lifts their card in front of its hood, like a mask**, and speaks as them. Their words come up in quotation marks under their name. When it lowers the card, it is itself again. With nothing new on the screen you always know who is speaking. And it is a small, strange, theatrical thing to watch the shadow across the table put on a face.

The eyes could also change shape a little for each mask: rounder for a child, narrower for a liar's sidelong look. That is optional, and for later.

---

## 9. Between stories: a world that remembers

People of the card's world who matter (anyone you made close, anyone you made hostile, anyone you caught lying) are **kept with your hero for that card**, as the hero already is. In the next story, some of them come back: the innkeeper you helped greets you as a friend and starts at friendly; the man you threatened has told others. The narrator remembers too ("You trusted a miller last time. Shall we see if you have learned?").

This is the long-term reason to keep playing: your place in this world grows, story by story.

---

## 10. What stays, and what each part now does

| Built | What it does in this design |
|---|---|
| The die, the box and the balance | Every open throw, unchanged. |
| The four ways | Getting past obstacles, unchanged. Talk is now also the ordinary act of conversation, and a die comes out only when someone resists. |
| Contests | Fights, chases and arguments, unchanged. A key you hold can take notches off a foe's dial before it starts ("you know his weakness"). |
| Dread and the narrator's moves | Unchanged, with new moves: *silence* (a person leaves or stops talking), *burn* (a clue on the map is lost before you get to it), *rumour* (someone you have not met starts cold). |
| Abilities | Unchanged. The *learn* verb now gives a clue or turns a doubted slip, and *sway* moves someone's attitude a step. |
| Levers and marks | Merged into clues: one kind of slip (4.4). |
| Companions | A close person can join you. Companions also have attitudes, and can leave if they turn cold. |
| Health, supplies and goodwill | Health and supplies stay. Goodwill (one number for everyone) gives way to each person's own attitude, and the pale seals become the beads on the people's cards. |
| The narrator's pale die | Luck questions, and now also the hidden throw (5.2). |
| The notebook and the pages | Unchanged. Clue slips go on the map; the pages stay the record. |

---

## 11. Who decides what

| | Code | Model |
|---|---|---|
| The truth, the keys, where every clue is, who lies | lays them out from the recipe and the seed, and checks they can be solved | words them for the card's world |
| A person's likes, wants, resolve and patience | sets the numbers, from a fixed list | writes who they are, and their voice |
| What a line is (who to, what kind, what it touches) | checks the reading against the facts | reads it (the Decision model first) |
| Attitude, patience, what is revealed | decides all of it | — |
| What a person says | releases the facts | writes the words, in their voice |
| Every number, every throw, the plan's steps | decides all of it | tells it |

The one new risk: a model may invent a fact in conversation. The rule "only what is on a slip is a clue" makes that harmless.

---

## 12. One scene, played

A made-up mystery. A wrong was done at Hare Hall and Maren Vell is blamed. You are Wren: Charm 2, Guile 1, Sense 3, Wits 1, Grace 1, Brawn 0. Three places are on the map: Hare Hall, the Brack Inn and the mill. It is 2 pm, and the plan dial reads 0 of 6.

You choose the inn. The road takes an hour.

> **NARRATOR** The Brack Inn: loud, full, and warm with tallow smoke. The keeper watches you come in and says nothing. *You notice the hearth was swept, but only on one side* (your Sense). Your move.

You write: *I sit at the bar and tell her it's the best-smelling stew I've had on this road.*

The reader says: talk, to the innkeeper, praise of her trade. She likes her trade respected, so her attitude goes from wary to friendly. No die. Ten minutes pass.

The narrator lifts the Innkeeper's card in front of its hood:

> **ODILE BRACK** "Mutton and juniper. My mother's. You've a better nose than the last lot through here, friend."

The bead on her card slides to friendly.

You write: *I ask if she saw anyone from the Hall in here the night it happened.*

That is a guarded clue, and she is friendly, so she tells you. She is also the one with a lie: she is covering for her brother.

> **ODILE BRACK** "Only Maren. Came in late, wet through, and left before I'd poured."

The narrator writes a slip, *Maren was at the inn late, wet through*, and lays it down with a question mark. Your Sense 3 is at least her lying, so: "Something in how she says it does not sit right."

You write: *I watch her face and ask myself if she's telling the truth.*

You throw on Sense. The balance leans your way. The die shows 14: it works.

> **NARRATOR** She is lying. And she looked at the swept side of the hearth while she did it.

You write: *I look over the hearth, the swept side.*

That is a spot, so you throw on Wits. The die shows 9, and with your Wits that falls short, so the narrator throws behind its hand. "You find nothing." Half an hour passes. It is 3:50, and the plan dial is still at 0.

You write: *I tell her softly I know Maren wasn't here, and I'd rather hear the truth from her than from the constable.*

The reader says: press, to the innkeeper, a plea, leaning on the doubted slip. Her resolve is hard, but friendly makes it a step easier, and the doubted slip leaned on makes it one more. You throw on Charm. The die shows 13: it works.

> **ODILE BRACK** "…It was my brother. Tam. He brought a cart round the back at dusk and asked me to say I'd seen Maren. He's at the mill. Don't you dare hurt him."

The slip with the question mark is torn. A new slip, *Tam brought a cart round the back at dusk*, is laid down plain, and the narrator inks a cart track from the inn to the mill. Her bead slides back to wary: you made her betray her brother. The first key, *who did it*, has one good clue now and wants one more.

Six lines, two dice, no gate. A friend made and partly spent, a liar caught, a lead with a place on it, and an hour and fifty minutes gone that the other side will use.

---

## 13. Why this is more fun

- **More decisions.** Today each place asks one question: which way is easiest? Now every line asks one: what to say, whom to believe, whether to spend time searching, whether to press now or win them over first, where to go next, whether you know enough yet.
- **Being clever pays.** Reading what a person likes and saying the right thing is mastery that dice cannot give you, and it gets better with practice.
- **Discovery.** There is a truth, and you find it out. Catching a lie is one of the best feelings a tabletop game has.
- **A plan comes together.** The end is shaped by what you found and who you won over, so it feels earned.
- **Every story is different.** Code generates the truth and its clues, so the same mystery has a different culprit and different liars every time, and still always has an answer.
- **A reason to come back.** The people of the card's world remember you.

It stays easy to learn. The player is told four things, each the first time it happens:

1. Talk to people, and they remember how you treat them.
2. What you learn goes on slips, and slips show you where to go.
3. Time runs, and the other side moves while it does.
4. Go to the end when you think you know enough.

Everything else is the narrator's job.

### The risks, plainly

- **More calls to the model**, one per conversational line, as questions already make. The Decision model's quick reading keeps the wait about as it is now.
- **Generating a solvable truth is real work** for code. It is the same kind of work as the road builder, with the same kind of checks.
- **The simulated player has to learn to investigate**, or the balance figures mean nothing. It needs a bot that talks, searches and follows slips.
- **A story will run longer** if the player investigates everything. The plan's clock is what keeps it to 30 to 60 minutes. Its pace is to be judged in play.

---

## 14. Build order (proposed)

Each step can be played and judged on its own.

1. **People, and anything you write is played.** Attitude, likes and wants, patience, first-person voices, the card lifted as a mask, and the three kinds of line (2.1). Places with people stop ending on the first good throw: you leave when you choose. This fixes "no rapport", "nobody speaks" and "I can't just play my character" on today's roads.
2. **Clues and the inked map.** The truth and its three keys, slips and their four states, leads that ink new places, free travel, and the plan dial in place of the road and the forks. This fixes "linear" and "leads are just delivered".
3. **Six stats, and the three kinds of throw.** Noticing without a throw, reading people, lies and catching them, the hidden throw. This fixes "stats only for passing".
4. **The end.** Keys change the last place. In a mystery, you name who did it and lay down your proof.
5. **The world remembers.** People are kept between stories.

## 15. For the user to decide

1. **The core sentence** (section 2): stories become investigations of a small world with a hidden truth, against the other side's clock, instead of a road of gates.
2. **Anything you write is played** (section 2.1): no line is squeezed into four ways; things with nothing at stake are played out with no die; you can add small facts with "say it's so"; playing your hero's nature pays.
3. **People with attitudes, patience and voices** (section 3), with the narrator lifting a card as a mask when someone speaks.
4. **Six stats**: Brawn, Grace, Charm, Guile, Wits, Sense (section 5). Heroes already kept would be converted.
5. **No road and no forks.** Free travel on a map you ink in as you learn, and you can go to the end at any time (section 7).
6. **The narrator's persona** (section 8.1): first person, dry and slightly wicked, and remembering you.
7. **The build order** (section 14).
