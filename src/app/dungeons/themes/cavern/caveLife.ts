/**
 * Where life grows in a cave (report §6.9 rule 8): green growth, moss, roots and creepers only
 * where daylight reaches, within a hop of the mouth; fungi only within a hop of water or of a
 * roost's droppings; nothing at all where lava runs.
 */

import type { CaveSites } from '../../layout/cavern/caveSites';
import type { DungeonFloor, GrowthKind, TerrainKind } from '../../model';
import { neighbours } from '../../roomGraph';

/** Hops from the mouth daylight reaches, and from water or a roost that fungi live by. */
const DAYLIGHT = 1;
const DAMP = 1;

/** Whether `kind` may grow in each room of the floor. */
export function caveLife(site: CaveSites, floor: Pick<DungeonFloor, 'rooms' | 'doors' | 'terrain'>): (room: number, kind: GrowthKind | TerrainKind) => boolean {
  const molten = new Set(floor.terrain.filter((p) => p.traits.hazard === 'lava').map((p) => p.room));
  const near = neighbours(floor.rooms.length, floor.doors);
  const roost = (id: number): boolean => floor.rooms[id]?.type === 'roost';
  return (room, kind) => {
    if (molten.has(room)) return false;
    if (kind === 'fungi') return site.nearWater(room, DAMP) || roost(room) || (near[room] ?? []).some(roost);
    return site.floor === 0 && (site.hopsFromMouth[room] ?? Infinity) <= DAYLIGHT;
  };
}
