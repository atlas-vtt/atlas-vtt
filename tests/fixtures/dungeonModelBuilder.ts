import type {
  CellDir,
  CellPoint,
  DoorKind,
  DungeonColumn,
  DungeonCrack,
  DungeonDoor,
  DungeonFloor,
  DungeonModel,
  DungeonRoom,
  DungeonRubble,
  DungeonWater,
} from '../../src/app/dungeons/model';
import { DUNGEON_GENERATOR_VERSION } from '../../src/app/dungeons/model';
import { rngFrom, type Rng } from '../../src/app/dungeons/rng';

/**
 * Hand-built dungeons for the renderer's tests, while the generator is written beside it.
 * Rooms and doors are integer cells; every other position is continuous, cell (i, j) spanning
 * [i, i + 1] × [j, j + 1], so the middle of cell (3, 4) is (3.5, 4.5).
 */

export function emptyFloor(): DungeonFloor {
  return { rooms: [], doors: [], columns: [], props: [], rubble: [], cracks: [], water: [], waterCells: [], stairs: [], terrain: [], growth: [] };
}

/** A dungeon of one empty floor; build it through `entryFloor`. */
export function emptyModel(seed: number): DungeonModel {
  return { version: DUNGEON_GENERATOR_VERSION, seed, tags: [], floors: [emptyFloor()] };
}

export function entryFloor(model: DungeonModel): DungeonFloor {
  const floor = model.floors[0];
  if (!floor) throw new Error('a dungeon without floors');
  return floor;
}

type RoomInput = Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'> & Partial<DungeonRoom>;

export function addRoom(model: DungeonFloor, input: RoomInput): DungeonRoom {
  const room: DungeonRoom = {
    id: model.rooms.length,
    kind: input.w === 1 && input.h === 1 ? 'junction' : input.w === 1 || input.h === 1 ? 'corridor' : 'room',
    rotunda: false,
    wing: 'regular',
    group: model.rooms.length,
    parent: null,
    axis: { x: 0, y: -1 },
    colonnade: false,
    boss: false,
    ...input,
  };
  model.rooms.push(room);
  return room;
}

export function addDoor(model: DungeonFloor, x: number, y: number, dir: CellDir, kind: DoorKind, from: number | null, to: number | null): DungeonDoor {
  const door: DungeonDoor = { x, y, dir, kind, from, to };
  model.doors.push(door);
  return door;
}

/** One column per cell along both long walls, one cell in from them. */
export function colonnade(room: DungeonRoom, radius: number, square = false): DungeonColumn[] {
  const columns: DungeonColumn[] = [];
  if (room.rotunda) {
    const ringRadius = Math.sqrt(room.w * room.w + 1) / 2 - 1;
    const count = 4 * Math.floor((Math.PI * ringRadius) / 2);
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) / count) * Math.PI * 2;
      columns.push({ x: cx + Math.cos(a) * ringRadius, y: cy + Math.sin(a) * ringRadius, radius, square, shattered: false });
    }
    return columns;
  }
  const alongX = room.w >= room.h;
  const length = alongX ? room.w : room.h;
  for (let i = 1; i < length - 1; i++) {
    for (const side of [1, (alongX ? room.h : room.w) - 2]) {
      const x = alongX ? room.x + i + 0.5 : room.x + side + 0.5;
      const y = alongX ? room.y + side + 0.5 : room.y + i + 0.5;
      columns.push({ x, y, radius, square, shattered: false });
    }
  }
  return columns;
}

/** A wobbly closed pool around a centre, smoothed with two rounds of corner cutting. */
export function pool(rng: Rng, cx: number, cy: number, rx: number, ry: number): DungeonWater {
  let points: CellPoint[] = [];
  const count = 14;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const k = 0.75 + rng() * 0.45;
    points.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  for (let round = 0; round < 3; round++) points = chaikin(points);
  return { outline: points };
}

function chaikin(points: CellPoint[]): CellPoint[] {
  const out: CellPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out;
}

/** A small stone: a jittered quad. */
export function stone(rng: Rng, cx: number, cy: number): DungeonRubble {
  const r = 0.1 + Math.pow(rng(), 3) * 0.35;
  const turn = rng() * Math.PI;
  const points: CellPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const a = turn + (i / 4) * Math.PI * 2 + (rng() - 0.5) * 0.8;
    const k = r * (0.7 + rng() * 0.5);
    points.push({ x: cx + Math.cos(a) * k, y: cy + Math.sin(a) * k });
  }
  return { points };
}

/** A zig-zag from a point on a wall into the room, along `dir`. */
export function crack(rng: Rng, start: CellPoint, dir: CellPoint): DungeonCrack {
  const points: CellPoint[] = [start];
  let angle = Math.atan2(dir.y, dir.x);
  const base = angle;
  let p = start;
  const segments = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < segments; i++) {
    angle = base + (rng() - 0.5) * (Math.PI / 2);
    p = { x: p.x + Math.cos(angle) * 0.2, y: p.y + Math.sin(angle) * 0.2 };
    points.push(p);
  }
  return { points, width: 0.06 + rng() * 0.06 };
}

/** Rubble and cracks scattered over a room's floor. */
export function scatter(model: DungeonFloor, room: DungeonRoom, seed: number, stones: number, cracks: number): void {
  const rng = rngFrom(seed);
  for (let i = 0; i < stones; i++) {
    model.rubble.push(stone(rng, room.x + 0.3 + rng() * (room.w - 0.6), room.y + 0.3 + rng() * (room.h - 0.6)));
  }
  for (let i = 0; i < cracks; i++) {
    const side = Math.floor(rng() * 4);
    const t = 0.2 + rng() * 0.6;
    const starts: [CellPoint, CellPoint][] = [
      [{ x: room.x + t * room.w, y: room.y }, { x: 0, y: 1 }],
      [{ x: room.x + room.w, y: room.y + t * room.h }, { x: -1, y: 0 }],
      [{ x: room.x + t * room.w, y: room.y + room.h }, { x: 0, y: -1 }],
      [{ x: room.x, y: room.y + t * room.h }, { x: 1, y: 0 }],
    ];
    const [start, dir] = starts[side]!;
    model.cracks.push(crack(rng, start, dir));
  }
}
