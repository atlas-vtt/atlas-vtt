import { cellKey } from '../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../../src/app/dungeons/model';
import { type FurnishSpace, furnishSpace } from '../../../src/app/dungeons/props/furnishSpace';
import { ALL_PROP_KINDS, type PropKind } from '../../../src/app/dungeons/props/propKinds';
import { frameOf } from '../../../src/app/dungeons/props/roomFrame';
import { roomSpace } from '../../../src/app/dungeons/props/space';
import { rngFrom } from '../../../src/app/dungeons/rng';
import { FloorTerrain } from '../../../src/app/dungeons/terrain/floorTerrain';
import { room } from './plannedFloorFixtures';
import { floorStack } from '../../../src/app/dungeons/floors/floorStack';

/** A room of `w` × `h` cells entered from the south (axis up), with a door in the middle of its south wall and, if asked, one in its north wall. */
export function furnished(w: number, h: number, options: { seed?: number; rotunda?: boolean; north?: boolean; offered?: ReadonlySet<PropKind>; placeAllowed?: (kind: PropKind, at: CellPoint) => boolean } = {}): FurnishSpace {
  const r: DungeonRoom = room(0, { x: 0, y: 0, w, h, axis: { x: 0, y: -1 }, rotunda: options.rotunda ?? false });
  const mid = Math.floor(w / 2);
  const doors: DungeonDoor[] = [{ x: mid, y: h, dir: { x: 0, y: -1 }, kind: 'door', from: null, to: 0 }];
  if (options.north) doors.push({ x: mid, y: -1, dir: { x: 0, y: -1 }, kind: 'door', from: 0, to: 1 });
  const floor = new FloorTerrain(0, { rooms: [r], doors, stairs: [], columns: [] }, floorStack('down', 1));
  const rc = floor.room(0)!;
  const clear = new Set(rc.needed.map((c) => cellKey(c.x, c.y)));
  return furnishSpace({
    floor,
    cells: rc,
    space: roomSpace(frameOf(r), clear, []),
    rng: rngFrom(options.seed ?? 1),
    offered: options.offered ?? ALL_PROP_KINDS,
    doors,
    ...(options.placeAllowed && { placeAllowed: options.placeAllowed }),
  });
}

