/**
 * Grid Alignment Controller
 *
 * Manages PIXI-side visuals for the grid calibration tool: the 4-quadrant
 * "Intersections" mode and the grid preview the "Freehand" mode places.
 * Owns the marks on the map (`AlignmentMarks`) and the scan that shows a
 * detection while it runs (`GridScanLayer`), moves the camera, and drives
 * live grid preview through the existing GridSystem.
 */

import type { Viewport } from 'pixi-viewport';
import type { GridSystem } from '../grid/GridSystem';
import { NO_STRETCH, sameStretch, type MapStretch } from '../grid/mapStretch';
import { prefersReducedMotion } from '../utils/motion';
import { AlignmentMarks } from './gridAlignment/AlignmentMarks';
import type { GridScanLayer } from './gridAlignment/GridScanLayer';
import { getQuadrantBounds } from './gridAlignmentMath';
import type { AlignmentPoint, AlignmentResult, MapBounds } from './gridAlignmentMath';
import type { DetectionEvent, DetectionOutcome } from './spectralEngine/detectionJob';
import type { DetectableMap } from './mosaicCanvas/mosaicCanvasView';
import { glideViewport } from './utils/viewportGlide';

/** The part of the view's map image an alignment reads and tries its stretch on. */
export interface AlignedMap extends Pick<DetectableMap, 'worldRect'> {
  readonly mapStretch: MapStretch;
  setStretch(stretch: MapStretch): void;
}

// Re-exports so consumers can import from one place
export type { AlignmentPoint, AlignmentResult } from './gridAlignmentMath';

/** How much room a rect brought into view gets around it, as a factor of its size. */
const QUADRANT_PADDING = 1.2;
const FULL_MAP_PADDING = 1.1;

/**
 * What a scan shows on the map: the engine at work and its answer being drawn (`working`), only the
 * last of the answer's glow, which the eye no longer follows (`fading`), or nothing.
 */
export type ScanState = 'working' | 'fading' | 'none';

export class GridAlignmentController {
  private readonly marks: AlignmentMarks;
  /** A detection's answer waits behind the scan's locking wave: the grid shows once the wave has passed. */
  private awaitingReveal = false;
  /** Ends the camera's glide where it is. */
  private endGlide: (() => void) | null = null;
  /** Counts the scans begun, so that an earlier one's end says nothing about a later one. */
  private scanRun = 0;
  /** Hears what a scan shows on the map, from its start until it has nothing left to show. */
  onScan: ((scan: ScanState) => void) | null = null;

  /** `scan` shows detections on the map while they run; without one only their answers show. The controller owns it. */
  constructor(
    private readonly viewport: Viewport,
    private readonly gridSystem: GridSystem,
    private readonly canvasEl: HTMLCanvasElement,
    private readonly map: AlignedMap | null = null,
    private readonly scan: GridScanLayer | null = null,
  ) {
    this.marks = new AlignmentMarks(viewport);
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

  /** How the map is drawn stretched right now: what points clicked on it are measured in. */
  getMapStretch(): MapStretch {
    return this.map?.mapStretch ?? NO_STRETCH;
  }

  // -----------------------------------------------------------------------
  // Marks on the map
  // -----------------------------------------------------------------------

  /** Moves the crosshair that follows the pointer during placement; `constrainY` holds it on one row. */
  updateCursorPreview(clientX: number, clientY: number, constrainY?: number): void {
    const point = this.screenToWorld(clientX, clientY);
    if (constrainY !== undefined) point.y = constrainY;
    this.marks.showCursor(point);
  }

  hideCursorPreview(): void {
    this.marks.hideCursor();
  }

  showMeasurementCrosshair(index: number, point: AlignmentPoint): void {
    this.marks.showCrosshair(index, point);
  }

  showMeasurementLine(index: number, a: AlignmentPoint, b: AlignmentPoint): void {
    this.marks.showLine(index, a, b);
  }

  /** Dims the quadrants the Intersections tab is not measuring in. */
  showQuadrantDimming(quadrantIndex: 0 | 1 | 2 | 3, completedPairs: number): void {
    this.marks.dimQuadrants(this.getMapBounds(), quadrantIndex, completedPairs);
  }

  clearQuadrantDimming(): void {
    this.marks.clearDimming();
  }

  // -----------------------------------------------------------------------
  // Viewport zoom helpers
  // -----------------------------------------------------------------------

  zoomToQuadrant(quadrantIndex: 0 | 1 | 2 | 3): void {
    const mapBounds = this.getMapBounds();
    if (mapBounds) this.lookAt(getQuadrantBounds(mapBounds, quadrantIndex), QUADRANT_PADDING);
  }

  zoomToFullMap(): void {
    const mapBounds = this.getMapBounds();
    if (mapBounds) this.lookAt(mapBounds, FULL_MAP_PADDING);
  }

  /** Brings `rect` into view with `padding` times its size of room: a glide, or a jump where motion is reduced. */
  private lookAt(rect: MapBounds, padding: number): void {
    const scale = Math.min(this.canvasEl.clientWidth / (rect.width * padding), this.canvasEl.clientHeight / (rect.height * padding));
    const target = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, scale };
    this.stopGlide();
    // A canvas without a size (its tab is hidden) has no view to bring anything into.
    if (!(scale > 0) || !Number.isFinite(scale)) return;
    if (prefersReducedMotion(this.canvasEl)) {
      this.viewport.scale.set(scale);
      this.viewport.moveCenter(target.x, target.y);
      return;
    }
    this.endGlide = glideViewport(this.viewport, this.canvasEl, target);
  }

