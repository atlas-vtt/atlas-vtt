/**
 * A text's width under its side handles: how wide a drag of one leaves the box its words wrap
 * in, and where the text then stands. The side that is not dragged stays where it is, and so
 * does the top: lines that are added stand under those before them.
 */

import type { Point } from '../types/visionTypes';

interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/** What of a text says how its box lies. */
interface Stance {
  /** Degrees. */
  readonly rotation: number;
  readonly scale: number;
}

function axes(rotation: number): { cos: number; sin: number } {
  const angle = (rotation * Math.PI) / 180;
  return { cos: rotation ? Math.cos(angle) : 1, sin: rotation ? Math.sin(angle) : 0 };
}

/**
 * The width a text's words wrap at once its `side` handle (-1 the left, 1 the right) was dragged
 * by `drag` (world pixels) from where its words' box was `width` wide: in the text's own units,
 * and no narrower than `least` (a letter's height: every line holds a letter at least).
 */
export function draggedWidth(text: Stance, width: number, side: -1 | 1, drag: Point, least: number): number {
  const { cos, sin } = axes(text.rotation);
  const along = drag.x * cos + drag.y * sin;
  return Math.max(least, width + (side * along) / text.scale);
}

/**
 * The place of a text at `centre` whose words' box was `before` and is `after` once its `side`
 * handle changed its width: the other side and the top of the box stay where they were.
 */
export function placeBesideSide(centre: Point, text: Stance, before: BoxSize, after: BoxSize, side: -1 | 1): Point {
  const { cos, sin } = axes(text.rotation);
  const x = (side * (after.width - before.width) * text.scale) / 2;
  const y = ((after.height - before.height) * text.scale) / 2;
  return { x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos };
}
