import { describe, expect, it } from 'vitest';
import { floorStack } from '../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { FIVE_ROOM_STAGES, type DungeonFloor, type DungeonModel, type FiveRoomStage } from '../../../src/app/dungeons/model';
import type { ThemeChoice } from '../../../src/app/dungeons/themes/themeTypes';
import { distances, doorProblems, secretProblems, unreachableRooms } from './dungeonInvariants';
import { holeProblems } from './holeInvariants';
import { bridgeProblems, cellProblems, clearanceProblems, hasCover, routeProblems, stairClearanceProblems } from './terrainInvariants';

/**
 * Five-room dungeons (Johnn Four's structure) over 1,000 seeds: one floor whatever was asked, five
 * main rooms in their order along the way in, the climax the boss room, the reward beyond it, each
 * stage built as architecture, and every terrain rule kept.
 */

const ONE_FLOOR = floorStack('down', 1);
const SEEDS = 1000;
const TAG_SETS: readonly string[][] = [[], ['colonnades'], ['crumbling'], ['wet'], ['dry'], ['large'], ['small'], ['round']];
/** The theme each tag set is asked with: what the retired temple, tomb and dwelling tags stood for, else Any. */
const THEMES: readonly (ThemeChoice | undefined)[] = [undefined, 'fortress', undefined, 'cavern', 'fortress', undefined, undefined, undefined];

const runs: { seed: number; theme: ThemeChoice | undefined; tags: string[]; model: DungeonModel }[] = Array.from({ length: SEEDS }, (_, k) => {
  const seed = (k + 1) * 6271;
  const tags = TAG_SETS[k % TAG_SETS.length] ?? [];
  const theme = THEMES[k % THEMES.length];
  return { seed, theme, tags, model: generateDungeon({ seed, theme, tags, floors: 1 + (k % 4), fiveRoom: true, bossRoom: k % 3 === 0 ? false : undefined }) };
  // A Haunted Mansion's five rooms are a house (`house/housePrograms.test.ts`), which Any may pick.
}).filter((run) => run.model.theme !== 'mansion');

function failures(check: (floor: DungeonFloor, model: DungeonModel) => string[]): string[] {
  return runs.flatMap(({ seed, tags, model }) => check(model.floors[0]!, model).map((p) => `seed ${seed} [${tags.join(',')}]: ${p}`)).slice(0, 10);
}

function stageRoom(floor: DungeonFloor, stage: FiveRoomStage) {
  return floor.rooms.find((room) => room.stage === stage);
}

const share = (check: (floor: DungeonFloor) => boolean): number => runs.filter(({ model }) => check(model.floors[0]!)).length / runs.length;

