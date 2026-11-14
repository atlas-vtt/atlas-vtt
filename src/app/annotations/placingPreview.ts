/**
 * What the Draw tool shows under the pointer before a press: the thing the press will make, in the
 * tool's look, where it will land. A stamp shows itself; the pen, a line, a rectangle and an
 * ellipse show a dot as wide as their line, where the line will start; the Cells mode shows the
 * cell it will fill or clear. The eraser has its ring, the Text mode its cursor, and Select makes
 * nothing. Pure: whoever draws the mark, and whoever hides the cursor for it, reads it here.
 */

import type { GridGeometry } from '../grid/gridDistance';
import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import type { DrawingInput, DrawMode, DrawToolChoices } from './annotationTypes';
import { addedParts, cellsShape, shapeWithin } from './cellFill';
import type { CellGrid } from './cellGrid';
import { stampSize, strokeWidth } from './drawSizes';
import { snapDrawPoint, snapStampPoint } from './drawSnap';
import { madeStamp, SEE_THROUGH } from './madeDrawing';
import type { FilledPart } from './quantized';
import { contrastOf } from './textLook';

export const PLACING_LOOK = {
  /** How much of a stamp shows that is not placed yet. */
  stampAlpha: 0.6,
  /** The least a dot is across, screen pixels: a thin pen far out still has a mark to aim with. */
  minDot: 4,
  /** The ring around a dot, screen pixels wide, in the tone that stands out from the dot's colour. */
  ring: 1.5,
  ringAlpha: 0.9,
} as const;

/** The stamp a press will place: the drawing itself, shown see-through. */
export interface StampMark {
  readonly kind: 'stamp';
  readonly stamp: DrawingInput;
  readonly alpha: number;
}

/** Where a line will start, as wide as the line. Lengths are world pixels. */
export interface DotMark {
  readonly kind: 'dot';
  readonly at: Point;
  readonly radius: number;
  /** '#rrggbb'. */
  readonly color: string;
  readonly alpha: number;
  /** Drawn around the dot, outside it: light around a dark colour, dark around a light one. */
  readonly ring: { readonly color: string; readonly width: number; readonly alpha: number };
}

/** The cell a press of the Cells mode will fill, or clear. */
export interface CellMark {
  readonly kind: 'cell';
  /** The cell, as its lattice calls it. */
  readonly key: string;
  /** Its area: up to the map's edge where it will be filled, all of it where it will be cleared. */
  readonly parts: readonly FilledPart[];
  /** '#rrggbb' of the fill. */
  readonly color: string;
  readonly unfill: boolean;
}

export type PlacingMark = StampMark | DotMark | CellMark;

/** What says which mark shows, and where. */
export interface PlacingAt {
  /** The mode the tool works in; null while it does not (another tool is in hand, the canvas shows the players' picture). */
  readonly mode: DrawMode | null;
  readonly tool: DrawToolChoices;
  /** The side of a cell the tool's sizes are shares of (`drawCell`). */
  readonly cell: number;
  /** The grid points snap to; null without one, or while its Snap is off. */
  readonly snapGrid: GridGeometry | null;
  /** The cells the Cells mode fills; null where it has none to fill. */
  readonly cells: CellGrid | null;
  /** The map, at whose edge a filled cell ends; null without one. */
  readonly bounds: Box | null;
  /** Screen pixels to a world pixel. */
  readonly zoom: number;
  /** Where the pointer is, world pixels. */
  readonly pointer: Point;
  /** Alt is held: nothing snaps. */
  readonly free: boolean;
}

const within = (inner: Box, outer: Box): boolean => inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY;

function boxOf(outline: readonly Point[]): Box {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of outline) {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}

function dot(at: Point, width: number, tool: DrawToolChoices, seeThrough: boolean, zoom: number): DotMark {
  const scale = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  return {
    kind: 'dot',
    at,
    radius: Math.max(width, PLACING_LOOK.minDot / scale) / 2,
    color: tool.color,
    alpha: seeThrough ? SEE_THROUGH : 1,
    ring: { color: contrastOf(tool.color), width: PLACING_LOOK.ring / scale, alpha: PLACING_LOOK.ringAlpha },
  };
}

/** The cell under the pointer as the Cells mode will leave it; null where a press there changes nothing that shows. */
function cellMark({ cells, pointer, bounds, tool }: PlacingAt): CellMark | null {
  const cell = cells?.cellAt(pointer);
  if (!cell || cell.outline.length < 3) return null;
  const whole: FilledPart[] = [{ outline: [...cell.outline], holes: [] }];
  const mark = { kind: 'cell' as const, key: cell.key, color: tool.color, unfill: tool.cellsUnfill };
  // Cleared, a cell is cleared whole; filled, it ends at the map's edge.
  if (tool.cellsUnfill || !bounds || within(boxOf(cell.outline), bounds)) return { ...mark, parts: whole };
  const parts = addedParts(shapeWithin(cellsShape([cell]), bounds), []).filter(({ outline }) => outline.length >= 3);
  return parts.length > 0 ? { ...mark, parts } : null;
}

/**
 * The mark under the pointer; null where the tool shows none (Select, Text, the eraser, no tool,
 * a cell off the map). A dot is never less than `PLACING_LOOK.minDot` screen pixels across, and
 * its ring keeps its width on screen at every zoom.
 */
export function placingMark(at: PlacingAt): PlacingMark | null {
  const { mode, tool, cell, snapGrid, zoom, pointer, free } = at;
  switch (mode) {
    case 'stamp': {
      const centre = snapStampPoint(snapGrid, pointer, free, stampSize(tool.size, cell));
      return { kind: 'stamp', stamp: madeStamp(centre, tool, cell), alpha: PLACING_LOOK.stampAlpha };
    }
    // The pen never snaps: its line begins where the pointer is.
    case 'pen':
      return dot({ x: pointer.x, y: pointer.y }, strokeWidth(tool.size, cell), tool, tool.seeThrough, zoom);
    case 'line':
      return dot(snapDrawPoint(snapGrid, pointer, free), strokeWidth(tool.size, cell), tool, tool.seeThrough, zoom);
    case 'rectangle':
    case 'ellipse':
      return dot(snapDrawPoint(snapGrid, pointer, free), strokeWidth(tool.size, cell), tool, false, zoom);
    case 'cells':
      return cellMark(at);
    default:
      return null;
  }
}
