/**
 * The recordings in assets/sounds (from Freesound; see CREDITS.md), in the order they are decoded: the table's
 * effects first, since they are short and wanted soonest, then thunder and the long beds. "name-n.mp3" is take n of
 * "name". scripts/embed.ts puts exactly these into the frontend bundle; the preview fetches them from /assets/sounds.
 */
export const SOUND_FILES: readonly string[] = [
  ...["throw-1", "throw-2", "throw-3", "throw-4", "throw-5", "rattle-1", "rattle-2"],
  ...["deal-1", "deal-2", "deal-3", "deal-4", "pat-1", "riffle-1", "riffle-2", "riffle-3"],
  ...["scratch-1", "scratch-2", "tear-1", "tear-2", "tear-3", "slide-1", "slide-2"],
  ...["knock-1", "knock-2", "knock-3", "token-1", "token-2", "peg-1", "peg-2", "swish-1", "swish-2"],
  ...["weight-1", "weight-2", "tink-1", "tink-2", "stone-1", "stone-2", "unroll-1", "unroll-2"],
  ...["strike-1", "strike-2", "strike-3", "slam-1", "slam-2"],
  ...["tone-1", "candles-1", "rain-1", "wind-1", "night-1", "thunder-1", "thunder-2", "thunder-3", "thunder-4"],
].map((n) => `${n}.mp3`);
