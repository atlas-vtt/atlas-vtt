import type { CellPoint, DungeonRiverBridge } from '../model';

/** How far from a bridge's middle a route's crossing may lie and still be on it, beyond half its length, in cells. */
const ON_DECK = 1;

/**
 * Of `bridges`, the one a crossing (the run `[a, b]` of a route's cells in the water) goes over, if any: a path that
 * crosses a river where a road already does takes that road's bridge, as paths do, never a second one beside it.
 */
export function deckUnder<T extends { bridge: DungeonRiverBridge }>(bridges: readonly T[], cells: readonly CellPoint[], [a, b]: [number, number]): T | undefined {
  const mid = cells[(a + b) >> 1]!;
  return bridges.find(({ bridge }) => Math.hypot(mid.x + 0.5 - bridge.at.x, mid.y + 0.5 - bridge.at.y) <= bridge.length / 2 + ON_DECK);
}
