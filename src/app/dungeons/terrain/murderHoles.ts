/**
 * Murder holes: small holes cut in the floor over a gatehouse's gate passage, in a row along it with
 * a cell of floor between each, so defenders above can see and strike whoever comes through the
 * gate. They are what a gate chamber over the passage is built for, so it always has them. Each is
 * one cell of the room above, walked over (too small to fall through), and opens onto the passage
 * below; nothing is placed in the gatehouse for them.
 */

import type { CellPoint, DungeonDoor, DungeonRoom } from '../model';
import { floorAbove } from '../floors/floorStack';
import { floorRect, stepsWithin } from '../geometry';
import { draft } from './catalog';
import type { FloorTerrain } from './floorTerrain';
import { mayCutIn, reasonsOf } from './typeReasons';
import { FEATURES } from '../themes/features';
import type { TerrainWork } from './work';

/** At most this many holes over one passage. */
const MOST_HOLES = 4;

/** The door a gate passage begins at: the gatehouse's entrance from outside, else the first door into it. */
function gateDoor(doors: readonly DungeonDoor[], room: DungeonRoom): DungeonDoor | undefined {
  return doors.find((d) => d.from === null && d.to === room.id) ?? doors.find((d) => d.to === room.id);
}

/** The cells of a gatehouse's gate passage, from its gate straight across the room, nearest first; none without a door in. */
export function gatePassage(room: DungeonRoom, doors: readonly DungeonDoor[]): CellPoint[] {
  const door = gateDoor(doors, room);
  return door ? stepsWithin(floorRect(room), door, door.dir) : [];
}

/** Of the gate passage's cells, those every other one from the gate (`first` 0) or from the cell after it (1). */
export function everyOther(way: readonly CellPoint[], first: 0 | 1): CellPoint[] {
  return way.filter((_, t) => t % 2 === first);
}

/** Murder holes over the gate passage of every gatehouse whose type gives the reason, where a room lies over it. */
export function murderHoles(work: TerrainWork): void {
  work.floors.forEach((floor, k) => {
    const top = floorAbove(work.stack, k);
    const above = work.floors[top ?? -1];
    if (top === null || !above) return;
    for (const room of floor.plan.rooms) {
      const typed = work.typed(k, room.id);
      if (!typed || !reasonsOf(typed.spec, work.theme.ruined).some((r) => r.at === 'above' && r.kinds.includes('murder-hole'))) continue;
      const way = gatePassage(room, floor.plan.doors);
      if (way.length > 0) cutRow(work, above, floor, way);
    }
  });
}

/**
 * A row of holes over every other cell of the passage, from just inside the gate or from the cell
 * after it, but those the room above keeps clear, in the one room above that lies over the most of
 * them; at least two.
 */
function cutRow(work: TerrainWork, above: FloorTerrain, below: FloorTerrain, way: readonly CellPoint[]): void {
  const gate = below.roomHolding(way.slice(0, 1));
  if (!gate) return;
  const rows = ([0, 1] as const).flatMap((first) => {
    // A cell the room above keeps clear (its stairs, the way onto them, before its doors) has no hole.
    const spots = everyOther(way, first).filter((c) => gate.isFloor(c) && above.roomHolding([c])?.fits([c]));
    const rooms = [...new Set(spots.map((c) => above.roomHolding([c])))];
    return rooms.flatMap((rc) => (rc ? [{ rc, cells: spots.filter((c) => above.roomHolding([c]) === rc).slice(0, MOST_HOLES) }] : []));
  });
  const fits = rows.filter(({ rc, cells }) => cells.length >= 2 && rc.room.wing === 'regular' && !rc.room.boss && rc.room.stage === undefined && mayCutIn(work, above.index, rc.room.id, FEATURES['murder-holes']) && rc.allows(cells, 'walk'));
  const best = fits.sort((a, b) => b.cells.length - a.cells.length)[0];
  if (!best) return;
  for (const c of best.cells) above.place({ ...draft('murder-hole', best.rc.room.id, [c]), opening: { bottom: below.index, link: work.nextLink() } });
}
