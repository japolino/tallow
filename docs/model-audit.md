# Where Tallow reads meaning without a model

Audit date: 2026-11-11, at commit 5beb046.

This lists every place where Tallow interprets text with regex or keyword rules, or could use images, but asks no model.

**What the host offers (lumiverse-spindle-types):**
- LLM messages accept image parts (`{type:"image", data, mime_type}`).
- Characters carry an `image_id` and a gallery, and the bytes can be read with `spindle.images.readBinary()`.
- Embeddings take text only, up to 256 texts of 8192 characters each.
- The Decision model takes images only on TypeSafe connections.
- There is no PDF or file-reading API. A PDF can only be read by an LLM that accepts it as a part, and Spindle has no such part.

**The rule for every fix:** use the Decision model first, then the reader LLM. Word rules apply only when no model is available or none is sure. This is the pattern in `game/route.ts`.

## P0: safety

| Where | Now | Should be |
|---|---|---|
| `engine/card/child.ts` `isChild`, used by `courtable()` in `game/card.ts` and by `contentFromLine` in `engine/content.ts:51` | A regex looks for ages and words like "teen" or "kid". It misses "a first-year at the academy" and flags "kid gloves". | Ask the Decision model whether any character is under 18 or written as a minor, with the reader LLM as backup. Block romance when either the model or the regex says yes. The regex stays as an extra filter and is never the only check. |

## P1: decides what the turn does

| Where | Now | Should be |
|---|---|---|
| `engine/people.ts` `lineKind` / `rulesLine`, used by `world.ts:580` and `:993` | A regex sorts each line into smalltalk, praise, offer, question, threat, lie, plea or gift. This drives attitude, patience and favour with every person. | One Decision choice over `LINE_KINDS`, with the person and the line as state. |
| `engine/world.ts` rows (goal, work, compare, table, time, speech, look) and `director.ts:629` `worldFirstLine` | Regex rows can override what the player tried in story mode. | The story-mode router. **The parent session owns this work.** |
| `game/director.ts` `handedTo` (594, 688) | Word overlap with fellows' names decides who a try is handed to. | A Decision choice among present fellows plus "me". |
| `engine/seats.ts:135` companion objection | Matches `burn\|kill\|murder\|torture\|poison`. | A Decision yes/no on whether the companion, given their stated nature, would object. |
| `engine/seats.ts` `touches`, `wantsToSpeak` | Fault words and keywords. | A Decision score. |
| `engine/contest.ts:259` `yieldSure` / `yieldRead` gate (`director.ts:582`) | A regex decides whether the model is even asked. | Always ask `pickBy` while a contest is on, without the regex gate. |
| `engine/contest.ts` `foeNamed` | Word overlap. | A Decision choice among the foes. |
| `engine/luck.ts` `luckRead` (fallback when `minds.luck` is missing) | Regex. | Wire `minds.luck` in every mind. The regex stays only as the no-model fallback. |
| `engine/schedule.ts` `hourNamed` | Regex time parsing. | Reader LLM returning JSON `{hour}`, with the regex as fallback. |
| `engine/free.ts` `riskyWords`, `placeNamed`, `leavesHere`, `threadPulled` | Regex. | Now reached only when the router fails. Keep them as fallback, and check that nothing calls them ahead of the router. |
| `game/free.ts` `calledRead`, `asksForRoll` | Regex. | Fold into the `try` route: the router names the stat it called for. |

## P2: story choice and setup

| Where | Now | Should be |
|---|---|---|
| `game/session.ts:460,472` `wantsFree`, `storyRead` (`content/tropes.ts:311`) | A regex settles the story choice before `pickBy` is asked. | `pickBy` first, with the regex only as fallback. |
| `engine/content.ts` `contentFromLine` / `switchOf` | Regex for "turn gore off" and similar. | A Decision box or choice per content switch. |
| `game/card.ts` `looksLikeWorld`, `tropeRead` | A regex guess runs next to the KIND model pick. | Trust the model pick. The regex is only the fallback. |
| `engine/tell-adventure.ts` `forkRead`, `campRead`, `temptRead`, `pickRead` (`roomtable.ts:193-213`) | Regex. `roomtable.ts` uses `forkRead` with no model at all. | `byMeaning` / `pickBy` everywhere, with these as fallbacks. |
| `meaning/read.ts` `rulesRead`, `checkedGrade` | Regex fallback after `minds.read`. | Acceptable as long as it stays a fallback only. |

## P3: models the host offers that Tallow never uses

| Capability | Use |
|---|---|
| **Vision** (LLM image parts plus the character's `image_id` and gallery) | At card load, send the avatar to the builder or reader to describe looks, setting and genre. The KIND and SETTING picks get it too. Describe gallery images as places and people. |
| **Embeddings beyond card load** (today `backend.ts:59` picks lore once) | Retrieve lore for each scene, from the current place and line, instead of a single pick. Recall memory by meaning: earlier exchanges, clues and notebook entries. Match the player's words to known places, threads and people. This gives the router and `handedTo` shortlists, and serves as the fallback when no Decision model is available. |
| **PDFs** | Spindle has no file or PDF API, so there is nothing to wire. Revisit when the host adds one. |

## Status after the fix (2026-11-11)

Done in this pass:
- **The minor check:** the card gets a Decision/reader read (`CardInfo.minor`), and the builder states every person's and the friend's age, combined through `ageFrom` with the words. A model's "minor" always wins, and the words still block when a model says adult. The card's pictures feed this check too.
- **`minds.pick`:** it always exists now. It asks the Decision model, then the reader LLM (JSON). Every `pickBy` in the game used to drop straight to regex when there was no Decision connection, and no longer does.
- **How a line lands with a person:** `game/hear.ts` (`minds.hear`, `withHeard`) feeds `Trip.heard`, and `world.ts` `spokenTo` and the press row use it ahead of `lineKind`.
- **Content settings:** `minds.content` reads them by meaning at the start of the night. In free form a new `settings` route triggers that read.
- **Story choice:** at the start of the night, the kind of story, playing someone new and a long campaign are all asked by meaning first.
- **Helpers for the director (`game/meaning.ts`):** `handedToBy`, `foeBy`, `objectsBy` (feeds `Moment2.against` in seats.ts) and `waitBy`.
- **Vision:** at card load the avatar and up to two gallery images go to the reader, or the builder if the reader can't see. The description lands in `CardInfo.looks`, which `cardText` passes to the KIND, SETTING and MINOR checks and to the builder. This needs the new `images` permission.
- **Lore per scene:** the backend keeps each card's lorebook. On every tell, answer, roam, move, blow or fellow line, the teller gets the 3 entries nearest the scene, picked by embeddings or by keys when there are none.

Done in story mode (`director.ts`, with the story router in `game/storyroute.ts`):
- `withHeard` is asked beside `minds.read` and the router, and feeds `Trip.heard`.
- `handedToBy` decides who a try is handed to, `foeBy` which foe a blow is aimed at, `objectsBy` whether a player cold to you refuses (asked only of those who could), and `waitBy` how long a wait lasts.
- Giving in is a kind of line the router says. With no router sure, it is asked by meaning whenever `minds.pick` exists, and `yieldRead` gates it only when nothing can be asked.
