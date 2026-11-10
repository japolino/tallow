# Tallow (working title)

A tabletop roleplaying game for Lumiverse, played in one 3D room: you sit at a table across from a shadowy narrator, with a map and pieces between you. The name and the extension id are placeholders.

The design, starting with the gameplay loop, is in [docs/DESIGN.md](docs/DESIGN.md).

## Where it stands

All four milestones are built. It runs as a local preview page, and as a Lumiverse (Spindle) extension.

1. **The room**: the hours of the day, six kinds of weather, candles that burn down through the night, the narrator, the map and its pieces, and the die.
2. **One moment of the game**: something stands in your way, you write what you do, the game names the check, you throw the die, and the situation changes.
3. **A whole adventure** in trope mode, a rescue or a courtship: the road dealt face down as cards, a stop's card turned when you arrive, forks, companions, things won, resting, a rival, a clock, and knacks to choose at a level-up.
4. **Inside Lumiverse, for a real card**: "Sit at the table" by the chat's input bar opens the room over the app. The narrator greets you by the card's character, asks which story and who you are, and builds the adventure for the card with your own model while you write.

Not done yet: nothing from a sitting is written into the chat, and it has not been played inside Lumiverse with a real model (the live tests answered as the model by hand). See [docs/DESIGN.md](docs/DESIGN.md), section 11.

## Install it in Lumiverse

```
bun install
bun run build
```

