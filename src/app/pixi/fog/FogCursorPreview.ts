/**
 * Shows a semi-transparent brush circle at the pointer position in world space.
 * White for paint, red-tinted for erase. Only visible in brush mode.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { STROKE_COLORS } from '../../tools/shapeStroke';

const CURSOR_ALPHA = 0.4;
const CURSOR_LINE_WIDTH = 2;

export class FogCursorPreview {
  private graphics: PIXI.Graphics;
  private _brushRadius = 50;
  private _isErasing = false;
  /** Where the pointer was on screen when the ring was last placed. */
  private screenPoint: PIXI.PointData | null = null;

  /**
   * A scroll pan, pinch or glide moves the map under a pointer that stands still, which sends
   * no pointer move: the ring stays at the pointer's place on screen.
   */
  private readonly followCamera = (): void => {
    if (!this.graphics.visible || !this.screenPoint) return;
    this.graphics.position.copyFrom(this.viewport.toWorld(this.screenPoint));
  };

  constructor(private readonly viewport: Viewport) {
    this.graphics = new PIXI.Graphics();
    this.graphics.eventMode = 'none';
    this.graphics.visible = false;
    this.graphics.zIndex = 9999;
    this.redraw();
    viewport.on('moved', this.followCamera);
  }

  // ── Public API ──────────────────────────────────────────────────────

  getDisplayObject(): PIXI.Graphics {
    return this.graphics;
  }

  show(isErasing: boolean): void {
    this._isErasing = isErasing;
    this.graphics.visible = true;
    this.redraw();
  }

  hide(): void {
    this.graphics.visible = false;
  }

  /** The ring is on the map. */
  get shown(): boolean {
    return this.graphics.visible;
  }

  setBrushRadius(radius: number): void {
    if (this._brushRadius === radius) return;
    this._brushRadius = radius;
    this.redraw();
  }

  updatePosition(worldX: number, worldY: number): void {
    this.graphics.position.set(worldX, worldY);
    this.screenPoint = this.viewport.toScreen(worldX, worldY);
  }

  destroy(): void {
    this.viewport.off('moved', this.followCamera);
    if (!this.graphics.destroyed) {
      this.graphics.destroy();
    }
  }

  // ── Internals ───────────────────────────────────────────────────────

  private redraw(): void {
    this.graphics.clear();
    const color = this._isErasing ? STROKE_COLORS.erase : STROKE_COLORS.paint;

    this.graphics.circle(0, 0, this._brushRadius);
    this.graphics.stroke({ width: CURSOR_LINE_WIDTH, color, alpha: CURSOR_ALPHA });
  }
}
