/** A press that moves further than this (pixels) pans the image instead of dismissing it. */
const CLICK_TOLERANCE = 5;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;

/** A move on screen as it is in a layer turned clockwise by `degrees` (a table TV's turn). */
export function unturned(dx: number, dy: number, degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  // Rounded, so a quarter turn moves along one axis exactly
  const cos = Math.round(Math.cos(radians) * 1e9) / 1e9;
  const sin = Math.round(Math.sin(radians) * 1e9) / 1e9;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

interface Press {
  /** The pointer that pressed: a second finger meanwhile neither pans nor dismisses. */
  pointerId: number;
  x: number;
  y: number;
  /** The press started on the dark area around the image, where a click dismisses it. */
  outsideImage: boolean;
}

/**
 * Input on an image shown in the player window: the wheel zooms, dragging
 * (a mouse, a finger or a pen) pans, a double-click resets, and a click beside
 * the image or Escape anywhere in the window dismisses it.
 */
export class ImageOverlayControls {
  private scale = 1;
  private x = 0;
  private y = 0;
  private press: Press | null = null;
  /** Where a drag began, on screen and in the image's offset. */
  private drag: { clientX: number; clientY: number; x: number; y: number } | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly image: HTMLImageElement,
    private readonly win: Window,
    private readonly onDismiss: () => void,
    /** How far the image's layer is turned, in degrees clockwise, so a drag follows the pointer. */
    private readonly turn: () => number = () => 0,
  ) {
    this.applyTransform();
    container.addEventListener('wheel', this.onWheel);
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('dblclick', this.onDoubleClick);
    win.document.addEventListener('pointermove', this.onPointerMove);
    win.document.addEventListener('pointerup', this.onPointerUp);
    win.document.addEventListener('pointercancel', this.onPointerCancel);
    // Capture on the window: a focused element in the player view cannot swallow Escape
    win.addEventListener('keydown', this.onKeyDown, true);
  }

  detach(): void {
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('dblclick', this.onDoubleClick);
    this.win.document.removeEventListener('pointermove', this.onPointerMove);
    this.win.document.removeEventListener('pointerup', this.onPointerUp);
    this.win.document.removeEventListener('pointercancel', this.onPointerCancel);
    this.win.removeEventListener('keydown', this.onKeyDown, true);
    this.press = null;
    this.drag = null;
  }

  private applyTransform(): void {
    this.image.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
  }

  private isOnImage(clientX: number, clientY: number): boolean {
    const rect = this.image.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    this.applyTransform();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    // The close button handles its own click
    if (this.container.querySelector('.atlas-image-display__close')?.contains(event.target as Node)) return;
    this.press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, outsideImage: !this.isOnImage(event.clientX, event.clientY) };
    this.drag = { clientX: event.clientX, clientY: event.clientY, x: this.x, y: this.y };
    this.container.addClass('is-dragging');
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.press?.pointerId) return;
    const moved = unturned(event.clientX - this.drag.clientX, event.clientY - this.drag.clientY, this.turn());
    this.x = this.drag.x + moved.x;
    this.y = this.drag.y + moved.y;
    this.applyTransform();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    this.release();
    if (!press.outsideImage) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= CLICK_TOLERANCE) this.onDismiss();
  };

  /** A lost pointer leaves the image where the drag brought it and dismisses nothing. */
  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.press?.pointerId) this.release();
  };

  private release(): void {
    this.press = null;
    this.drag = null;
    this.container.removeClass('is-dragging');
  }

  private readonly onDoubleClick = (): void => {
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.applyTransform();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.onDismiss();
  };
}
