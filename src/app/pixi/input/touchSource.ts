import type { TouchGestures } from './touchGestures';

/** Maps a point of the window to the canvas' own pixels (`EventSystem.mapPositionToPoint`). */
export type ToCanvasPoint = (out: { x: number; y: number }, clientX: number, clientY: number) => void;

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

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

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly toCanvas: ToCanvasPoint,
    private readonly gestures: TouchGestures,
    private readonly onPen: () => void,
    private readonly onLifted: (id: number) => void,
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
    const PointerEventOf = (this.win as Window & typeof globalThis).PointerEvent;
    if (typeof PointerEventOf !== 'function') return;
    const rect = this.canvas.getBoundingClientRect();
    const event = new PointerEventOf('pointercancel', {
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

  private readonly onBlur = (): void => this.gestures.reset();

  private answer(event: object): boolean {
    if (!isPointerEvent(event) || this.own.has(event)) return true;
    if (event.pointerType === 'pen') {
      this.followPen(event);
      return true;
    }
    if (event.pointerType !== 'touch') return true;
    const id = event.pointerId;
    if (event.type === 'pointerdown') {
      if (event.target !== this.canvas) return true;
      this.toCanvas(this.point, event.clientX, event.clientY);
      this.gestures.down(id, this.point.x, this.point.y);
      return false;
    }
    if (!this.gestures.tracks(id)) return true;
    this.toCanvas(this.point, event.clientX, event.clientY);
    if (event.type === 'pointermove') return this.gestures.move(id, this.point.x, this.point.y);
    const forwarded = event.type === 'pointerup' && this.gestures.up(id, this.point.x, this.point.y);
    if (event.type === 'pointercancel') this.gestures.cancel(id);
    this.onLifted(id);
    return forwarded || event.type === 'pointercancel';
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
