import { containsItsPositioned, scrollAxes } from './scrollAreas';
import { thumbGeometry } from './thumbGeometry';

type Axis = 'y' | 'x';

/** How long the thumbs stay after the last scroll or the pointer's arrival before they fade. */
export const HIDE_AFTER_MS = 1000;
/** Thickness of a thumb's grab band (`$band` in `_overlay-scrollbars.scss`): a corner both thumbs would share is left free. */
const BAND_PX = 12;
const WHEEL_LINE_PX = 16;
/** Marks the slot of a shadow root Atlas made, so a reloaded Atlas finds its own roots again. */
const SLOT_MARK = 'data-atlas-scrollbar-slot';
/** Presses on the thumbs stay with them: the area under them (a grid's marquee, a list's click) never sees them. */
const KEPT_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'] as const;

export interface OverlayScrollbarHost {
  shown(bar: OverlayScrollbar): void;
  hidden(bar: OverlayScrollbar): void;
}

/**
 * The scrollbar of one scroll area, drawn over its content in the area's shadow root (the area's children are
 * slotted as they are, so no selector or layout of theirs changes) and styled by `styles/_overlay-scrollbars.scss`
 * through `::part()`. The thumbs move with a scroll-driven animation, so scrolling runs no script; this only
 * sizes them, shows them for a moment and lets them be dragged.
 */
export class OverlayScrollbar {
  private readonly frame: HTMLElement;
  private readonly thumbs: Record<Axis, HTMLElement>;
  private readonly travel: Record<Axis, number> = { y: 0, x: 0 };
  private contained = false;
  private shown = false;
  private hovered = false;
  private dragging: Axis | null = null;
  private hideTimer: number | undefined;
  private lastProps = '';
  private lastParts = '';

  /** Whether `root` is a shadow root this module made. */
  static owns(root: ShadowRoot): boolean {
    return root.querySelector(`slot[${SLOT_MARK}]`) !== null;
  }

  /** Gives `root`, a new shadow root of a scroll area, the slot its children render through. */
  static prepare(root: ShadowRoot): void {
    root.createEl('slot', { attr: { [SLOT_MARK]: '' } });
  }

  constructor(readonly area: HTMLElement, root: ShadowRoot, private readonly host: OverlayScrollbarHost) {
    this.frame = root.createDiv({ attr: { part: 'frame', 'aria-hidden': 'true' } });
    this.thumbs = {
      y: this.frame.createDiv({ attr: { part: 'thumb thumb-y', hidden: '' } }),
      x: this.frame.createDiv({ attr: { part: 'thumb thumb-x', hidden: '' } }),
    };
    for (const type of KEPT_EVENTS) this.frame.addEventListener(type, (event) => event.stopPropagation());
    this.frame.addEventListener('wheel', (event) => this.forwardWheel(event), { passive: false });
    for (const axis of ['y', 'x'] as const) {
      const thumb = this.thumbs[axis];
      thumb.addEventListener('pointerdown', (event) => this.startDrag(axis, event));
      thumb.addEventListener('pointerenter', () => { this.hovered = true; this.arm(); });
      thumb.addEventListener('pointerleave', () => { this.hovered = false; this.arm(); });
    }
    area.setAttribute('data-atlas-scrollbar', '');
  }

