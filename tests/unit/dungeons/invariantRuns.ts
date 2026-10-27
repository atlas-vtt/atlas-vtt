import { describe, expect, it } from 'vitest';
import { stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import type { ThemeId } from '../../../src/app/dungeons/themes/themeTypes';
import { doorProblems, floorProblems, independentLoops, loopProblems, normals, rotundaProblems, secretProblems, unreachableRooms } from './dungeonInvariants';
import { connectionProblems, entranceProblems, riseProblems, stairProblems, storeyProblems, withinShare } from './floorsInvariants';
import { physicsProblems } from './themeTerrainInvariants';
import { holeProblems } from './holeInvariants';
import { blockedCells, bridgeProblems, cellProblems, clearanceProblems, isHazard, routeProblems, stairClearanceProblems } from './terrainInvariants';
import { coverProblems } from './coverInvariants';
import { timeBound } from '../../helpers/timeBound';

/**
 * Every rule of the generator, held over many dungeons of one floor count: 1,000 seeds, each with
 * two of the tag sets below, so each floor count meets every set over two hundred seeds. Runs
 * rotate the theme over Fortress and Cavern; a Haunted Mansion is a house, held by the house rules.
 */

const SEEDS = 1000;
const TAG_SETS: readonly string[][] = [
  [],
  ['small'],
  ['large'],
  ['medium', 'ordered', 'colonnades', 'overgrown'],
  ['chaotic', 'winding', 'wet'],
  ['string', 'deep', 'flooded'],
  ['secret', 'round', 'overgrown'],
  ['no-secrets', 'square', 'flat', 'dry', 'compact'],
  ['cramped', 'crumbling', 'large'],
];
// A Haunted Mansion is a house, held by its own rules (`house/houseInvariants.test.ts`).
const THEMES: readonly ThemeId[] = ['fortress', 'cavern'];
const RANGES: Record<string, [number, number]> = { small: [3, 6], medium: [6, 12], large: [12, 25], '': [6, 15] };

export interface Run {
  seed: number;
  tags: string[];
  model: DungeonModel;
  ms: number;
}

function runsOf(floors: number): Run[] {
  const out: Run[] = [];
  for (let k = 1; k <= SEEDS; k++) {
    const seed = k * 7919 + floors;
    for (const offset of [0, 4]) {
      const tags = TAG_SETS[(k + offset) % TAG_SETS.length] ?? [];
      // The theme turns once per round of tag sets, so every theme meets every set.
      const theme = THEMES[Math.floor((k + offset) / TAG_SETS.length) % THEMES.length];
      const start = performance.now();
      const model = generateDungeon({ seed, tags, floors, theme });
      out.push({ seed, tags, model, ms: performance.now() - start });
    }
  }
  return out;
}

export function describeInvariants(floors: number): void {
  const runs = runsOf(floors);
  const failures = (check: (run: Run) => string[]): string[] =>
    runs.flatMap((run) => check(run).map((problem) => `seed ${run.seed} [${run.tags.join(',')}]: ${problem}`)).slice(0, 10);
  const eachFloor = (check: (run: Run, index: number) => string[]) => (run: Run): string[] =>
    run.model.floors.flatMap((_, index) => check(run, index).map((problem) => `floor ${index}: ${problem}`));
  const has = (run: Run, tag: string): boolean => run.model.tags.includes(tag);
  // Typed rooms are held by their recipes (generateThemes.*.test.ts, cave/caveRules.ts).
  const caverns = runs.filter((run) => run.model.theme === 'cavern');

  describe(`generated dungeons of ${floors} floor${floors > 1 ? 's' : ''}`, () => {
    it('have as many floors as asked for, the deeper the fewer rooms, never fewer than three', () => {
      expect(failures((run) => (run.model.floors.length === floors ? [] : [`${run.model.floors.length} floors`]))).toEqual([]);
      expect(failures(eachFloor((run, i) => (normals(run.model.floors[i]!).length >= 3 ? [] : ['fewer than three rooms'])))).toEqual([]);
      const mean = (i: number): number => runs.reduce((sum, run) => sum + normals(run.model.floors[i]!).length, 0) / runs.length;
      for (let i = 1; i < floors; i++) expect(mean(i)).toBeLessThan(mean(i - 1));
    });

    it('never overlap floors within a floor, and every floor stays clear of other rooms’ walls', () => {
      expect(failures(eachFloor((run, i) => [...floorProblems(run.model.floors[i]!), ...rotundaProblems(run.model.floors[i]!)]))).toEqual([]);
    });

    it('put every door in the wall between its two rooms, or an entrance in an outer wall of the entry floor', () => {
      expect(failures(eachFloor((run, i) => doorProblems(run.model.floors[i]!, i === 0)))).toEqual([]);
    });

    it('can be walked from where each floor is entered to every room', () => {
      expect(failures(eachFloor((run, i) => unreachableRooms(run.model.floors[i]!).map((id) => `room ${id} unreachable`)))).toEqual([]);
    });

    it('run a loop through the way to the farthest room, about one loop per eight rooms', () => {
      expect(failures(eachFloor((run, i) => loopProblems(run.model.floors[i]!)))).toEqual([]);
      const floorsOf = runs.flatMap((run) => run.model.floors);
      const loops = floorsOf.reduce((sum, floor) => sum + independentLoops(floor), 0);
      const wanted = floorsOf.reduce((sum, floor) => sum + normals(floor).length / 8, 0);
      expect(loops / wanted).toBeGreaterThan(0.7);
      expect(loops / wanted).toBeLessThan(1.6);
    });

    it('open the entry floor at (0, 0), and from six rooms by a second, less obvious way', () => {
      expect(failures((run) => entranceProblems(run.model))).toEqual([]);
    });

    it('hide nothing a party needs behind a secret door', () => {
      expect(failures(eachFloor((run, i) => secretProblems(run.model.floors[i]!)))).toEqual([]);
    });

    it('join floors by stairwells that line up, in rooms that stay passable', () => {
      expect(failures((run) => stairProblems(run.model))).toEqual([]);
      if (floors === 1) expect(runs.every((run) => run.model.floors[0]!.stairs.length === 0)).toBe(true);
    });

    it('stack Fortress and Mansion floors upward', () => {
      expect(failures((run) => riseProblems(run.model))).toEqual([]);
    });

    it('stand every storey of a Fortress or Mansion within the outer walls of the floor below', () => {
      expect(failures((run) => storeyProblems(run.model))).toEqual([]);
    });

    it("keep every later floor within the earlier floor's walls plus two cells where it can", () => {
      if (floors === 1) return;
      for (const theme of THEMES) expect(withinShare(runs.filter((run) => run.model.theme === theme).map((run) => run.model)), theme).toBeGreaterThan(0.8);
    });

    it('join floors by two stairwells far apart where both have six rooms or more', () => {
      expect(failures((run) => connectionProblems(run.model))).toEqual([]);
    });

    it('have the entry floor as large as its size tag asks', () => {
      expect(
        failures((run) => {
          const size = ['small', 'medium', 'large'].find((s) => run.tags.includes(s)) ?? '';
          const [min, max] = RANGES[size]!;
          const count = normals(run.model.floors[0]!).length;
          return count < min || count > max ? [`${count} normal rooms, not ${min}–${max}`] : [];
        }),
      ).toEqual([]);
    });

    it('keep to their tags: strings unbranched, dry dry, flat flat, square square, secretless open', () => {
      expect(
        failures(eachFloor((run, i) => {
          const floor = run.model.floors[i]!;
          const problems: string[] = [];
          if (has(run, 'string') && floor.rooms.some((room) => floor.rooms.filter((r) => r.parent === room.id).length > 1)) problems.push('a string branches');
          if (has(run, 'dry') && floor.waterCells.length > 0) problems.push('water');
          if (has(run, 'flat') && floor.doors.some((door) => door.kind === 'steps')) problems.push('steps');
          if (has(run, 'square') && floor.rooms.some((room) => room.rotunda)) problems.push('rotunda');
          if (has(run, 'no-secrets') && floor.doors.some((door) => door.kind === 'secret')) problems.push('secret door');
          if (floor.rooms.some((r) => r.rotunda && (r.w !== r.h || r.kind !== 'room'))) problems.push('a round room that is not square');
          return problems;
        })),
      ).toEqual([]);
    });

    it('make one boss room on the floor furthest from the entrance: the farthest dead end there, larger than the rooms around it, reached from one room', () => {
      expect(
        failures((run) => {
          const deepest = run.model.floors.length - 1;
          const problems: string[] = [];
          run.model.floors.forEach((floor, i) => {
            const bosses = floor.rooms.filter((room) => room.boss);
            if (bosses.length !== (i === deepest ? 1 : 0)) problems.push(`floor ${i}: ${bosses.length} boss rooms`);
            for (const boss of bosses) {
              if (boss.kind !== 'room' || boss.wing !== 'regular' || floor.stairs.some((s) => s.x >= boss.x && s.x < boss.x + boss.w && s.y >= boss.y && s.y < boss.y + boss.h)) problems.push('a boss room that is no plain room');
              const before = new Set(floor.doors.filter((d) => d.to === boss.id || d.from === boss.id).map((d) => (d.to === boss.id ? d.from : d.to)));
              if (before.size !== 1 || before.has(null)) problems.push(`boss room entered from ${[...before].join(', ')}`);
            }
          });
          return problems;
        }),
      ).toEqual([]);
      const bosses = runs.map((run) => run.model.floors.at(-1)!).map((floor) => {
        const boss = floor.rooms.find((room) => room.boss)!;
        const others = normals(floor).filter((room) => !room.boss);
        const mean = others.reduce((sum, room) => sum + room.w * room.h, 0) / Math.max(1, others.length);
        return boss.w * boss.h > mean;
      });
      // Measured 0.8475 over four floors once Fortresses and Mansions rise (their upper floors grow from the other stair end).
      expect(bosses.filter(Boolean).length / bosses.length).toBeGreaterThan(0.84);
      const without = generateDungeon({ seed: 5, tags: [], floors, bossRoom: false });
      expect(without.floors.some((floor) => floor.rooms.some((room) => room.boss))).toBe(false);
    });

    it('let the tags show', () => {
      const shareIn = (among: readonly Run[], tag: string, check: (model: DungeonModel) => boolean): number => {
        const tagged = among.filter((run) => has(run, tag));
        return tagged.filter((run) => check(run.model)).length / tagged.length;
      };
      const share = (tag: string, check: (model: DungeonModel) => boolean): number => {
        const tagged = runs.filter((run) => has(run, tag));
        return tagged.filter((run) => check(run.model)).length / tagged.length;
      };
      const anyFloor = (model: DungeonModel, check: (floor: DungeonModel['floors'][number]) => boolean): boolean => model.floors.some(check);
      expect(share('secret', (m) => anyFloor(m, (f) => f.doors.some((d) => d.kind === 'secret')))).toBeGreaterThan(0.7);
      // A cave's chambers are never round: the tag shows in the built theme.
      expect(shareIn(runs.filter((run) => run.model.theme !== 'cavern'), 'round', (m) => anyFloor(m, (f) => f.rooms.some((r) => r.rotunda)))).toBeGreaterThan(0.5);
      // A built theme's water stands only in the rooms that hold it.
      expect(shareIn(caverns, 'flooded', (m) => anyFloor(m, (f) => f.waterCells.length > 0))).toBeGreaterThan(0.9);
      expect(share('deep', (m) => anyFloor(m, (f) => f.doors.some((d) => d.kind === 'steps')))).toBeGreaterThan(0.5);
    });

    it('stand nothing on a platform, a ledge or a dais: no seat names what a room is for', () => {
      expect(failures(eachFloor((run, i) => {
        const floor = run.model.floors[i]!;
        const raised = new Set(floor.terrain.filter((p) => p.kind === 'platform' || p.kind === 'ledge').flatMap((p) => p.cells.map((c) => `${c.x},${c.y}`)));
        const daises = floor.props.filter((p) => p.kind === 'dais');
        return floor.props.filter((p) => p.kind !== 'dais').flatMap((p) => {
          const onRaised = raised.has(`${Math.floor(p.x)},${Math.floor(p.y)}`);
          const onDais = daises.some((d) => d.room === p.room && Math.hypot(d.x - p.x, d.y - p.y) < 1.2 * d.scale);
          return onRaised || onDais ? [`a ${p.kind} on ${onRaised ? 'raised ground' : 'a dais'}`] : [];
        });
      }))).toEqual([]);
    });

    it('lay terrain on whole cells of one room each, never on doors, stairwells or the cells they are reached from', () => {
      expect(failures(eachFloor((run, i) => [...cellProblems(run.model.floors[i]!), ...clearanceProblems(run.model.floors[i]!, i, stackOf(run.model))]))).toEqual([]);
    });

    it('keep holes and molten channels clear of standing water', () => {
      expect(failures((run) => physicsProblems(run.model))).toEqual([]);
    });

    it('keep stairwells clear of hazards, bridges and water, on them and beside them', () => {
      expect(failures(eachFloor((run, i) => stairClearanceProblems(run.model.floors[i]!, i, stackOf(run.model))))).toEqual([]);
    });

    // Walking every floor of a thousand dungeons takes a while beside the whole suite.
    it('keep a way through every floor that steps into no hazard, cover or hole, and bridge what they lay across a room', () => {
      expect(failures(eachFloor((run, i) => [...routeProblems(run.model.floors[i]!), ...bridgeProblems(run.model.floors[i]!)]))).toEqual([]);
    }, 60_000);

    it('open holes only over rooms of the floors below, down to rubble or a bottomless void', () => {
      expect(failures((run) => holeProblems(run.model))).toEqual([]);
      if (floors === 1) expect(runs.every((run) => run.model.floors[0]!.terrain.every((p) => !p.opening || p.opening.bottom === null))).toBe(true);
      else {
        // Typed rooms open holes only for a reason of their type: a cave's shafts where it holds a stairwell.
        const share = (check: (run: Run) => boolean): number => caverns.filter(check).length / caverns.length;
        // A cave's arena may lie under a fault's chasm, never under a builder's gallery.
        expect(share((run) => run.model.floors.some((f) => f.terrain.some((p) => p.kind === 'gallery')))).toBe(0);
        expect(share((run) => run.model.floors.some((f) => f.terrain.some((p) => p.kind === 'shaft')))).toBeGreaterThan(0.15);
      }
    });

    it('look down from a gallery into the great hall or entrance hall below', () => {
      if (floors === 1) return;
      // Only a room built to overlook the hall holds one (a gallery, stair hall or solar; a landing or portrait
      // gallery): measured 0.020–0.037 over 400 seeds of each theme and floor count; pinned at half.
      const rising = runs.filter((run) => run.model.theme !== 'cavern');
      const share = rising.filter((run) => run.model.floors.some((f) => f.terrain.some((p) => p.kind === 'gallery'))).length / rising.length;
      expect(share).toBeGreaterThan(0.01);
    });

    it('keep their theme\'s rule of cover', () => {
      expect(failures((run) => coverProblems(run.model))).toEqual([]);
    });

    it('generate within the time budget', () => {
      const p95 = (list: readonly Run[]): number => {
        const times = list.map((run) => run.ms).sort((a, b) => a - b);
        return times[Math.floor(times.length * 0.95)] ?? 0;
      };
      expect(p95(runs.filter((run) => run.model.theme !== 'cavern'))).toBeLessThan(timeBound(25 * floors));
      // A cave also shapes its chambers and tunnels, and grows a floor anew until its main path fits two cells wide.
      expect(p95(caverns)).toBeLessThan(timeBound(75 * floors));
    });
  });
}
