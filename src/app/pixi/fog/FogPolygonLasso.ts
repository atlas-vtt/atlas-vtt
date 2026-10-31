import type { Point } from '../../grid/hexGeometry';

/** Click-placed corners with a temporary edge to the pointer. */
export class FogPolygonLasso {
  private points: Point[] = [];
  private keyWindow: Window | null = null;

  constructor(
    private canvas: HTMLCanvasElement | undefined,
    private preview: (points: Point[]) => void,
    private complete: (points: Point[] | null) => void,
  ) {}

  click(point: Point): void {
    if (this.points.length === 0) {
      this.keyWindow = this.canvas?.ownerDocument.defaultView ?? activeWindow;
      this.keyWindow.addEventListener('keydown', this.onKeyDown, true);
      this.canvas?.addEventListener('dblclick', this.onDoubleClick);
      this.canvas?.addEventListener('contextmenu', this.onContextMenu, true);
      this.canvas?.addEventListener('pointerdown', this.onPointerDown, true);
    }
    const first = this.points[0];
    if (this.points.length >= 3 && first && samePoint(first, point)) {
      this.finish();
      return;
    }
    const last = this.points[this.points.length - 1];
    if (!last || !samePoint(last, point)) this.points.push(point);
    this.preview(this.points);
  }

  move(point: Point): void {
    if (this.points.length) this.preview([...this.points, point]);
  }

  cancel(): void {
    this.end(null);
  }

  private finish(): void {
    // A line or repeated corner cannot enclose fog.
    const first = this.points[0];
    const second = this.points[1];
    const hasArea = first && second && this.points.some(point =>
      Math.abs((second.x - first.x) * (point.y - first.y) - (second.y - first.y) * (point.x - first.x)) > 0.001);
    if (hasArea) this.end([...this.points]);
  }

  private end(points: Point[] | null): void {
    this.keyWindow?.removeEventListener('keydown', this.onKeyDown, true);
    this.canvas?.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu, true);
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown, true);
    this.keyWindow = null;
    this.points = [];
    this.preview([]);
    this.complete(points);
  }

  private onDoubleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.finish();
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finish();
  };

  private onPointerDown = (event: PointerEvent): void => {
    // Reserve the right click for finishing, before Pixi opens an object menu.
    if (event.button === 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') this.cancel();
    else if (!event.repeat) this.finish();
  };
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}
