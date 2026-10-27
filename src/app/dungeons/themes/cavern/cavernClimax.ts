/**
 * How a Cavern's boss room may be built as an arena: the grand cavern, perhaps across a fault's
 * chasm; the lake cavern behind its dam; a den with its ledge of rock and nothing on it. No dressed
 * pillars: a cave's cover is its breakdown, never mirrored.
 */

import type { ArenaSpec, ClimaxSpec } from '../themeTypes';

export const GRAND_CAVERN_ARENA: ArenaSpec = { setPieces: [], mirrored: ['rubble-heap'], hazards: ['chasm'] };
export const LAKE_ARENA: ArenaSpec = { setPieces: [], mirrored: ['rubble-heap'], hazards: ['deep-water'] };
export const DEN_ARENA: ArenaSpec = { setPieces: [], mirrored: ['rubble-heap'], hazards: [] };

export const CAVERN_CLIMAX: readonly ClimaxSpec[] = [
  { type: 'grand-cavern', weight: 0.45, arena: GRAND_CAVERN_ARENA },
  { type: 'lake-cavern', weight: 0.25, arena: LAKE_ARENA },
  // A beast's den in a wild cave, its chief's in a lived-in one: the facts allow one of the two, never both.
  { type: 'den', weight: 0.3, arena: DEN_ARENA },
  { type: 'chief-den', weight: 0.3, arena: DEN_ARENA },
];
