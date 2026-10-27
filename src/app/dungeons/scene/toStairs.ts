import type { LevelLink } from '../../types/sceneLevelTypes';
import { isAbove, stackOf } from '../floors/floorStack';
import type { CellDir, DungeonModel } from '../model';
import type { DungeonPlacement } from './toWalls';

/** The edge of a stairwell's rectangle (corners clockwise from its top left) on the side its treads descend towards: the foot. */
function footEdge(down: CellDir): number {
  if (down.y < 0) return 0;
  if (down.x > 0) return 1;
  if (down.y > 0) return 2;
  return 3;
}

/**
 * A dungeon's stairwells as the stairs of its scene: one level link per stairwell, on exactly its
 * drawn cells (the same rectangle on both floors), joining the floor above and the floor below both
 * ways, walked (`flight`): the foot is the low end the treads descend towards, where they are
 * entered on the floor below, and the head the high end, where they are entered on the floor
 * above; a token changes floor in the last row at the far end, one row per cell of the stairwell's
 * length. `levelIds` are the scene's levels by floor (index 0 the entry floor), which lies above
 * or below the next as the stack says (`isAbove`). Pure.
 */
export function stairLinks(model: DungeonModel, levelIds: readonly string[], placement: DungeonPlacement): Record<string, LevelLink> {
  const { originCell, pxPerCell } = placement;
  const world = (x: number, y: number): { x: number; y: number } => ({ x: (x - originCell.x) * pxPerCell, y: (y - originCell.y) * pxPerCell });
  const links: Record<string, LevelLink> = {};
  const stack = stackOf(model);
  model.floors.forEach((floor, index) => {
    // Each stairwell once, from the end on the floor nearer the entrance
    for (const stair of floor.stairs.filter(s => s.to > index)) {
      const above = isAbove(stack, index, stair.to);
      const upper = levelIds[above ? index : stair.to];
      const lower = levelIds[above ? stair.to : index];
      if (!upper || !lower) continue;
      const id = `levellink_dungeon_${stair.link}`;
      const { x, y, w, h, down } = stair;
      links[id] = {
        id,
        kind: 'level-link',
        polygon: [world(x, y), world(x + w, y), world(x + w, y + h), world(x, y + h)],
        levels: [upper, lower],
        flight: { foot: footEdge(down), rows: down.x !== 0 ? w : h },
      };
    }
  });
  return links;
}
