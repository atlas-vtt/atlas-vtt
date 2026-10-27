import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { FORTRESS } from '../../../src/app/dungeons/themes/fortress';
import { normals } from './dungeonInvariants';
import { apartProblems, entranceRoom, floorDepth, nearRooms, nextRooms, onOuterWall, type Place, roomsOfType, typeOf, typingProblems, wayAvoids } from './themeInvariants';
import { failuresOf, shareOf, themeRuns } from './themeRuns';
import { passageProblems, towerProblems } from './fortressLayoutInvariants';
import { describeThemeTerrain } from './themeTerrainRules';

/** The rules of a Fortress (report §3.2), each held over 500 dungeons of one to three floors. */
describe('generated Fortresses', () => {
  const runs = themeRuns('fortress');
  const doorsOf = (model: DungeonModel, p: Place): number => model.floors[p.floor]!.doors.filter((d) => d.from === p.room || d.to === p.room).length;
  const halls = (model: DungeonModel): Place[] => [...roomsOfType(model, 'great-hall'), ...roomsOfType(model, 'lower-hall')].filter((p) => p.floor === 0);
  const isNext = (model: DungeonModel, a: Place, b: Place): boolean => a.floor === b.floor && nextRooms(model.floors[a.floor]!, a.room).includes(b.room);

  it('opens on the gatehouse', () => {
    expect(failuresOf(runs, (m) => (typeOf(m, entranceRoom(m)) === 'gatehouse' ? [] : [`entered by a ${typeOf(m, entranceRoom(m))}`]))).toEqual([]);
  });

  it('holds one great hall or lower hall on the entrance floor, a hub in the front two thirds', () => {
    const frontHub = (m: DungeonModel, p: Place): boolean => doorsOf(m, p) >= 3 && floorDepth(m.floors[0]!, p.room) < 2 / 3;
    // Where the entrance room is the floor's only hub in front, no hall can be one.
    const hasHub = (m: DungeonModel): boolean => normals(m.floors[0]!).some((room) => room.id !== entranceRoom(m).room && !room.boss && frontHub(m, { floor: 0, room: room.id }));
    expect(shareOf(runs, () => true, (m) => halls(m).length > 0)).toBeGreaterThan(0.97);
    expect(shareOf(runs, hasHub, (m) => halls(m).some((p) => frontHub(m, p)))).toBeGreaterThan(0.9);
  });

  it('sets the kitchen next to the hall and every buttery next to a kitchen', () => {
    const hasKitchen = (m: DungeonModel): boolean => roomsOfType(m, 'kitchen').length > 0 && halls(m).length > 0;
    expect(shareOf(runs, hasKitchen, (m) => roomsOfType(m, 'kitchen').some((k) => halls(m).some((h) => isNext(m, k, h))))).toBeGreaterThan(0.85);
    expect(failuresOf(runs, (m) => roomsOfType(m, 'buttery').filter((b) => !roomsOfType(m, 'kitchen').some((k) => isNext(m, b, k))).map((b) => `buttery ${b.room} on floor ${b.floor} by no kitchen`))).toEqual([]);
  });

  it('keeps the way from the hall to the solar clear of the kitchen', () => {
    const all = (m: DungeonModel): boolean => halls(m).length > 0 && roomsOfType(m, 'solar').length > 0 && roomsOfType(m, 'kitchen').length > 0;
    expect(shareOf(runs, all, (m) => wayAvoids(m, halls(m)[0]!, roomsOfType(m, 'solar')[0]!, roomsOfType(m, 'kitchen')[0]!))).toBeGreaterThan(0.85);
  });

  it('ends the chapel off the hall', () => {
    const chapels = runs.flatMap((run) => roomsOfType(run.model, 'chapel').filter((p) => !run.model.floors[p.floor]!.rooms[p.room]!.boss).map((p) => ({ m: run.model, p })));
    const off = chapels.filter(({ m, p }) => doorsOf(m, p) <= 1 && halls(m).some((h) => h.floor === p.floor && nearRooms(m.floors[p.floor]!, p.room).includes(h.room)));
    expect(chapels.length).toBeGreaterThan(0);
    expect(off.length / chapels.length).toBeGreaterThan(0.8);
  });

  it('hangs every garderobe on a solar or chamber, on an outer wall', () => {
    expect(failuresOf(runs, (m) => roomsOfType(m, 'garderobe').flatMap((g) => {
      const floor = m.floors[g.floor]!;
      const byBed = nextRooms(floor, g.room).some((r) => ['solar', 'chamber'].includes(floor.rooms[r]?.type ?? ''));
      return byBed && onOuterWall(floor, floor.rooms[g.room]!) ? [] : [`garderobe ${g.room} on floor ${g.floor}`];
    }))).toEqual([]);
  });

  it('keeps barracks and armoury within two rooms of the gatehouse', () => {
    const guards = runs.flatMap((run) => [...roomsOfType(run.model, 'barracks'), ...roomsOfType(run.model, 'armoury')].map((p) => ({ m: run.model, p })));
    const close = guards.filter(({ m, p }) => roomsOfType(m, 'gatehouse').some((g) => g.floor === p.floor && nearRooms(m.floors[p.floor]!, p.room).includes(g.room)));
    expect(close.length / guards.length).toBeGreaterThan(0.85);
  });

  it('keeps stores, cistern, gaol and stable on the entrance floor', () => {
    expect(failuresOf(runs, (m) => ['buttery', 'storeroom', 'cistern', 'gaol', 'stable'].flatMap((type) => roomsOfType(m, type).filter((p) => p.floor !== 0).map((p) => `${type} on floor ${p.floor}`)))).toEqual([]);
  });

  it('never sets kitchen beside chapel or solar, gaol beside solar, or garderobe beside kitchen', () => {
    const pairs = [['kitchen', 'chapel'], ['kitchen', 'solar'], ['gaol', 'solar'], ['garderobe', 'kitchen']] as const;
    expect(failuresOf(runs, (m) => apartProblems(m, [...pairs, ...pairs.map(([a, b]) => [b, a] as const)]))).toEqual([]);
  });

  it('uses only the types of its own theme and types every normal room', () => {
    const ids = new Set<string>(FORTRESS.rooms.map((spec) => spec.id));
    expect(failuresOf(runs, (m) => typingProblems(m, ids))).toEqual([]);
    expect(runs.every((run) => run.model.theme === 'fortress' && normals(run.model.floors[0]!).length > 0)).toBe(true);
  });

  it('opens a chasm on the entrance floor of a Fortress as a bottomless void', () => {
    const ruins = Array.from({ length: 300 }, (_, k) => generateDungeon({ seed: (k + 1) * 3307, theme: 'fortress', tags: ['ruined'], floors: 2 + (k % 2) }));
    const problems = ruins.flatMap((m) => [
      ...m.floors[0]!.terrain.filter((p) => p.opening && p.opening.bottom !== null).map((p) => `seed ${m.seed}: a ${p.kind} on the entrance floor falls to floor ${p.opening!.bottom}`),
      ...m.floors[1]!.terrain
        .filter((p) => p.kind === 'chasm' && p.opening)
        .filter((p) => p.opening!.bottom !== 0 || !m.floors[0]!.terrain.some((q) => q.kind === 'chasm-floor' && q.under === p.opening!.link))
        .map((p) => `seed ${m.seed}: a chasm on floor 1 falls to ${p.opening!.bottom}`),
    ]);
    // A collapse opens a floor only over a room that takes the fall, which few do (about one ruin in 300).
    expect(problems.slice(0, 10)).toEqual([]);
  }, 60_000);

  it('raises few towers, on the plan\'s outer edge', () => {
    // Before towers were capped, 11 % of the rooms of 400 Fortresses were round, up to 14 on a floor
    // (the `round` tag multiplies their chance by five); now about 5 %, at most three.
    expect(failuresOf(runs, towerProblems)).toEqual([]);
  });

  it('builds passages two cells across, three on the main way, one only where a reason keeps them narrow', () => {
    // About 5 % of the passages are one cell across (each for its reason), 47 % two and 48 % three; all were one before.
    expect(failuresOf(runs, passageProblems)).toEqual([]);
  });

  describeThemeTerrain(runs, FORTRESS);
});