writes `dist/frontend.js` and `dist/backend.js` (the room's models are inside the frontend file). Then

```
bun scripts/deploy-local.ts D:/Lumiverse
```

copies the build into your Lumiverse's `data/extensions/tallow/`. In Lumiverse, open the drawer, then **Extensions**, and use **Import local extensions** (the owner can), then turn Tallow on. Tallow asks for three permissions, each shown in Lumiverse's own dialog when you first sit down:

- **characters**, to read the chat's character card;
- **generation**, to ask your model to build the adventure and tell what happens;
- **app_manipulation**, to open the room over the whole app (without it, the room opens in a floating window).

Open a chat with a character and press "Sit at the table". The ✕ at the top leaves the table. Without the generation permission, or if the model does not answer, the game still plays: a made-up adventure with the card's character in it, and plain stand-in lines.

## Run the preview

```
bun install
bun run preview
```

Then open http://localhost:4184. No Lumiverse needed.

### Play an adventure

Open http://localhost:4184/?adventure=rescue (or `=courtship`) to play a whole made-up adventure at the table, with stand-ins for the model. Add `&slow=2500` to make every stand-in take two and a half seconds, so the narrator's waits can be watched. Every turn is played the way the moment below is, and where the road forks you touch one of the two cards (or write which).

Open http://localhost:4184/host to try the built extension (`dist/frontend.js`) in a pretend Lumiverse, with a made-up card and no model.

### Play the moment

Nothing is on the screen but the room. You play with the things on the table.

1. The narrator speaks: its words come up at the foot of the picture. A click, Space or Enter brings the rest at once.
2. It hands you a page that says where you are (Wren Bridge), who you are and what you are good at. Read it, then click or press Enter to set it down. Pages you set down stay in a pile by your right hand; click the pile (or press the up arrow) to read them again, and use the arrow keys to turn to earlier ones.
3. In front of you are three piles of counters: red stones for health, coins for supplies, pale seals for goodwill. That is what you carry.
4. Start typing, or click the notebook at your left hand. You lean in over it and your hand writes what you type. For example: "I offer to put her sums right if she lifts the bar". Enter tears the page off and hands it to the narrator. Escape shuts the notebook.
5. The narrator says how it read your line and loads the balance at the left of the table: its dark weights for how hard the thing is, your pale ones for what you bring. You turn your head to it while it is loaded and back when the beam is at rest (a click turns you back sooner). The pan that sinks is the likelier end. If it read you wrongly, write again instead.
6. Click the dice box (or press Enter) to take a die. Move the pointer to shake it and click the table to let it go.
7. The narrator says what happened, takes or gives counters, writes the turn under your line and hands the page back. The clock moves on and the pieces move.

A try that fails is not a dead end: it costs something, closes the way you tried, and makes the ways that are left harder. The rules are in [docs/DESIGN.md](docs/DESIGN.md), sections 1.5 and 1.6.

With no model in the preview, a list of plain words does the reading of your line, so it can be fooled.

### The room by itself

Open http://localhost:4184/?play=0 for the room alone, with its own controls:

- **Time**: drag the slider, or use Morning, Noon, Golden hour, Dusk, Night. "Run a day" turns the clock by itself. Watch the candles: the narrator sets out new ones and lights them at a quarter past six in the evening, they burn down all night, and by seven in the morning they are stubs.
- **Weather**: Clear, Rain, Storm, Fog, Wind or Snow. The room slides from one to the next over a couple of seconds.
- **Lean in over the map**: the button, a click on the table, the mouse wheel, or the space bar.
- **Pick up the die**: your hand takes a die from the box. Move the pointer to shake it, click to let go. The number is decided by seeded dice in code before the throw; the throw only shows it.

Switches for the address bar are listed at the top of `preview/main.ts`.

## Checks

```
bun run verify
```

runs the unit tests and the type check.

```
bun run moment
```

plays one moment as text and prints only what the screen would say, so it can be read the way a new player would read it. Give it your own lines (`bun run moment "I pay the toll" "I creep past the dog"`), put `SEED=moss` in front to choose the dice, and `NOTE=1` to also print the note the narrator's model would be given.

Two more checks look at the room itself. They start the Edge that ships with Windows without a window (set `TALLOW_BROWSER` to use another Chromium-family browser) and touch no other browser.

```
bun run shots
```

takes a picture of the room in every state worth looking at (each hour, each kind of weather, the candles through the night, the hand, a throw, the narrator moving its piece and making its gestures, one moment played at the table, a phone held upright) into `.artifacts/room/`. Add words to take only the pictures whose names contain them: `bun run shots rain hand`.

```
bun run pointer
```

plays the room with a real mouse (moves, clicks and the wheel sent through the browser) and checks that leaning in, picking up, shaking and throwing the die all work and that the view never jumps. Then it plays one moment the same way, at the table: it reads and sets down pages, types the lines on a real keyboard, clicks the notebook and the dice box, and checks the counters against what the rules say you carry. Put `SOFT=1` in front of either to draw with the software renderer, as a stand-in for a slow machine, and `TALLOW_PORT=4190` to serve the preview on another port when something else has the usual one.

```
bun run adventure
```

plays a whole adventure as text, using only what the table would say. `ADV=courtship` for the courtship, `RUNS=400` to play it 400 times and print how often it is won.

```
bun run table
```

plays a whole adventure in the room in a real browser, the way a player would, and takes pictures into `.artifacts/table/`. `bun scripts/sit.ts` (after `bun run build`) does the same for the built extension in the pretend Lumiverse.

```
bun run live -- --card card.json --state run1 next
bun run live -- --card card.json --state run1 answer answer.txt
```

plays a sitting against a real card one step at a time: each step prints what the model is asked, or what the player is asked, and waits for an answer in a file. A person, or another model, answers as both. Keep cards and runs outside this folder: they are private.

## Layout

- `src/room/`: the room. `room.ts` is the entry (`mountRoom`); `daylight.ts` turns the hour and the weather into light and says how far the candles have burnt; `weather.ts` is snow, rain, leaves, fog and lightning; `candles.ts` is a candle that melts; `narrator.ts` and `hand.ts` are the figure across the table and your own hand; `desk.ts` is your side of the table (the notebook and pencil, the pages, the hands that write and hold them), with `paper.ts` (a page), `counters.ts` (the counters and the balance), `voice.ts` (the narrator's words) and `drawnhands.ts` (your drawn hands); `governor.ts` decides when a slow machine should draw less; `flat.ts` is a plain 2D picture shown where WebGL is not available.
- `src/engine/`: game rules, with no model and no browser in them. `dice.ts` is the seeded dice; `moment.ts` is one moment of the loop; `tell.ts` says a moment in plain words; `weigh.ts` turns a check into weights for the balance; `adventure.ts` is a whole adventure (the road, forks, resting, companions, the rival, the clock) and `tell-adventure.ts` says it; `hero.ts` is who you are (kinds of person, stat points, knacks); `cards.ts` is the kinds of card; `card/child.ts` is the rule for who is read as a child.
- `src/content/`: the two made-up adventures, which are also the skeletons an adventure for a card is built on.
- `src/game/`: playing it. `director.ts` plays an adventure at any table; `roomtable.ts` is the room's table; `session.ts` is a whole sitting for a card; `card.ts` reads a card; `build.ts` builds the adventure for it; `prompts.ts` is what a model is asked and how its answers are checked; `modelminds.ts` asks it, and `minds.ts` holds the stand-ins.
- `src/frontend.ts`, `src/backend.ts`, `src/frontend/overlay.ts`, `src/shared/protocol.ts`: the Spindle extension. `spindle.json` is its manifest; `scripts/build.ts` builds it.
- `src/meaning/`: what a model is asked and how its answer is cleaned. `read.ts` reads a written line, with a list of plain words for when no model answers.
- `models/`: Blender scripts that make the sculpted parts (the narrator's mantle, hood, hand and jointed arm, and the pieces on the map). Run one with `blender --background --python models/NAME.py`; it writes into `assets/models/`. The room falls back to shapes built in code if a model file is missing.
- `assets/models/`: the files those scripts wrote.
- `preview/`: the preview page and its made-up data. `play.ts` plays the moment at the table: it says the narrator's lines and tells the room what to show. `host.ts` is the pretend Lumiverse for the built extension.
- `scripts/`: the preview server, the moment played as text, and the two checks that look at the room.
- `tests/`: unit tests that need no browser.
