import { describe, expect, it, vi } from 'vitest';
import { cellKey } from '../../../src/app/dungeons/geometry';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../../src/app/dungeons/model';
import { ALL_PROP_KINDS, type PropKind } from '../../../src/app/dungeons/props/propKinds';

/** Which kinds of piece are offered, switched per run: every kind, or none. */
const offer = vi.hoisted(() => ({ kinds: null as ReadonlySet<string> | null }));

vi.mock('../../../src/app/dungeons/drawnKinds', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/app/dungeons/drawnKinds')>();
  const { ALL_TERRAIN_KINDS } = await import('../../../src/app/dungeons/terrain/catalog');
  const kinds = { has: (kind: PropKind): boolean => offer.kinds?.has(kind) ?? false };
  return { ...original, DRAWN_PROP_KINDS: kinds, DRAWN_TERRAIN_KINDS: ALL_TERRAIN_KINDS };
});

function generated(request: DungeonRequest, kinds: ReadonlySet<string>): DungeonModel {
  offer.kinds = kinds;
  return generateDungeon(request);
}

const middle = (points: readonly { x: number; y: number }[]): string => {
  const n = points.length;
  return `${(points.reduce((s, p) => s + p.x, 0) / n).toFixed(6)},${(points.reduce((s, p) => s + p.y, 0) / n).toFixed(6)}`;
};

const REQUESTS: readonly DungeonRequest[] = [
  ...Array.from({ length: 24 }, (_, k): DungeonRequest => ({ seed: 97 + k * 7919, theme: (['fortress', 'mansion', 'cavern'] as const)[k % 3], tags: [[], ['ruined'], ['crumbling'], ['large', 'wet']][k % 4]!, floors: 1 + (k % 3) })),
];

/**
 * The pieces (statues, fireplaces, formations) are placed from a stream of their own after every
 * piece of terrain, the water and the undergrowth: which kinds are drawn never moves any of them or
 * a stone of rubble. A piece only hides the stones under it.
 */
describe('the pieces a dungeon holds', () => {
  it('move no terrain, no water and no rubble, whatever kinds are drawn', () => {
    const problems: string[] = [];
    for (const request of REQUESTS) {
      const bare = generated(request, new Set());
      const full = generated(request, ALL_PROP_KINDS);
      full.floors.forEach((floor, f) => {
        const before = bare.floors[f]!;
        const cells = (pieces: typeof floor.terrain): string[] => pieces.flatMap((p) => p.cells.map((c) => `${p.kind}:${cellKey(c.x, c.y)}`)).sort();
        const label = `seed ${request.seed} ${request.theme} floor ${f}`;
        if (JSON.stringify(cells(floor.terrain)) !== JSON.stringify(cells(before.terrain))) problems.push(`${label}: terrain moved`);
        if (JSON.stringify(floor.waterCells) !== JSON.stringify(before.waterCells)) problems.push(`${label}: water moved`);
        const stones = new Set(before.rubble.map((r) => middle(r.points)));
        if (floor.rubble.some((r) => !stones.has(middle(r.points)))) problems.push(`${label}: a stone moved`);
      });
    }
    expect(problems).toEqual([]);
  }, 120_000);
});
