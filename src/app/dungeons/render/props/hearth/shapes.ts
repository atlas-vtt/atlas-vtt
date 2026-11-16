import { rectPoly, type PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import { roundedRect } from '../../glyphPen';
import { INNER_WALL } from '../../houseShapes';

/** All dimensions are local cells, with the room towards −y and the wall at +y. */
export interface Part { x: number; y: number; w: number; h: number }
export const HEARTH: Part = { x: 0, y: 0, w: 1.8, h: 0.82 };
/** Where a fire burns once lit: a flame overlay fits inside this clear recess, above the cold ash and fuel. */
export const HEARTH_FIREBOX: Part = { x: 0, y: 0.005, w: 1.12, h: 0.43 };

/**
 * A house's fireplace (`inHouse`): its two cells stand before a chimney stack, whose face lies half
 * an inner wall before the cells' back edge. The firebox is cut into the stack's face, its cheeks
 * splayed towards the fire-back; a later fire burns inside `STACK_FIREBOX`, the box round it.
 */
export const STACK_FACE = 0.5 - INNER_WALL / 2;
export const STACK_FIREBOX: Part = { x: 0, y: STACK_FACE + 0.15, w: 0.84, h: 0.3 };
/** The firebox's outline: the opening on the stack's face, the fire-back narrower behind it. */
export const STACK_FIREBOX_OUTLINE: readonly Vec[] = [
  { x: -0.42, y: STACK_FACE }, { x: 0.42, y: STACK_FACE },
  { x: 0.27, y: STACK_FACE + 0.3 }, { x: -0.27, y: STACK_FACE + 0.3 },
];
/** Where a lit fire's logs lie in a house's firebox: clear of its splayed cheeks, the fire-back behind them. */
export const STACK_FUEL: Part = { x: 0, y: STACK_FIREBOX.y + 0.01, w: 0.5, h: 0.22 };
/** The mantel shelf across the opening's front, standing out from the face over the hearth stone. */
export const MANTEL: Part = { x: 0, y: STACK_FACE - 0.055, w: 1.36, h: 0.13 };
/** The hearth stone on the floor before the opening. */
export const HEARTH_STONE: Part = { x: 0, y: STACK_FACE - 0.21, w: 1.16, h: 0.42 };

export function partPath(b: Part): PathFn {
  return path => roundedRect(path, b.x, b.y, b.w, b.h, 0.025);
}
export function partPoly(b: Part): Vec[] {
  return rectPoly({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
}
