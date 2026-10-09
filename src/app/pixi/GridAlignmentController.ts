/**
 * Grid Alignment Controller
 *
 * Manages PIXI-side visuals for the grid calibration tool: the 4-quadrant
 * "Intersections" mode and the grid preview the "Freehand" mode places.
 * Draws crosshair markers, connecting lines, quadrant dimming, and drives
 * live grid preview through the existing GridSystem.
 */

import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { GridSystem, GridType } from '../grid/GridSystem';
import { getQuadrantBounds } from './gridAlignmentMath';
import type { AlignmentPoint, MapBounds } from './gridAlignmentMath';
import { MAP_LAYER_Z } from './mapLayerOrder';
import type { DetectableMap } from './mapImage/mapImageView';

// Re-exports so consumers can import from one place
export type { AlignmentPoint, AlignmentResult } from './gridAlignmentMath';

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const CROSSHAIR_SIZE = 20;
const CROSSHAIR_COLOR = 0x00ff88;
const LINE_COLOR = 0x00ff88;
const CIRCLE_RADIUS = 4;
const LINE_WIDTH = 2;
const DASH_LENGTH = 8;
const GAP_LENGTH = 6;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class GridAlignmentController {
  private viewport: Viewport;
  private gridSystem: GridSystem;
  private canvasEl: HTMLCanvasElement;
  private map: Pick<DetectableMap, 'worldRect'> | null;

  private crosshairs: (Graphics | null)[] = [];
  private connectingLines: (Graphics | null)[] = [];
  private quadrantOverlay: Graphics | null = null;
  private cursorPreview: Graphics | null = null;

  constructor(
    viewport: Viewport,
    gridSystem: GridSystem,
    canvasEl: HTMLCanvasElement,
    map: Pick<DetectableMap, 'worldRect'> | null = null,
  ) {
    this.viewport = viewport;
    this.gridSystem = gridSystem;
    this.canvasEl = canvasEl;
    this.map = map;
  }

  // -----------------------------------------------------------------------
  // Coordinate helpers
  // -----------------------------------------------------------------------

  screenToWorld(clientX: number, clientY: number): AlignmentPoint {
    const rect = this.canvasEl.getBoundingClientRect();
    const world = this.viewport.toWorld(clientX - rect.left, clientY - rect.top);
    return { x: world.x, y: world.y };
  }

  /** The map image in world units; null while none is shown. */
  getMapBounds(): MapBounds | null {
    const rect = this.map?.worldRect;
    return rect && rect.width > 0 && rect.height > 0 ? { ...rect } : null;
  }

  // -----------------------------------------------------------------------
  // Cursor preview (follows pointer during placement)
  // -----------------------------------------------------------------------

  updateCursorPreview(clientX: number, clientY: number, constrainY?: number): void {
    const point = this.screenToWorld(clientX, clientY);
    if (constrainY !== undefined) point.y = constrainY;

    if (!this.cursorPreview) {
      this.cursorPreview = new Graphics();
      this.cursorPreview.eventMode = 'none';
      this.cursorPreview.alpha = 0.5;
      this.addMark(this.cursorPreview);
    }

    this.cursorPreview.clear();
    this.drawCrosshairAt(this.cursorPreview, point, 0.4);
  }

  hideCursorPreview(): void {
    if (this.cursorPreview) {
      this.removeGraphics(this.cursorPreview);
      this.cursorPreview = null;
    }
  }

  // -----------------------------------------------------------------------
  // Indexed crosshair markers
  // -----------------------------------------------------------------------

  showMeasurementCrosshair(index: number, point: AlignmentPoint): void {
    if (this.crosshairs[index]) {
      this.removeGraphics(this.crosshairs[index]);
    }

    const g = new Graphics();
    g.eventMode = 'none';
    this.drawCrosshairAt(g, point, 0.6);

    this.addMark(g);
    this.crosshairs[index] = g;
  }

  // -----------------------------------------------------------------------
  // Indexed connecting lines (dashed)
  // -----------------------------------------------------------------------

  showMeasurementLine(index: number, a: AlignmentPoint, b: AlignmentPoint): void {
    if (this.connectingLines[index]) {
      this.removeGraphics(this.connectingLines[index]);
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const g = new Graphics();
    g.eventMode = 'none';

    const ux = dx / dist;
    const uy = dy / dist;
    let travelled = 0;
    let drawing = true;

    while (travelled < dist) {
      const segLen = drawing ? DASH_LENGTH : GAP_LENGTH;
      const end = Math.min(travelled + segLen, dist);
      if (drawing) {
        g.moveTo(a.x + ux * travelled, a.y + uy * travelled);
        g.lineTo(a.x + ux * end, a.y + uy * end);
      }
      travelled = end;
      drawing = !drawing;
    }

    g.stroke({ width: LINE_WIDTH, color: LINE_COLOR });
    this.addMark(g);
    this.connectingLines[index] = g;
  }

  // -----------------------------------------------------------------------
  // Quadrant dimming (Intersections tab)
  // -----------------------------------------------------------------------

  showQuadrantDimming(quadrantIndex: 0 | 1 | 2 | 3, completedPairs: number): void {
    this.clearQuadrantDimming();

    const mapBounds = this.getMapBounds();
    if (!mapBounds) return;

    const g = new Graphics();
    g.eventMode = 'none';

    for (let i = 0; i < 4; i++) {
      if (i === quadrantIndex) continue;
      const qb = getQuadrantBounds(mapBounds, i as 0 | 1 | 2 | 3);
      const alpha = i < completedPairs ? 0.15 : 0.35;
      g.rect(qb.x, qb.y, qb.width, qb.height);
      g.fill({ color: 0x000000, alpha });
    }

    this.addMark(g);
    this.quadrantOverlay = g;
  }

  clearQuadrantDimming(): void {
    if (this.quadrantOverlay) {
      this.removeGraphics(this.quadrantOverlay);
      this.quadrantOverlay = null;
    }
  }

  // -----------------------------------------------------------------------
  // Viewport zoom helpers
  // -----------------------------------------------------------------------

  zoomToQuadrant(quadrantIndex: 0 | 1 | 2 | 3): void {
    const mapBounds = this.getMapBounds();
    if (!mapBounds) return;

    const qb = getQuadrantBounds(mapBounds, quadrantIndex);
    const padding = 1.2;
    const scaleX = this.canvasEl.clientWidth / (qb.width * padding);
    const scaleY = this.canvasEl.clientHeight / (qb.height * padding);

    this.viewport.scale.set(Math.min(scaleX, scaleY));
    this.viewport.moveCenter(qb.x + qb.width / 2, qb.y + qb.height / 2);
  }

  zoomToFullMap(): void {
    const mapBounds = this.getMapBounds();
    if (!mapBounds) return;

    const padding = 1.1;
    const scaleX = this.canvasEl.clientWidth / (mapBounds.width * padding);
    const scaleY = this.canvasEl.clientHeight / (mapBounds.height * padding);

    this.viewport.scale.set(Math.min(scaleX, scaleY));
    this.viewport.moveCenter(
      mapBounds.x + mapBounds.width / 2,
      mapBounds.y + mapBounds.height / 2,
    );
  }

  // -----------------------------------------------------------------------
  // Grid preview
  // -----------------------------------------------------------------------

  showPreview(cellSize: number, offsetX: number, offsetY: number, type?: GridType): void {
    this.gridSystem.updateOptions({
      size: cellSize,
      offsetX,
      offsetY,
      enabled: true,
      isAligning: true,
      ...(type ? { type } : {}),
    });
  }

  /** Hides the grid while a new one is being placed; cancelling restores the scene's grid. */
  hidePreview(): void {
    this.gridSystem.updateOptions({ enabled: false, isAligning: true });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  cleanupVisuals(): void {
    for (const g of this.crosshairs) {
      if (g) this.removeGraphics(g);
    }
    this.crosshairs = [];

    for (const g of this.connectingLines) {
      if (g) this.removeGraphics(g);
    }
    this.connectingLines = [];

    this.clearQuadrantDimming();
    this.hideCursorPreview();
  }

  destroy(): void {
    this.cleanupVisuals();
    this.gridSystem.setAlignmentMode(false);
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private drawCrosshairAt(g: Graphics, point: AlignmentPoint, fillAlpha: number): void {
    const half = CROSSHAIR_SIZE / 2;
    g.moveTo(point.x - half, point.y);
    g.lineTo(point.x + half, point.y);
    g.moveTo(point.x, point.y - half);
    g.lineTo(point.x, point.y + half);
    g.stroke({ width: LINE_WIDTH, color: CROSSHAIR_COLOR });
    g.circle(point.x, point.y, CIRCLE_RADIUS);
    g.fill({ color: CROSSHAIR_COLOR, alpha: fillAlpha });
  }

  /** Above the lighting, which would darken the marks like the map. */
  private addMark(g: Graphics): void {
    g.zIndex = MAP_LAYER_Z.gridAlignment;
    this.viewport.addChild(g);
  }

  private removeGraphics(g: Graphics): void {
    if (g.parent) g.parent.removeChild(g);
    if (!g.destroyed) g.destroy();
  }
}
