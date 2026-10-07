/**
 * Geometry and style of Atlas's measurements, shared by the measure tool and the token drag
 * ruler: the path's strokes, the point markers, circle and cone areas, and the distance label's
 * place, size and colours. Pure and PIXI-free; `utils/measureDrawing.ts` and `MeasureRenderer.ts`
 * draw them with Graphics. Lengths are world units unless they say screen pixels.
 */
import type { Point } from '../../grid/hexGeometry';

/** Black, for the soft shadows under paths and points. */
export const MEASURE_SHADOW = 0x000000;

/** A path is stroked three times: a soft shadow, the accent body and a bright core. */
export const MEASURE_PATH_STROKES: ReadonlyArray<{ width: number; alpha: number; shadow: boolean }> = [
  { width: 6, alpha: 0.3, shadow: true },
  { width: 4, alpha: 0.8, shadow: false },
  { width: 2, alpha: 1, shadow: false },
];

/** A point marker: a shadow halo, an accent disc and a ring just inside it. */
export const MEASURE_POINT = { radius: 8, halo: 3, haloAlpha: 0.3, fillAlpha: 0.9, ringInset: 1, ringWidth: 2 } as const;

/** Circle and cone areas: a faint fill and an outline; circles add a thin highlight just inside. */
export const MEASURE_AREA = { fillAlpha: 0.1, strokeWidth: 3, strokeAlpha: 0.8, highlightWidth: 1.5, highlightInset: 1 } as const;

/** The cone's default opening: 90 degrees, 45 on each side. A game system may set another (`MeasurementSettings.coneAngle`). */
export const CONE_ANGLE = Math.PI / 2;

export const MEASURE_LABEL_FONT_SIZE = 16;
/** How far the measure tool's label sits above the middle of the measurement, in screen pixels. */
const LABEL_LIFT = 30;

/** The label's pill per theme: its fill, then its hairline outline. */
export const MEASURE_LABEL_COLORS = {
  fillAlpha: 0.95,
  dark: { fill: 0x2a2a2a, stroke: 0xffffff, strokeAlpha: 0.4 },
  light: { fill: 0xe3e3e3, stroke: 0x000000, strokeAlpha: 0.3 },
} as const;

/** The point halfway along the path's length, where its distance label goes. */
export function pathMidpoint(points: readonly Point[]): Point | null {
  const segments = points.slice(1).map((end, i) => {
    const start = points[i]!;
    return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
  });
  let remaining = segments.reduce((sum, segment) => sum + segment.length, 0) / 2;
  for (const { start, end, length } of segments) {
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    remaining -= length;
  }
  return points[0] ?? null;
}

/** Font size in world units that keeps the label readable at any zoom. */
export function measureLabelFontSize(viewportScale: number): number {
  return Math.max(12, Math.min(32, MEASURE_LABEL_FONT_SIZE / viewportScale));
}

/** Where the measure tool's label goes: the middle of the measurement, lifted a constant screen distance. */
export function measureLabelAnchor(start: Point, end: Point, viewportScale: number): Point {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - LABEL_LIFT / viewportScale };
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  strokeWidth: number;
}

/** The pill behind a label of `textWidth` × `textHeight` world units centred on `center`. */
export function measureLabelBox(textWidth: number, textHeight: number, center: Point, viewportScale: number): LabelBox {
  const scaleFactor = 1 / viewportScale;
  const padding = 8 * scaleFactor;
  const width = textWidth + padding * 2;
  const height = Math.max(20 * scaleFactor, textHeight + 4 * scaleFactor);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height, radius: height / 2, strokeWidth: 0.5 * scaleFactor };
}

export interface ConeGeometry {
  radius: number;
  /** The arc runs from `startAngle` to `endAngle`, in radians. */
  startAngle: number;
  endAngle: number;
  /** The ends of the cone's two straight edges. */
  left: Point;
  right: Point;
}

/** A cone from `start` towards `end`, opening `opening` radians. */
export function coneGeometry(start: Point, end: Point, opening: number = CONE_ANGLE): ConeGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const baseAngle = Math.atan2(dy, dx);
  const startAngle = baseAngle - opening / 2;
  const endAngle = baseAngle + opening / 2;
  const at = (angle: number): Point => ({ x: start.x + radius * Math.cos(angle), y: start.y + radius * Math.sin(angle) });
  return { radius, startAngle, endAngle, left: at(startAngle), right: at(endAngle) };
}

/**
 * `segments + 1` points along an arc, for surfaces that draw arcs as polylines.
 * Part of the shared drawing contract (`@atlas-vtt/shared/draw`); Atlas's own renderer draws arcs natively.
 */
export function arcPoints(center: Point, radius: number, startAngle: number, endAngle: number, segments: number): Point[] {
  const steps = Math.max(1, Math.round(segments));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = startAngle + ((endAngle - startAngle) * i) / steps;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
}
