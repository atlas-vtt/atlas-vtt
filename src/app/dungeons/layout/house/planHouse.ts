/**
 * The Haunted Mansion's own layout step: a house, not a dungeon (design 2026-10-25, research §5).
 * Lot and footprint first, then the stairs and chimney stacks that every floor keeps, a corridor
 * spine per floor, rooms cut into the bands beside it and typed by zone, doors and windows; a
 * cellar under the entrance floor one time in `CELLAR_CHANCE` where there are floors enough. Writes
 * the same planned floors the rest of the pipeline reads, its walls on cell edges.
 */

import { cellKey, cellsBox, doorCells, houseCells } from '../../geometry';
import { DRAWN_GROUNDS_KINDS } from '../../drawnKinds';
import type { CellDir, FiveRoomStage, DungeonDoor, DungeonRoom, DungeonStair, HouseGrounds } from '../../model';
import type { PlannedFloor } from '../../floors/planFloors';
import { type Rng, chance, floorStream, stream, weighted } from '../../rng';
import type { DungeonTag } from '../../tags';
import type { RoomTypeId } from '../../themes/roomTypes';
import { cutBands } from './houseBands';
import { houseDoors } from './houseDoors';
import { roomCells } from './houseEdges';
import { type HouseFrame, type WingId, houseFrame } from './houseFrame';
import { boxCells, inBoxes } from './houseGrid';
import { moveFloor } from './houseMove';
import { fiveRoomHouse } from './houseFiveRoom';
import { houseGrounds } from './houseGrounds';
import { houseLot } from './houseLot';
import { type HouseSize, houseParams, houseSize } from './houseParams';
import { houseStairs, type HouseStair } from './houseStairs';
import { buildStorey } from './houseStorey';
import { chooseStacks } from './houseStacks';
import { type Facade, entranceEdges, facadePeriod, houseFacade } from './houseFacade';
import { WindowFloor } from './houseWindows';
import { type TypedRoom, typeStorey } from './houseZones';
import { approachCells } from '../../floors/stairSpots';

/** How often a house of two floors or more has one of them as a cellar. */
export const CELLAR_CHANCE = 0.4;

export interface HousePlan {
  floors: PlannedFloor[];
  /** Floors under the entrance floor: the cellar's, the last index. */
  below: number;
}

/** The climax room's type where it stands: a ballroom on a house of one floor, a ritual room in an attic or cellar. */
function climaxType(rng: Rng, frame: HouseFrame, level: number): RoomTypeId {
  if (level < 0 || (frame.attic && level === frame.storeys - 1)) return 'ritual-room';
  if (level === 0) return weighted(rng, [['ballroom', 0.6], ['ritual-room', 0.4]]);
  return weighted(rng, [['master-bedroom', 0.55], ['ritual-room', 0.45]]);
}

/** Room 0 of a floor: where it is entered, by the front door, the main stair or the back stair. */
function entryFirst(rooms: TypedRoom[], level: number): TypedRoom[] {
  const role = level === 0 || level === 1 ? 'hall' : 'stair-hall';
  const first = rooms.find((r) => r.role === role) ?? rooms.find((r) => r.role === 'stair-hall') ?? rooms[0]!;
  const corridors = rooms.filter((r) => r !== first && r.kind === 'corridor');
  const others = rooms.filter((r) => r !== first && r.kind !== 'corridor' && r.servedBy === null);
  const served = rooms.filter((r) => r.servedBy !== null).map((r) => ({ ...r, servedBy: null as number | null, served: rooms[r.servedBy!]! }));
  const ordered: TypedRoom[] = [first, ...corridors, ...others];
  for (const s of served) ordered.push({ ...s, servedBy: ordered.indexOf(s.served) });
  return ordered;
}

