import { describe, expect, it } from 'vitest';
import { planFloors } from '../../../../src/app/dungeons/floors/planFloors';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { cellKey, doorCells, floorRect, inRect } from '../../../../src/app/dungeons/geometry';
import { CaveGrid } from '../../../../src/app/dungeons/layout/cavern/caveGrid';
import { caveParams } from '../../../../src/app/dungeons/layout/cavern/caveParams';
import { claimLane, laneEnds, mainRoute, wideLane } from '../../../../src/app/dungeons/layout/cavern/mainPath';
import { holdNecks } from '../../../../src/app/dungeons/layout/cavern/necks';
import type { CellPoint, DungeonDoor, DungeonFloor, DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import { dungeonParams, dungeonTags } from '../../../../src/app/dungeons/params';
import { rngFrom } from '../../../../src/app/dungeons/rng';

/**
 * A crawl, a squeeze or a letterbox is a neck of the cave's own rock, measured apart from the
 * generator on 200 caves: one floor cell across at its door, and where a passage runs on along the
 * way one cell across the row either side too and at most two the row after; a chamber gives up the
 * cells beside the one before the door where it can spare them; a walk holds no neck; and every
 * room of every floor is still reached.
 */

const TAGS: readonly string[][] = [[], ['wet'], ['large'], ['small'], ['winding'], ['dry'], ['spacious'], ['cramped']];
const NARROW = new Set(['crawl', 'squeeze', 'letterbox']);

function caves(count: number): DungeonModel[] {
  return Array.from({ length: count }, (_, k) => generateDungeon({ seed: 5_003 + k * 7_919, theme: 'cavern', tags: TAGS[k % TAGS.length]!, floors: 1 + (k % 2) }));
}

const key = (c: CellPoint): string => cellKey(c.x, c.y);

/** A door's cells by how far they lie along its way (`t`) and across it (`j`). */
const neckCell = (door: DungeonDoor) => (t: number, j: number): CellPoint => ({ x: door.x + t * door.dir.x + j * door.dir.y, y: door.y + t * door.dir.y + j * door.dir.x });

/** Whether the way runs on along the room past the door: a passage grown along the way, the door in its end wall. */
const runsOn = (room: DungeonRoom, door: DungeonDoor, approach: CellPoint): boolean =>
  room.kind !== 'room' && (room.axis.x !== 0) === (door.dir.x !== 0) && inRect(floorRect(room), approach.x, approach.y);

interface Side {
  where: string;
  room: DungeonRoom;
  /** How many cells across the side's floor runs at `t` along the way, through the way's line: the room's own (in the door's row, the door's and its two rooms'). */
  across: (t: number) => number;
  /** Whether a cell of the main path stands beside the way's line `t` along it. */
  laneBeside: (t: number) => boolean;
  /** Whether a cell of the main path beside the way's line `t` along it lies beside another door's cell: where the path crosses the next wall at once. */
  laneCrosses: (t: number) => boolean;
  door: DungeonDoor;
  onLane: boolean;
  side: number;
}

/** Every side of every narrow way of the floor. */
function necksOf(floor: DungeonFloor, name: string): { doors: { door: DungeonDoor; across: (t: number) => number; where: string }[]; sides: Side[] } {
  const owner = new Map<string, number>();
  for (const room of floor.rooms) for (const c of room.cells ?? []) owner.set(key(c), room.id);
  const lane = new Set((floor.cave?.lane ?? []).map(key));
  const doors = floor.doors.filter((d) => d.kind === 'opening' && d.from !== null && d.to !== null && NARROW.has(d.way ?? 'walk'));
  const otherDoorCells = (door: DungeonDoor): Set<string> => new Set(floor.doors.filter((d) => d !== door && d.kind !== 'secret').flatMap((d) => doorCells(d).map(key)));
  const sides: Side[] = [];
  const out = doors.map((door) => {
    const cell = neckCell(door);
    const where = `${name} ${door.way} at ${key(door)}`;
    const across = (t: number): number => {
      const room = t < 0 ? door.from : door.to;
      const own = (c: CellPoint): boolean => (t === 0 ? (c.x === door.x && c.y === door.y) || [door.from, door.to].includes(owner.get(key(c)) ?? -1) : owner.get(key(c)) === room);
      if (!own(cell(t, 0))) return 0;
      let n = 1;
      for (const s of [-1, 1]) for (let j = 1; own(cell(t, s * j)); j++) n++;
      return n;
    };
    const laneBeside = (t: number): boolean => [-1, 1].some((j) => lane.has(key(cell(t, j))));
    const laneCrosses = (t: number): boolean =>
      [-1, 1].some((j) => {
        const c = cell(t, j);
        return lane.has(key(c)) && ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => otherDoorCells(door).has(cellKey(c.x + dx, c.y + dy)));
      });
    const onLane = lane.has(key(door));
    for (const side of [-1, 1]) sides.push({ where: `${where} side ${side}`, room: floor.rooms[(side < 0 ? door.from : door.to)!]!, across, laneBeside, laneCrosses, door, onLane, side });
    return { door, across, where };
  });
  return { doors: out, sides };
}

/**
 * How many cells across the floor runs through the door's row (`t` 0), or the row `t` along the way,
 * counting every floor there is: any room's cells and every open door's.
 */
