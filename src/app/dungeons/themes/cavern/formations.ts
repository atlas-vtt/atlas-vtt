/**
 * Where a cave's formations form (report §6.9 rule 5): stalagmites and columns where water drips
 * into air, so never in a room a stream runs through or water fills; crystals in a grotto or on a
 * shore; no calcite where lava runs, and no stalagmite near an acid spring, which eats it. How
 * richly a room is decorated follows the same: dry dead ends and upper floors richest, the mouth,
 * where air moves and the rock dries, poorest, and wet rooms poor.
 */

import { cellKey, floorCellsOf } from '../../geometry';
import type { CellPoint, PropKind } from '../../model';
import type { RoomRef } from '../themeTypes';
import { type CaveFacts, allowsType } from './caveTypeRules';

/** Formations of dripping water: stalagmites and the columns where they meet the roof. */
const DRIPSTONE: ReadonlySet<PropKind> = new Set<PropKind>(['stalagmites', 'column-formation']);
/** Everything that grows of calcite. */
const CALCITE: ReadonlySet<PropKind> = new Set<PropKind>(['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals']);
/** Acid eats calcite this far from its spring. */
const ACID_REACH = 3;
/** The rooms of a lived-in cave, furnished by those who live there. */
const LIVED_IN = new Set(['guard-post', 'lived-in-hollow', 'fire-hollow', 'pen', 'store-hollow', 'chief-den']);

function roomOf(facts: CaveFacts, ref: RoomRef): CaveFacts['floors'][number]['rooms'][number] | undefined {
  return facts.floors[ref.floor]?.rooms[ref.room];
}

/** Whether water runs through the room or fills it. */
function wet(facts: CaveFacts, ref: RoomRef): boolean {
  const cave = facts.floors[ref.floor]?.cave;
  return (cave?.basins.includes(ref.room) ?? false) || (cave?.streams.some((s) => s.includes(ref.room)) ?? false);
}

/** By floor, the cells within reach of a room that may hold an acid spring, as keys; worked out once per cave. */
const acidReach = new WeakMap<CaveFacts, Map<number, Set<string>>>();

/** Whether `at` lies within reach of a room of the floor that may hold an acid spring. */
function byAcid(facts: CaveFacts, ref: RoomRef, at: CellPoint): boolean {
  if (!facts.tags.has('acid')) return false;
  const floors = acidReach.get(facts) ?? new Map<number, Set<string>>();
  acidReach.set(facts, floors);
  let near = floors.get(ref.floor);
  if (!near) {
    near = new Set<string>();
    for (const room of facts.floors[ref.floor]?.rooms ?? []) {
      if (room.kind !== 'room' || !allowsType(facts, 'sulphur-spring', { floor: ref.floor, room: room.id })) continue;
      for (const c of floorCellsOf(room)) for (let dx = -ACID_REACH; dx <= ACID_REACH; dx++) for (let dy = -ACID_REACH; dy <= ACID_REACH; dy++) near.add(cellKey(c.x + dx, c.y + dy));
    }
    floors.set(ref.floor, near);
  }
  return near.has(cellKey(Math.floor(at.x), Math.floor(at.y)));
}

/** Whether a formation of `kind` may form at `at` in the room; any other piece may stand anywhere its recipe puts it. */
export function formationAllowed(kind: PropKind, at: CellPoint, ref: RoomRef, facts: CaveFacts): boolean {
  if (!CALCITE.has(kind)) return true;
  const type = roomOf(facts, ref)?.type;
  if (type === 'lava-tube') return false;
  if (DRIPSTONE.has(kind) && wet(facts, ref)) return false;
  if (kind === 'crystals' && type !== 'crystal-grotto' && !(facts.floors[ref.floor]?.cave?.basins.includes(ref.room) ?? false)) return false;
  return kind !== 'stalagmites' || !byAcid(facts, ref, at);
}

/** How richly the room is decorated, 0..1: dry dead ends and upper floors high, the mouth low, rooms of running or standing water low. */
export function formationRichness(ref: RoomRef, facts: CaveFacts): number {
  const room = roomOf(facts, ref);
  const site = facts.sites[ref.floor];
  if (!room || !site || LIVED_IN.has(room.type ?? '')) return 1;
  const floor = facts.floors[ref.floor]!;
  if ((site.hopsFromMouth[ref.room] ?? Infinity) === 0) return 0.25;
  const deadEnd = floor.doors.filter((d) => d.from === ref.room || d.to === ref.room).length <= 1;
  let richness = 0.6 + (deadEnd ? 0.25 : 0) + (site.deepest ? 0 : 0.15);
  if (wet(facts, ref)) richness -= 0.35;
  return Math.max(0.15, Math.min(1, richness));
}
