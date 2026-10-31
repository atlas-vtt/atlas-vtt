import { beforeAll, describe, expect, it, vi } from 'vitest';
import { floorCellsOf } from '../../../../src/app/dungeons/geometry';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonRoom } from '../../../../src/app/dungeons/model';
import { doorApproaches } from '../../../../src/app/dungeons/floors/stairSpots';
import { LIVED_IN } from '../../../../src/app/dungeons/themes/cavern/formations';
import type { GreatPattern } from '../../../../src/app/dungeons/terrain/cavern/greatChambers';
import { formationProblems, laneProblems, rimstoneProblems, waterProblems } from '../caveRules';
import { cellProblems, routeProblems, walkable } from '../terrainInvariants';
import { mirrorProblems, physicsProblems } from '../themeTerrainInvariants';

/** What the great chambers' pass chose, and a switch that leaves it out, so a chamber is compared with itself without its interior. */
const pass = vi.hoisted(() => ({ off: false, chosen: [] as { floor: number; room: number; patterns: string[] }[] }));

vi.mock('../../../../src/app/dungeons/terrain/cavern/greatChambers', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../src/app/dungeons/terrain/cavern/greatChambers')>();
  return {
    ...original,
    placeGreatChambers: (...args: Parameters<typeof original.placeGreatChambers>): Map<number, GreatPattern[]> => {
      if (pass.off) return new Map();
      const out = original.placeGreatChambers(...args);
      for (const [room, patterns] of out) pass.chosen.push({ floor: args[1], room, patterns });
      return out;
    },
  };
});

const TAG_SETS = [[], ['large'], ['spacious'], ['wet', 'winding'], ['flooded', 'spacious'], ['lava', 'deep', 'large'], ['acid', 'large'], ['cramped', 'dry'], ['inhabited', 'wet', 'large']];
const SEEDS = 200;
const GREAT = new Set(['hall', 'gargantuan']);

interface Run {
  seed: number;
  model: DungeonModel;
  bare: DungeonModel;
  chosen: { floor: number; room: number; patterns: string[] }[];
}

/** The pieces and props in a room. */
function filling(floor: DungeonFloor, room: number): number {
  return floor.terrain.filter((p) => p.room === room).length + floor.props.filter((p) => p.room === room).length;
}

/** Whether a hall or gargantuan chamber is one the pass builds: no arena or stage, nobody's home. */
function isGreat(room: DungeonRoom): boolean {
  return room.kind === 'room' && GREAT.has(room.tier ?? '') && !room.boss && !room.stage && !LIVED_IN.has(room.type ?? '');
}

/** The share of a room's floor no piece of terrain (but the water lying over it) and no formation stands on. */
function freeShare(floor: DungeonFloor, room: DungeonRoom): number {
  const own = new Set(floorCellsOf(room).map((c) => `${c.x},${c.y}`));
  const used = new Set<string>();
  for (const p of floor.terrain) if (p.room === room.id && p.kind !== 'shallow-water') for (const c of p.cells) used.add(`${c.x},${c.y}`);
  for (const p of floor.props) if (p.room === room.id) used.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);
  return 1 - [...used].filter((k) => own.has(k)).length / own.size;
}

/** The cells before a room's doors and onto its stairs that cannot reach each other over the room's walkable floor. */
function cutLanes(floor: DungeonFloor, room: DungeonRoom): string[] {
  const open = walkable(floor);
  const own = new Set(floorCellsOf(room).map((c) => `${c.x},${c.y}`));
  const needed = doorApproaches(room, floor.doors).filter((c) => own.has(`${c.x},${c.y}`));
  const first = needed[0];
  if (!first) return [];
  const seen = new Set([`${first.x},${first.y}`]);
  const queue: CellPoint[] = [first];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const n = { x: at.x + d.x, y: at.y + d.y };
      const key = `${n.x},${n.y}`;
      if (own.has(key) && open.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push(n);
      }
    }
  }
  return needed.filter((c) => !seen.has(`${c.x},${c.y}`)).map((c) => `room ${room.id}: the way to ${c.x},${c.y} is cut`);
}

describe('a cave’s great chambers', () => {
  const runs: Run[] = [];

  beforeAll(() => {
    for (let k = 1; k <= SEEDS; k++) {
      const seed = k * 4973 + 11;
      const request = { seed, theme: 'cavern' as const, tags: TAG_SETS[k % TAG_SETS.length]!, floors: 1 + (k % 3) };
      pass.chosen = [];
      pass.off = false;
      const model = generateDungeon(request);
      const chosen = pass.chosen;
      pass.off = true;
      const bare = generateDungeon(request);
      pass.off = false;
      runs.push({ seed, model, bare, chosen });
    }
  }, 300_000);

  const each = (problems: (run: Run) => string[]): string[] => runs.flatMap((run) => problems(run).map((p) => `seed ${run.seed}: ${p}`));
  const greats = (run: Run): { f: number; room: DungeonRoom }[] => run.model.floors.flatMap((floor, f) => floor.rooms.filter(isGreat).map((room) => ({ f, room })));

  it('fills every hall and gargantuan chamber with at least six pieces beyond its type’s own', () => {
    expect(runs.reduce((n, run) => n + greats(run).length, 0)).toBeGreaterThan(100);
    expect(each((run) => greats(run).flatMap(({ f, room }) => {
      const added = filling(run.model.floors[f]!, room.id) - filling(run.bare.floors[f]!, room.id);
      return added >= 6 ? [] : [`floor ${f} ${room.tier} ${room.type} ${room.id}: ${added} pieces added`];
    }))).toEqual([]);
  });

  it('leaves at least two fifths of every great chamber’s floor free', () => {
    expect(each((run) => greats(run).flatMap(({ f, room }) => {
      const free = freeShare(run.model.floors[f]!, room);
      return free >= 0.4 ? [] : [`floor ${f} room ${room.id}: ${free.toFixed(2)} free`];
    }))).toEqual([]);
  });

  it('builds every interior somewhere, a gargantuan chamber sometimes two', () => {
    const patterns = new Set(runs.flatMap((run) => run.chosen.flatMap((c) => c.patterns)));
    expect([...patterns].sort()).toEqual(['boulders', 'breakdown', 'columns', 'forest', 'lake', 'ring']);
    expect(runs.some((run) => run.chosen.some((c) => c.patterns.length === 2))).toBe(true);
  });

  it('keeps the lane and every way between a chamber’s doors open', () => {
    expect(each((run) => run.model.floors.flatMap((floor) => [...laneProblems(floor), ...routeProblems(floor), ...cellProblems(floor), ...floor.rooms.filter(isGreat).flatMap((room) => cutLanes(floor, room))]))).toEqual([]);
  });

  it('keeps the cave’s rules: formations where they form, rimstone by water, water where it gathers, nothing mirrored, no hole by water', () => {
    expect(each((run) => [...formationProblems(run.model), ...rimstoneProblems(run.model), ...waterProblems(run.model), ...mirrorProblems(run.model), ...physicsProblems(run.model)])).toEqual([]);
  });
});
