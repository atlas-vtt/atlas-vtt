/**
 * What a Cavern changes in the layout and how it shapes its rooms: its variant by the tags, how
 * round and how full its chambers grow, and the room and stair sizes a cave can shape (no round
 * rooms or colonnades, every room at least 3 cells across, stairwells 2 across).
 */

import type { CaveVariant } from '../../caveModel';
import { type DungeonParams, SPACIOUS_SIZES } from '../../params';
import type { DungeonTag } from '../../tags';

export interface CaveShaping {
  variant: CaveVariant;
  /** How round chambers grow (`pow(c, gamma)`), drawn from this range per chamber. */
  gamma: readonly [number, number];
  /** How strongly chambers stretch along a fault. */
  stretch: number;
  /** The share of a chamber's rectangle it fills. */
  fill: readonly [number, number];
  /** The chance a side passage is two cells wide. */
  sideWide: number;
}

const SHAPING: Readonly<Record<CaveVariant, Omit<CaveShaping, 'variant' | 'sideWide'>>> = {
  limestone: { gamma: [2, 3], stretch: 1.6, fill: [0.5, 0.75] },
  'lava-tube': { gamma: [4, 4], stretch: 3, fill: [0.6, 0.8] },
  underdark: { gamma: [4, 6], stretch: 1.3, fill: [0.62, 0.8] },
};
const SIDE_WIDE = 0.4;
/** The narrowest floor a cave's normal room has either way, and a stairwell across. */
const MIN_ROOM_FLOOR = 3;
const STAIR_ACROSS = 2;

/** Lava makes a lava tube; a large, spacious or deep cave is the Underdark; else limestone. */
export function caveVariant(tags: ReadonlySet<DungeonTag>): CaveVariant {
  if (tags.has('lava')) return 'lava-tube';
  if (tags.has('large') || tags.has('spacious') || tags.has('deep')) return 'underdark';
  return 'limestone';
}

/** A Cavern's params: everything from the tags, with the sizes a cave can shape and how it shapes them. */
export function caveParams(params: DungeonParams): DungeonParams {
  const variant = caveVariant(params.tags);
  return {
    ...params,
    rotundaFactor: 0,
    colonnadeFactor: 0,
    minRoomFloor: MIN_ROOM_FLOOR,
    stairAcross: STAIR_ACROSS,
    ...(variant === 'underdark' && { sizeStyles: SPACIOUS_SIZES }),
    cave: { variant, ...SHAPING[variant], sideWide: SIDE_WIDE },
  };
}
