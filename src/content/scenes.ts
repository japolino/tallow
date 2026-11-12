/**
 * A stock story of scenes (engine/hand.ts), in the shape a builder model writes one. It is played only when no model
 * can write a story for the card: in the tests, the simulation (scripts/hand.ts) and the preview's table. It knows
 * nothing of any card, so at a real table the old road stories are the fallback, not this.
 */
import { checkSceneStory, type SceneStory } from "../engine/hand.js";

/** As a model would answer: checked by the same code as a model's answer. */
export const STOCK_SCENES_RAW = {
  title: "The Ferryman's Due",
  goal: "A sealed letter has to be in the magistrate's own hand, across the river, before the dawn bell. Three people would rather it was not.",
  won: "The magistrate reads it standing, in his nightshirt, and sends for the watch before he has finished. It is done.",
  lost: "The dawn bell rings with the letter still in your coat, and what it would have stopped goes ahead.",
  by: "the dawn bell",
  scenes: [
    {
      name: "The Night Ferry",
      card: "water",
      face: "The Night Ferry",
      situation: "The last ferry is tied up for the night, and its keeper has been paid by a stranger to keep it tied. The river is high and loud. A lamp burns in her hut, and her boy sleeps by the stove.",
      person: { name: "Orla", who: "the ferry keeper, a broad tired woman of forty who took a stranger's coin an hour ago.", wants: "to keep the coin without anyone drowning on her watch.", age: "adult" },
      through: "get across the river tonight.",
      closing: "the men who paid Orla are coming back along the bank road to see it done.",
      taken: "They find you on the bank. You are held in the boat shed until the small hours, and the letter's seal is cracked when you get it back.",
      things: ["the ferry's slack mooring rope", "Orla's unpaid tally at the tavern", "the high water itself"],
      boon: "Orla's word to the far bank",
    },
    {
      name: "The Toll Yard",
      card: "sentries",
      face: "The Toll Yard",
      situation: "The far bank's toll yard is shut. Two watchmen play at dice under the arch, with a description of a courier and orders to hold one. A carter's covered wagon waits inside for the gate to open at first light.",
      through: "get past the yard and onto the town road.",
      closing: "the watchmen putting the description and your face together.",
      taken: "You are marched to the lock-up and searched. They keep your purse, and let you go only when the sergeant tires of you.",
      things: ["the carter's covered wagon", "the watchmen's dice game", "the unlit side of the arch"],
      boon: "a toll-yard pass stamped for the day",
    },
    {
      name: "The Magistrate's Door",
      card: "guardian",
      face: "The Clerk at the Door",
      situation: "The magistrate's house is dark but for the clerk's window. The clerk opens to no one before the bell, and a man in a good coat is already in the hall, offering him reasons to lose a letter.",
      person: { name: "Halden", who: "the magistrate's clerk, a grey exact man of fifty who is frightened of being blamed.", wants: "to be able to say he followed the rules, whatever happens.", age: "adult" },
      through: "put the letter into the magistrate's own hand.",
      closing: "the man in the good coat turning Halden against you.",
      taken: "The door shuts on you. By the time it opens again the letter is a matter for tomorrow, and tomorrow is too late.",
      things: ["the unbroken seal on the letter", "the rule book on Halden's desk", "the magistrate's bedroom window above"],
      boon: "the magistrate's thanks",
    },
  ],
};

export const STOCK_SCENES: SceneStory = checkSceneStory(STOCK_SCENES_RAW)!;
