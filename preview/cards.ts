/**
 * Every card face and back side by side, for looking at the art (http://localhost:4184/cards).
 */
import { CARD_KINDS } from "../src/engine/cards.js";
import { cardBack, cardFace, loadCardPictures } from "../src/room/cardart.js";

await loadCardPictures();

document.body.style.cssText = "margin:0;background:#16110d;display:flex;flex-wrap:wrap;gap:10px;padding:10px";
const show = (c: HTMLCanvasElement): void => {
  c.style.width = "120px";
  document.body.append(c);
};
for (const k of CARD_KINDS) show(cardFace(k.id, k.family === "person" && k.id !== "keeper" ? "Dov" : undefined));
for (const f of ["person", "obstacle", "fight", "thing", "place"] as const) show(cardBack(f));
// Cards with words on them, as an ability, a companion and a thing kept are dealt to your side (?big=1 to see them large).
show(cardFace("lantern", "Ember in the Palm", "Gift. A coal of red light wakes in your hand. For 1 of your grit, a try where a lock or a gate comes into it is one step easier."));
show(cardFace("companion", "Wren Halloway", "A road-worn tinker with quick hands. Your Grace counts one higher. Likes it when you slip by unseen; hates it when you pay your way."));
show(cardFace("key", "Brass key of the mill", "Use it to go unseen: that try is one step easier, once."));
// The run's own cards, as its systems make them: a choice that is a whole sentence, a quest, a ware, a perk, a fight.
show(cardFace("crossroads", "Accept her offer and give up your jacket", "", "Choices", "Accept her offer and give up your jacket"));
show(cardFace("crossroads", "Slip out the back", "", "Choices", "Slip out the back"));
show(cardFace("lantern", "The Boy's Errand", "Find out who sent the boy with the hooked knife, and why. Next: ask at the Lamplighters' Stair (0 of 1).", "Quests"));
show(cardFace("purse", "Lamp oil: 12 silver", "A flask of good oil, enough for a night. 3 left.", "Old Hesk's wares", "I buy the lamp oil from Old Hesk."));
show(cardFace("boon", "Sure-Footed", "You have learned to trust your feet on bad ground. Climbing rises by 1, and a fall costs you less than it should.", "Perks", "I take Sure-Footed."));
show(cardFace("ambush", "Hold the bridge", "A way to go about the chase across the weir.", "The chase", "Hold the bridge"));
show(cardFace("warden", "The Lamplighters' Guild", "Wary of you. They remember the unpaid toll.", "Groups"));
show(cardFace("keep", "Greywater Keep", "", "Places"));
show(cardFace("key", "The ledger's last page", "It names the one who paid for the boy's knife. An extraordinarily long text follows here to see what happens when a card is given far more words than any card should ever be asked to carry on its face, because a model will one day write this much and the card must still look made on purpose and not broken at all.", "Clues", "I show the page to the warden."));
if (new URLSearchParams(location.search).get("big") === "1") for (const c of document.querySelectorAll("canvas")) c.style.width = "300px";
(window as unknown as { drawn: boolean }).drawn = true;
