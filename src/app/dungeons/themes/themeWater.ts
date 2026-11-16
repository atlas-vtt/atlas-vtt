/**
 * Where standing water may lie on a built theme's floors: only in rooms whose type has water for a
 * reason (a cistern, a conservatory's pool, a ruin's flooded cellar). Everything else stays dry,
 * corridors too, whatever the water level.
 */

import { cellKey } from '../geometry';
import type { DungeonRoom } from '../model';
import { reasonsOf } from '../terrain/typeReasons';
import type { TypedRoom } from '../terrain/typeTerrain';

export interface ThemeWater {
  /** Rooms where water may stand. */
  wet: ReadonlySet<number>;
  /** Rooms that may hold a pool. */
  pools: ReadonlySet<number>;
  /** Every floor cell of the other rooms, as `x,y`. */
  dry: ReadonlySet<string>;
}

export function themeWater(rooms: readonly DungeonRoom[], types: ReadonlyMap<number, TypedRoom>, ruined: boolean): ThemeWater {
  const wet = new Set<number>();
  const pools = new Set<number>();
  for (const [id, typed] of types) {
    const waters = reasonsOf(typed.spec, ruined).flatMap((reason) => (reason.water ? [reason.water] : []));
    if (waters.length) wet.add(id);
    if (waters.includes('pool')) pools.add(id);
  }
  const dry = new Set<string>();
  for (const room of rooms) {
    if (wet.has(room.id)) continue;
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) dry.add(cellKey(x, y));
  }
  return { wet, pools, dry };
}