  private stopGlide(): void {
    this.endGlide?.();
    this.endGlide = null;
  }

  // -----------------------------------------------------------------------
  // Detections shown while they run
  // -----------------------------------------------------------------------

  /**
   * Begins showing a detection whose waves run out from `origin`, or from the map's middle.
   * Returns what its events are handed to.
   */
  beginScan(origin?: AlignmentPoint): (event: DetectionEvent) => void {
    const { scan } = this;
    if (!scan) return () => undefined;
    scan.start(origin);
    this.scanRun++;
    this.onScan?.(scan.showing ? 'working' : 'none');
    return (event) => scan.show(event);
  }

  /**
   * Ends the scan with the detection's outcome. A grid found is drawn as the result has the map,
   * and where no grid was showing it appears behind the scan's locking wave.
   */
  endScan({ result, hits }: DetectionOutcome): void {
    const { scan } = this;
    if (!scan) return;
    if (!result) {
      scan.miss();
      this.sayWhenStill(scan);
      return;
    }
    // The wave runs over the map as the result draws it.
    this.takeStretch(result.mapStretch ?? NO_STRETCH);
    this.awaitingReveal = this.gridSystem.getOptions().enabled !== true;
    scan.lock(result, hits, () => {
      if (!this.awaitingReveal) return;
      this.awaitingReveal = false;
      this.gridSystem.updateOptions({ enabled: true, isAligning: true });
    });
    this.sayWhenStill(scan);
  }

  /** Tells `onScan` how the scan under way ends: its last glow, then nothing. */
  private sayWhenStill(scan: GridScanLayer): void {
    const run = this.scanRun;
    const say = (state: ScanState): void => {
      if (run === this.scanRun) this.onScan?.(state);
    };
    if (!scan.showing) {
      say('none');
      return;
    }
    scan.whenQuiet(() => say('fading'));
    scan.whenStill(() => say('none'));
  }

  /** Ends a scan nobody waits for any more. */
  cancelScan(): void {
    this.awaitingReveal = false;
    this.scan?.cancel();
    this.scanRun++;
    this.onScan?.('none');
  }

  // -----------------------------------------------------------------------
  // Grid preview
  // -----------------------------------------------------------------------

  /** Shows the grid of `result` over the map as the result stretches it. */
  showPreview(result: AlignmentResult): void {
    this.takeStretch(result.mapStretch ?? NO_STRETCH);
    this.gridSystem.updateOptions({
      size: result.cellSize,
      offsetX: result.offsetX,
      offsetY: result.offsetY,
      enabled: !this.awaitingReveal,
      isAligning: true,
      ...(result.gridType ? { type: result.gridType } : {}),
    });
  }

  /** Draws the map with `stretch`: the grid is drawn over the map's rect, so the map takes its stretch first. */
  private takeStretch(stretch: MapStretch): void {
    // Marks stay where they were clicked in the world, which a map stretched otherwise has moved away under them.
    if (this.map && !sameStretch(stretch, this.map.mapStretch)) this.marks.clearMeasurements();
    this.map?.setStretch(stretch);
  }

  /** Hides the grid while a new one is being placed; cancelling restores the scene's grid. */
  hidePreview(): void {
    this.gridSystem.updateOptions({ enabled: false, isAligning: true });
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  cleanupVisuals(): void {
    this.marks.clear();
  }

  destroy(): void {
    this.marks.destroy();
    this.stopGlide();
    this.awaitingReveal = false;
    this.scan?.destroy();
    this.gridSystem.setAlignmentMode(false);
  }
}
