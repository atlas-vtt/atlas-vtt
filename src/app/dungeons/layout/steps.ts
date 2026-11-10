/**
 * Steps: a change of floor level at an ordinary door. The fewer doors the room behind it has, the
 * likelier, and twice as likely at each end that is a junction. Mostly the floor falls away as
 * the dungeon goes on (from the room nearer the start to the one beyond).
 */

import type { DoorKind } from '../model';
import type { DungeonParams } from '../params';
import { type KeyedRng, chance } from '../rng';
import { type WorkLayout, doorsOf, kindOf, roomAt } from './workLayout';

const ORDINARY: ReadonlySet<DoorKind> = new Set<DoorKind>(['door', 'opening']);
const DESCENDING_SHARE = 0.75;

export function addSteps(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): void {
  if (params.stepsChance <= 0) return;
  const rng = rngOf('steps');
  for (const door of layout.doors) {
    if (door.from === null || door.to === null || !ORDINARY.has(door.kind)) continue;
    const from = roomAt(layout, door.from);
    const to = roomAt(layout, door.to);
    let p = params.stepsChance / Math.max(1, doorsOf(layout, to.id).length);
    if (kindOf(from) === 'junction') p *= 2;
    if (kindOf(to) === 'junction') p *= 2;
    if (!chance(rng, p)) continue;
    door.kind = 'steps';
    if (chance(rng, DESCENDING_SHARE)) door.descends = true;
  }
}
