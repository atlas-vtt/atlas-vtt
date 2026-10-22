/**
 * Where the selection highlight lies, as pure geometry. Shapes come in world units and the
 * highlight is laid out in screen pixels, so its line, its gap and its corners keep their size
 * at every zoom: `zoom` is screen pixels per world unit.
 */

import { CANVAS_INK } from '../utils/canvasInk';

/** The look of a selection, in screen pixels. */
export const SELECTION_LOOK = {
  /** Map left showing between what is selected and its highlight. */
  gap: 4,
  /** The accent line and the dark line on either side of it: the ink of every mark Atlas draws on the map. */
  stroke: CANVAS_INK.stroke,
  keyline: CANVAS_INK.keyline,
  /** The corner of a highlight around something without corners of its own (a drawing), at the accent's middle. */
  frameRadius: 6,
  /** Room between the highlights and the frame around a selection of two or more. */
  groupGap: 6,
  /** The group frame's line. */
  groupStroke: 1,
  /** The group frame's corner, at its line's middle. */
  groupRadius: 12,
  /** Room left between a highlight and a handle standing on it. */
  handleClearance: 1,
  /** A highlight lands on what was selected from this much larger. */
  appearFrom: 1.06,
} as const;

/** What a highlight follows, centred on the selected thing's place, in world units. */
export type SelectionOutline =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly width: number; readonly height: number; readonly rotation: number; readonly cornerRadius: number };

/** A highlight's accent line in screen pixels: the path its middle follows, centred on its thing. */
export type HighlightPath =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly width: number; readonly height: number; readonly rotation: number; readonly radius: number };

/** An axis-aligned rectangle. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rounded rectangle, in screen pixels: the path of a line's middle. */
export interface RoundedBox extends Box {
  readonly radius: number;
}

/** What a token shows of itself to its highlight. */
export interface TokenShape {
  /** The art's diameter (the sprite's content), in world units. */
  readonly tokenSize: number;
  /** Outer diameter of its ring, or null for a token shown without one. */
  readonly ringDiameter: number | null;
  /** The art as drawn, for a token without a ring: its size and turn. */
  readonly art: { readonly width: number; readonly height: number; readonly rotation: number };
}

/** A token's outline: the circle of its ring, or the box of its art where it shows none. */
export function tokenOutline(shape: TokenShape): SelectionOutline {
  if (shape.ringDiameter !== null) return { kind: 'circle', radius: shape.ringDiameter / 2 };
  const { width, height, rotation } = shape.art;
  return { kind: 'rect', width, height, rotation, cornerRadius: 0 };
}

/** The outline of a box (a drawing, a fog area), centred on the box's middle. */
export function boxOutline(box: Box): SelectionOutline {
  return { kind: 'rect', width: box.width, height: box.height, rotation: 0, cornerRadius: 0 };
}

/** How far the accent's middle stands outside the outline, in screen pixels. */
const ACCENT_OFFSET = SELECTION_LOOK.gap + SELECTION_LOOK.stroke / 2;

/**
 * The accent's path around `outline` at `zoom`: an even gap outside it on every side, with corners
 * concentric to the outline's (a box with square corners gets `frameRadius`).
 */
export function highlightPath(outline: SelectionOutline, zoom: number): HighlightPath {
  if (outline.kind === 'circle') return { kind: 'circle', radius: outline.radius * zoom + ACCENT_OFFSET };
  const corner = outline.cornerRadius * zoom;
  return {
    kind: 'rect',
    width: outline.width * zoom + 2 * ACCENT_OFFSET,
    height: outline.height * zoom + 2 * ACCENT_OFFSET,
    rotation: outline.rotation,
    radius: corner > 0 ? corner + ACCENT_OFFSET : SELECTION_LOOK.frameRadius,
  };
}

/** `path` grown outward by `by` screen pixels, its corners staying concentric. */
export function grownPath(path: HighlightPath, by: number): HighlightPath {
  if (path.kind === 'circle') return { kind: 'circle', radius: path.radius + by };
  return { ...path, width: path.width + 2 * by, height: path.height + 2 * by, radius: Math.max(0, path.radius + by) };
}

/** How far the highlight's outer edge (the accent and its dark line) stands from its middle, in screen pixels. */
export const HIGHLIGHT_EDGE = SELECTION_LOOK.stroke / 2 + SELECTION_LOOK.keyline;

/** The screen box a highlight covers, centred on `centre` (in screen pixels). */
export function highlightBox(path: HighlightPath, centre: { x: number; y: number }): Box {
  const outer = grownPath(path, HIGHLIGHT_EDGE);
  let halfWidth: number;
  let halfHeight: number;
  if (outer.kind === 'circle') {
    halfWidth = halfHeight = outer.radius;
  } else {
    const cos = Math.abs(Math.cos(outer.rotation));
    const sin = Math.abs(Math.sin(outer.rotation));
    halfWidth = (outer.width * cos + outer.height * sin) / 2;
    halfHeight = (outer.width * sin + outer.height * cos) / 2;
  }
  return { x: centre.x - halfWidth, y: centre.y - halfHeight, width: 2 * halfWidth, height: 2 * halfHeight };
}

