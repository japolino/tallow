/**
 * Whether the narrator's book has pictures (game/chapters.ts, backend/pictures.ts). Each one is an image made by Inlay
 * Illustrator on the user's own image connection, which may cost them money, so they are off until the user says yes:
 * asked once, when Inlay Illustrator is there to draw them, and changed at any time in the drawer. Kept in the page:
 * there is nothing secret in a yes or a no.
 */
const KEY = "tallow:pictures";
/** Asked once; a no is an answer. */
const ASKED = "tallow:asked-pictures-1";

export const PICTURES_ASK = {
  title: "Pictures in the narrator's book?",
  message:
    "Inlay Illustrator is installed. At every rest and every ending the narrator writes a short chapter in its book, and Inlay can paint one picture for each, in your own art style. Each picture is an image generation on your image connection, which may cost you money. You can change this at any time in Tallow's drawer.",
  variant: "info" as const,
  confirmLabel: "Paint them",
  cancelLabel: "No pictures",
};

export function picturesOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setPictures(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
    localStorage.setItem(ASKED, "1");
  } catch {
    /* Not kept: asked again next time. */
  }
}

/** Whether the user has been asked, or has chosen in the drawer. */
export function picturesAsked(): boolean {
  try {
    return localStorage.getItem(ASKED) === "1" || localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

/** An image loaded from an address, or null if it will not load. */
export function loadImage(src: string, ms = 20_000): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    const timer = setTimeout(() => done(null), ms);
    img.onload = () => {
      clearTimeout(timer);
      done(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    img.src = src;
  });
}
