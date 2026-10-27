/**
 * A cave room named for a hazard it could not take: a chasm hall whose fault left no room for a
 * chasm, a stream passage the stream could not run through. It is then what it is, a passage
 * chamber, so neither its name in the note nor its pin promises what is not there.
 */

import type { DungeonRoom } from '../../model';
import type { RoomTypeId } from '../../themes/roomTypes';
import { programmeOf } from '../../themes/themes';
import type { TypedRoom } from '../typeTerrain';
import type { TerrainWork } from '../work';

/** The types a cave names for their hazard. A collapse chamber and a shaft room are rooms besides their holes. */
const NAMED_FOR_HAZARD: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>(['chasm-hall', 'stream-passage', 'lake-cavern', 'sump', 'lava-tube', 'sulphur-spring']);

/** The room's type now that its hazard was not laid: a passage chamber where its type was named for it, else as it was. */
export function withoutItsHazard(work: TerrainWork, room: DungeonRoom, typed: TypedRoom): TypedRoom {
  if (!work.cave || room.boss || !NAMED_FOR_HAZARD.has(typed.spec.id)) return typed;
  const spec = programmeOf(work.theme.definition, work.tags).rooms.find((s) => s.id === 'passage-chamber');
  if (!spec) return typed;
  room.type = spec.id;
  return { spec, context: typed.context };
}