/** The smallest box holding every one of `boxes`; null for none. */
export function unionBox(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The quiet frame around a selection of two or more (`boxes`, one per selected thing, in screen
 * pixels): `groupGap` outside all of them on every side. A single thing has its highlight alone.
 */
export function groupFrame(boxes: readonly Box[]): RoundedBox | null {
  if (boxes.length < 2) return null;
  const union = unionBox(boxes);
  if (!union) return null;
  const pad = SELECTION_LOOK.groupGap + SELECTION_LOOK.groupStroke / 2;
  return { x: union.x - pad, y: union.y - pad, width: union.width + 2 * pad, height: union.height + 2 * pad, radius: SELECTION_LOOK.groupRadius };
}

/**
 * Whether `point` lies inside `box` or on its line, rounded corners included: what a press inside the
 * group frame takes hold of.
 */
export function roundedBoxContains(box: RoundedBox, point: { x: number; y: number }, line = 0): boolean {
  const half = line / 2;
  const left = box.x - half;
  const top = box.y - half;
  const right = box.x + box.width + half;
  const bottom = box.y + box.height + half;
  if (point.x < left || point.x > right || point.y < top || point.y > bottom) return false;
  const radius = Math.min(box.radius + half, (right - left) / 2, (bottom - top) / 2);
  const cx = Math.min(Math.max(point.x, left + radius), right - radius);
  const cy = Math.min(Math.max(point.y, top + radius), bottom - radius);
  return Math.hypot(point.x - cx, point.y - cy) <= radius;
}

/** A point in screen pixels, relative to a highlight's middle. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A round thing standing on a highlight (a token's handle), which the highlight passes behind. */
export interface Notch extends Point {
  readonly radius: number;
}

/** How far a polyline may stray from the true curve, in screen pixels: far below what an eye or a pixel tells. */
const CURVE_TOLERANCE = 0.05;

/** Pieces enough that a curve of `radius` strays no more than `CURVE_TOLERANCE` from its chords, over `angle`. */
function arcSteps(radius: number, angle: number): number {
  if (!(radius > CURVE_TOLERANCE)) return 1;
  const step = 2 * Math.acos(1 - CURVE_TOLERANCE / radius);
  return Math.max(2, Math.ceil(angle / step));
}

function arcInto(points: Point[], cx: number, cy: number, radius: number, from: number, to: number): void {
  const steps = arcSteps(radius, Math.abs(to - from));
  for (let i = 0; i < steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
}

/** `path` as a closed polyline (the last point joins the first), turned by its rotation. */
export function outlinePoints(path: HighlightPath): Point[] {
  const points: Point[] = [];
  if (path.kind === 'circle') {
    arcInto(points, 0, 0, path.radius, 0, 2 * Math.PI);
    return points;
  }
  const halfWidth = path.width / 2;
  const halfHeight = path.height / 2;
  const radius = Math.min(path.radius, halfWidth, halfHeight);
  const right = halfWidth - radius;
  const bottom = halfHeight - radius;
  arcInto(points, right, bottom, radius, 0, Math.PI / 2);
  arcInto(points, -right, bottom, radius, Math.PI / 2, Math.PI);
  arcInto(points, -right, -bottom, radius, Math.PI, 1.5 * Math.PI);
  arcInto(points, right, -bottom, radius, 1.5 * Math.PI, 2 * Math.PI);
  if (path.rotation === 0) return points;
  const cos = Math.cos(path.rotation);
  const sin = Math.sin(path.rotation);
  return points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
}

/** The part of the segment `p`–`q` (as 0 to 1 along it) inside `notch`, or null. */
function insideNotch(p: Point, q: Point, notch: Notch): [number, number] | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const fx = p.x - notch.x;
  const fy = p.y - notch.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - notch.radius * notch.radius;
  const discriminant = b * b - 4 * a * c;
  if (a === 0 || discriminant <= 0) return null;
  const root = Math.sqrt(discriminant);
  const from = Math.max(0, (-b - root) / (2 * a));
  const to = Math.min(1, (-b + root) / (2 * a));
  return from < to ? [from, to] : null;
}

/** The parts of the segment (as 0 to 1 along it) outside every notch. */
function outsideNotches(p: Point, q: Point, notches: readonly Notch[]): Array<[number, number]> {
  const inside = notches
    .map((notch) => insideNotch(p, q, notch))
    .filter((part): part is [number, number] => part !== null)
    .sort((a, b) => a[0] - b[0]);
  const outside: Array<[number, number]> = [];
  let at = 0;
  for (const [from, to] of inside) {
    if (from > at) outside.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < 1) outside.push([at, 1]);
  return outside;
}

function along(p: Point, q: Point, t: number): Point {
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

/**
 * The closed polyline `points` with what lies inside `notches` taken out, as open runs; null when
 * no notch touches it, so it stays one closed line.
 */
export function openRuns(points: readonly Point[], notches: readonly Notch[]): Point[][] | null {
  const count = points.length;
  const segment = (i: number): [Point, Point] => [points[i % count]!, points[(i + 1) % count]!];
  const cut = (i: number): boolean => {
    const [p, q] = segment(i);
    const outside = outsideNotches(p, q, notches);
    return outside.length !== 1 || outside[0]![0] !== 0 || outside[0]![1] !== 1;
  };
  let start = -1;
  for (let i = 0; i < count && start < 0; i++) if (cut(i)) start = i;
  if (start < 0) return null;
  const runs: Point[][] = [];
  let run: Point[] = [];
  let firstJoinsLast = false;
  for (let k = 0; k < count; k++) {
    const [p, q] = segment(start + k);
    for (const [from, to] of outsideNotches(p, q, notches)) {
      if (from > 0 || run.length === 0) {
        if (run.length > 1) runs.push(run);
        if (k === 0 && from === 0 && runs.length === 0) firstJoinsLast = true;
        run = [along(p, q, from)];
      }
      run.push(along(p, q, to));
      if (to < 1) {
        runs.push(run);
        run = [];
      }
    }
  }
  if (run.length > 1) {
    if (firstJoinsLast && runs.length > 0) runs[0] = [...run, ...runs[0]!.slice(1)];
    else runs.push(run);
  }
  return runs.filter((part) => part.length > 1);
}
