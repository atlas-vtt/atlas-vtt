import { polyPath } from '../../art/paths';
import { fineLines, type GlyphPen } from '../../glyphPen';
import { burningFuel } from './burningFuel';
import { part, sunk, surface } from './parts';
import { HEARTH_STONE, MANTEL, STACK_FIREBOX, STACK_FIREBOX_OUTLINE, STACK_FUEL, partPath } from './shapes';

const FIREBOX_BOX = {
  minX: STACK_FIREBOX.x - STACK_FIREBOX.w / 2,
  minY: STACK_FIREBOX.y - STACK_FIREBOX.h / 2,
  maxX: STACK_FIREBOX.x + STACK_FIREBOX.w / 2,
  maxY: STACK_FIREBOX.y + STACK_FIREBOX.h / 2,
};
const firebox = polyPath(STACK_FIREBOX_OUTLINE);
const depth = (y: number): number => 0.25 + 0.43 * (y - FIREBOX_BOX.minY) / STACK_FIREBOX.h;

/**
 * A house's fireplace seen from above: the hearth stone on the floor, the firebox cut into the
 * chimney stack's face behind it, cold and clear or with a fire burning in it (`lit`), and the
 * mantel shelf across the opening's front.
 */
export function stackFireplace(pen: GlyphPen, painted: boolean, lit = false): void {
  // The hearth stone lies flush with the floor: outlined, with no lit or shaded edges.
  surface(pen, partPath(HEARTH_STONE), 'stone');
  sunk(pen, firebox, STACK_FIREBOX_OUTLINE, FIREBOX_BOX, depth, painted);
  if (lit) burningFuel(pen, STACK_FUEL, firebox);
  part(pen, MANTEL, 'dressed');
  // The shelf's moulded front edge.
  const front = MANTEL.y - MANTEL.h / 2 + 0.035;
  fineLines(pen, [-MANTEL.w / 2 + 0.02, front, MANTEL.w / 2 - 0.02, front]);
}

/** The mantel shelf alone stands up: the hearth stone lies flat and the firebox is in the stack. */
export const stackFireplaceSilhouette = partPath(MANTEL);