/** The way a room is entered: from its corridor into a band room, along a corridor, from the front into the rest. */
function axisOf(room: TypedRoom): CellDir {
  const { box: b, toCorridor } = room;
  if (toCorridor) return { x: (0 - toCorridor.x) as CellDir['x'], y: (0 - toCorridor.y) as CellDir['y'] };
  if (room.kind === 'corridor') return b.w >= b.h ? { x: 1, y: 0 } : { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

function toRoom(room: TypedRoom & { stage?: FiveRoomStage }, id: number): DungeonRoom {
  const { box: b } = room;
  return {
    id,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    kind: room.kind,
    rotunda: false,
    wing: 'regular',
    group: id,
    parent: id === 0 ? null : 0,
    axis: axisOf(room),
    colonnade: false,
    boss: room.boss,
    ...(room.stage && { stage: room.stage }),
    ...(room.type && room.kind === 'room' && { type: room.type }),
    ...(room.notch && { cells: roomCells(room) }),
  };
}

/** Cells no door opens onto on a floor: every stairwell there and the row it is reached from. */
function blockedBy(stairs: readonly HouseStair[], level: number): Set<string> {
  const keys = new Set<string>();
  for (const s of stairs) {
    if (s.lower !== level && s.upper !== level) continue;
    const spot = { ...s.spot, to: 0, link: 0 };
    for (const c of [...boxCells(s.spot), ...approachCells(spot, s.upper === level ? 'upper' : 'lower')]) keys.add(cellKey(c.x, c.y));
  }
  return keys;
}

export function planHouse(seed: number, tags: ReadonlySet<DungeonTag>, count: number, boss: boolean, fiveRoom = false): HousePlan {
  const rng = stream(seed, 'layout', 'house');
  if (fiveRoom) return planFiveRoom(seed, rng, houseSize(tags));
  const cellar = count > 1 && chance(rng, CELLAR_CHANCE);
  const storeys = count - (cellar ? 1 : 0);
  const size = houseSize(tags);
  const frame = houseFrame(houseParams(rng, size, count), storeys, cellar);
  const ruined = tags.has('ruined') ? ruinWing(rng, frame) : null;
  const cut = cutBands(stream(seed, 'layout', 'house:bands'), frame, size);
  const levels = [...Array.from({ length: storeys }, (_, k) => k), ...(cellar ? [-1] : [])];
  const indexOf = (level: number): number => (level < 0 ? count - 1 : level);
  const climaxLevel = !boss ? null : cellar && chance(rng, 0.5) ? -1 : storeys - 1;
  const climax = climaxLevel === null ? null : climaxType(rng, frame, climaxLevel);
  const stairs = houseStairs(frame, levels);
  const period = facadePeriod(rng);
  const floors: PlannedFloor[] = [];
  const lit = new Map<number, WindowFloor>();
  let facade: Facade | null = null;
  let link = 0;
  const links = stairs.map(() => link++);
  const planned = levels.map((level) => {
    const storey = buildStorey(frame, cut, level);
    const typed = typeStorey({
      rng: floorStream(seed, 'rooms', indexOf(level), 'house'),
      storey,
      climax: level === climaxLevel ? climax : null,
      master: level === 1 && climax !== 'master-bedroom',
      cellar,
      dining: { x: frame.hall.x + frame.hall.w, y: frame.hall.y, w: 1, h: 1 },
      servery: frame.baizeX < frame.width,
      ruined,
    });
    return { level, storey, typed };
  });
  // The places no stack is built on stay the rooms' floor; rooms keep the types they were given with every place cut.
  const built = chooseStacks(frame, cut, planned.map((p) => p.typed));
  for (const { storey, typed } of planned) {
    storey.stacks = storey.stacks.filter((s) => built.has(s));
    for (const r of typed) if (r.notch && !built.has(r.notch)) r.notch = null;
  }
  for (const { level, storey, typed } of planned) {
    const rooms = entryFirst(typed, level);
    const inHouse = inBoxes([...rooms.map((r) => r.box), ...storey.stacks]);
    const doors = houseDoors({ frame, rooms, blocked: blockedBy(stairs, level), inHouse, ground: level === 0 });
    const own: DungeonStair[] = stairs.flatMap((s, k) => (s.lower === level || s.upper === level ? [{ ...s.spot, to: indexOf(s.lower === level ? s.upper : s.lower), link: links[k]! }] : []));
    facade ??= groundFacade(frame, rooms, doors, inHouse, period);
    // A floor's windows stand over the windows below; a cellar's under the ground floor's.
    const neighbour = lit.get(level > 0 ? level - 1 : 0);
    const windows = new WindowFloor({ frame, facade, kind: storey.kind, rooms, doors, inHouse, lined: neighbour?.linedKeys() ?? new Set() });
    windows.place();
    lit.set(level, windows);
    floors[indexOf(level)] = { rooms: rooms.map(toRoom), doors, stairs: own, house: { walls: 'edges', windows: windows.windows, stacks: storey.stacks.map((s) => ({ ...s })) } };
    // A window the floor below lacks stands over a window there too, down the house, where the room below takes it.
    for (const window of windows.windows) {
      if (window.size === 'tall') continue;
      for (let under = level - 1; under >= 0; under--) {
        const below = lit.get(under)!;
        if (below.lined(window) || !below.takeFromAbove(window)) break;
      }
    }
  }
  return settled(seed, size, floors, !frame.symmetric && chance(rng, 0.5) ? frame.width : null, cellar ? 1 : 0);
}

/**
 * The grounds round the ground floor, by the map's size: the lot, its boundary and gate, the way to
 * the porch, outbuildings, garden; only the kinds that have a drawing are kept (`drawnKinds.ts`).
 */
function groundsOf(seed: number, size: HouseSize, ground: PlannedFloor, front: DungeonDoor): HouseGrounds {
  const keys = houseCells({ rooms: ground.rooms, stacks: ground.house?.stacks });
  // Stacks stand inside the house: its rooms alone reach its edges.
  const around = cellsBox(ground.rooms.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w - 1, y: r.y + r.h - 1 }]));
  const rng = stream(seed, 'layout', 'house:grounds');
  const lot = houseLot(rng, size, around, doorCells(front));
  // The garden door leads out of the back of the house, towards −y.
  const garden = ground.doors.find((d) => d.from === null && d.dir.y === 1) ?? null;
  const gardenCells = garden && doorCells(garden);
  const grounds = houseGrounds(rng, size, lot, keys, around, true, gardenCells && { x: Math.min(...gardenCells.map((c) => c.x)), y: garden.y, width: gardenCells.length });
  return { lot: grounds.lot, pieces: grounds.pieces.filter((piece) => DRAWN_GROUNDS_KINDS.has(piece.kind)) };
}

