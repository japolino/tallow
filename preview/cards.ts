/**
 * Every card face and back side by side, for looking at the art (http://localhost:4184/cards).
 */
import { CARD_KINDS } from "../src/engine/cards.js";
import { cardBack, cardFace } from "../src/room/cardart.js";

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
if (new URLSearchParams(location.search).get("big") === "1") for (const c of document.querySelectorAll("canvas")) c.style.width = "300px";
(window as unknown as { drawn: boolean }).drawn = true;
