# Tallow's look: the room, its props and the narrator

This document has two parts. The first is a survey of how the room looks today and what each thing in it is made from. The second is the style guide that every remodelled and new prop follows. Gemini judges each model against the second part.

## Part 1: what is in the room now (2026-11-12)

The room is built two ways:

- **Blender models.** Five GLB files in `assets/models/`, each made by a Python script in `models/`. They are embedded as base64 in `src/embedded/models.js` (2.5 MB on disk, about 3.3 MB as base64).
- **three.js code.** Everything else is built from primitives in `src/room/*.ts` and painted with seeded canvas textures from `src/room/textures.ts`. Nothing is downloaded at run time.

The renderer uses PCF soft shadows and no tone mapping. A small PMREM room (`room.ts` `environment()`) gives polished things something to reflect. Candles are the key light, and the windows add cool moonlight or sun depending on the hour.

### Blender models

| File | Script | How it was made | Tris | UVs | Materials in file | Size |
|---|---|---|---|---|---|---|
| `narrator_cloak.glb` | `narrator_cloak.py` | A cloth grid dropped over a seated proxy and simulated for 70 frames, then frozen | 26,000 | none | none (`narrator.ts` sets matte near-black cloth, double-sided) | 466 KB |
| `narrator_hood.glb` | `narrator_hood.py` | A sculpted bmesh hood with a black `void` inside | 9,000 | none | `cloth` and `void`, as flat colours | 162 KB |
| `narrator_hand.glb` | `narrator_hand.py` | A gaunt hand built from bmesh tubes and subdivided | 9,000 | none | none | 159 KB |
| `narrator_arm.glb` | `narrator_arm.py` | The hand above, rigged to 22 bones, with a sleeve and 18 clips (reach, pinch, deal and so on) | 15,520 (the hand alone is 14,000) | none | `skin` and `cloth`, both the default grey (`narrator.ts` replaces them) | 1,524 KB |
| `pieces.glb` | `pieces.py` | Two carved figures, `traveller` and `shadow` (a small copy of the narrator) | 4,200 each | none | `body`, `band`, `void` and `eyes` (`room.ts` `carve()` swaps in ivory or black glass) | 153 KB |

None of these models has UVs or a texture. Each one is a smooth, high-poly surface with one flat colour that the code assigns. The narrator reads well: a big dark silhouette, two glowing eyes and pale hands. But the hands are much denser and smoother than anything else on the table, and their grey-pink skin gets no texture. They look like they come from another game, set beside the blocky code props.

### Props built in code

| Prop | Where | Built from | Surface |
|---|---|---|---|
| Walls, window bays, sills, ceiling and beams | `room.ts` `shell()` | Extruded shapes and boxes | Canvas plaster, leaded lattice and frost |
| Floor | `room.ts` | A plane | Canvas wood |
| Bookshelves | `room.ts` `shelves()` | Plain boxes in 7 flat spine colours | No texture. They read as coloured blocks. |
| Table, frame and legs | `room.ts` `table()` | A rounded box on plain boxes | The top has canvas planks with a bump map. The legs are flat dark boxes. |
| Map sheet | `room.ts`, `mapsheet.ts` | A rippled plane | Canvas parchment and ink (it is game state, so it stays canvas) |
| Candles (dish cluster, brass stick, black campaign candle) | `candles.ts` | Lathes that burn down, with runs and a ragged rim | Flat wax colours, emissive glow, and sprites for the flame and halo |
| Pewter dish and brass candlestick | `room.ts` `props()` | Lathes, 28 to 32 sides | Smooth PBR metal |
| The narrator's tome | `room.ts` | 4 boxes and a clasp | Canvas leather |
| Coins | `room.ts`, `counters.ts` | Cylinders with 18 sides | Gold metal, metalness 1 |
| Dice box | `room.ts` `diceBox()` | 5 boxes and felt | Canvas wood |
| d20 and spare dice | `die.ts`, `room.ts` | Flat-shaded icosahedra | Glossy clearcoat |
| Counters (health stones, supply coins, goodwill tokens, iron and brass bits) | `counters.ts` | Primitives | Clearcoat, metal and plain colour mixed |
| Contest board (leather cloth, dials, pegs) | `board.ts` | Primitives | Canvas hide and flat wood colours |
| Battle mat | `battlemat.ts` | A plane with primitives | Canvas leather and chalk |
| Bowl of dread | `dread.ts` | A lathe of clay with glossy black stones | Flat colour |
| Luck tray and bone die | `luck.ts` | Boxes and felt | Flat colour |
| Notebook, pages and pencil | `desk.ts`, `paper.ts` | Boxes and planes | Canvas writing (game state) |
| Cards | `tablecards.ts`, `cardart.ts` | Rounded planes | Canvas art (game state) |

### How they sit together

