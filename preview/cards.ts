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
(window as unknown as { drawn: boolean }).drawn = true;
