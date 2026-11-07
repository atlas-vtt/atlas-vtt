/**
 * How large a house is and how it is built, by the map's size tag (untagged reads as medium): its
 * style of footprint, the widths of its hall, rooms and bands, and how far its grounds reach. In
 * cells of 5 ft, from the research's table of playable sizes (§2.5).
 */

import { type Rng, int, weighted } from '../../rng';
import type { DungeonTag } from '../../tags';

export type HouseSize = 'small' | 'medium' | 'large';

/**
 * A house's plan: a block (one range, Georgian), an L (a service wing behind one end), a U (wings
 * behind both ends, the service wing and a family wing) or an H (wings before and behind both ends).
 * Block, U and H mirror about the axis through the front door.
 */
export type HouseStyle = 'block' | 'L' | 'U' | 'H';

export interface HouseParams {
  size: HouseSize;
  style: HouseStyle;
  /** Depth of the room bands of the main range, behind and before its corridor. */
  back: number;
  front: number;
  hall: number;
  /** The reception rooms west of the hall, as one span. */
  west: number;
  dining: number;
  /** The service side east of the dining room's line, as one span (servery, kitchen, scullery). */
  service: number;
  /** How far wings reach from the main range, and their band of rooms. */
  wingLength: number;
  wingBand: number;
}

export function houseSize(tags: ReadonlySet<DungeonTag>): HouseSize {
  if (tags.has('small')) return 'small';
  if (tags.has('large')) return 'large';
  return 'medium';
}

const STYLES: Record<HouseSize, readonly (readonly [HouseStyle, number])[]> = {
  small: [['block', 3], ['L', 2]],
  medium: [['block', 2], ['L', 2], ['U', 1.5]],
  large: [['L', 1], ['U', 2], ['H', 2]],
};

/** Ranges per size, inclusive. */
const SPANS: Record<HouseSize, { band: [number, number]; hall: [number, number]; west: [number, number]; dining: [number, number]; service: [number, number]; wing: [number, number] }> = {
  small: { band: [4, 4], hall: [5, 5], west: [4, 5], dining: [4, 4], service: [4, 5], wing: [5, 6] },
  medium: { band: [4, 5], hall: [5, 6], west: [5, 9], dining: [4, 5], service: [6, 9], wing: [6, 9] },
  large: { band: [5, 6], hall: [6, 6], west: [8, 12], dining: [5, 6], service: [9, 12], wing: [8, 12] },
};

export function houseParams(rng: Rng, size: HouseSize, floors: number): HouseParams {
  const s = SPANS[size];
  const style = weighted(rng, STYLES[size]);
  const back = int(rng, s.band[0], s.band[1]);
  // The front band holds the main stair against the hall's side wall, its rows free before and behind it.
  const front = Math.max(5, int(rng, s.band[0], s.band[1]));
  const hall = int(rng, s.hall[0], s.hall[1]);
  // A house of several floors (a cellar counts) keeps a stair hall of five cells for its back stair on the service side.
  const service = Math.max(int(rng, s.service[0], s.service[1]), floors > 1 ? 5 + (style === 'block' ? 4 : 0) : 0);
  return {
    size,
    style,
    back,
    front,
    hall,
    west: int(rng, s.west[0], s.west[1]),
    dining: int(rng, s.dining[0], s.dining[1]),
    service,
    wingLength: int(rng, s.wing[0], s.wing[1]),
    wingBand: s.band[0] + (size === 'large' ? 1 : 0),
  };
}
