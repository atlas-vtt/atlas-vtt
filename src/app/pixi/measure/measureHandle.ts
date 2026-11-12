import type { FederatedPointerEvent } from 'pixi.js';
import type { KeptMeasure, MeasureShapeKind } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import { lightColorNumber, readableTint } from '../lighting/lightMarker';
import type { CanvasBadgeTheme } from '../utils/canvasBadgeColors';
import { mapMarkerScale } from '../utils/mapMarkerScale';

/** Screen pixels at marker scale 1. A measurement's handle is smaller than a light's badge (14) and a note pin's (20). */
export const MEASURE_HANDLE_RADIUS = 10;
export const MEASURE_HANDLE_GLYPH_SIZE = 12;
/** A little wider than the badge, so its edge is easy to press. */
export const MEASURE_HANDLE_HIT_RADIUS = 12;

const HOVER_LIFT = 1.12;
const DRAG_LIFT = 1.2;

/**
 * What of a kept measurement takes the pointer. Its origin moves the whole of it; an area's far
 * end, which resizes and turns it, joins here.
 */
export type MeasureHandlePart = 'origin';

/** A handle on the map: which measurement's, and which of its parts. */
export interface MeasureHandleRef {
  readonly id: string;
  readonly part: MeasureHandlePart;
}

/** What the token renderer's viewport dispatch asks about the handles of kept measurements, with any tool. */
export interface MeasurePointerHandlers {
  /** A left press at a world point; true when a handle took it. */
  pointerDown(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /** The cursor over a handle, null over none. */
  cursorAt(worldX: number, worldY: number): string | null;
  /** The pointer left the canvas. */
  leave(): void;
}

/** Where the handle of `measure` stands, in world pixels: at its origin, its first point. */
export function measureHandlePoint(measure: Pick<KeptMeasure, 'points'>): Point {
  return measure.points[0] ?? { x: 0, y: 0 };
}

export interface MeasureHandleState {
  hovered: boolean;
  /** Its popover is open. */
  selected: boolean;
  dragging: boolean;
}

/** How one handle is drawn. */
export interface MeasureHandleLook {
  /** The glyph: the measurement's shape. */
  shape: MeasureShapeKind;
  /** The badge's ink. */
  glyphTint: number;
  /** The measurement's colour, the theme's accent where it names none. */
  ringColor: number;
  /** The ring around the handle whose popover is open. */
  accent: number | null;
  /** Scale on top of the handle's size on screen. */
  lift: number;
}

/** The look of a kept measurement's handle: its shape's glyph on the theme's badge, and a thin ring in its colour. */
export function measureHandleLook(measure: Pick<KeptMeasure, 'shape' | 'color'>, state: MeasureHandleState, theme: CanvasBadgeTheme): MeasureHandleLook {
  const color = measure.color === undefined ? theme.accent : lightColorNumber(measure.color);
  let lift = 1;
  if (state.dragging) lift = DRAG_LIFT;
  else if (state.hovered) lift = HOVER_LIFT;
  return {
    shape: measure.shape,
    glyphTint: theme.stroke,
    ringColor: readableTint(color, theme.background),
    accent: state.selected ? theme.accent : null,
    lift,
  };
}

export function sameHandleLook(a: MeasureHandleLook, b: MeasureHandleLook): boolean {
  return a.shape === b.shape && a.glyphTint === b.glyphTint && a.ringColor === b.ringColor && a.accent === b.accent;
}

/** World radius within which a press at viewport `zoom` hits a handle. */
export function measureHandleHitRadius(zoom: number): number {
  return MEASURE_HANDLE_HIT_RADIUS * mapMarkerScale(zoom);
}

/**
 * The handle at the world `point` at viewport `zoom`: the nearest one within reach, and of handles
 * as near as each other the one of the later measurement, which lies on top. Only handles are
 * hit: a measurement's line, area and label take no pointer.
 */
export function measureHandleAt(measures: readonly KeptMeasure[], point: Point, zoom: number): MeasureHandleRef | null {
  let nearest: MeasureHandleRef | null = null;
  let best = measureHandleHitRadius(zoom);
  for (const measure of measures) {
    const at = measureHandlePoint(measure);
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= best) {
      best = distance;
      nearest = { id: measure.id, part: 'origin' };
    }
  }
  return nearest;
}