/**
 * A ruin's fallen wing (research §5.8): one of the wings off the main range lost its roof, so no floor
 * stands above its ground floor; a block's west end lies collapsed under a roof that held.
 */
function ruinWing(rng: Rng, frame: HouseFrame): WingId {
  const wings = frame.wings.filter((w) => w.id !== 'main');
  if (wings.length === 0) return 'main';
  const fallen = wings[Math.floor(rng() * wings.length)]!;
  fallen.storeys = 1;
  return fallen.id;
}

/** The floors with their grounds, mirrored where `mirror` gives the width to mirror over, and shifted so the front door's outside cell is (0, 0). */
function settled(seed: number, size: HouseSize, floors: PlannedFloor[], mirror: number | null, below: number): HousePlan {
  const front = floors[0]!.doors.find((d) => d.from === null)!;
  floors[0]!.house!.grounds = groundsOf(seed, size, floors[0]!, front);
  const shift = { x: -(mirror === null ? front.x : mirror - 1 - front.x), y: -front.y };
  return { floors: floors.map((floor) => moveFloor({ mirror, shift }, floor)), below };
}

/** The facades of a house, from its ground floor. */
function groundFacade(frame: Pick<HouseFrame, 'width' | 'symmetric'>, rooms: readonly TypedRoom[], doors: readonly DungeonDoor[], inHouse: (x: number, y: number) => boolean, period: number): Facade {
  return houseFacade({ frame, inHouse, cells: rooms.flatMap((r) => roomCells(r)), entrances: entranceEdges(doors), period });
}

/** A five-room dungeon as a house of one floor (`houseFiveRoom.ts`). */
function planFiveRoom(seed: number, rng: Rng, size: HouseSize): HousePlan {
  const house = fiveRoomHouse(rng);
  const inHouse = inBoxes(house.rooms.map((r) => r.box));
  const frame = { width: house.width, symmetric: false };
  const windows = new WindowFloor({ frame, facade: groundFacade(frame, house.rooms, house.doors, inHouse, facadePeriod(rng)), kind: 'ground', rooms: house.rooms, doors: house.doors, inHouse, lined: new Set() });
  windows.place();
  const floor: PlannedFloor = { rooms: house.rooms.map(toRoom), doors: house.doors, stairs: [], house: { walls: 'edges', windows: windows.windows, stacks: [] } };
  return settled(seed, size, [floor], chance(rng, 0.5) ? house.width : null, 0);
}
