/**
 * The kinds of story the narrator can tell (docs/DESIGN.md, 3.1 and section 11, item 24). You choose a family (a
 * rescue, a heist, a mystery...), and the story inside it is drawn at random, so two sittings of the same family are
 * not the same story. Each story is a recipe: how long the road is, what kind of trouble stands on it, which ways tend
 * to be easier, what waits at the end, who is with you and who is against you, and the hours it runs in. The road
 * itself is laid out from the recipe by code (src/engine/road.ts); a model only writes its words.
 *
 * The families and stories are the familiar shapes of storytelling, in our own words. None is taken from any game.
 */
import type { Sky } from "../engine/adventure.js";
import { seededRng } from "../engine/dice.js";
import type { Way } from "../engine/moment.js";

export type Family = "rescue" | "heist" | "mystery" | "journey" | "hunt" | "romance" | "survival";

export const FAMILIES: readonly Family[] = ["rescue", "heist", "mystery", "journey", "hunt", "romance", "survival"];

/** How the narrator offers each family, and what it means (for reading what you write, by words or by meaning). */
export const FAMILY_SAID: Record<Family, { name: string; means: string; words: RegExp }> = {
  rescue: { name: "a rescue", means: "a rescue: get someone back, or out, before it is too late", words: /\b(rescue|save|saving|free|freeing|get (?:her|him|them|someone) (?:out|back)|break (?:her|him|them|someone) out|kidnap|captive|ransom)/i },
  heist: { name: "a heist", means: "a heist: steal or take back something well guarded", words: /\b(heist|steal|stealing|theft|thief|rob|robbery|burgl|break[- ]in|vault|loot|smuggl|job)\b/i },
  mystery: { name: "a mystery", means: "a mystery: find out the truth before it gets away", words: /\b(myster\w*|whodunn?it|who did it|murder|detective|investigat\w*|clue|secret|solve|haunt\w*|conspira\w*|truth)/i },
  journey: { name: "a journey", means: "a journey: get somewhere, or someone somewhere, against the clock", words: /\b(journey|travel|road ?trip|escort|deliver\w*|message|escape|flee|run away|pilgrim\w*|voyage|quest)/i },
  hunt: { name: "a hunt", means: "a hunt: track down something, or someone, and face it", words: /\b(hunt|hunting|track|bounty|beast|monster|creature|duel|revenge|vengeance|old score)/i },
  romance: { name: "a romance", means: "a romance: try to win someone's heart", words: /\b(roman\w*|court|courting|courtship|woo|wooing|love|heart|date|kiss|flirt|crush|win (?:her|him|them))/i },
  survival: { name: "a night to survive", means: "survival: hold out against what is coming until it is over", words: /\b(surviv\w*|siege|hold out|hold the line|defend|storm|until (?:dawn|morning)|the night)\b/i },
};

/** Who the card's own character is in a story: with you from the start, or the one you court. */
export type Part = "friend" | "courted";

/** A climax: the card of the last stop, and how many good tries it takes. */
export interface Climax {
  cards: readonly string[];
  kind: "person" | "obstacle" | "fight";
  holds: 1 | 2 | 3;
}

export interface Recipe {
  id: string;
  family: Family;
  /** The story, as the builder is told it: what the job is, in a line. */
  brief: string;
  /** Said by the narrator when the story is drawn: what kind of story it turned out to be. */
  drawn: string;
  part: Part;
  /** Stops in all (not all are passed: a fork lays two side by side). */
  stops: [number, number];
  /** How often each kind of trouble comes up on the road. */
  mix: { person: number; obstacle: number; fight: number };
  /** Ways that tend to be easier (-1) or harder (+1) in this kind of story. */
  lean: Partial<Record<Way, -1 | 1>>;
  climax: Climax;
  /** Someone against you, who gains ground on every try that fails. */
  rival?: { card: string; max: number; brief: string };
  /** Someone met on the road who may walk on with you. */
  joins: boolean;
  /** How many things may be won on the road. */
  loot: number;
  /** The hour it starts, and roughly how long the night (or day) is. */
  start: number;
  /**
   * Hours added to (or taken off) the clock, found by playing each story on hundreds of roads (`ADV=gen:all RUNS=300
   * bun run adventure`) so that a careful player wins about three times in four.
   */
  pace?: number;
  /** The weathers this story likes, for the road and its places. */
  skies: readonly Sky[];
  /**
   * The shape of the map (docs/MOONSHOT.md, the maps): a road (the default) is walked from one end to the other; a hub
   * is a place you go out from and come back to, its places visited in any order, the end opening once enough of
   * them are done. A mystery or a heist is cased from a hub; a chase or an escort is a road.
   */
  shape?: "road" | "hub";
  /** Words for the made-up story told when no model writes it: {friend}, {end} and {rival} are filled in. */
  fallback: { title: string; goal: string; won: string; lost: string; rivalName?: string; rivalWho?: string; rivalLost?: string };
}