describe('five-room dungeons', () => {
  it('have one floor and each of the five stages once, in order along the way in', () => {
    expect(failures((_, model) => (model.floors.length === 1 ? [] : [`${model.floors.length} floors`]))).toEqual([]);
    expect(
      failures((floor) => {
        const rooms = FIVE_ROOM_STAGES.map((stage) => floor.rooms.filter((room) => room.stage === stage));
        if (rooms.some((r) => r.length !== 1)) return [`stages ${rooms.map((r) => r.length).join('/')}`];
        const hops = distances(floor, 0);
        const order = rooms.map((r) => hops.get(r[0]!.id) ?? Infinity);
        return order.every((d, i) => i === 0 || d > order[i - 1]!) ? [] : [`stages at ${order.join(', ')} doors in`];
      }),
    ).toEqual([]);
    expect(failures((floor) => (floor.rooms.filter((room) => room.kind === 'room' && !room.stage).length === 0 ? [] : ['a normal room without a stage']))).toEqual([]);
  });

  it('make the climax the boss room, entered from the setback side alone, the reward beyond it', () => {
    expect(
      failures((floor) => {
        const climax = stageRoom(floor, 'climax');
        const reward = stageRoom(floor, 'reward');
        if (!climax?.boss || floor.rooms.filter((r) => r.boss).length !== 1) return ['the climax is no boss room'];
        const neighbours = (id: number): Set<number | null> => new Set(floor.doors.filter((d) => d.from === id || d.to === id).map((d) => (d.from === id ? d.to : d.from)));
        const rewardWays = neighbours(reward!.id);
        if (rewardWays.size !== 1 || !rewardWays.has(climax.id)) return ['the reward is not reached through the climax alone'];
        const climaxWays = [...neighbours(climax.id)].filter((id) => id !== reward!.id);
        return climaxWays.length === 1 ? [] : [`the climax is entered from ${climaxWays.join(', ')}`];
      }),
    ).toEqual([]);
  });

  // Stages built by role in a Cavern; a built theme's stages take its types (below).
  it('take a Cavern\'s types for its stages where its cave allows them', () => {
    const caverns = runs.filter(({ model }) => model.theme === 'cavern');
    const typed = (stage: FiveRoomStage, types: readonly string[]): number => caverns.filter(({ model }) => types.includes(stageRoom(model.floors[0]!, stage)?.type ?? '')).length / caverns.length;
    expect(typed('entrance', ['cave-mouth'])).toBe(1);
    // A stage room that could not take the hazard its type is named for is a passage chamber.
    expect(typed('puzzle', ['crystal-grotto', 'chasm-hall', 'passage-chamber'])).toBeGreaterThan(0.5);
    expect(typed('setback', ['chasm-hall', 'lake-cavern', 'collapse-chamber', 'passage-chamber'])).toBeGreaterThan(0.4);
    expect(typed('climax', ['grand-cavern', 'lake-cavern', 'den'])).toBe(1);
  });

  it('honour the tags that make sense for one string of rooms', () => {
    const secretShare = (tags: string[]): number => {
      let secret = 0;
      let asked = 0;
      for (let seed = 1; seed <= 48; seed++) {
        const model = generateDungeon({ seed, tags, floors: 1, fiveRoom: true });
        if (model.theme === 'mansion') continue;
        asked++;
        if (stageRoom(model.floors[0]!, 'reward')?.wing === 'secret') secret++;
      }
      return secret / asked;
    };
    expect(secretShare(['secret'])).toBeGreaterThan(0.9);
    expect(secretShare(['no-secrets'])).toBe(0);
    const differs = (tag: string): number => {
      let changed = 0;
      for (let seed = 1; seed <= 60; seed++) {
        // A Cavern builds no colonnades whatever its tags say, and a Mansion is a house, so the tags are held on the Fortress.
        const theme = 'fortress';
        const rooms = (tags: string[]) => JSON.stringify(generateDungeon({ seed, theme, tags, floors: 1, fiveRoom: true }).floors[0]!.rooms.map((r) => [r.x, r.y, r.w, r.h, r.colonnade, r.rotunda]));
        if (rooms([]) !== rooms([tag])) changed++;
      }
      return changed;
    };
    for (const tag of ['compact', 'winding', 'small', 'ordered', 'chaotic', 'colonnades']) expect(differs(tag), tag).toBeGreaterThan(7);
  });

  it('keep every rule of the layout and the terrain', () => {
    expect(failures((floor) => [...doorProblems(floor, true), ...unreachableRooms(floor).map((id) => `room ${id} unreachable`), ...secretProblems(floor)])).toEqual([]);
    expect(failures((floor) => [...cellProblems(floor), ...clearanceProblems(floor, 0, ONE_FLOOR), ...routeProblems(floor), ...bridgeProblems(floor), ...stairClearanceProblems(floor, 0, ONE_FLOOR)])).toEqual([]);
    expect(failures((_, model) => holeProblems(model))).toEqual([]);
  });

  it('give the same dungeon for the same request', () => {
    for (const { seed, theme, tags, model } of runs.slice(0, 200)) expect(generateDungeon({ seed, theme, tags, floors: 1, fiveRoom: true })).toEqual(model);
  });
});

describe.each([
  ['fortress', { entrance: ['gatehouse'], puzzle: ['gallery', 'library'], reward: ['solar'] }],
] as const)('five-room %s dungeons', (theme, types) => {
  const themed = Array.from({ length: 300 }, (_, k) => generateDungeon({ seed: (k + 1) * 4447, theme, tags: [], floors: 1, fiveRoom: true }));

  it('take the theme\'s types for their stages', () => {
    const problems = themed.flatMap((model) => {
      const floor = model.floors[0]!;
      const out: string[] = [];
      for (const stage of ['entrance', 'puzzle', 'reward'] as const) {
        const room = stageRoom(floor, stage);
        if (room && !(types[stage] as readonly string[]).includes(room.type ?? '')) out.push(`seed ${model.seed}: the ${stage} is a ${room.type}`);
      }
      const setback = stageRoom(floor, 'setback');
      if (setback && floor.terrain.some((p) => p.room === setback.id && p.traits.hazard !== undefined)) out.push(`seed ${model.seed}: a hazard in the setback`);
      return out;
    });
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it('keep their stages in order and stay the same for the same seed', () => {
    for (const model of themed.slice(0, 50)) {
      expect(FIVE_ROOM_STAGES.every((stage) => stageRoom(model.floors[0]!, stage))).toBe(true);
      expect(generateDungeon({ seed: model.seed, theme, tags: [], floors: 1, fiveRoom: true })).toEqual(model);
    }
  });
});
