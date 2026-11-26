import type { TouchGestures } from './touchGestures';

/** Maps a point of the window to the canvas' own pixels (`EventSystem.mapPositionToPoint`). */
export type ToCanvasPoint = (out: { x: number; y: number }, clientX: number, clientY: number) => void;

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

/** Whether the event says its pointer is gone: lifted, or taken away. */
function isLift(type: string): boolean {
  return type === 'pointerup' || type === 'pointercancel';
}

/**
 * Hears the fingers and pens on the map's canvas from the window, before anything on the way to
 * the canvas can take them, and tells the gestures. For every event it answers whether the map's
 * tools get it (`admits`), to PIXI's gate and to whoever takes presses before PIXI does.
 *
 * Only `touch` and `pen` pointers are looked at: a mouse is never asked about.
 */
export class TouchSource {
  private readonly win: Window;
  private readonly point = { x: 0, y: 0 };
  private readonly own = new WeakSet<object>();
  private lastEvent: object | null = null;
  private lastAnswer = true;
  private penId: number | null = null;
  /** Fingers forgotten while they were down (the window lost focus): nothing of them is anyone's until they lift. */
  private readonly lost = new Set<number>();

  /** `onLifted` hears of every finger that is gone, and whether the tools get its release. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly toCanvas: ToCanvasPoint,
    private readonly gestures: TouchGestures,
    private readonly onPen: () => void,
    private readonly onLifted: (id: number, released: boolean) => void,
  ) {
    this.win = canvas.ownerDocument.defaultView ?? window;
    for (const type of POINTER_EVENTS) this.win.addEventListener(type, this.hear, true);
    this.win.addEventListener('blur', this.onBlur);
  }

  /** Whether the map's tools get the event. Asked by the window's listener or by PIXI, whichever hears the event first. */
  readonly admits = (event: object): boolean => {
    if (event === this.lastEvent) return this.lastAnswer;
    this.lastEvent = event;
    this.lastAnswer = this.answer(event);
    return this.lastAnswer;
  };

  /** Tells the canvas' own listeners that the finger is lost, as the browser does for a touch it takes away. */
  cancelPointer(id: number, canvasX: number, canvasY: number): void {
    const view = this.canvas.ownerDocument.defaultView ?? window;
    if (typeof view.PointerEvent !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const event = new view.PointerEvent('pointercancel', {
      pointerId: id, pointerType: 'touch', bubbles: true, clientX: rect.left + canvasX, clientY: rect.top + canvasY,
    });
    this.own.add(event);
    this.canvas.dispatchEvent(event);
  }

  destroy(): void {
    for (const type of POINTER_EVENTS) this.win.removeEventListener(type, this.hear, true);
    this.win.removeEventListener('blur', this.onBlur);
  }

  private readonly hear = (event: PointerEvent): void => {
    this.admits(event);
  };

  /**
   * The window lost focus, and what follows may never be heard: the tools are told that every
   * finger is lost, the fingers and their presses are forgotten, and so is the pen. A finger that
   * is still down does nothing more.
   */
  private readonly onBlur = (): void => {
    for (const id of this.gestures.reset()) {
      this.lost.add(id);
      this.onLifted(id, false);
    }
    this.penId = null;
    this.gestures.setPenDown(false);
  };

  private answer(event: object): boolean {
    if (!isPointerEvent(event) || this.own.has(event)) return true;
    if (event.pointerType === 'pen') {
      this.followPen(event);
      return true;
    }
    if (event.pointerType !== 'touch') return true;
    const id = event.pointerId;
    const { type } = event;
    if (type === 'pointerdown') {
      // The first finger of a touch: every finger before it has lifted, heard or not
      if (event.isPrimary) this.lost.clear();
      else this.lost.delete(id);
      if (event.target !== this.canvas) return true;
      this.toCanvas(this.point, event.clientX, event.clientY);
      this.gestures.down(id, this.point.x, this.point.y, event.timeStamp);
      return false;
    }
    // What says where the pointer is over (`pointerover`, `pointerout`, `pointerleave`) is neither a move nor a lift
    if (type !== 'pointermove' && !isLift(type)) return true;
    if (this.lost.has(id)) {
      if (isLift(type)) this.lost.delete(id);
      return false;
    }
    if (!this.gestures.tracks(id)) return true;
    this.toCanvas(this.point, event.clientX, event.clientY);
    if (type === 'pointermove') return this.gestures.move(id, this.point.x, this.point.y);
    const released = type === 'pointerup' && this.gestures.up(id, this.point.x, this.point.y, event.timeStamp);
    if (type === 'pointercancel') this.gestures.cancel(id);
    this.onLifted(id, released);
    return released || type === 'pointercancel';
  }

  /** A pen on the canvas is the tool; the gestures only need to know while it is down. */
  private followPen(event: PointerEvent): void {
    if (event.type === 'pointerdown' && event.target === this.canvas) {
      this.penId = event.pointerId;
      this.gestures.setPenDown(true);
      this.onPen();
    } else if ((event.type === 'pointerup' || event.type === 'pointercancel') && event.pointerId === this.penId) {
      this.penId = null;
      this.gestures.setPenDown(false);
    }
  }
}

function isPointerEvent(event: object): event is PointerEvent {
  return 'pointerType' in event && 'pointerId' in event;
}
