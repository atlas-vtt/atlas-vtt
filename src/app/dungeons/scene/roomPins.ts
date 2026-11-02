import type { CellPoint, DungeonRoom } from '../model';
import { stackOf, stairEnd } from '../floors/floorStack';
import { cellKey, cellsOf, floorCellsOf, maskOf } from '../geometry';
import { approachCells, doorApproaches, spotRect } from '../floors/stairSpots';
import { frameOf } from '../props/roomFrame';
import { propReach } from '../props/catalogue';
import { isFree, roomSpace, type RoomSpace } from '../props/space';
import type { VisibleFloor } from '../render/visibleDungeon';
import { footingOf } from '../terrain/catalog';

/** How far a pin reaches from its cell's middle, in cells: what must be clear for it. */
const PIN_REACH = 0.3;

/** The cells of a floor a pin may not stand on, from what must stay clear to what may only be crossed. */
interface Clearances {
  /** Stairwells and the terrain no one walks on (cover, hazards). */
  never: CellPoint[];
  /** The rows stairwells are reached from, the cells before doors, water and terrain walked across. */
  preferNot: CellPoint[];
}

function clearancesOf(visible: VisibleFloor, room: DungeonRoom): Clearances {
  const { floor } = visible;
  const pieces = floor.terrain.filter(piece => piece.room === room.id);
  return {
    never: [...floor.stairs.flatMap(s => cellsOf(spotRect(s))), ...pieces.filter(p => footingOf(p.kind) === 'block').flatMap(p => p.cells)],
    preferNot: [
      ...floor.stairs.flatMap(s => approachCells(s, stairEnd(stackOf(visible.model), visible.index, s.to))),
      ...doorApproaches(room, visible.doors),
      ...floor.waterCells,
      ...pieces.filter(p => footingOf(p.kind) === 'walk').flatMap(p => p.cells),
    ],
  };
}

/**
 * Where a room's pin stands: the middle of the free cell nearest the room's middle (in reading
 * order among equals). Free is off the stairwells and the rows they are reached from, the cells
 * before doors, every prop, column and piece of terrain, and dry. Where a small room has no such
 * cell, the nearest off stairs, props, columns and terrain no one walks on; then the nearest
 * off stairs and that terrain; then its middle.
 */
export function pinCell(visible: VisibleFloor, room: DungeonRoom): CellPoint {
  const { floor } = visible;
  const { never, preferNot } = clearancesOf(visible, room);
  const frame = frameOf(room);
  const middle = frame.centre;
  const centres = floorCellsOf(room)
    .map(c => ({ x: c.x + 0.5, y: c.y + 0.5 }))
    .sort((a, b) => Math.hypot(a.x - middle.x, a.y - middle.y) - Math.hypot(b.x - middle.x, b.y - middle.y) || a.y - b.y || a.x - b.x);
  const spaceOf = (clear: readonly CellPoint[], furnished: boolean): RoomSpace => {
    const space = roomSpace(frame, new Set(clear.map(c => cellKey(c.x, c.y))), furnished ? floor.columns : [], maskOf(room));
    if (furnished) for (const prop of floor.props) space.taken.push({ x: prop.x, y: prop.y, radius: propReach(prop.kind) * prop.scale });
    return space;
  };
  for (const space of [spaceOf([...never, ...preferNot], true), spaceOf(never, true), spaceOf(never, false)]) {
    const free = centres.find(p => isFree(space, p, PIN_REACH));
    if (free) return free;
  }
  return centres[0] ?? middle;
}
