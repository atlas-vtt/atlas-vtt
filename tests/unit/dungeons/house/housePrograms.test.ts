import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { FIVE_ROOM_STAGES, type DungeonModel } from '../../../../src/app/dungeons/model';
import { distances } from '../dungeonInvariants';
import { baizeDoor, mirrored, receptionApart, roomSizes, stacksWarm, structureOnly, zones } from './houseZoneRules';

/** Houses typed where they stand (research §5.5, §5.8; rules 5, 11–14, 19, 22), their tags and five-room houses. */
const TAGS: readonly string[][] = [[], ['small'], ['large'], ['ruined'], ['overgrown'], ['inhabited'], ['ruined', 'overgrown']];
const RUNS: { tags: string[]; model: DungeonModel }[] = Array.from({ length: 280 }, (_, k) => {
  const tags = TAGS[k % TAGS.length] ?? [];
  return { tags, model: generateDungeon({ seed: (k + 1) * 3779, theme: 'mansion', tags, floors: 1 + (k % 4) }) };
});
const failures = (check: (m: DungeonModel) => string[]): string[] => RUNS.flatMap(({ tags, model }) => check(model).map((p) => `seed ${model.seed} [${tags}]: ${p}`)).slice(0, 8);
const typesOf = (m: DungeonModel): string[] => m.floors.flatMap((f) => f.rooms.map((r) => r.type ?? ''));

describe('a house typed by zone', () => {
  for (const [name, rule] of Object.entries({ stacksWarm, receptionApart, baizeDoor, zones, roomSizes, structureOnly })) {
    it(`keeps ${name}`, () => expect(failures(rule)).toEqual([]));
  }

  it('has a kitchen, a drawing room and a dining room, and a master bedroom upstairs where there is an upstairs', () => {
    expect(failures((m) => ['kitchen', 'drawing-room', 'dining-room'].filter((t) => !typesOf(m).includes(t)).map((t) => `no ${t}`))).toEqual([]);
    const upstairs = RUNS.filter(({ model }) => model.floors.length - (model.below ?? 0) > 1);
    expect(upstairs.filter(({ model }) => typesOf(model).includes('master-bedroom') || typesOf(model).includes('ritual-room')).length).toBe(upstairs.length);
  });

  it('mirrors the footprint about the front door in most houses (blocks, Us and Hs)', () => {
    expect(RUNS.filter(({ model }) => mirrored(model)).length / RUNS.length).toBeGreaterThan(0.4);
  });

  it('puts the climax on the top floor or in a cellar', () => {
    expect(failures((m) => {
      const floors = m.floors.flatMap((f, i) => (f.rooms.some((r) => r.boss) ? [i] : []));
      const top = m.floors.length - 1 - (m.below ?? 0);
      return floors.length === 1 && (floors[0] === top || (m.below && floors[0] === m.floors.length - 1)) ? [] : [`boss on floors ${floors.join(',')}`];
    })).toEqual([]);
  });

  it('lets a ruin drop a wing: collapsed rooms on the ground floor and no storey over them', () => {
    const ruins = RUNS.filter(({ tags }) => tags.includes('ruined'));
    expect(ruins.filter(({ model }) => model.floors[0]!.rooms.some((r) => r.type === 'collapsed-room')).length / ruins.length).toBeGreaterThan(0.9);
    expect(RUNS.filter(({ tags }) => !tags.includes('ruined')).every(({ model }) => !typesOf(model).includes('collapsed-room'))).toBe(true);
  });

  it('lets a lived-in house keep more of its fireplaces', () => {
    const hearths = (tag: string): number => {
      const runs = RUNS.filter(({ tags }) => (tag ? tags.length === 1 && tags[0] === tag : tags.length === 0));
      return runs.reduce((sum, { model }) => sum + model.floors.reduce((n, f) => n + f.props.filter((p) => p.kind === 'hearth').length, 0), 0) / runs.length;
    };
    expect(hearths('inhabited')).toBeGreaterThan(hearths(''));
  });

  it('grows ivy in an overgrown house', () => {
    const grown = RUNS.filter(({ tags }) => tags.includes('overgrown'));
    expect(grown.filter(({ model }) => model.floors.some((f) => f.growth.length > 0)).length / grown.length).toBeGreaterThan(0.9);
  });
});

describe('a five-room dungeon in a house', () => {
  const houses = Array.from({ length: 200 }, (_, k) => generateDungeon({ seed: (k + 1) * 4447, theme: 'mansion', tags: [], floors: 1 + (k % 3), fiveRoom: true }));

  it('is one floor of the five stages in order, the climax entered from the setback alone, the reward through it', () => {
    for (const model of houses) {
      const floor = model.floors[0]!;
      expect(model.floors).toHaveLength(1);
      const rooms = FIVE_ROOM_STAGES.map((stage) => floor.rooms.filter((r) => r.stage === stage));
      expect(rooms.map((r) => r.length)).toEqual([1, 1, 1, 1, 1]);
      const hops = distances(floor, 0);
      const order = rooms.map((r) => hops.get(r[0]!.id) ?? Infinity);
      expect(order.every((d, i) => i === 0 || d > order[i - 1]!), `seed ${model.seed}: ${order}`).toBe(true);
      const climax = rooms[3]![0]!;
      const reward = rooms[4]![0]!;
      expect(climax.boss).toBe(true);
      const ways = (id: number): (number | null)[] => floor.doors.filter((d) => d.from === id || d.to === id).map((d) => (d.from === id ? d.to : d.from));
      expect(ways(reward.id)).toEqual([climax.id]);
      expect(ways(climax.id).filter((id) => id !== reward.id)).toEqual([rooms[2]![0]!.id]);
    }
  });

  it('stays the same for the same seed', () => {
    for (const model of houses.slice(0, 40)) expect(generateDungeon({ seed: model.seed, theme: 'mansion', tags: [], floors: 1, fiveRoom: true })).toEqual(model);
  });
});
