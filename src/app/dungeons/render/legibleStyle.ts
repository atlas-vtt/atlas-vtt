import { REFERENCE_CELL_PX, type DungeonStyle } from '../style';

/**
 * Pixels per cell (on a 1400 × 1000 picture) below which a drawn map keeps its surroundings and
 * strokes from shrinking with it: a large dungeon fitted into the preview would otherwise wear its
 * walls as hairlines and its rock as a thin rim.
 */
const LEGIBLE_CELL_PX = 24;
/** The least width a wall's ink is drawn with, in pixels of such a picture, so walls always read. */
const LEAST_WALL_PX = 1.4;

/**
 * The style a map is drawn in at `cellPx` pixels per cell: below the legible size the surroundings
 * grow by (legible / cellPx)^0.5 and the strokes by (legible / cellPx)^0.75, so both shrink more
 * slowly than the map but still with it; at any size the wall's ink stays `LEAST_WALL_PX` wide.
 */
export function legibleStyle(style: DungeonStyle, cellPx: number): DungeonStyle {
  if (!(cellPx > 0)) return style;
  const leastWall = (LEAST_WALL_PX * REFERENCE_CELL_PX) / cellPx;
  if (cellPx >= LEGIBLE_CELL_PX) return style.strokes.thick >= leastWall ? style : { ...style, strokes: { ...style.strokes, thick: leastWall } };
  const ratio = LEGIBLE_CELL_PX / cellPx;
  const grow = Math.min(1.6, Math.sqrt(ratio));
  const thicken = ratio ** 0.75;
  const { strokes, surround } = style;
  return {
    ...style,
    strokes: { thin: strokes.thin * thicken, normal: strokes.normal * thicken, thick: Math.max(strokes.thick * thicken, leastWall) },
    surround: { ...surround, reach: surround.reach * grow, size: surround.size * grow, stroke: surround.stroke * thicken },
  };
}
