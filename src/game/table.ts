/**
 * The table as the game sees it: what the narrator and the player can do across it. The room plays it with its own
 * things (roomtable.ts); nothing here decides anything.
 */

/** What the narrator is seen doing while a model is asked: reading your page, thinking it over, or shuffling the deck. */
export type Beat = "read" | "tell" | "deal";

export interface Written {
  line: string;
  /** Resolves when the page is in the narrator's hands. */
  given: Promise<void>;
}

export interface Table {
  /** The narrator says these lines. Resolves when the last word is out. */
  say(lines: string[]): Promise<void>;
  /** The player writes a line in the notebook and hands it over. */
  write(): Promise<Written>;
  /** The narrator writes on the page it has (or a fresh one) and hands it to the player. Resolves when it is set down. */
  page(w: { heading?: string; his: string[] }): Promise<void>;
  /** The narrator pushes the page it has aside. */
  aside(): Promise<void>;
  /** Something is being worked out: show the beat for it until `work` is done, then end it. */
  wait<T>(beat: Beat, work: Promise<T>): Promise<T>;
  /** Wait for the player to take a die (null), or to write another line instead. */
  dieOrLine(): Promise<Written | null>;
  /** The player throws; the die shows `natural`, which was decided before. */
  throwDie(natural: number): Promise<void>;
  /** The room's clock. */
  clock(hour: number): void;
  /** Theatre of the mind: the map and the pieces put away (true), or set out again (false). */
  theatre?(on: boolean): void;
  /** Your sheets, the stack by your left hand: written out again as they now stand. */
  sheets?(pages: { heading: string; his: string[] }[]): void;
  /**
   * What happened last, written out and laid beside your notebook to write against: your line, if there was one, and
   * what the narrator told. It replaces what lay there before.
   */
  notes?(w: { mine?: string; heading?: string; his: string[] }): void;
  /** Pencil notes in the margin of your notebook, in your own hand. */
  margin?(notes: string[]): Promise<void>;
}
