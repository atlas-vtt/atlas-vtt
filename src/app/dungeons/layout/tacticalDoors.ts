import { cellKey, doorCells, floorCellsOf, perpendicular } from '../geometry';
import type { CellDir } from '../model';
import type { CompactLayout } from './compact';

/** Two-cell built doorways, only where both sides already have floor and no other door is displaced. */
export function widenEncounterDoors(layout: CompactLayout): CompactLayout {
  const owner = new Map(layout.rooms.flatMap(room => floorCellsOf(room).map(c => [cellKey(c.x, c.y), room.id] as const)));
  const occupied = new Set(layout.doors.flatMap(door => doorCells(door).map(c => cellKey(c.x, c.y))));
  const doors = layout.doors.map(door => {
    if (door.wide || door.kind !== 'door' || door.from === null || door.to === null) return door;
    const side = perpendicular(door.dir);
    const sides: CellDir[] = [side, { x: -side.x as CellDir['x'], y: -side.y as CellDir['y'] }];
    const wide = sides.find(offset => {
      const x = door.x + offset.x;
      const y = door.y + offset.y;
      if (occupied.has(cellKey(x, y))) return false;
      // Edge doors occupy a cell of the room they leave; ordinary doors occupy the wall cell.
      const from = door.edge ? { x, y } : { x: x - door.dir.x, y: y - door.dir.y };
      return owner.get(cellKey(from.x, from.y)) === door.from && owner.get(cellKey(x + door.dir.x, y + door.dir.y)) === door.to;
    });
    if (!wide) return door;
    occupied.add(cellKey(door.x + wide.x, door.y + wide.y));
    return { ...door, wide };
  });
  return { ...layout, doors };
}
