/**
 * Whether a floor's layout can be shaped into a cave that keeps its token-fit rules: the main path
 * fits two cells wide, and with it taken every chamber still has room for a 3 × 3 block of its own. Asked of
 * every attempt at a Cavern floor, so a floor that cannot is grown anew.
 */

import { CaveGrid, type CaveFloorPlan } from './caveGrid';
import { reserveCores } from './chambers';
import { type LaneEnd, claimLane, mainRoute, wideLane } from './mainPath';

export function caveFits(floor: CaveFloorPlan, from: LaneEnd, to: LaneEnd, index: number): boolean {
  const grid = new CaveGrid(floor, index);
  const route = mainRoute(floor, from, to);
  const lane = wideLane(grid, floor, route, from, to);
  if (!lane) return false;
  claimLane(grid, floor, route, lane);
  return reserveCores(grid, floor.rooms);
}
