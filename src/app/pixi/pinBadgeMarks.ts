import { Graphics } from 'pixi.js';
import type { CanvasBadgeColors } from './utils/canvasBadgeColors';

/** The mark's radius and where its centre sits on the badge's rim, as a share of the badge's radius. */
const MARK_RADIUS = 9;
const RIM = Math.SQRT1_2;

/** A small disc on the badge's upper right in the badge's ink, ringed in its paper colour, to hold a mark's glyph. */
function rimMark(label: string, badgeRadius: number, colors: CanvasBadgeColors): Graphics {
  const mark = new Graphics();
  mark.label = label;
  mark.position.set(badgeRadius * RIM, -badgeRadius * RIM);
  mark.circle(0, 0, MARK_RADIUS).fill({ color: colors.stroke });
  mark.circle(0, 0, MARK_RADIUS).stroke({ width: 1.5, color: colors.background });
  return mark;
}

/**
 * The GM's sign that players may read a pin's note: an open book in the badge's paper colour on
 * the rim mark, so it reads on either theme.
 */
export function createReadableMark(badgeRadius: number, colors: CanvasBadgeColors): Graphics {
  const mark = rimMark('pin-readable-mark', badgeRadius, colors);
  // Two pages meeting at the spine, each a little higher at its outer edge.
  mark.poly([-0.7, -2.8, -5.6, -4.2, -5.6, 3.4, -0.7, 4.6]).fill({ color: colors.background });
  mark.poly([0.7, -2.8, 5.6, -4.2, 5.6, 3.4, 0.7, 4.6]).fill({ color: colors.background });
  return mark;
}

/**
 * The sign that a click on the pin rolls an encounter: a twenty-sided die seen face on, its
 * outline in the paper colour and its front face in ink, on the rim mark.
 */
export function createRollMark(badgeRadius: number, colors: CanvasBadgeColors): Graphics {
  const mark = rimMark('pin-roll-mark', badgeRadius, colors);
  const hexagon = Array.from({ length: 6 }, (_, corner) => {
    const angle = (Math.PI / 3) * corner - Math.PI / 2;
    return [Math.cos(angle) * 5.8, Math.sin(angle) * 5.8];
  }).flat();
  mark.poly(hexagon).fill({ color: colors.background });
  mark.poly([0, -3.1, 2.8, 1.9, -2.8, 1.9]).fill({ color: colors.stroke });
  return mark;
}
