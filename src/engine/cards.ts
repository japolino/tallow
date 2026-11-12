/**
 * The kinds of card the narrator lays on the table (docs/DESIGN.md, 1.7 and 8.1). Each kind is drawn once, in our
 * own tarot-style frame, and used by every adventure: a stop's card shows what stands in the way, a card on your side
 * shows who is with you or what you have won.
 *
 * The names and pictures are our own. None is taken from an existing deck. This is the set decided on (docs/DESIGN.md, section 11, item 16):
 * enough for the rescue and the courtship, and for the kinds of stop the other tropes will need.
 */

/** What a card stands for, which also decides the colour of its back. */
export type CardFamily = "person" | "obstacle" | "fight" | "thing" | "place";

export interface CardKind {
  id: string;
  /** The title on its banner. */
  title: string;
  family: CardFamily;
  /** What its picture shows, in a few words: for the drawing in code, and for a picture prompt later. */
  shows: string;
}

const K = (id: string, title: string, family: CardFamily, shows: string): CardKind => ({ id, title, family, shows });

export const CARD_KINDS: readonly CardKind[] = [
  // People in your way.
  K("keeper", "The Toll-Keeper", "person", "a figure on a stool by a lowered bar, a ledger on the knee"),
  K("host", "The Innkeeper", "person", "a broad figure behind a counter, a lamp and two cups"),
  K("miller", "The Miller", "person", "a figure in an apron before a turning wheel, sacks at the feet"),
  K("warden", "The Warden", "person", "a tall figure in a chain of office, a ring of keys at the belt"),
  K("guardian", "The Guardian", "person", "a stern figure with folded arms in a doorway"),
  K("rival", "The Rival", "person", "a smiling figure with a flower held behind the back"),
  K("beloved", "The Beloved", "person", "a figure turning to look back over one shoulder, a ribbon in the wind"),
  K("companion", "The Fellow Traveller", "person", "a walker with a staff and a pack, looking down the road"),
  // Things in your way.
  K("gate", "The Barred Gate", "obstacle", "a heavy gate with a beam across it, a lamp above"),
  K("water", "The High Water", "obstacle", "a river in flood over stepping stones"),
  K("climb", "The Steep Way", "obstacle", "a path cut in a cliff, a rope pegged to the rock"),
  K("crowd", "The Throng", "obstacle", "many heads and lanterns pressed together in a lane"),
  K("contest", "The Contest", "obstacle", "a target on a post, an arrow in the outer ring"),
  // Fights.
  K("ambush", "The Ambush", "fight", "riders breaking from behind trees, blades out"),
  K("hound", "The Hound", "fight", "a great dog with its hackles up, chain broken"),
  K("sentries", "The Watch", "fight", "two spears crossed before a wall"),
  // Places.
  K("keep", "The Keep", "place", "a dark tower on a rock with one lit window"),
  K("fire", "The Bonfire", "place", "a tall fire with sparks rising and figures round it"),
  // Things kept.
  K("key", "The Key", "thing", "a large iron key on a loop of cord"),
  K("token", "The Token", "thing", "a carved wooden token on a thong"),
  K("lantern", "The Lantern", "thing", "a shuttered lantern with a thin blade of light"),
  K("purse", "The Purse", "thing", "a drawstring purse spilling three coins"),
];

const BY_ID = new Map(CARD_KINDS.map((k) => [k.id, k]));

export function cardKind(id: string): CardKind {
  const k = BY_ID.get(id);
  if (!k) throw new Error(`No card kind "${id}"`);
  return k;
}

/** The title on a stop's card: the one written for this world, else its kind's own. */
export const faceOf = (s: { card: string; face?: string }): string => s.face ?? cardKind(s.card).title;

/** What the back of a stop's card says about it before it is turned: the family, in plain words. */
export const FAMILY_SAYS: Record<CardFamily, string> = {
  person: "someone to get past",
  obstacle: "something to get past",
  fight: "a fight",
  thing: "a thing",
  place: "a place",
};
