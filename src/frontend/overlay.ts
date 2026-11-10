/**
 * The full-screen layer the room is drawn in, inside Lumiverse. It mounts over the whole app when the extension may
 * ("app_manipulation"); otherwise it uses a borderless floating widget the size of the window. Everything sits in one
 * shadow root, so the host's styles and the room's never mix. Adapted from the sibling project's overlay.
 */
import type { SpindleFrontendContext } from "lumiverse-spindle-types";

export interface Overlay {
  content: HTMLElement;
  show(): void;
  hide(): void;
  visible(): boolean;
  onClose(fn: () => void): void;
  destroy(): void;
}

const CSS = `
:host { all: initial; }
.tl-layer { position: fixed; inset: 0; z-index: 40; background: #060504; display: none; }
.tl-layer.open { display: block; }
.tl-content { position: absolute; inset: 0; overflow: hidden; }
.tl-close { position: absolute; top: max(10px, env(safe-area-inset-top)); right: 12px; z-index: 5; width: 34px; height: 34px;
  border-radius: 50%; border: 1px solid rgba(233,226,212,.18); background: rgba(6,5,4,.45); color: rgba(233,226,212,.7);
  font: 16px/1 Georgia, serif; cursor: pointer; display: grid; place-items: center; opacity: .55; transition: opacity .3s; }
.tl-close:hover, .tl-close:focus-visible { opacity: 1; }
`;

export function createOverlay(ctx: SpindleFrontendContext, canMountApp: boolean): Overlay {
  let host: HTMLElement;
  let setVisible: (v: boolean) => void;
  let dispose: () => void;
  if (canMountApp) {
    const mount = ctx.ui.mountApp({ className: "tallow-room", position: "app-overlay" });
    host = mount.root;
    setVisible = (v) => mount.setVisible(v);
    dispose = () => mount.destroy();
  } else {
    const widget = ctx.ui.createFloatWidget({ width: window.innerWidth, height: window.innerHeight, initialPosition: { x: 0, y: 0 }, chromeless: true, tooltip: "Tallow" });
    host = widget.root;
    const fit = (): void => {
      widget.setSize(window.innerWidth, window.innerHeight);
      widget.moveTo(0, 0);
    };
    window.addEventListener("resize", fit);
    setVisible = (v) => {
      if (v) fit();
      widget.setVisible(v);
    };
    dispose = () => {
      window.removeEventListener("resize", fit);
      widget.destroy();
    };
  }
  const shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : (host as unknown as ShadowRoot);
  const style = document.createElement("style");
  style.textContent = CSS;
  const layer = document.createElement("div");
  layer.className = "tl-layer";
  const content = document.createElement("div");
  content.className = "tl-content";
  const close = document.createElement("button");
  close.className = "tl-close";
  close.setAttribute("aria-label", "Leave the table");
  close.textContent = "✕";
  layer.append(content, close);
  shadow.append(style, layer);

  const closers: (() => void)[] = [];
  const show = (): void => {
    setVisible(true);
    layer.classList.add("open");
  };
  const hide = (): void => {
    layer.classList.remove("open");
    setVisible(false);
  };
  close.addEventListener("click", () => {
    hide();
    closers.forEach((f) => f());
  });
  hide();
  return { content, show, hide, visible: () => layer.classList.contains("open"), onClose: (fn) => closers.push(fn), destroy: () => dispose() };
}