  /** Sizes the thumbs to the area as it is laid out now; false when nothing in it scrolls. */
  measure(): boolean {
    const area = this.area;
    const style = area.win.getComputedStyle(area);
    const axes = scrollAxes(style);
    const rangeY = axes.y ? area.scrollHeight - area.clientHeight : 0;
    const rangeX = axes.x ? area.scrollWidth - area.clientWidth : 0;
    const both = rangeY >= 1 && rangeX >= 1;
    const y = rangeY >= 1 ? thumbGeometry(area.scrollHeight, area.clientHeight, area.clientHeight - (both ? BAND_PX : 0)) : null;
    const x = rangeX >= 1 ? thumbGeometry(area.scrollWidth, area.clientWidth, area.clientWidth - (both ? BAND_PX : 0)) : null;
    this.travel.y = y?.travel ?? 0;
    this.travel.x = x?.travel ?? 0;
    this.thumbs.y.toggleAttribute('hidden', !y);
    this.thumbs.x.toggleAttribute('hidden', !x);
    this.contained = containsItsPositioned(style);
    const props: Record<string, string> = {
      '--atlas-scrollbar-range-y': `${Math.max(0, rangeY)}px`,
      '--atlas-scrollbar-range-x': `${Math.max(0, rangeX)}px`,
      '--atlas-scrollbar-thumb-y': `${y?.size ?? 0}px`,
      '--atlas-scrollbar-thumb-x': `${x?.size ?? 0}px`,
      '--atlas-scrollbar-travel-y': `${this.travel.y}px`,
      '--atlas-scrollbar-travel-x': `${this.travel.x}px`,
      // The frame covers the padding box; anchored from outside it starts at the border box.
      '--atlas-scrollbar-border-top': `${area.clientTop}px`,
      '--atlas-scrollbar-border-left': `${area.clientLeft}px`,
      '--atlas-scrollbar-border-right': `${Math.max(0, area.offsetWidth - area.clientWidth - area.clientLeft)}px`,
      '--atlas-scrollbar-border-bottom': `${Math.max(0, area.offsetHeight - area.clientHeight - area.clientTop)}px`,
    };
    const key = Object.values(props).join();
    if (key !== this.lastProps) {
      this.lastProps = key;
      this.frame.setCssProps(props);
    }
    this.writeParts();
    return y !== null || x !== null;
  }

  /** Whether the thumbs show: a scroll then only keeps them, without measuring the area again. */
  get isShown(): boolean {
    return this.shown;
  }

  /** Shows the thumbs and fades them `HIDE_AFTER_MS` later, unless the pointer is on one or drags it. */
  reveal(): void {
    if (!this.shown) {
      this.shown = true;
      this.writeParts();
      this.host.shown(this);
    }
    this.arm();
  }

  hide(): void {
    this.area.win.clearTimeout(this.hideTimer);
    if (!this.shown) return;
    this.shown = false;
    this.writeParts();
    this.host.hidden(this);
  }

  destroy(): void {
    this.area.win.clearTimeout(this.hideTimer);
    this.frame.remove();
    this.area.removeAttribute('data-atlas-scrollbar');
  }

  private arm(): void {
    const win = this.area.win;
    win.clearTimeout(this.hideTimer);
    if (!this.shown || this.hovered || this.dragging) return;
    this.hideTimer = win.setTimeout(() => this.hide(), HIDE_AFTER_MS);
  }

  private writeParts(): void {
    const frame = `frame${this.contained ? ' contained' : ''}${this.shown ? ' shown' : ''}`;
    const key = `${frame}/${this.dragging ?? ''}`;
    if (key === this.lastParts) return;
    this.lastParts = key;
    this.frame.setAttribute('part', frame);
    for (const axis of ['y', 'x'] as const) {
      this.thumbs[axis].setAttribute('part', `thumb thumb-${axis}${this.dragging === axis ? ' dragging' : ''}`);
    }
  }

  private startDrag(axis: Axis, event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const area = this.area;
    const thumb = this.thumbs[axis];
    const from = axis === 'y' ? event.clientY : event.clientX;
    const start = axis === 'y' ? area.scrollTop : area.scrollLeft;
    const range = axis === 'y' ? area.scrollHeight - area.clientHeight : area.scrollWidth - area.clientWidth;
    const ratio = this.travel[axis] > 0 ? range / this.travel[axis] : 0;
    thumb.setPointerCapture(event.pointerId);
    this.dragging = axis;
    this.writeParts();
    this.arm();
    const move = (moved: PointerEvent): void => {
      const offset = start + ((axis === 'y' ? moved.clientY : moved.clientX) - from) * ratio;
      area.scrollTo(axis === 'y' ? { top: offset, behavior: 'instant' } : { left: offset, behavior: 'instant' });
    };
    const end = (): void => {
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', end);
      thumb.removeEventListener('pointercancel', end);
      thumb.removeEventListener('lostpointercapture', end);
      this.dragging = null;
      this.writeParts();
      this.arm();
    };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
    thumb.addEventListener('lostpointercapture', end);
  }

  /** The frame lies outside the area's scrolling box, so a wheel over a thumb would scroll what lies around it. */
  private forwardWheel(event: WheelEvent): void {
    event.preventDefault();
    const area = this.area;
    const unit = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? area.clientHeight : 1;
    area.scrollBy({ left: event.deltaX * unit, top: event.deltaY * unit, behavior: 'instant' });
  }
}
