/**
 * Rooms built to overlook another. Where a hall's type opens the floor over it for a reason that
 * names the rooms it may be cut in (`FeatureSpec.cutIn`: a great hall's minstrels' gallery, an
 * entrance hall's stair well, a ballroom's gallery, a gatehouse's murder holes), the room right
 * above that covers what it overlooks takes one of those types, where one may stand there: by
 * itself, or by trading types with the room that holds it. Rooms so typed are fixed.
 */

import type { PlannedFloor } from '../../floors/planFloors';
import { cellsOf, floorRect, inRect, intersection } from '../../geometry';
import type { DungeonRoom } from '../../model';
import { everyOther, gatePassage } from '../../terrain/murderHoles';
import { reasonsOf } from '../../terrain/typeReasons';
import { mayOpen } from '../../terrain/wells';
import type { FeatureSpec } from '../features';
import type { RoomTypeId } from '../roomTypes';
import { type Assignment, heldCount, specOf } from './score';
import { keepsRules, touched } from './swaps';

/** How much of what `reason` overlooks in `hall` the room `over` covers: the cells of a gallery's 2 × 2, or of a row of murder holes; 0 where it could not hold the opening. */
function coverage(reason: FeatureSpec, hall: DungeonRoom, doors: PlannedFloor['doors'], over: DungeonRoom): number {
  if (!mayOpen(over)) return 0;
  const f = floorRect(over);
  if (reason.kinds.includes('murder-hole')) {
    const way = gatePassage(hall, doors);
    const row = Math.max(...([0, 1] as const).map((first) => everyOther(way, first).filter((c) => inRect(f, c.x, c.y)).length));
    return row >= 2 ? row : 0;
  }
  const shared = intersection(f, floorRect(hall));
  return shared && shared.x1 > shared.x0 && shared.y1 > shared.y0 ? cellsOf(shared).length : 0;
}

/** Whether room `i` may give up its type: it is not anchored (but for the stair type), and the programme keeps as many of it as it needs. */
function mayGiveUp(a: Assignment, i: number): boolean {
  const type = a.types[i];
  if (a.fixed[i] && type !== a.programme.stairs) return false;
  const spec = type ? specOf(a.programme, type) : undefined;
  const cores = a.programme.clusters.some((cluster) => cluster.core === type);
  return !spec || (!cores && heldCount(a, spec.id, i) >= spec.count[0]);
}

/** Room `i` takes `id`, where it and every room about it keep their rules: by itself, else by trading with an unanchored room that holds it. */
function retype(a: Assignment, i: number, id: RoomTypeId): boolean {
  const own = a.types[i] ?? null;
  a.types[i] = id;
  if (keepsRules(a, touched(a, i, i))) return true;
  a.types[i] = own;
  for (let j = 0; j < a.types.length; j++) {
    if (j === i || a.types[j] !== id || a.fixed[j] || !mayGiveUp(a, j)) continue;
    [a.types[i], a.types[j]] = [id, own];
    if (keepsRules(a, touched(a, i, j))) return true;
    [a.types[i], a.types[j]] = [own, id];
  }
  return false;
}

export function placeOverlooks(a: Assignment, floors: readonly PlannedFloor[], above: (floor: number) => number | null): void {
  for (const t of a.traits) {
    const type = a.types[t.index];
    const up = above(t.floor);
    const plan = floors[t.floor];
    const hall = plan?.rooms[t.room];
    if (!type || t.boss || up === null || !plan || !hall) continue;
    const spec = specOf(a.programme, type);
    const reasons = spec ? reasonsOf(spec, a.ruined).filter((r) => r.at === 'above' && r.cutIn) : [];
    for (const reason of reasons) {
      const wanted = reason.cutIn ?? [];
      const covering = a.traits
        .filter((u) => u.floor === up)
        .map((u) => ({ u, cover: coverage(reason, hall, plan.doors, floors[up]?.rooms[u.room] as DungeonRoom) }))
        .filter(({ cover }) => cover > 0)
        .sort((x, y) => y.cover - x.cover || x.u.index - y.u.index);
      if (covering.some(({ u }) => wanted.includes(a.types[u.index] as RoomTypeId))) continue;
      const placed = covering.find(({ u }) => mayGiveUp(a, u.index) && wanted.some((id) => retype(a, u.index, id)));
      if (placed) a.fixed[placed.u.index] = true;
    }
  }
}
