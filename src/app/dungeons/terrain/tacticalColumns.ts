import { stairEnd, type FloorStack } from '../floors/floorStack';
import type { DungeonColumn } from '../model';
import type { FloorPlan } from './floorTerrain';
import { RoomCells } from './roomCells';
import { touches } from './roomFrame';
import { tacticalLaneCells } from './roomLanes';

/** Make openings in colonnades along the same routes that furnishing will keep clear. */
export function clearTacticalColumns(plan: Pick<FloorPlan, 'rooms' | 'doors' | 'stairs' | 'columns'>, stack: FloorStack, index: number): DungeonColumn[] {
  if (plan.columns.length === 0) return [];
  const lanes = plan.rooms.filter(room => room.kind === 'room').flatMap(room => tacticalLaneCells(
    new RoomCells(room, plan.doors, plan.stairs, stair => stairEnd(stack, index, stair.to), []),
  ));
  return plan.columns.filter(column => !lanes.some(cell => touches(column, cell)));
}
