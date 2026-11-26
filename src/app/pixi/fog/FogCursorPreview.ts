/**
 * Shows the brush as a ring at the pointer's place in world space: a light line (red where the
 * brush erases) inside a dark one, both as wide on screen at any zoom, so the ring shows on a
 * light map and on a dark one. Only visible in brush mode.
 */
import * as PIXI from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { STROKE_COLORS } from '../../tools/shapeStroke';

/** The ring's lines in screen pixels: the dark one lies under the light one and shows to either side of it. */
const DARK_LINE = { width: 4, color: 0x000000, alpha: 0.55 } as const;
const LIGHT_LINE = { width: 1.5, alpha: 0.95 } as const;

export class FogCursorPreview {
  private graphics: PIXI.Graphics;
  private _brushRadius = 50;
  private _isErasing = false;
  /** Where the pointer was on screen when the ring was last placed. */
  private screenPoint: PIXI.PointData | null = null;
  /** The zoom the ring's lines were drawn for. */
  private drawnZoom = 1;

  /**
   * A scroll pan, pinch or glide moves the map under a pointer that stands still, which sends
   * no pointer move: the ring stays at the pointer's place on screen, and a zoom draws its lines
   * anew, as wide on screen as before.
   */
  private readonly followCamera = (): void => {
    if (!this.graphics.visible) return;
    if (this.zoom() !== this.drawnZoom) this.redraw();
    if (this.screenPoint) this.graphics.position.copyFrom(this.viewport.toWorld(this.screenPoint));
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
    // A zoom set by a key or a fit sends no `moved`: the next pointer move finds it.
    if (this.graphics.visible && this.zoom() !== this.drawnZoom) this.redraw();
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

  /** Screen pixels per world pixel. */
  private zoom(): number {
    const zoom = this.viewport.scale.x;
    return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  }

  private redraw(): void {
    const zoom = this.zoom();
    this.drawnZoom = zoom;
    const color = this._isErasing ? STROKE_COLORS.erase : STROKE_COLORS.paint;
    this.graphics.clear();
    this.graphics.circle(0, 0, this._brushRadius);
    this.graphics.stroke({ width: DARK_LINE.width / zoom, color: DARK_LINE.color, alpha: DARK_LINE.alpha });
    this.graphics.circle(0, 0, this._brushRadius);
    this.graphics.stroke({ width: LIGHT_LINE.width / zoom, color, alpha: LIGHT_LINE.alpha });
  }
}
