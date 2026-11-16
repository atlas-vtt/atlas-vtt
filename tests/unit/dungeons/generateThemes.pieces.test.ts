import { describe, expect, it, vi } from 'vitest';
import { stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { blockedCells, clearanceProblems, hasCover, routeProblems, stairClearanceProblems } from './terrainInvariants';

/**
 * Themed dungeons with every kind of piece offered, as they will be once every kind has its
 * drawing: what the recipes place must keep every way through a floor open and every door and
 * stair approach clear, and only structure that fixes no room's purpose stands in them.
 */
vi.mock('../../../src/app/dungeons/drawnKinds', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/app/dungeons/drawnKinds')>();
  const { ALL_PROP_KINDS } = await import('../../../src/app/dungeons/props/propKinds');
  return { ...original, DRAWN_PROP_KINDS: ALL_PROP_KINDS };
});

const TAG_SETS: readonly string[][] = [[], ['small'], ['large'], ['secret', 'round'], ['crumbling', 'overgrown']];
/** What a built dungeon may hold: structure, never furniture. */
const STRUCTURE = new Set(['dais', 'statue', 'bust', 'fountain', 'well', 'hearth']);

describe.each(['fortress', 'mansion'] as const)('%s dungeons with every piece drawn', (theme) => {
  const runs = Array.from({ length: 200 }, (_, k) => {
    const seed = (k + 1) * 6007;
    const tags = TAG_SETS[k % TAG_SETS.length] ?? [];
    return { seed, tags, model: generateDungeon({ seed, theme, tags, floors: 1 + (k % 3) }) };
  });
  const failures = (check: (model: DungeonModel) => string[]): string[] => runs.flatMap((run) => check(run.model).map((p) => `seed ${run.seed} [${run.tags.join(',')}]: ${p}`)).slice(0, 10);

  it('builds fireplaces into walls and holds only structure', () => {
    const props = runs.flatMap((run) => run.model.floors.flatMap((f) => f.props));
    expect(props.filter((p) => p.kind === 'hearth').length / runs.length).toBeGreaterThan(0.5);
    expect([...new Set(props.map((p) => p.kind))].filter((kind) => !STRUCTURE.has(kind))).toEqual([]);
  });

  it('keeps every way through, every door and stair approach clear of its pieces', () => {
    expect(failures((m) => m.floors.flatMap((floor, i) => [...routeProblems(floor), ...clearanceProblems(floor, i, stackOf(m)), ...stairClearanceProblems(floor, i, stackOf(m))].map((p) => `floor ${i}: ${p}`)))).toEqual([]);
  });

  const arenas = runs.map((run) => run.model.floors.at(-1)!).flatMap((floor) => {
    const boss = floor.rooms.find((room) => room.boss);
    return boss ? [{ floor, boss }] : [];
  });
  const arenaShare = (check: (a: (typeof arenas)[number]) => boolean): number => arenas.filter(check).length / arenas.length;

  it('keeps the arena\'s platform and cover, two thirds of it free', () => {
    expect(arenaShare(({ floor, boss }) => floor.terrain.some((p) => p.room === boss.id && p.kind === 'platform'))).toBeGreaterThan(0.6);
    expect(arenaShare(({ floor, boss }) => hasCover(floor, boss.id))).toBeGreaterThan(0.9);
    expect(arenas.filter(({ floor, boss }) => blockedCells(floor, boss.id) > boss.w * boss.h * 0.4).map(({ boss }) => boss.id)).toEqual([]);
  });

  it('gives the arena a set piece', () => {
    const SET_PIECES = new Set(['statue', 'portal-ring', 'pillar', 'mosaic']);
    // Measured 0.90 (Fortress) once nothing is seated on the platform: a hall's arena takes pillars only, where they fit.
    expect(arenaShare(({ floor, boss }) => floor.terrain.some((p) => p.room === boss.id && SET_PIECES.has(p.kind)) || floor.props.some((p) => p.room === boss.id))).toBeGreaterThan(0.85);
  });
});
