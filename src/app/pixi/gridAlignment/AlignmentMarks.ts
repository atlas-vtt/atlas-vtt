/**
 * What the alignment tool marks on the map: a crosshair at every clicked point, a dashed line
 * across every measurement, the crosshair that follows the pointer and the dimming of the
 * quadrants that are not being measured. Crosshairs and dashes are as large on screen at any zoom,
 * as a map pin is.
 */

import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { getQuadrantBounds } from '../gridAlignmentMath';
import type { AlignmentPoint, MapBounds } from '../gridAlignmentMath';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';

// Sizes in pixels of the screen.
const CROSSHAIR_SIZE = 20;
const CIRCLE_RADIUS = 4;
const LINE_WIDTH = 2;
const DASH_LENGTH = 8;
const GAP_LENGTH = 6;
/** A dark line under every mark, so the accent reads on any map. */
const CASING_COLOR = 0x000000;
const CASING_ALPHA = 0.45;
const CASING_EXTRA_WIDTH = 2;

const CURSOR_ALPHA = 0.5;
const CURSOR_FILL_ALPHA = 0.4;
const CROSSHAIR_FILL_ALPHA = 0.6;

const DIM_COLOR = 0x000000;
/** A quadrant still to be measured is dimmed more than one already measured. */
const DIM_ALPHA = 0.35;
const DIM_ALPHA_MEASURED = 0.15;

const QUADRANTS = [0, 1, 2, 3] as const;

interface MeasurementLine {
  g: Graphics;
  a: AlignmentPoint;
  b: AlignmentPoint;
}

interface Stroke {
  width: number;
  color: number;
  alpha: number;
}

function accentColor(): number {
  return cssColorToHexNumber(getObsidianAccentColor());
}

/** The strokes of a mark, bottom first: a dark casing, then the theme's accent. */
function markStrokes(): Stroke[] {
  return [
    { width: LINE_WIDTH + CASING_EXTRA_WIDTH, color: CASING_COLOR, alpha: CASING_ALPHA },
    { width: LINE_WIDTH, color: accentColor(), alpha: 1 },
  ];
}

export class AlignmentMarks {
  private crosshairs: (Graphics | null)[] = [];
  private lines: (MeasurementLine | null)[] = [];
  private quadrantOverlay: Graphics | null = null;
  private cursor: Graphics | null = null;

  constructor(private readonly viewport: Viewport) {
    this.viewport.on('zoomed', this.fitToZoom);
  }

  /** Shows the crosshair that follows the pointer at `point`. */
  showCursor(point: AlignmentPoint): void {
    if (!this.cursor) {
      this.cursor = this.crosshair(CURSOR_FILL_ALPHA);
      this.cursor.alpha = CURSOR_ALPHA;
    }
    this.cursor.position.set(point.x, point.y);
  }

  hideCursor(): void {
    if (this.cursor) destroyTree(this.cursor);
    this.cursor = null;
  }

  /** Marks the clicked point `index`, in place of the mark it had. */
  showCrosshair(index: number, point: AlignmentPoint): void {
    const earlier = this.crosshairs[index];
    if (earlier) destroyTree(earlier);

    const g = this.crosshair(CROSSHAIR_FILL_ALPHA);
    g.position.set(point.x, point.y);
    this.crosshairs[index] = g;
  }

  /** Joins the two points of measurement `index` with a dashed line, in place of the line it had. */
  showLine(index: number, a: AlignmentPoint, b: AlignmentPoint): void {
    const earlier = this.lines[index];
    if (earlier) destroyTree(earlier.g);
    this.lines[index] = null;
    // Points in one place have no direction to dash along.
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return;

    const line = { g: this.mark(), a, b };
    this.lines[index] = line;
    this.drawLine(line);
  }

  /** Dims every quadrant of the map but `active`; nothing where no map is shown. */
  dimQuadrants(mapBounds: MapBounds | null, active: 0 | 1 | 2 | 3, measuredPairs: number): void {
    this.clearDimming();
    if (!mapBounds) return;

    const g = this.mark();
    for (const quadrant of QUADRANTS) {
      if (quadrant === active) continue;
      const { x, y, width, height } = getQuadrantBounds(mapBounds, quadrant);
      g.rect(x, y, width, height);
      g.fill({ color: DIM_COLOR, alpha: quadrant < measuredPairs ? DIM_ALPHA_MEASURED : DIM_ALPHA });
    }
    this.quadrantOverlay = g;
  }

  clearDimming(): void {
    if (this.quadrantOverlay) destroyTree(this.quadrantOverlay);
    this.quadrantOverlay = null;
  }

  /** Removes the crosshairs of the clicked points and the lines between them. */
  clearMeasurements(): void {
    for (const g of this.crosshairs) if (g) destroyTree(g);
    this.crosshairs = [];
    for (const line of this.lines) if (line) destroyTree(line.g);
    this.lines = [];
  }

  clear(): void {
    this.clearMeasurements();
    this.clearDimming();
    this.hideCursor();
  }

  destroy(): void {
    this.clear();
    this.viewport.off('zoomed', this.fitToZoom);
  }

  /** World units per pixel of the screen. */
  private pixelSize(): number {
    return 1 / this.viewport.scale.x;
  }

  /** Keeps every mark its size on screen. */
  private readonly fitToZoom = (): void => {
    const pixel = this.pixelSize();
    for (const g of [...this.crosshairs, this.cursor]) g?.scale.set(pixel);
    for (const line of this.lines) if (line) this.drawLine(line);
  };

  /** A crosshair drawn in pixels of the screen around its own origin; the zoom scales it back (`fitToZoom`). */
  private crosshair(fillAlpha: number): Graphics {
    const g = this.mark();
    const half = CROSSHAIR_SIZE / 2;
    for (const { width, color, alpha } of markStrokes()) {
      g.moveTo(-half, 0).lineTo(half, 0).moveTo(0, -half).lineTo(0, half);
      g.stroke({ width, color, alpha });
    }
    g.circle(0, 0, CIRCLE_RADIUS);
    g.fill({ color: accentColor(), alpha: fillAlpha });
    g.scale.set(this.pixelSize());
    return g;
  }

  /** Dashes of one length on screen from `a` to `b`, drawn anew when the zoom changes. */
  private drawLine({ g, a, b }: MeasurementLine): void {
    const pixel = this.pixelSize();
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    g.clear();
    for (const { width, color, alpha } of markStrokes()) {
      for (let travelled = 0; travelled < length; travelled += (DASH_LENGTH + GAP_LENGTH) * pixel) {
        const end = Math.min(travelled + DASH_LENGTH * pixel, length);
        g.moveTo(a.x + ux * travelled, a.y + uy * travelled);
        g.lineTo(a.x + ux * end, a.y + uy * end);
      }
      g.stroke({ width: width * pixel, color, alpha });
    }
  }

  /** An empty mark on the map, above the lighting, which would darken it like the map. */
  private mark(): Graphics {
    const g = new Graphics();
    g.eventMode = 'none';
    g.zIndex = MAP_LAYER_Z.gridAlignment;
    this.viewport.addChild(g);
    return g;
  }
}
