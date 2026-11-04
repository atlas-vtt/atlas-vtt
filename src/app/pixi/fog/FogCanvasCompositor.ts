/** Draws cached committed coverage and a separate temporary stroke on Canvas 2D. */
import { getDomHost } from '../../host/dom';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import { validateFogOperation } from '../../fog/fogOperationShape';
import { coverCanvas } from '../utils/coverCanvas';
import { drawFogCoverage } from './drawFogCoverage';
import { drawWithSpreadEdges, FOG_COLOR, renderOperation } from './fogRenderUtils';
import { fogEdgeBlur } from '../../fog/fogEdge';

export class FogCanvasCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bounds: FogBounds;
  private scale: number;
  /** How far the edge fades to either side, in world pixels; 0 keeps it hard. */
  private edgeWidth = 0;
  /** Where the map lies in the world, whose own edge is no edge of the fog; null spreads from the canvas' edges. */
  private mapArea: () => FogBounds | null = () => null;
  /** The fog spread past the map for the blur; kept, as a composite runs on every brush move, and only while edges fade. */
  private spread: HTMLCanvasElement | null = null;
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

  /**
   * Returns false after covering the canvas when geometry or drawing fails. `fadeEdge` false draws
   * the fog as its shapes are, for what reads its pixels.
   */
  composite(ops: Readonly<Record<string, FogOperation>>, preview?: FogOperation, fadeEdge = true): boolean {
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
      if (fadeEdge) this.fadeEdges();
      return true;
    } catch {
      return this.coverCanvas();
    }
  }

  /** Fades the edge over `worldPx` map pixels from the next composite on; 0 keeps it hard. */
  setEdgeWidth(worldPx: number, mapArea: () => FogBounds | null = () => null): void {
    this.edgeWidth = worldPx;
    this.mapArea = mapArea;
    if (worldPx <= 0) this.spread = null;
  }

  /**
   * Blurs the finished fog once, which fades its edges and erased holes alike. The map's own edge is
   * no edge of the fog: fog painted up to it would fade into the nothing beyond and show the rim of
   * the map to the players, so what lies at the map's edge is spread past it first. Beyond the map
   * the fog therefore repeats its edge, whatever was painted there.
   */
  private fadeEdges(): void {
    const blur = fogEdgeBlur(this.edgeWidth) * this.scale;
    if (blur <= 0) return;
    // A blur's reach ends within three of its radii
    const pad = Math.ceil(blur * 3);
    const width = this.canvas.width + 2 * pad;
    const height = this.canvas.height + 2 * pad;
    const spread = this.spread ??= getDomHost().createCanvas(undefined, { width, height });
    if (spread.width !== width) spread.width = width;
    if (spread.height !== height) spread.height = height;
    const spreadCtx = spread.getContext('2d');
    if (!spreadCtx) throw new Error('Failed to get 2D context for the fog edge');
    spreadCtx.clearRect(0, 0, width, height);
    drawWithSpreadEdges(spreadCtx, this.canvas, this.mapOnCanvas(), pad);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = `blur(${blur}px)`;
    try {
      this.ctx.drawImage(spread, -pad, -pad);
    } finally {
      // Whatever draws next must be whole: the cover of a failed composite above all
      this.ctx.filter = 'none';
    }
  }

  /**
   * The whole canvas pixels that lie on the map, rounded inward: a column the map's edge cuts holds
   * fog painted up to that edge only in part, and repeated it would show the map through it.
   */
  private mapOnCanvas(): FogBounds {
    const { width, height } = this.canvas;
    const map = this.mapArea();
    if (map) {
      const left = Math.max(0, Math.ceil((map.x - this.bounds.x) * this.scale));
      const top = Math.max(0, Math.ceil((map.y - this.bounds.y) * this.scale));
      const right = Math.min(width, Math.floor((map.x + map.width - this.bounds.x) * this.scale));
      const bottom = Math.min(height, Math.floor((map.y + map.height - this.bounds.y) * this.scale));
      if (right > left && bottom > top) return { x: left, y: top, width: right - left, height: bottom - top };
    }
    return { x: 0, y: 0, width, height };
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
    coverCanvas(this.canvas, this.ctx, FOG_COLOR);
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
    this.spread = null;
    this.canvas.width = 1;
    this.canvas.height = 1;
  }
}
