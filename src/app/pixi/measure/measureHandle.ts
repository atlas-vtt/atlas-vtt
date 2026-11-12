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
/** The handle at an area's far end: a plain dot, smaller than the badge at its origin. */
export const MEASURE_END_HANDLE_RADIUS = 6;
export const MEASURE_END_HANDLE_HIT_RADIUS = 9;

const HOVER_LIFT = 1.12;
const DRAG_LIFT = 1.2;

/**
 * What of a kept measurement takes the pointer. Its origin moves the whole of it; an area's far
 * end resizes and turns it.
 */
export type MeasureHandlePart = 'origin' | 'end';

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

/** Where the handle at an area's far end stands; null for a ruler, which has none. */
export function measureEndHandlePoint(measure: Pick<KeptMeasure, 'shape' | 'points'>): Point | null {
  return measure.shape === 'ruler' ? null : measure.points[1] ?? null;
}

/** Where a kept measurement's handles stand, in world pixels. */
export interface MeasureHandlePlace {
  readonly origin: Point;
  /** The handle at an area's far end; null for a ruler. */
  readonly end: Point | null;
}

/**
 * Says where the handles of a kept measurement stand; null for one that has none now. An aura's
 * stand around its token, wherever that is, and it has none while its token is not on the map shown.
 */
export type MeasureHandlePlacer = (measure: KeptMeasure) => MeasureHandlePlace | null;

/** Where the handles of a measurement stand that lies where its points say: at its origin and, an area's second, at its far end. */
export const handlesAtPoints: MeasureHandlePlacer = (measure) => ({ origin: measureHandlePoint(measure), end: measureEndHandlePoint(measure) });

export interface MeasureHandleState {
  /** The part of it the pointer is over; null over none. */
  hovered: MeasureHandlePart | null;
  /** Its popover is open. */
  selected: boolean;
  /** The part of it being dragged; null while none is. */
  dragging: MeasureHandlePart | null;
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
  /** The same for the handle at an area's far end. */
  endLift: number;
}

const liftOf = (state: MeasureHandleState, part: MeasureHandlePart): number => {
  if (state.dragging === part) return DRAG_LIFT;
  return state.hovered === part ? HOVER_LIFT : 1;
};

/** The look of a kept measurement's handle: its shape's glyph on the theme's badge, and a thin ring in its colour. */
export function measureHandleLook(measure: Pick<KeptMeasure, 'shape' | 'color'>, state: MeasureHandleState, theme: CanvasBadgeTheme): MeasureHandleLook {
  const color = measure.color === undefined ? theme.accent : lightColorNumber(measure.color);
  return {
    shape: measure.shape,
    glyphTint: theme.stroke,
    ringColor: readableTint(color, theme.background),
    accent: state.selected ? theme.accent : null,
    lift: liftOf(state, 'origin'),
    endLift: liftOf(state, 'end'),
  };
}

export function sameHandleLook(a: MeasureHandleLook, b: MeasureHandleLook): boolean {
  return a.shape === b.shape && a.glyphTint === b.glyphTint && a.ringColor === b.ringColor && a.accent === b.accent;
}

/**
 * The handle at the world `point` at viewport `zoom`: the nearest one within its reach, and of
 * handles as near as each other the one of the later measurement, which lies on top. Only handles
 * are hit: a measurement's line, area and label take no pointer. `place` says where each
 * measurement's handles stand.
 */
export function measureHandleAt(measures: readonly KeptMeasure[], point: Point, zoom: number, place: MeasureHandlePlacer = handlesAtPoints): MeasureHandleRef | null {
  const scale = mapMarkerScale(zoom);
  let nearest: MeasureHandleRef | null = null;
  let best = Infinity;
  const take = (id: string, part: MeasureHandlePart, at: Point | null, reach: number): void => {
    if (!at) return;
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= reach * scale && distance <= best) {
      best = distance;
      nearest = { id, part };
    }
  };
  for (const measure of measures) {
    const at = place(measure);
    if (!at) continue;
    take(measure.id, 'origin', at.origin, MEASURE_HANDLE_HIT_RADIUS);
    take(measure.id, 'end', at.end, MEASURE_END_HANDLE_HIT_RADIUS);
  }
  return nearest;
}