const R = (r: Recipe): Recipe => r;

export const RECIPES: readonly Recipe[] = [
  /* ------------------------------ rescues ------------------------------ */
  R({
    id: "captive", pace: -0.5, family: "rescue", part: "friend", stops: [6, 7], mix: { person: 3, obstacle: 2, fight: 1 }, lean: {}, joins: true, loot: 3, start: 14, skies: ["clear", "fog", "wind", "storm"],
    brief: "a rescue: someone the companion loves, needs or owes has been taken, and is held at the end of the road. Get them back before they are taken beyond reach.",
    drawn: "Someone has been taken.",
    climax: { cards: ["keep", "warden", "guardian"], kind: "person", holds: 2 },
    fallback: { title: "The Road to {end}", goal: "Someone {friend} loves was taken to {end}, and at {deadline} they are moved beyond reach. You have until then to get them back, with {friend} beside you.", won: "You come away from {end} with the one who was taken, and {friend} does not let go of their hand all the way home.", lost: "The hour comes and goes. Whoever held them has moved them on, and the trail ends at {end}." },
  }),
  R({
    id: "jailbreak", pace: 1, family: "rescue", part: "friend", stops: [5, 7], mix: { person: 2, obstacle: 2, fight: 2 }, lean: { sneak: -1, talk: 1 }, joins: true, loot: 2, start: 17, skies: ["clear", "rain", "fog"],
    brief: "a jailbreak: someone dear to the companion is locked up, unjustly, and will be sent away or sentenced at the deadline. Break them out.",
    drawn: "Someone is locked up, and they do not deserve it.",
    climax: { cards: ["sentries", "warden", "gate"], kind: "obstacle", holds: 2 },
    fallback: { title: "Out of {end}", goal: "Someone {friend} loves is locked up in {end} for something they did not do, and at {deadline} they are sent where nobody comes back from. Break them out tonight.", won: "The last door swings open, and the prisoner walks out into the night air between you and {friend}.", lost: "At {deadline} the cart leaves {end} with the prisoner in it. You watch it go." },
  }),
  R({
    id: "lost", family: "rescue", part: "friend", stops: [5, 7], mix: { person: 1, obstacle: 4, fight: 1 }, lean: { force: -1, pay: 1 }, joins: false, loot: 2, start: 15, skies: ["fog", "snow", "rain", "storm", "wind"],
    brief: "a search: someone the companion cares for has gone missing in wild or dangerous country, hurt or lost. Find them and bring them back before the night or the weather finishes them.",
    drawn: "Someone is lost out there, and the weather is turning.",
    climax: { cards: ["climb", "water", "hound"], kind: "obstacle", holds: 2 },
    fallback: { title: "Lost at {end}", goal: "Someone {friend} cares for went out toward {end} and never came back, and the weather is turning. If they are not found by {deadline}, they will not be found alive.", won: "You find them at {end}, cold and frightened but breathing, and between you and {friend} you carry them home.", lost: "By {deadline} the weather has closed in for good. The search is called off at {end}." },
  }),
  R({
    id: "ransom", family: "rescue", part: "friend", stops: [5, 6], mix: { person: 4, obstacle: 1, fight: 1 }, lean: { pay: -1, force: 1 }, joins: false, loot: 3, start: 12, skies: ["clear", "rain", "wind"],
    brief: "a ransom: someone close to the companion is held for a price the companion cannot pay. Raise it, bargain it down, or trick the takers before the deadline.",
    drawn: "Someone is held for a price nobody can pay.",
    climax: { cards: ["warden", "host", "keeper"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 5, brief: "the takers' patience, which runs out a little with every slip you make" },
    fallback: { title: "The Price at {end}", goal: "Someone {friend} loves is held at {end} for a price {friend} cannot pay, and the takers will wait only until {deadline}. Get them back, by bargain or by trick.", won: "The takers count what they were given and let their prisoner go. {friend} runs the last of the way.", lost: "At {deadline} the takers stop waiting. The house at {end} is empty when you get there.", rivalName: "the takers", rivalWho: "the takers, who are watching every step you make", rivalLost: "The takers have seen enough. They are gone from {end}, and their prisoner with them." },
  }),

  /* ------------------------------ heists ------------------------------ */
  R({
    id: "vault", shape: "hub", family: "heist", part: "friend", stops: [6, 7], mix: { person: 2, obstacle: 3, fight: 1 }, lean: { sneak: -1, force: 1 }, joins: true, loot: 3, start: 16, skies: ["clear", "rain", "fog"],
    brief: "a heist: something worth a fortune, or worth more than that, is locked away at the end of the road. Get in, take it, get out before it is found missing or moved.",
    drawn: "There is something worth taking, and it is very well kept.",
    climax: { cards: ["keep", "gate", "sentries"], kind: "obstacle", holds: 2 },
    fallback: { title: "The Job at {end}", goal: "What {friend} wants is locked away at {end}, and at {deadline} it is moved somewhere no one can reach. Tonight you and {friend} go in after it.", won: "You walk out of {end} with it under your coat, and nobody has even started shouting yet.", lost: "At {deadline} it is loaded up and carried away under guard. The job at {end} is over before it began." },
  }),
  R({
    id: "stolen-back", family: "heist", part: "friend", stops: [5, 7], mix: { person: 3, obstacle: 2, fight: 1 }, lean: { sneak: -1 }, joins: true, loot: 2, start: 15, skies: ["clear", "wind", "rain"],
    brief: "a theft put right: something that belongs to the companion (an heirloom, a keepsake, a thing that matters) was stolen and is held by the thief. Take it back before it is sold or gone.",
    drawn: "Something was stolen, and you are going to take it back.",
    climax: { cards: ["warden", "host", "keep"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 5, brief: "the thief, who will sell it on and be gone if given the time" },
    fallback: { title: "What Was Taken", goal: "Something that matters to {friend} was stolen, and the thief holds it at {end} until a buyer comes at {deadline}. Take it back first.", won: "It is back in {friend}'s hands, and the thief at {end} will be a long time working out how.", lost: "At {deadline} the buyer comes and goes from {end}, and what was taken goes with them.", rivalWho: "the thief, who is no fool and is watching for you", rivalLost: "The thief has had enough warning. By the time you reach {end} they are gone, and so is it." },
  }),
  R({
    id: "swap", pace: 0, family: "heist", part: "friend", stops: [5, 6], mix: { person: 4, obstacle: 2, fight: 0 }, lean: { talk: -1, force: 1 }, joins: false, loot: 3, start: 16, skies: ["clear", "rain"],
    brief: "a switch: a fake must be put in the place of something real, at a grand gathering or a guarded house, without anyone noticing until it is too late. Talk and nerve, more than force.",
    drawn: "A fake has to take the place of the real thing, and nobody may notice.",
    climax: { cards: ["guardian", "host", "warden"], kind: "person", holds: 2 },
    fallback: { title: "The Switch at {end}", goal: "The real thing is on show at {end} until {deadline}, and {friend} has the fake. Put one in the place of the other, under every eye in the room.", won: "The fake sits where the real one was, admired by everyone at {end}, and the real one is in {friend}'s pocket.", lost: "At {deadline} the real thing is locked away again at {end}, and the fake is still in your hands." },
  }),
  R({
    id: "smuggle", pace: 0.5, family: "heist", part: "friend", stops: [6, 7], mix: { person: 3, obstacle: 2, fight: 1 }, lean: { pay: -1, sneak: -1, force: 1 }, joins: true, loot: 2, start: 17, skies: ["fog", "rain", "clear", "storm"],
    brief: "a smuggling run: something (or someone) forbidden has to be carried past checkpoints, watchmen and prying eyes to the end of the road by the deadline.",
    drawn: "Something forbidden has to get through, and you are carrying it.",
    climax: { cards: ["sentries", "keeper", "water"], kind: "obstacle", holds: 2 },
    fallback: { title: "The Run to {end}", goal: "{friend} has something that must reach {end} by {deadline}, and every watchman on the road would take it. Get it through.", won: "It is handed over at {end}, safe, and {friend} laughs for the first time all night.", lost: "At {deadline} the people at {end} stop waiting, and what you carried is worth nothing now." },
  }),

  /* ------------------------------ mysteries ------------------------------ */
  R({
    id: "culprit", shape: "hub", pace: -1, family: "mystery", part: "friend", stops: [6, 7], mix: { person: 4, obstacle: 1, fight: 1 }, lean: { talk: -1, force: 1 }, joins: true, loot: 3, start: 13, skies: ["rain", "fog", "clear"],
    brief: "a whodunit: a wrong has been done (a theft, a death, a betrayal) and the companion is blamed or hurt by it. Follow the leads from witness to witness, and corner the one who did it before they get away.",
    drawn: "A wrong has been done, and someone is getting away with it.",
    climax: { cards: ["warden", "rival", "host"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 5, brief: "the one who did it, who covers their tracks a little more with every slip you make" },
    fallback: { title: "The Truth at {end}", goal: "A wrong was done, and {friend} is the one being blamed. Whoever really did it will be gone from {end} by {deadline}. Find them first.", won: "At {end} the truth comes out in front of everyone, and {friend} can hold their head up again.", lost: "At {deadline} whoever did it is gone from {end}, and {friend} carries the blame.", rivalWho: "whoever did it, who knows someone is asking questions", rivalLost: "Whoever did it has covered every track. At {end} there is nothing left to find." },
  }),
  R({
    id: "vanished", shape: "hub", pace: -1, family: "mystery", part: "friend", stops: [6, 7], mix: { person: 3, obstacle: 2, fight: 1 }, lean: { talk: -1 }, joins: true, loot: 3, start: 10, skies: ["fog", "clear", "rain"],
    brief: "a disappearance: someone the companion knows has vanished without a word, and nobody will say where. Follow the trail of who saw what, and find out what happened to them.",
    drawn: "Someone has vanished, and nobody will say where.",
    climax: { cards: ["keep", "warden", "guardian"], kind: "person", holds: 2 },
    fallback: { title: "Gone from {start}", goal: "Someone {friend} knows vanished without a word, and every trail leads toward {end}. Find out what became of them before {deadline}, when the trail goes cold.", won: "At {end} you find them, and the reason they could not come home. {friend} brings them out into the light.", lost: "By {deadline} the trail has gone cold. Whatever happened at {end} stays there." },
  }),
  R({
    id: "haunting", shape: "hub", family: "mystery", part: "friend", stops: [5, 6], mix: { person: 2, obstacle: 3, fight: 1 }, lean: { force: 1, sneak: -1 }, joins: false, loot: 2, start: 16.5, skies: ["fog", "storm", "wind"],
    brief: "a haunting: something strange troubles a place the companion cares about (sounds, sightings, things moved, people afraid). Find out what is really behind it, natural or not, and put it to rest.",
    drawn: "Something strange is going on, and people are frightened.",
    climax: { cards: ["keep", "fire", "guardian"], kind: "person", holds: 2 },
    fallback: { title: "What Walks at {end}", goal: "Something strange troubles {end}, and {friend} is frightened of it. Find out what it is, and put it to rest before {deadline}.", won: "At {end} the thing behind it all is brought out into the open, and the place is quiet again.", lost: "At {deadline} it is worse than ever, and the people of {end} pack their things and leave." },
  }),
  R({
    id: "conspiracy", shape: "hub", pace: -0.5, family: "mystery", part: "friend", stops: [6, 7], mix: { person: 4, obstacle: 1, fight: 1 }, lean: { talk: -1, pay: -1, force: 1 }, joins: true, loot: 3, start: 9, skies: ["clear", "rain"],
    brief: "a conspiracy: people with power are plotting something, and the companion has stumbled onto it. Gather proof from the people in on it, and bring it out before the plot is carried out at the deadline.",
    drawn: "Powerful people are plotting, and you are the only ones who know.",
    climax: { cards: ["warden", "guardian", "keep"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 5, brief: "the plotters, who close ranks a little more with every slip you make" },
    fallback: { title: "The Plot at {end}", goal: "{friend} has found out that someone powerful is plotting, and it all comes to a head at {end} at {deadline}. Get proof, and stop it.", won: "At {end} the proof is laid out for all to see, and the plotters have nowhere left to stand.", lost: "At {deadline} the plot is carried out at {end}, and nobody ever believes what you knew.", rivalName: "the plotters", rivalWho: "the plotters, who have eyes everywhere", rivalLost: "The plotters have found you out. Every door at {end} is shut to you, and every witness has gone quiet." },
  }),

  /* ------------------------------ journeys ------------------------------ */
  R({
    id: "escort", pace: -0.5, family: "journey", part: "friend", stops: [6, 7], mix: { person: 2, obstacle: 3, fight: 1 }, lean: {}, joins: true, loot: 2, start: 8, skies: ["clear", "wind", "rain", "snow"],
    brief: "an escort: the companion has to reach the end of the road safely and in time (to claim something, to warn someone, to be where they are needed), and the road does not want them to. Get them there.",
    drawn: "Someone has to get somewhere, and the road does not want them to.",
    climax: { cards: ["gate", "keeper", "guardian"], kind: "obstacle", holds: 2 },
    fallback: { title: "The Way to {end}", goal: "{friend} has to be at {end} by {deadline}, or everything they have is lost. The road is long, and not everyone wants them to arrive.", won: "The gates of {end} open, and {friend} walks through with time to spare.", lost: "At {deadline} {end} is still a long way off. {friend} sits down at the roadside and does not say anything for a long time." },
  }),
  R({
    id: "message", family: "journey", part: "friend", stops: [5, 7], mix: { person: 2, obstacle: 3, fight: 1 }, lean: { sneak: -1, pay: 1 }, joins: false, loot: 2, start: 14, skies: ["rain", "storm", "wind", "fog"],
    brief: "an errand against the clock: a message, a cure or a warning must reach the end of the road by the deadline, or something terrible happens there. The companion is the one who knows why it matters.",
    drawn: "Something has to get there in time, or it will be too late for everyone.",
    climax: { cards: ["gate", "sentries", "keeper"], kind: "obstacle", holds: 2 },
    fallback: { title: "Word for {end}", goal: "{friend} carries word that has to reach {end} by {deadline}, or something terrible happens there. It is a long night's going.", won: "The word is given at {end} with minutes to spare, and the whole place breathes again.", lost: "At {deadline} it is too late. Whatever was going to happen at {end} has happened." },
  }),
  R({
    id: "escape", pace: 0.5, family: "journey", part: "friend", stops: [5, 7], mix: { person: 2, obstacle: 3, fight: 2 }, lean: { sneak: -1, talk: 1 }, joins: false, loot: 2, start: 17, skies: ["rain", "fog", "storm"],
    brief: "an escape: the companion is hunted and must get out (over a border, to a safe house, off an island) with the hunters close behind. Every slip lets them gain ground.",
    drawn: "Someone is being hunted, and you are getting them out.",
    climax: { cards: ["water", "gate", "sentries"], kind: "obstacle", holds: 2 },
    rival: { card: "hound", max: 5, brief: "the hunters on your trail, who gain ground with every slip you make" },
    fallback: { title: "Over to {end}", goal: "{friend} is hunted, and the only safety is at {end}. The hunters are an hour behind, and by {deadline} the way will be shut.", won: "You cross into {end} with the hunters' lights still on the far side, and {friend} finally sleeps.", lost: "At {deadline} the way to {end} is shut, and the hunters' lights are all round you.", rivalName: "the hunters", rivalWho: "the hunters, close behind, with lights and dogs", rivalLost: "The hunters close in before you reach {end}. There is nowhere left to run." },
  }),
  R({
    id: "pilgrimage", pace: -0.5, family: "journey", part: "friend", stops: [6, 7], mix: { person: 3, obstacle: 3, fight: 0 }, lean: { talk: -1, force: 1 }, joins: true, loot: 3, start: 8, skies: ["clear", "wind", "snow", "fog"],
    brief: "a pilgrimage: the companion has to reach a far, special place (holy, forbidden, long promised) by a certain hour, for a reason that matters deeply to them. The road tests patience and kindness more than strength.",
    drawn: "Someone has to reach a far place, for a reason close to their heart.",
    climax: { cards: ["guardian", "climb", "fire"], kind: "person", holds: 2 },
    fallback: { title: "The Road to {end}", goal: "{friend} made a promise long ago to be at {end} by {deadline} on this day. It is today, and it is a long road.", won: "{friend} reaches {end} as the hour comes, and keeps the promise. You stand back and let them have the moment.", lost: "At {deadline} {end} is still over the next hill. {friend} turns back without a word." },
  }),

  /* ------------------------------ hunts ------------------------------ */
  R({
    id: "beast", pace: 1.5, family: "hunt", part: "friend", stops: [5, 7], mix: { person: 2, obstacle: 2, fight: 2 }, lean: { force: -1, talk: 1 }, joins: true, loot: 3, start: 14, skies: ["fog", "storm", "wind", "snow"],
    brief: "a monster hunt: something dangerous (a beast, a creature, a thing that should not be) is preying on people the companion cares about. Track it to its lair and face it.",
    drawn: "Something is preying on people, and it has to be stopped.",
    climax: { cards: ["hound", "ambush", "keep"], kind: "fight", holds: 3 },
    fallback: { title: "The Thing at {end}", goal: "Something has been killing at night near {friend}'s home, and its lair is at {end}. Find it and finish it before {deadline}, when it hunts again.", won: "At {end} it falls, at last, and the night is quiet. {friend} lets out a breath they have been holding for weeks.", lost: "At {deadline} it hunts again, and you are nowhere near {end}." },
  }),
  R({
    id: "bounty", pace: -0.5, family: "hunt", part: "friend", stops: [5, 7], mix: { person: 3, obstacle: 2, fight: 1 }, lean: { talk: -1 }, joins: true, loot: 2, start: 11, skies: ["clear", "rain", "wind"],
    brief: "a manhunt: someone who wronged the companion (or many people) is on the run. Track them from place to place by what people saw, and bring them in.",
    drawn: "Someone who did wrong is on the run, and you are going after them.",
    climax: { cards: ["rival", "ambush", "keep"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 5, brief: "the one you are hunting, who slips further away with every slip you make" },
    fallback: { title: "After the One at {end}", goal: "Someone who wronged {friend} is running, and they mean to be gone from {end} by {deadline}. Bring them in before they do.", won: "At {end} you have them, and {friend} gets to look them in the eye at last.", lost: "At {deadline} they are gone from {end}, over the edge of the map.", rivalWho: "the one you are hunting, who knows you are coming", rivalLost: "They have slipped away. At {end} there is only a cold hearth and a back door left open." },
  }),
  R({
    id: "old-score", pace: 0.5, family: "hunt", part: "friend", stops: [5, 6], mix: { person: 3, obstacle: 1, fight: 2 }, lean: { force: -1 }, joins: false, loot: 2, start: 13, skies: ["clear", "wind", "storm"],
    brief: "an old score: the companion has an old enemy, and tonight is the night it is settled, by a duel, a reckoning, or a confrontation in front of witnesses. Get to them through their friends, and face them.",
    drawn: "There is an old score, and tonight it gets settled.",
    climax: { cards: ["rival", "fire", "contest"], kind: "fight", holds: 2 },
    rival: { card: "rival", max: 4, brief: "the old enemy, who grows surer of winning with every slip you make" },
    fallback: { title: "The Score at {end}", goal: "{friend} has an old enemy, and tonight at {end} it gets settled, one way or the other. The enemy's friends are on every road there.", won: "At {end} it is settled, and the old enemy walks away with nothing. {friend} is free of them at last.", lost: "At {deadline} the old enemy is still waiting at {end}, and you never got there.", rivalWho: "the old enemy, who has never lost", rivalLost: "The old enemy has the better of you before you even reach {end}. They laugh about it for years." },
  }),

  /* ------------------------------ romances ------------------------------ */
  R({
    id: "courtship", family: "romance", part: "courted", stops: [5, 6], mix: { person: 3, obstacle: 2, fight: 0 }, lean: { talk: -1, force: 1 }, joins: false, loot: 2, start: 14, skies: ["clear", "wind"],
    brief: "a courtship: tonight, at a gathering, the player tries to win the heart of the one they love, and someone else is trying too.",
    drawn: "Tonight you try to win a heart, and you are not the only one trying.",
    climax: { cards: ["fire", "beloved"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 4, brief: "a rival for the same heart, who gains ground with every slip you make" },
    fallback: { title: "A Night at {end}", goal: "{friend} has had your heart for a long time, and tonight at {end} people say what they mean. Someone else means to say it to {friend} first.", won: "{friend} turns and looks at you, properly, for the first time. Then takes your hand.", lost: "At {deadline} the moment has gone past you. {friend} is laughing with someone else.", rivalWho: "a rival, handsome and sure of themselves", rivalLost: "The rival has got there before you. {friend} takes their arm and they walk off together." },
  }),
  R({
    id: "forbidden", pace: 0.5, family: "romance", part: "courted", stops: [5, 6], mix: { person: 3, obstacle: 2, fight: 1 }, lean: { sneak: -1, force: 1 }, joins: false, loot: 2, start: 16, skies: ["clear", "rain", "fog"],
    brief: "a forbidden love: the player and the one they love are kept apart (by family, rank, a feud or a vow), and tonight is the only chance to meet and say what must be said. Someone means to keep them apart.",
    drawn: "You are kept apart from the one you love, and tonight is the only chance.",
    climax: { cards: ["beloved", "fire", "guardian"], kind: "person", holds: 2 },
    rival: { card: "guardian", max: 4, brief: "the one who means to keep you apart, who learns more with every slip you make" },
    fallback: { title: "Meet Me at {end}", goal: "You and {friend} are forbidden to meet, and tonight at {end}, until {deadline}, is the only chance you will ever get. Someone is watching to stop you.", won: "At {end}, in the dark, {friend} is waiting, and nothing anyone forbids matters any more.", lost: "At {deadline} {end} is empty. {friend} waited as long as they could.", rivalName: "the watcher", rivalWho: "the one who keeps you apart, watchful and stern", rivalLost: "You were seen. {friend} is taken home, and the door is locked behind them." },
  }),
  R({
    id: "admirer", pace: 0.5, family: "romance", part: "courted", stops: [5, 6], mix: { person: 3, obstacle: 2, fight: 0 }, lean: { talk: -1, pay: -1, force: 1 }, joins: false, loot: 3, start: 10, skies: ["clear", "wind"],
    brief: "a secret admirer's day: the player has admired the one they love from afar, and today, by a series of small gifts, favours and brave moments, they let it be known, before the day ends and the chance with it.",
    drawn: "You have loved someone from afar, and today you let them know.",
    climax: { cards: ["beloved", "fire"], kind: "person", holds: 2 },
    fallback: { title: "A Day for {friend}", goal: "You have admired {friend} from afar for too long. Today, before {deadline}, you mean to let them know, one brave thing at a time, and end the day at {end}.", won: "At {end} {friend} works out who it was all along, and smiles in a way you will remember.", lost: "At {deadline} the day is over. {friend} never knew it was you." },
  }),
  R({
    id: "rekindled", pace: 0.5, family: "romance", part: "courted", stops: [5, 6], mix: { person: 4, obstacle: 1, fight: 0 }, lean: { talk: -1 }, joins: false, loot: 2, start: 15, skies: ["rain", "clear", "fog"],
    brief: "a second chance: the player and the one they love parted badly long ago, and they are in the same place for one night only. Mend what was broken, and say what was never said.",
    drawn: "You parted badly once, and tonight is a second chance.",
    climax: { cards: ["beloved", "fire"], kind: "person", holds: 2 },
    rival: { card: "rival", max: 5, brief: "someone new in their life, who gains ground with every slip you make" },
    fallback: { title: "Again at {end}", goal: "You and {friend} parted badly, years ago. Tonight you are both in the same place, and {friend} leaves from {end} at {deadline}. Mend it, if you can.", won: "At {end} {friend} does not get on the coach. They stay, and so do you.", lost: "At {deadline} {friend} leaves from {end}, and you were too late to say it.", rivalWho: "someone new in their life, kind and sure", rivalLost: "Someone else has their heart now. You see it in how {friend} looks at them." },
  }),

  /* ------------------------------ survival ------------------------------ */
  R({
    id: "the-night", pace: 0.5, family: "survival", part: "friend", stops: [5, 7], mix: { person: 1, obstacle: 2, fight: 3 }, lean: { force: -1, pay: 1 }, joins: true, loot: 3, start: 17, skies: ["storm", "fog", "snow", "wind"],
    brief: "a night to survive: something comes for the companion and the player at nightfall (raiders, beasts, the cold, a curse), and they must get through to the end of the night, from one shelter to the next, to the place where it all comes to a head before dawn.",
    drawn: "Something is coming tonight, and you have to live until morning.",
    climax: { cards: ["fire", "ambush", "keep"], kind: "fight", holds: 3 },
    fallback: { title: "Until Morning", goal: "Something comes at nightfall, and you and {friend} are out in it. Get through to {end}, and hold out there until the worst is past.", won: "The sky goes grey over {end}, and whatever came in the night slinks away from the light. You and {friend} are still standing.", lost: "The night has the better of you. By {deadline}, {end} has fallen." },
  }),
  R({
    id: "siege", pace: 0.5, family: "survival", part: "friend", stops: [5, 6], mix: { person: 2, obstacle: 2, fight: 2 }, lean: { force: -1, sneak: 1 }, joins: true, loot: 3, start: 13, skies: ["clear", "wind", "storm"],
    brief: "a siege: the companion's home (a house, a village, a hall) will be attacked at the deadline. Rally help, shore up defences, and stand at the last stand when the attack comes.",
    drawn: "A home is about to be attacked, and you are going to hold it.",
    climax: { cards: ["gate", "ambush", "sentries"], kind: "fight", holds: 3 },
    fallback: { title: "The Stand at {end}", goal: "{end} is {friend}'s home, and it will be attacked tonight. Gather help on the way and be there to hold it.", won: "The attack breaks at the walls of {end}, and the people inside cheer you and {friend} until they are hoarse.", lost: "At {deadline} {end} falls, and {friend} watches it burn." },
  }),
  R({
    id: "storm", pace: 0.5, family: "survival", part: "friend", stops: [5, 7], mix: { person: 1, obstacle: 4, fight: 1 }, lean: { force: -1, talk: 1 }, joins: true, loot: 2, start: 13, skies: ["storm", "snow", "rain", "wind"],
    brief: "a disaster: a storm, a flood, a fire or a collapse is coming, and the companion has to get through it to shelter, helping whoever can be helped on the way.",
    drawn: "Disaster is coming, and you are right in its path.",
    climax: { cards: ["water", "climb", "gate"], kind: "obstacle", holds: 2 },
    fallback: { title: "Before the Storm", goal: "The worst storm in memory is coming, and you and {friend} are miles from shelter. Get to {end} before {deadline}, when it breaks.", won: "You get through the doors of {end} as the storm breaks behind you, and {friend} laughs out loud from sheer relief.", lost: "At {deadline} the storm breaks over you, miles short of {end}." },
  }),
];

export const recipeOf = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);
export const recipesIn = (f: Family): Recipe[] => RECIPES.filter((r) => r.family === f);

/* ------------------------------ choosing a story ------------------------------ */

/** The families a card is offered: a romance only when the card's character may be courted (docs/DESIGN.md, 7). */
export const familiesFor = (courtable: boolean): Family[] => FAMILIES.filter((f) => f !== "romance" || courtable);

/** The families as the narrator says them: "a rescue, a heist, ... or a night to survive". */
export function familiesSaid(offered: readonly Family[]): string {
  const names = offered.map((f) => FAMILY_SAID[f].name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}` : names[0] ?? "";
}

/** What a line written in answer to "what kind of story?" can come to. */
export type StoryAnswer = Family | "any" | "done";

const ANY = /\b(surprise|you (?:choose|pick|decide)|choose for me|pick for me|anything|any of them|whatever|up to you|random|your choice|dealer'?s choice|don'?t mind|no preference)/i;
// Words for stopping play, never for what a story does: "a story where we stop a cult" or "leave the city" is a story.
const DONE = /\b(i'?m done|we'?re done|done for (tonight|now|the night)|that'?s enough|enough for (tonight|now)|stop (here|now|for tonight|for now|playing)|let'?s stop|no more|good ?night|bye|quit|that'?s all|call it a (night|day)|not tonight|no thanks?|i'?m tired|maybe later|another time)\b|^\s*(done|enough|stop|later|no)\s*[.!]*\s*$/i;

/** Which family a written line asks for, "any" to let the narrator choose, "done" (when it may stop) to stop for tonight; null when it cannot be told. */
export function storyRead(line: string, offered: readonly Family[], canStop = false): StoryAnswer | null {
  const hits = offered.filter((f) => FAMILY_SAID[f].words.test(line));
  if (hits.length === 1) return hits[0]!;
  if (hits.length) return null;
  if (canStop && DONE.test(line)) return "done";
  return ANY.test(line) ? "any" : null;
}

/**
 * The story drawn in a family: one not yet played with this card if there is one, never the one just played if
 * there is another, picked by seeded dice. "any" picks the family as well, not the last one played if it can.
 */
export function drawRecipe(answer: Family | "any", seed: string, played: readonly string[], offered: readonly Family[] = FAMILIES): Recipe {
  const rng = seededRng(`story:${seed}:${played.length}`);
  const last = played.length ? recipeOf(played[played.length - 1]!) : undefined;
  let family = answer;
  if (family === "any") {
    const fams = offered.filter((f) => f !== last?.family);
    family = (fams.length ? fams : offered)[Math.floor(rng() * (fams.length ? fams : offered).length)] ?? "rescue";
  }
  const pool = recipesIn(family);
  const fresh = pool.filter((r) => !played.includes(r.id));
  const notLast = pool.filter((r) => r.id !== last?.id);
  const from = fresh.length ? fresh : notLast.length ? notLast : pool;
  return from[Math.floor(rng() * from.length)]!;
}
