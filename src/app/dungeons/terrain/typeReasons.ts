/**
 * What terrain a typed room may hold, read from its type: the kinds it allows, those its reasons
 * bring (`themes/features.ts`, a ruin's only in a ruin), and in a ruin the rubble, broken floor,
 * roots and wall fragments of decay. An untyped room (a Cavern until its plan) may hold anything,
 * as before themes. Every terrain pass that cuts holes asks here first.
 */

import type { TerrainKind } from '../model';
import { floorBelow } from '../floors/floorStack';
import { FEATURES, type FeatureSpec } from '../themes/features';
import type { RoomTypeSpec } from '../themes/themeTypes';
import type { TerrainWork } from './work';

/** What decay brings into any room of a ruin. */
export const RUINED_GROUND: readonly TerrainKind[] = ['rubble-heap', 'rubble-field', 'broken-floor', 'tangled-roots', 'wall-fragment'];

/** The reasons a type holds in this dungeon: those of a ruin only where it is one. */
export function reasonsOf(spec: RoomTypeSpec, ruined: boolean): FeatureSpec[] {
  return (spec.terrain.features ?? []).map((reason) => FEATURES[reason]).filter((reason) => ruined || !reason.ruinedOnly);
}

/** Whether a room of type `spec` (undefined: untyped) may hold terrain of `kind`. */
export function typeAllows(spec: RoomTypeSpec | undefined, kind: TerrainKind, ruined: boolean): boolean {
  if (!spec) return true;
  if (spec.terrain.allows?.includes(kind)) return true;
  if (ruined && RUINED_GROUND.includes(kind)) return true;
  return reasonsOf(spec, ruined).some((reason) => reason.at === 'here' && reason.kinds.includes(kind));
}

/** Whether a hole of `kind` may be cut in room `room` of floor `k`: an untyped room, or a type with a reason for it. */
export function holeAllowed(work: TerrainWork, k: number, room: number, kind: TerrainKind): boolean {
  const typed = work.typed(k, room);
  if (!typed) return true;
  const below = floorBelow(work.stack, k) !== null;
  return reasonsOf(typed.spec, work.theme.ruined).some((reason) => reason.at === 'here' && reason.kinds.includes(kind) && (!reason.upperFloor || below));
}

/** Whether a hole may be cut over room `room` of floor `k` from the floor above it: an untyped room, or a type whose reason opens the floor above it. */
export function openingAbove(work: TerrainWork, k: number, room: number, kind: TerrainKind): boolean {
  const typed = work.typed(k, room);
  return !typed || reasonsOf(typed.spec, work.theme.ruined).some((reason) => reason.at === 'above' && reason.kinds.includes(kind));
}

/** Whether the opening `reason` brings may be cut in room `room` of floor `k`: a type the reason names, an untyped room, or any where it names none. */
export function mayCutIn(work: TerrainWork, k: number, room: number, reason: FeatureSpec): boolean {
  const type = work.typed(k, room)?.spec.id;
  return !reason.cutIn || type === undefined || reason.cutIn.includes(type);
}

/** Whether a fall from a hole above may open through or end in room `room` of floor `k`: an untyped or empty room, a hazard type or a collapsed room; in a cave, any room, since rock falls where it will. */
export function takesFall(work: TerrainWork, k: number, room: number): boolean {
  const typed = work.typed(k, room);
  if (!typed || work.empty(k, room) || work.cave) return true;
  return (typed.spec.terrain.hazards?.length ?? 0) > 0 || typed.spec.id === 'collapsed-room';
}
