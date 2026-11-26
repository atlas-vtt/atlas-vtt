import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { WallSegment } from '../../types/wallTypes';
import { drawKindWall, kindMarks, type KindSpan } from './wallKindLook';

/** A wall with a look of its own, and the colour the editor gives it now. */
export interface KindWall {
  wall: WallSegment;
  color: number;
  alpha: number;
  /** A secret door: drawn hollow. */
  hollow: boolean;
}

/** How far past the screen the walls are drawn, as a share of the screen's size: a pan within it draws nothing anew. */
const MARGIN = 0.5;
/** The most strokes and dots one drawing lays out: with more on screen, every pattern is made coarser alike. */
const MAX_MARKS = 12_000;

interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * The wall editor's walls that have a look of their own (`wallKindLook`). Their dashes and dots
 * are laid out in screen pixels, so they are drawn anew when the zoom changes: only the parts
 * of walls on the screen and half a screen around it, at most once a frame however many zoom
 * events a frame brings, and with a coarser pattern where the screen holds more of them than
 * `MAX_MARKS` strokes and dots. A pan draws anew only once the screen leaves what was drawn.
 * With 20,000 such walls a zoom step then takes 9 to 70 ms; drawing all of them at every zoom
 * event takes up to 3.4 s.
 */
export class KindWallLayer {
  readonly graphics = new Graphics();
  private walls: readonly KindWall[] = [];
  private drawn: (Rect & { zoom: number }) | null = null;
  private pending = false;

  constructor(private readonly viewport: Viewport) {
    viewport.on('zoomed', this.onZoom);
    viewport.on('moved', this.onMove);
  }

  /** The walls to show from now on, drawn at once: the editor redraws on every edit. */
  set(walls: readonly KindWall[]): void {
    this.walls = walls;
    this.draw();
  }

  destroy(): void {
    this.viewport.off('zoomed', this.onZoom);
    this.viewport.off('moved', this.onMove);
    this.viewport.options.ticker?.remove(this.flush);
    this.graphics.destroy();
  }

  private readonly onZoom = (): void => {
    if (this.viewport.scale.x !== this.drawn?.zoom) this.schedule();
  };

  private readonly onMove = (): void => {
    const screen = this.screen(0), drawn = this.drawn;
    if (!drawn || screen.x0 < drawn.x0 || screen.y0 < drawn.y0 || screen.x1 > drawn.x1 || screen.y1 > drawn.y1) this.schedule();
  };

  /** Draws in the frame's tick, once; at once where the viewport has no ticker. */
  private schedule(): void {
    if (this.pending || this.walls.length === 0 || !this.graphics.parent?.visible) return;
    const ticker = this.viewport.options.ticker;
    if (!ticker) {
      this.draw();
      return;
    }
    this.pending = true;
    ticker.addOnce(this.flush);
  }

  private readonly flush = (): void => {
    this.pending = false;
    if (this.graphics.parent?.visible) this.draw();
  };

  /** The part of the world on the screen, and `margin` screens more to every side. */
  private screen(margin: number): Rect {
    const { x, y, scale, screenWidth, screenHeight } = this.viewport;
    const zoom = scale.x || 1;
    const width = screenWidth / zoom, height = screenHeight / zoom;
    if (!(width > 0 && height > 0)) return { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    return { x0: -x / zoom - width * margin, y0: -y / zoom - height * margin, x1: -x / zoom + width * (1 + margin), y1: -y / zoom + height * (1 + margin) };
  }

  private draw(): void {
    const zoom = this.viewport.scale.x;
    const rect = this.screen(MARGIN);
    this.drawn = { ...rect, zoom };
    this.graphics.clear();
    const shown: { wall: KindWall; span: KindSpan }[] = [];
    let marks = 0;
    for (const wall of this.walls) {
      const span = within(wall.wall, rect);
      if (!span) continue;
      shown.push({ wall, span });
      marks += kindMarks(wall.wall, zoom, span);
    }
    const coarsen = Math.max(1, marks / MAX_MARKS);
    for (const { wall, span } of shown) drawKindWall(this.graphics, wall.wall, wall.color, zoom, wall.alpha, { ...span, coarsen }, wall.hollow);
  }
}

/** The stretch of `wall` inside `rect`, as distances from its first end, or null if none of it is. */
function within(wall: WallSegment, rect: Rect): KindSpan | null {
  const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
  const length = Math.hypot(dx, dy);
  let from = 0, to = 1;
  // Liang-Barsky: the share of the segment inside each of the four sides in turn.
  for (const [step, room] of [[-dx, wall.p1.x - rect.x0], [dx, rect.x1 - wall.p1.x], [-dy, wall.p1.y - rect.y0], [dy, rect.y1 - wall.p1.y]] as const) {
    if (step === 0) {
      if (room < 0) return null;
    } else if (step < 0) from = Math.max(from, room / step);
    else to = Math.min(to, room / step);
  }
  return from <= to ? { from: from * length, to: to * length, coarsen: 1 } : null;
}