- **Two levels of finish.** The large surfaces (table, floor, walls, map, leather) are painted, warm and textured. The small props are bare primitives in flat colours: box books, box legs, box tome, cylinder coins.
- **Three kinds of material.** Matte painted surfaces, mirror-smooth PBR metal (brass, pewter, gold at metalness 0.8 to 1) and glossy clearcoat (dice, health stones, the narrator's piece) are all mixed together. Under candlelight the metals and the clearcoat flare, while the painted things go dull.
- **Mismatched density.** The narrator's hand is 14,000 tris. A coin has 18 sides and a book has 12 tris.
- **Sparse room.** Beyond the table there are bookshelves, two windows and dark floor. The corners and the window sills are empty.

## Part 2: the style guide

### The idea in one line

**A tabletop diorama carved and painted by hand, lit by tallow candles.** Everything looks like a well-made miniature: chunky and slightly crooked, with soft bevels that catch the flame. Surface detail is painted, not modelled. The palette is warm and dark, the gloom stays in, and only flame and eyes glow.

### Palette

All base colours come from one shared palette texture, `assets/models/palette.png` (16 × 16 swatches, 256 px), and models UV-map their faces onto it. The swatches are linear-light colours chosen for candlelight. Values stay between about 4% and 75% albedo: no pure black except the narrator's `void`, and no pure white.

| Role | sRGB | Use |
|---|---|---|
| Soot | `#16110E` | The narrator's cloth, iron, the deepest wood |
| Oak, dark | `#3A2416` | Furniture, legs, shelves |
| Oak, mid | `#6B4527` | Boxes, trays, dials |
| Oak, light | `#9C6B3F` | Worn edges, turned wood, pale pieces |
| Tallow wax | `#E3D3AE` | Candles, bone and ivory (the brightest diffuse value) |
| Parchment | `#C9A877` | Paper, scrolls, page edges |
| Oxblood leather | `#5A1F18` | Bindings, the tome, the board cloth |
| Aged brass | `#8A6A2C` | Candlesticks, clasps, hinges |
| Pewter | `#5A5C5E` | Dish, tankard, cup |
| Ember | `#C2541E` | Danger accents, pegs, sealing wax |
| Moss felt | `#1C2A22` | Lining, the luck tray, green bands |
| Ink blue | `#1F2E4A` | Blue bands, a book spine, ink |
| Night | `#202838` | Things lit only by the window |
| Flame (emissive only) | `#FFD58A` | Flames, embers, the narrator's eyes |

Each family has three or four swatches (shadow, base, worn edge, highlight). A painted gradient across those swatches gives every prop the same hand-painted ramp.

### Shape language

- **Chunky, miniature proportions.** Push the shape that tells you what a thing is (a tankard's handle, a book's raised bands, a candlestick's drip pan) by about 10–20% over real life. At the seat (eye 1.2 m from the narrator, FOV 42°) every prop must read by silhouette alone.
- **Nothing is perfect.** Add a slight lean, uneven sides and a wobble of a few millimetres (Blender: a low-strength Displace or Lattice, or a noise-driven geometry nodes offset). Turned things get 12 to 20 sides, not 32.
- **Soft, wide bevels.** Every hard edge gets a bevel of 2 segments, about 1.5 mm on small props and 4 mm on furniture, with weighted normals, so edges catch a rim of candlelight. No knife-sharp edges and no fully smoothed blobs.
- **Detail in paint, not geometry.** Wood grain, stitching, dents and lettering go into the texture and the bake. Geometry carries only what changes the silhouette.

### Level of detail and budgets

| Kind | Tris | Notes |
|---|---|---|
| Small table prop (coin, die, peg, stone) | 50–300 | Instanced in code wherever there are several |
| Ordinary prop (book, cup, candlestick, box) | 300–1,500 | |
| Big prop (chest, lantern, stool, shelf unit) | 1,500–4,000 | |
| Narrator: hood | ≤ 4,000 | Its form is baked to normals from today's 9,000 |
| Narrator: mantle | ≤ 9,000 | UV'd, with the cloth folds baked to normals from a denser simulation |
| Narrator: each arm, hand and sleeve | ≤ 5,000 | Knuckles and tendons baked to normals from the high-poly hand |
| Each piece | ≤ 1,500 | |

**Size budget.** All models are embedded in the frontend bundle. Every GLB together, textures included, must stay at or under the 2.5 MB of today, and should end smaller. Textures are PNG, 256 px for props and up to 512 px for the narrator. There is no Draco or KTX2, because those decoders would have to be fetched at run time.

### Materials and textures

- **One shading model.** Every model uses `MeshStandardMaterial` (glTF metallic-roughness). Do not use clearcoat or physical materials on props.
- **Shared base colour.** Each model samples `palette.png`. Several models share a material wherever their roles match (`wood`, `brass`, `wax` and so on). Material names are roles, so the code can still swap them, as it does today for `body`, `band`, `void`, `eyes`, `cloth` and `skin`.
- **Baked light and wear.** Each model gets ambient occlusion and curvature baked in Blender (Cycles bake). Store them as vertex colour `COLOR_0`, where R is AO and G is edge wear, so props need no second texture. The room multiplies by AO and lightens edges by wear. The narrator's cloak, hood and hands also get a 512 px tangent-space normal map baked from their high-poly versions.
- **Roughness** is 0.55–0.95 for everything organic: wood, cloth, leather, wax, paper and bone. Brass and pewter go down to 0.4, glass and varnish to 0.3.
- **Metalness** is 0 or 1 and nothing in between. Metal is dull and aged: brass and pewter carry dark grime in the bake, so they glint at the edges instead of mirroring the room.
- **Emissive** is only for flame, embers, the narrator's eyes and the glow inside wax near a flame.

### Lighting and outlines

- **Candles are the key light.** Every prop must look right under warm point lights from below and to the side, with a cool, dim window fill. Value contrast, not hue, separates a prop from the table: a dark prop needs a lighter worn edge, and a pale one needs AO at its foot.
- **No ink outlines.** Outlines would break the gloom and turn the room into a cartoon. Silhouettes come from rim light on bevels and from contrast with the backdrop.
- **The gloom stays.** Nothing self-lights or brightens to stay visible. A prop that vanishes in the dark at night is fine if it reads in its candle pool.

### Scale and export conventions

- **Units are metres**, true to the room. The table top is 1.9 × 1.25 m with its top surface at y = 0. A candle is 0.1–0.2 m and a piece is about 0.09 m.
- **Axes.** Blender works +Z up with the front facing −Y. The glTF export uses +Y up with the front facing +Z in the room. The origin is the middle of the base, on whatever surface the prop stands on, with transforms applied.
- **Export settings.** glTF binary, Y up, apply modifiers, vertex colours on, normals on, tangents only when there is a normal map, and no cameras or lights. Animation is exported only for the narrator's arm.
- **Names.** Each prop is one object named after it (`tankard`, `inkwell`), and one file can hold several props, like `pieces.glb`. Names the code already reads (the bones, the clips, `ctl`, `grip`, `traveller`, `shadow`, `void`, `eyes`, `band`) do not change.
- **Scripts.** Each GLB is made by one script in `models/`, which runs as `blender -b -P models/NAME.py`. Shared helpers (the palette, bevels, the bake and the export) live in `models/style.py`.

### What stays in code

Things that change as you play stay built in code, but take their colours and roughness from the same palette and rules: the burning candles, the map sheet, cards, pages, the contest board's cloth, the battle mat and the die faces. Static props move to Blender: the books and shelves, the tome, the dish and the candlestick, the dice box, the luck tray, the dread bowl, coins and stones, the table's legs and frame, and every new prop.

### New props to fill the room

All of these are placed outside the play area: the map, both hands' reach, the notebook and the narrator's dealing space.

- **On the table, at its edges:** an inkwell and quill by the narrator's tome, a pewter tankard and a stoppered bottle on your left beyond the candle dish, a small hourglass, a rolled scroll or two tied with cord, and a candle stub in a skull at the narrator's left (18+ and dark themes are fine).
- **On the sills:** a horn lantern on the back window sill, and a jar of dried herbs with a stub of candle on the left sill.
- **On the shelves:** real books (raised bands and leaning stacks), a few jars and a small coffer.
- **On the floor and against the walls:** an iron-bound chest, a barrel or crate in the dark corner, a three-legged stool, a worn rug under the table, and a cold iron candle wheel hanging from a beam.

### How Gemini judges

For each model, three renders go to the judge: three-quarter front, side and top, each under one warm key light and a cool fill on a dark backdrop. A fourth render shows the model on the table at the seat's view. The room as a whole is judged from the seat and the lean views, by day and at night. The judge scores each of the following from 1 to 10 and lists concrete fixes:

1. Palette fidelity.
2. Shape language (chunk, wobble and bevels).
3. Detail level against the budget.
4. Material rules.
5. Reads under candlelight.
6. Fits with the rest of the room.

A model passes when every score is at least 7 and the mean is at least 8. Verdicts are kept beside the renders.

## Part 3: what was built (2026-11-12)

### The files

| File | Script | What it holds | Tris | Baked | Size |
|---|---|---|---|---|---|
| `props.glb` | `props.py` | 23 props: table, dish, candlestick, coin, tome, dice box, book row, inkwell, tankard, bottle, scroll, hourglass, lantern, herb jar, jar, skull, coffer, chest, barrel, crate, stool, rug, candle wheel | 40,904 in all | AO, cavity and wear in `COLOR_0`; base colour from the embedded palette | 1,550 KB |
| `narrator_arm.glb` | `narrator_arm.py` | Hand and sleeve, 22 bones, 18 clips | 10,440 (the hand 9,000) | AO and cavity in `COLOR_0`, at rest; no normal map | 632 KB |
| `narrator_cloak.glb` | `narrator_cloak.py` | The simulated mantle | 8,999 | AO and cavity in `COLOR_0`; no normal map | 240 KB |
| `narrator_hood.glb` | `narrator_hood.py` | The hood and its void | 4,000 | AO and cavity in `COLOR_0` | 92 KB |
| `pieces.glb` | `pieces.py` | `traveller` and `shadow` | 1,500 each | AO and wear in `COLOR_0` | 105 KB |

All of them add up to about **2.62 MB, over the 2.5 MB budget by about 120 KB.** Most of that is `props.glb`, which holds 23 props where the old files held none. The arm went from 1,524 KB to 632 KB and the cloak from 466 KB to 240 KB. `narrator_hand.glb` is no longer shipped. `narrator_arm.py` builds the sculpt by importing `narrator_hand.py` and thins it to 9,000 triangles. Run on its own, `narrator_hand.py` now writes to `models/narrator_hand.glb`, which is gitignored.

### How the pipeline differs from Part 2

- **Palette.** The texture is `models/palette.png`. It is embedded inside `props.glb`, not shipped as its own file.
- **The hand is geometry, not a normal map.** Thinned to 3,600 triangles with the sculpt baked to a normal map, the hand read as a mottled lump. It ships at 9,000 triangles instead. The sculpt's palm sits below the long bones, so the four tendons and the knuckles stand out of the back of the hand, and a knob of wrist bone stands at the cuff. The budget in Part 2 (5,000 for the whole arm) gave way to that.
- **Skin weights** are stored as normalized bytes by `quantize_glb`.
- **Quantization.** After export, `style.quantize_glb` repacks every file with `KHR_mesh_quantization`:
  - normals as int8, UVs as uint16 and colours as uint8;
  - positions as int16, with the dequantizing offset and scale written onto the node (skipped for skinned meshes and for `pieces.glb`, whose nodes `room.ts` moves itself);
  - animation channels that only hold the rest value are dropped, and rotations are stored as int16;
  - unused accessors are compacted out.
  
  `room.ts` puts each prop clone inside a carrier `Group` and moves that, so the node's own transform stays as the file set it.
- **The narrator keeps its own colours.** The cloth is soot (`#16110E`), multiplied by its baked AO. The skin is bone in shadow (`#9E8E6C`). The sleeves keep the mantle's rim light; without it they sink into the dark and the hands seem to float. The pieces are matte; their clearcoat is gone.
- **Wobble.** Every prop except the ones something rests on or in (`STEADY`: table, dish, candlestick, coin) gets a slow, low warp over its whole size (`wobble`, 0.6% of its size), so no line is ruler-straight.
- **Wear on narrow faces.** The wear bake lightens edges by curvature, so thin parts such as rims, bands and quill vanes go to the worn swatch first.
- **Per-prop overrides.** In `props.py`, `o["tones"]` fixes the tone (shadow, base, worn edge or highlight) for a material index, and `o["noise"]` sets how much painted mottle `style.paint` adds.
- **Judge renders.** Besides the key, fill and rim lights, each render has two emissive cards out of frame, one warm and one cool. Metal reflects them, so it shows a rim instead of rendering black.

### Where the judging stands

None of the 23 props has reached the bar (every score at least 7 and a mean of at least 8). Gemini's means in round 8 (r8), the last round:

| Prop | r8 mean | Prop | r8 mean | Prop | r8 mean |
|---|---|---|---|---|---|
| coin | 8.0 | stool | 6.3 | crate | 5.3 |
| dish | 7.3 | tankard | 6.3 | bottle | 5.3 |
| table | 7.3 | tome | 6.3 | rug | 5.2 |
| candlestick | 7.0 | candle wheel | 6.3 | coffer | 5.2 |
| jar | 6.7 | dice box | 6.0 | hourglass | 4.8 |
| book row | 6.5 | inkwell | 5.8 | lantern | 4.8 |
| chest | 5.5 | scroll | 5.5 | skull | 4.7 |
| herb jar | 4.5 | barrel | 4.3 | | |

The whole room scored 5/3/3/3/6/3 before this work and 7/7/8/8/8/6 after it (mean 7.3, not a pass). Its open points are:

- the bottle reads as a modern wine bottle;
- the sleeves at the wrists still look pale by day;
- the skull should move from the shelf to the table.

The weakest props have the same complaints across rounds:

- the barrel doesn't read as staves;
- the lantern's panels look like glass, not horn;
- the hourglass has no sand;
- the skull is too smooth;
- the herb jar's cloth has no skirt or gathers.
