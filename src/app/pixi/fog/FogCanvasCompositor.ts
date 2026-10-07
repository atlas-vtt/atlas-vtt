/** Draws cached committed coverage and a separate temporary stroke on Canvas 2D. */
import { getDomHost } from '../../host/dom';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import { validateFogOperation } from '../../fog/fogOperationShape';
import { drawFogCoverage } from './drawFogCoverage';
import { FOG_COLOR, renderOperation } from './fogRenderUtils';

export class FogCanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bounds: FogBounds;
  private scale: number;
  constructor(
    bounds: FogBounds,
    scale = 0.5,
    private readonly coverageCache = new FogCoverageCache(),
    private readonly mapKey: () => string | null = () => null,
  ) {
    this.bounds = bounds;
    this.scale = scale;
    this.canvas = getDomHost().createCanvas(undefined, {
      width: Math.max(1, Math.round(bounds.width * scale)),
      height: Math.max(1, Math.round(bounds.height * scale)),
    });

    const ctx = this.canvas.getContext('2d', { willReadFrequently: false, alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context for fog compositor');
    this.ctx = ctx;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Returns false after covering the canvas when geometry or drawing fails. */
  composite(ops: Readonly<Record<string, FogOperation>>, preview?: FogOperation): boolean {
    const coverage = this.coverageCache.get(ops, this.mapKey());
    if (!coverage) return this.coverCanvas();
    try {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.globalAlpha = 1;
      this.ctx.fillStyle = FOG_COLOR;
      drawFogCoverage(this.ctx, coverage.shape, this.bounds, this.scale);
      if (preview) {
        validateFogOperation(preview);
        renderOperation(this.ctx, preview, this.bounds, this.scale, preview.offsetX ?? 0, preview.offsetY ?? 0);
      }
      return true;
    } catch {
      return this.coverCanvas();
    }
  }

  /** Map changes discard undo/redo observations as well as the current geometry. */
  reset(): void {
    this.coverageCache.reset();
    this.clearCanvas();
  }

  /** Clear old pixels without discarding geometry another consumer already read. */
  clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private coverCanvas(): false {
    // Reset every Canvas state, including a save/clip left behind by a failed draw.
    const width = this.canvas.width;
    this.canvas.width = width;
    this.ctx.fillStyle = FOG_COLOR;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    return false;
  }

  /** Recreate canvas when map/bounds change. */
  updateBounds(bounds: FogBounds): void {
    this.bounds = bounds;
    this.canvas.width = Math.max(1, Math.round(bounds.width * this.scale));
    this.canvas.height = Math.max(1, Math.round(bounds.height * this.scale));
  }

  /** The underlying HTMLCanvasElement for PIXI texture creation. */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  getBounds(): FogBounds {
    return this.bounds;
  }

  destroy(): void {
    this.reset();
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
