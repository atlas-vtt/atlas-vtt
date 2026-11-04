import type { NotePin } from '../types';
import type { GridState } from '../types/gridTypes';
import { axialToPixel, createHexLayout, isHexGridType, pixelToAxial } from './hexGeometry';
import type { AxialCoord, HexLayout, Point } from './hexGeometry';

/** The hex layout of a map's grid, or null when the map has no hex grid. */
export function hexLayoutOfGrid(grid: Pick<GridState, 'type' | 'size' | 'offsetX' | 'offsetY'> | null | undefined): HexLayout | null {
  if (!grid || !isHexGridType(grid.type) || !(grid.size > 0)) return null;
  return createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0);
}

/** True when `pin` shows as a linked hex, which needs a hex grid; elsewhere it shows as a pin. */
export function isShownAsHex(pin: NotePin, layout: HexLayout | null): boolean {
  return pin.hex === true && layout !== null;
}

/**
 * The hex a linked pin belongs to: the one containing its stored point, so the
 * link stays on the same part of the map when the grid is realigned.
 */
export function linkedHexOf(pin: NotePin, layout: HexLayout): AxialCoord {
  return pixelToAxial(layout, pin);
}

/** Where a pin's badge sits: a linked pin in the centre of its hex, any other pin at its point. */
export function pinDisplayPoint(pin: NotePin, layout: HexLayout | null): Point {
  return layout && isShownAsHex(pin, layout) ? axialToPixel(layout, linkedHexOf(pin, layout)) : { x: pin.x, y: pin.y };
}

/** The linked pin whose hex contains `point`, or null. */
export function hexLinkAt(pins: Record<string, NotePin>, layout: HexLayout, point: Point): NotePin | null {
  const target = pixelToAxial(layout, point);
  for (const pin of Object.values(pins)) {
    if (pin.hex !== true) continue;
    const hex = linkedHexOf(pin, layout);
    if (hex.q === target.q && hex.r === target.r) return pin;
  }
  return null;
}
