/**
 * The rules of a game system that shape a measured area. They are the collection's; whoever works
 * an area out is handed them.
 */

/** When an area covers a cell: at least half of the cell lies in it, the cell's centre does, or any part of the cell does. */
export type AreaCellRule = 'half' | 'centre' | 'any';

export const AREA_CELL_RULES: readonly AreaCellRule[] = ['half', 'centre', 'any'];

export const DEFAULT_AREA_CELL_RULE: AreaCellRule = 'half';

/**
 * How a cone ends: `round` on the arc as far from its apex as it is long, `flat` on a straight
 * side across the drag at the drag's length (a triangle).
 */
export type ConeEnd = 'flat' | 'round';

export const CONE_ENDS: readonly ConeEnd[] = ['flat', 'round'];

/** A cone was always drawn with a round end. */
export const DEFAULT_CONE_END: ConeEnd = 'round';
