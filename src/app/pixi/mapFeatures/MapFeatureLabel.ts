import type { HoverText } from './mapFeatureText';
import './map-feature-label.scss';

/** Hovering this long on a new thing shows its label, as Atlas's tooltips do. */
const HOVER_DELAY_MS = 300;
/** The label stands this far right of and below the pointer, clear of the cursor. */
const POINTER_GAP = 14;
/** How close to the window's edge the label may come before it moves to the pointer's other side. */
const EDGE = 8;
/** What hides the label at once, heard on the window in the capture phase. */
const DISMISS_EVENTS = ['keydown', 'pointerdown', 'wheel', 'contextmenu'] as const;

/**
 * The GM's hover label over the map, in Atlas's tooltip look (`.tooltip-content`): a DOM element in
 * the canvas's own document, so no capture of the map (the player window, thumbnails, online play)
 * can ever hold it. It shows after a short hover on a new thing, follows the pointer while it stays
 * on that thing, and hides at once on any key, press, wheel or context menu. It never takes a key.
 */
export class MapFeatureLabel {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly traits: HTMLElement;
  private readonly win: Window;
  /** What the label names now, shown or waiting for the delay; null while it names nothing. */
  private target: object | null = null;
  private timer: number | null = null;
  private clientX = 0;
  private clientY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.win = canvas.win;
    this.el = canvas.doc.body.createDiv({ cls: ['tooltip-content', 'atlas-map-feature-label'], attr: { role: 'tooltip' } });
    this.el.hidden = true;
    const inner = this.el.createDiv({ cls: 'tooltip-inner' });
    this.title = inner.createSpan({ cls: 'tooltip-label' });
    this.traits = inner.createSpan({ cls: 'atlas-map-feature-label__traits' });
    for (const type of DISMISS_EVENTS) this.win.addEventListener(type, this.dismiss, true);
  }

  /** Whether the label names something, shown or waiting for the delay. */
  get naming(): boolean {
    return this.target !== null;
  }

  /** Whether the label shows now. */
  get shown(): boolean {
    return !this.el.hidden;
  }

  /**
   * Names the thing under the pointer (`target`, told from another thing by identity), read with
   * `describe` once it is new, at the pointer's place in the window; null names nothing.
   */
  point<T extends object>(target: T | null, describe: (target: T) => HoverText, clientX: number, clientY: number): void {
    this.clientX = clientX;
    this.clientY = clientY;
    if (target === null) {
      this.hide();
      return;
    }
    if (target !== this.target) {
      this.hide();
      this.target = target;
      this.fill(describe(target));
      this.timer = this.win.setTimeout(() => this.show(), HOVER_DELAY_MS);
      return;
    }
    if (this.shown) this.place();
  }

  hide(): void {
    this.clearTimer();
    this.target = null;
    this.el.hidden = true;
  }

  destroy(): void {
    this.hide();
    for (const type of DISMISS_EVENTS) this.win.removeEventListener(type, this.dismiss, true);
    this.el.remove();
  }

  private readonly dismiss = (): void => this.hide();

  private fill({ title, traits }: HoverText): void {
    this.title.setText(title);
    this.traits.setText(traits.join(' · '));
    this.traits.hidden = traits.length === 0;
  }

  private show(): void {
    this.timer = null;
    this.el.hidden = false;
    this.place();
  }

  /** Beside the pointer, on its other side where the window's edge leaves no room. */
  private place(): void {
    const { offsetWidth: width, offsetHeight: height } = this.el;
    const right = this.clientX + POINTER_GAP;
    const below = this.clientY + POINTER_GAP;
    const x = right + width > this.win.innerWidth - EDGE ? this.clientX - POINTER_GAP - width : right;
    const y = below + height > this.win.innerHeight - EDGE ? this.clientY - POINTER_GAP - height : below;
    this.el.style.left = `${Math.max(EDGE, x)}px`;
    this.el.style.top = `${Math.max(EDGE, y)}px`;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.win.clearTimeout(this.timer);
    this.timer = null;
  }
}
