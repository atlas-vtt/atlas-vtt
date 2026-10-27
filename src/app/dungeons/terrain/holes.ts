/**
 * Holes through floors (Verticality): a chasm, a shaft or a gallery on floor `k` opens onto the
 * floors physically below it (the stack's). A hole only lies over the floor of a regular room on the floor below, never over
 * rock, a wall, a stairwell or the cells before a door: there it either opens on (an abyss through
 * several floors, never cutting that room in two) or ends, and its fall ends on loose rubble
 * (`chasm-floor`, difficult). Below the lowest floor there is nothing: a bottomless void.
 */

import type { CellPoint, TerrainKind } from '../model';
import { type Rng, chance } from '../rng';
import { floorBelow } from '../floors/floorStack';
import { draft } from './catalog';
import type { RoomCells } from './roomCells';
import { takesFall } from './typeReasons';
import type { TerrainWork } from './work';

/** How likely an abyss opens on through the floor below where it could. */
const OPEN_ON = 0.6;
/** A hole opens on through a room below only where the room is four cells across both ways and keeps most of its floor. */
const MOST_OF_ROOM = 0.6;
/** ...and this many free cells besides, for the room's own cover. */
const LEFT_FREE = 4;
/** A fall that ends in a room leaves it at least this many free cells, so its rubble never fills the room. */
const LEFT_UNDER = 2;

/** Where a hole over `cells` on floor `k` leads: the floors it opens through below, and the floor it ends on (null: bottomless). */
export interface Drop {
  through: { floor: number; rc: RoomCells }[];
  bottom: { floor: number; rc: RoomCells } | null;
}

/** The way down from a hole over `cells` on floor `k`; null where no floor below can take it. */
export function dropBelow(work: TerrainWork, k: number, cells: readonly CellPoint[], rng: Rng, mayOpenOn = true): Drop | null {
  const through: Drop['through'] = [];
  for (let floor = floorBelow(work.stack, k); floor !== null; floor = floorBelow(work.stack, floor)) {
    const rc = work.floors[floor]?.roomHolding(cells);
    // Only a room that may take a fall from above: never a furnished room of a built theme.
    if (!rc || rc.room.wing !== 'regular' || !takesFall(work, floor, rc.room.id)) return null;
    const last = floorBelow(work.stack, floor) === null;
    const roomy = rc.depth >= 4 && rc.width >= 4 && cells.length <= rc.floorCount * (1 - MOST_OF_ROOM) && rc.freeCount() - cells.length >= LEFT_FREE && rc.keepsCover(cells);
    // A cave's hole opens on only where its wall cannot wander over it (`RoomCells.clearOfRock`).
    const canOpen = mayOpenOn && roomy && rc.allows(cells, 'block') && !cells.some((c) => rc.nearStairs(c) || (work.cave !== undefined && !rc.clearOfRock(c)));
    const canEnd = rc.fits(cells) && rc.freeCount() - cells.length >= LEFT_UNDER;
    if (canOpen && (!canEnd || chance(rng, OPEN_ON))) {
      through.push({ floor, rc });
      if (last) return { through, bottom: null };
      continue;
    }
    return canEnd ? { through, bottom: { floor, rc } } : null;
  }
  return { through, bottom: null };
}

const FLOOR_UNDER: Readonly<Partial<Record<TerrainKind, string>>> = { shaft: 'dungeon.terrain.shaftFloor' };

/**
 * Cuts a hole of `kind` over `cells` in room `rc` of floor `k`, `bridges` laid over it, and the
 * holes and the rubble below it as `drop` found them. The hole's id, or null where its own room
 * cannot take it.
 */
export function cutHole(work: TerrainWork, k: number, rc: RoomCells, kind: TerrainKind, cells: CellPoint[], drop: Drop, options: { bridge?: CellPoint[]; name?: string } = {}): number | null {
  const link = work.nextLink();
  const opening = { bottom: drop.bottom?.floor ?? null, link };
  const floor = work.floors[k];
  if (!floor) return null;
  const id = floor.place({ ...draft(kind, rc.room.id, cells, { name: options.name }), opening }, options.bridge);
  if (id === null) return null;
  for (const { floor: below, rc: room } of drop.through) {
    work.floors[below]?.addHeld({ ...draft('chasm', room.room.id, cells.map((c) => ({ ...c }))), opening });
  }
  if (drop.bottom) {
    const { floor: below, rc: room } = drop.bottom;
    work.floors[below]?.addHeld({ ...draft('chasm-floor', room.room.id, cells.map((c) => ({ ...c })), { name: FLOOR_UNDER[kind] }), under: link });
  }
  return id;
}