function crossSection(floor: DungeonFloor, door: DungeonDoor, t: number): number {
  const open = new Set([...floor.rooms.flatMap((room) => (room.cells ?? []).map(key)), ...floor.doors.filter((d) => d.kind !== 'secret').flatMap((d) => doorCells(d).map(key))]);
  const cell = neckCell(door);
  if (!open.has(key(cell(t, 0)))) return 0;
  let n = 1;
  for (const s of [-1, 1]) for (let j = 1; open.has(key(cell(t, s * j))); j++) n++;
  return n;
}

/** Whether every room with cells is reached over the floor from the first: rooms, narrows and hidden crawls alike. */
function allReached(floor: DungeonFloor): boolean {
  const owner = new Map<string, number>();
  for (const room of floor.rooms) for (const c of room.cells ?? []) owner.set(key(c), room.id);
  const cells = new Set([...owner.keys(), ...floor.doors.flatMap((d) => doorCells(d).map(key))]);
  const [first] = owner.keys();
  if (first === undefined) return true;
  const seen = new Set([first]);
  const queue = [first];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!.split(',').map(Number) as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = cellKey(x + dx, y + dy);
      if (cells.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return floor.rooms.every((room) => (room.cells ?? []).length === 0 || seen.has(key(room.cells![0]!)));
}

describe('the necks of the narrow ways', () => {
  const all = caves(200).flatMap((model) => model.floors.map((floor, index) => ({ floor, name: `seed ${model.seed} floor ${index}` })));
  const necks = all.map(({ floor, name }) => necksOf(floor, name));
  const doors = necks.flatMap((n) => n.doors);
  const sides = necks.flatMap((n) => n.sides);

  it('stand one cell across in the door’s row, the rock either side', () => {
    expect(doors.length).toBeGreaterThan(1_000);
    expect(doors.filter((d) => d.across(0) !== 1).map((d) => d.where)).toEqual([]);
  });

  it('stand one floor cell across at the door, and before it on a chamber’s side, without exception: a chamber that cannot give up the cells gives up the way', () => {
    const wide = all.flatMap(({ floor, name }) =>
      floor.doors
        .filter((d) => d.kind === 'opening' && d.from !== null && d.to !== null && NARROW.has(d.way ?? 'walk'))
        .flatMap((door) => {
          const chamberSides = [-1, 1].filter((side) => floor.rooms[(side < 0 ? door.from : door.to)!]?.kind === 'room');
          return [0, ...chamberSides].filter((t) => crossSection(floor, door, t) !== 1).map((t) => `${name} ${door.way} at ${key(door)} row ${t}: ${crossSection(floor, door, t)} across`);
        }),
    );
    expect(wide).toEqual([]);
  });

  it('cut a passage that runs on to one cell either side of the door and to two the row after', () => {
    const passages = sides.filter((s) => runsOn(s.room, s.door, neckCell(s.door)(s.side, 0)));
    expect(passages.length).toBeGreaterThan(500);
    // The main path keeps its two cells past a neck it does not pass, and through a pinch where it crosses the next wall at once.
    const wide = passages.filter((s) => s.across(s.side) !== 1 && (s.onLane ? !s.laneCrosses(s.side) : !s.laneBeside(s.side))).map((s) => s.where);
    expect(wide).toEqual([]);
    const tapering = passages.filter((s) => inRect(floorRect(s.room), neckCell(s.door)(2 * s.side, 0).x, neckCell(s.door)(2 * s.side, 0).y));
    expect(tapering.filter((s) => s.across(2 * s.side) > 2 && !s.laneBeside(2 * s.side) && !s.laneBeside(s.side)).map((s) => s.where)).toEqual([]);
  });

  it('take the cells beside the one before the door from a chamber that can spare them', () => {
    const chambers = sides.filter((s) => s.room.kind === 'room' && (s.onLane || !s.laneBeside(s.side)));
    const one = chambers.filter((s) => s.across(s.side) === 1).length;
    console.log(`${chambers.length} chamber sides of narrow ways: ${((100 * one) / chambers.length).toFixed(1)} % one cell across before the door`);
    // A chamber three cells deep needs that row for its 3 × 3 block, and one with several narrow ways may spare only some.
    expect(one / chambers.length).toBeGreaterThan(0.75);
  });

  it('leave every room of every floor reached', () => {
    expect(all.filter(({ floor }) => !allReached(floor)).map(({ name }) => name)).toEqual([]);
  });

  it('are never held round a walk', () => {
    for (let k = 1; k <= 30; k++) {
      const seed = k * 4_391;
      const params = caveParams(dungeonParams(dungeonTags(seed, TAGS[k % TAGS.length]!)));
      for (const [index, planned] of planFloors(seed, params, 1, true).entries()) {
        const floor = { ...planned, doors: planned.doors.map((door) => ({ ...door, way: 'walk' as const, width: 10 })) };
        const grid = new CaveGrid(floor, index);
        const [from, to] = laneEnds(index, 1, floor, true);
        const route = mainRoute(floor, from, to);
        const lane = wideLane(grid, floor, route, from, to) ?? [];
        claimLane(grid, floor, route, lane);
        holdNecks(rngFrom(seed), grid, floor, new Set(lane.map(key)), new Set());
        const { x0, y0, w, h } = grid.box();
        let held = 0;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (grid.heldAsRock(x, y)) held++;
        expect(held, `seed ${seed} floor ${index}`).toBe(0);
      }
    }
  });
});
