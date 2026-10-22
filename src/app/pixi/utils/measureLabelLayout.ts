/**
 * Where a measurement's distance label stands and how large it is, as pure geometry. The label is
 * token UI: laid out in UI units at the scale a selected token's nameplate has, while the path it
 * stands beside is drawn in screen pixels.
 */

import type { Point } from '../../grid/hexGeometry';
import {
  NAMEPLATE_HEIGHT, NAMEPLATE_TEXT, SELECTED_TOKEN_UI_SCREEN_SCALE, restingTokenUIScale, selectedTokenUIScale, tokenTextResolution,
} from '../token-renderer/tokenSizing';
import { CANVAS_INK } from './canvasInk';

/** The radius of the dots marking a measurement's points, in screen pixels; a label keeps clear of them. */
export const MEASURE_DOT = 4;

/** The label's look in UI units: the nameplate's height and padding, and as much map between it and the line. */
export const LABEL_LOOK = {
  height: NAMEPLATE_HEIGHT,
  padding: NAMEPLATE_TEXT.padding,
  gap: NAMEPLATE_TEXT.padding,
  /** The pill's rim, as thick as the nameplate's border. */
  border: 0.5,
} as const;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A circle the label must not cover, in the same units as the path it is placed by. */
export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Where a label goes: beside a path (clear of its line and dots, and of `avoid`, in world units), or
 * centred over a point (inside a measured area, where no line runs).
 */
export type LabelTarget =
  | { readonly beside: readonly Point[]; readonly avoid?: Circle | null }
  | { readonly over: Point };

/**
 * World units per UI unit of the label: a selected token's UI (`selectedTokenUIScale`), so it rests at
 * the nameplate's size on the map, grows with the map zoomed in and never shrinks below the size a
 * selected nameplate keeps on screen.
 */
export function labelScale(gridSize: number, zoom: number): number {
  const size = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 70;
  return selectedTokenUIScale(restingTokenUIScale(size), zoom);
}

/**
 * The text's resolution: the token UI's (`tokenTextResolution`), taken from the label's scale on
 * screen relative to the size a selected nameplate keeps there, and from a screen denser than two
 * pixels to the point. Whole steps, so zooming re-rasterises the text only now and then.
 */
export function labelTextResolution(uiScale: number, zoom: number, deviceRatio: number): number {
  const onScreen = (uiScale * zoom) / SELECTED_TOKEN_UI_SCREEN_SCALE;
  return Math.ceil(tokenTextResolution(onScreen * Math.max(1, deviceRatio / 2)));
}

/** The pill around a text of `text`'s size, in UI units: the nameplate's height, `padding` beside the text, ends fully rounded. */
export function pillSize(text: Size): Size & { readonly radius: number } {
  const height = Math.max(LABEL_LOOK.height, text.height + 2 * LABEL_LOOK.border);
  const width = Math.max(height, text.width + 2 * LABEL_LOOK.padding);
  return { width, height, radius: height / 2 };
}

/** The point halfway along a path's length, and the direction of the segment it lies on (null without length). */
export function pathMiddle(points: readonly Point[]): { readonly point: Point; readonly direction: Point | null } | null {
  const first = points[0];
  if (!first) return null;
  const lengths = points.slice(1).map((end, i) => Math.hypot(end.x - points[i]!.x, end.y - points[i]!.y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (const [i, length] of lengths.entries()) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return {
        point: { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t },
        direction: { x: (end.x - start.x) / length, y: (end.y - start.y) / length },
      };
    }
    remaining -= length;
  }
  return { point: first, direction: null };
}

/** How far a box of `size` reaches from its middle along the unit vector `n`. */
function reach(size: Size, n: Point): number {
  return (Math.abs(n.x) * size.width + Math.abs(n.y) * size.height) / 2;
}

/** The distance from a circle's centre to the nearest point of a box of `size` centred on `center`. */
function distanceToBox(circle: Circle, center: Point, size: Size): number {
  const dx = Math.max(Math.abs(circle.x - center.x) - size.width / 2, 0);
  const dy = Math.max(Math.abs(circle.y - center.y) - size.height / 2, 0);
  return Math.hypot(dx, dy);
}

/**
 * Where a label of `size` stands beside `path` (screen pixels): at the path's middle, moved off the
 * line along its normal (the upper side, or the right of an upright line) until `gap` lies between it
 * and the line's dots and, if given, `avoid` (the token a drag ruler measures). A path without length
 * takes the label above its point.
 */
export function placeLabel(path: readonly Point[], size: Size, gap: number, avoid: Circle | null = null): Point | null {
  const middle = pathMiddle(path);
  if (!middle) return null;
  const along = middle.direction ?? { x: 1, y: 0 };
  let normal = { x: along.y, y: -along.x };
  if (normal.y > 1e-9 || (Math.abs(normal.y) <= 1e-9 && normal.x < 0)) normal = { x: -normal.x, y: -normal.y };
  let distance = reach(size, normal) + MEASURE_DOT + CANVAS_INK.keyline + gap;
  const at = (offset: number): Point => ({ x: middle.point.x + normal.x * offset, y: middle.point.y + normal.y * offset });
  if (avoid) {
    // The token lies along the line, so stepping away from the line always clears it.
    const limit = distance + 2 * (avoid.radius + gap) + size.width + size.height;
    while (distance < limit && distanceToBox(avoid, at(distance), size) < avoid.radius + gap) distance += 1;
  }
  return at(distance);
}

/** Where a label of `size` (screen pixels) stands for `target`, in screen pixels at `zoom`, `gap` (screen pixels) from what it keeps clear of. */
export function labelCenter(target: LabelTarget, size: Size, zoom: number, gap: number): Point | null {
  const screen = ({ x, y }: Point): Point => ({ x: x * zoom, y: y * zoom });
  if ('over' in target) return screen(target.over);
  const avoid = target.avoid ? { ...screen(target.avoid), radius: target.avoid.radius * zoom } : null;
  return placeLabel(target.beside.map(screen), size, gap, avoid);
}
