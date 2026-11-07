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
  x: number;
  y: number;
  /** The press started on the dark area around the image, where a click dismisses it. */
  outsideImage: boolean;
}

/**
 * Input on an image shown in the player window: the wheel zooms, dragging
 * pans, a double-click resets, and a click beside the image or Escape anywhere
 * in the window dismisses it.
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
    container.addEventListener('mousedown', this.onMouseDown);
    container.addEventListener('dblclick', this.onDoubleClick);
    win.document.addEventListener('mousemove', this.onMouseMove);
    win.document.addEventListener('mouseup', this.onMouseUp);
    // Capture on the window: a focused element in the player view cannot swallow Escape
    win.addEventListener('keydown', this.onKeyDown, true);
  }

  detach(): void {
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('mousedown', this.onMouseDown);
    this.container.removeEventListener('dblclick', this.onDoubleClick);
    this.win.document.removeEventListener('mousemove', this.onMouseMove);
    this.win.document.removeEventListener('mouseup', this.onMouseUp);
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

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    // The close button handles its own click
    if (this.container.querySelector('.atlas-image-display__close')?.contains(event.target as Node)) return;
    this.press = { x: event.clientX, y: event.clientY, outsideImage: !this.isOnImage(event.clientX, event.clientY) };
    this.drag = { clientX: event.clientX, clientY: event.clientY, x: this.x, y: this.y };
    this.container.addClass('is-dragging');
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.drag) return;
    const moved = unturned(event.clientX - this.drag.clientX, event.clientY - this.drag.clientY, this.turn());
    this.x = this.drag.x + moved.x;
    this.y = this.drag.y + moved.y;
    this.applyTransform();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    const press = this.press;
    this.press = null;
    this.drag = null;
    this.container.removeClass('is-dragging');
    if (!press?.outsideImage) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= CLICK_TOLERANCE) this.onDismiss();
  };

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
