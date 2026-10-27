import { describe, expect, it, vi } from 'vitest';
import { floorAbove, stackOf } from '../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { outerWallCells } from '../../../src/app/dungeons/growth/outerWalls';
import { houseCells } from '../../../src/app/dungeons/geometry';
import type { DungeonFloor } from '../../../src/app/dungeons/model';

/** A house's outside, where its outer walls face; none for a floor walled by whole cells. */
function outsideOf(floor: DungeonFloor): ((x: number, y: number) => boolean) | undefined {
  if (floor.walls !== 'edges') return undefined;
  const house = houseCells(floor);
  return (x, y) => !house.has(`${x},${y}`);
}
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { PROP_SPECS } from '../../../src/app/dungeons/props/catalogue';
import { keptPieces, ruinedKeep } from '../../../src/app/dungeons/props/ruined';
import { rngFrom } from '../../../src/app/dungeons/rng';
import type { Piece } from '../../../src/app/dungeons/themes/themeTypes';
import { normals } from './dungeonInvariants';
import { isHazard } from './terrainInvariants';

/** Ruins, with every kind of piece offered, as they will be once every kind has its drawing. */
vi.mock('../../../src/app/dungeons/drawnKinds', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/app/dungeons/drawnKinds')>();
  const { ALL_PROP_KINDS } = await import('../../../src/app/dungeons/props/propKinds');
  return { ...original, DRAWN_PROP_KINDS: ALL_PROP_KINDS };
});

const SEEDS = 300;
const UNDERGROWTH = new Set(['brambles', 'thicket', 'tangled-roots']);

describe.each(['fortress', 'mansion'] as const)('a ruined %s', (theme) => {
  const runs = (tags: string[]): DungeonModel[] => Array.from({ length: SEEDS }, (_, k) => generateDungeon({ seed: (k + 1) * 3001, theme, tags, floors: 1 + (k % 2) }));
  const ruined = runs(['ruined']);
  const plain = runs([]);
  const furniture = (models: readonly DungeonModel[]): number => models.reduce((sum, m) => sum + m.floors.reduce((s, f) => s + f.props.filter((p) => !PROP_SPECS[p.kind].natural).length, 0), 0) / models.length;
  /** The share of normal rooms that hold no piece of their own. */
  const emptyShare = (models: readonly DungeonModel[]): number => {
    const rooms = models.flatMap((m) => m.floors.flatMap((f) => normals(f).filter((r) => !r.boss).map((r) => f.props.some((p) => p.room === r.id))));
    return rooms.filter((holds) => !holds).length / rooms.length;
  };

  it('keeps 40 to 70 percent of its furniture', () => {
    const share = furniture(ruined) / furniture(plain);
    // A ruined house also lost the floors over its fallen wing, and their pieces with them.
    expect(share).toBeGreaterThanOrEqual(theme === 'mansion' ? 0.3 : 0.4);
    expect(share).toBeLessThanOrEqual(0.7);
  });

  it('lays rubble, broken floor or wall fragments in its rooms, and hazards only for a reason', () => {
    const decay = new Set(['rubble-field', 'broken-floor', 'rubble-heap', 'wall-fragment']);
    expect(ruined.filter((m) => m.floors.some((f) => f.terrain.some((p) => decay.has(p.kind) && f.rooms[p.room]?.type))).length / SEEDS).toBeGreaterThan(0.8);
    const hazardTypes = new Set(['collapsed-room', ...(theme === 'fortress' ? ['gaol', 'cistern'] : [])]);
    const stray = ruined.flatMap((m) => m.floors.flatMap((f) => f.terrain.filter((p) => isHazard(p) && !f.rooms[p.room]?.boss && !hazardTypes.has(f.rooms[p.room]?.type ?? '')).map((p) => `${m.seed}: ${p.kind} in a ${f.rooms[p.room]?.type}`)));
    expect(stray.slice(0, 5)).toEqual([]);
  });

  it('grows plants only along its outer walls when ruined alone', () => {
    const stray = ruined.flatMap((m) => m.floors.flatMap((f) => f.growth.filter((g) => {
      const room = f.rooms[g.room];
      if (!room) return true;
      const outer = outerWallCells(room, f.rooms, outsideOf(f));
      return !g.cells.every((c) => outer.has(`${c.x},${c.y}`));
    }).map((g) => `${m.seed}: ${g.kind} off an outer wall in a ${f.rooms[g.room]?.type}`)));
    expect(ruined.some((m) => m.floors.some((f) => f.growth.length > 0))).toBe(true);
    expect(stray.slice(0, 5)).toEqual([]);
  });

  it('grows undergrowth only where light or water comes in when ruined and overgrown: by outer walls, under openings above, by water', () => {
    const wild = runs(['ruined', 'overgrown']);
    const stray = wild.flatMap((m) => m.floors.flatMap((f, k) => {
      const above = floorAbove(stackOf(m), k);
      const under = new Set((above === null ? [] : m.floors[above]!.terrain.filter((p) => p.opening)).flatMap((p) => p.cells.map((c) => `${c.x},${c.y}`)));
      const wet = new Set(f.waterCells.map((c) => `${c.x},${c.y}`));
      const near = (c: { x: number; y: number }, set: ReadonlySet<string>): boolean => [-2, -1, 0, 1, 2].some((dx) => [-2, -1, 0, 1, 2].some((dy) => set.has(`${c.x + dx},${c.y + dy}`)));
      return f.terrain.filter((p) => UNDERGROWTH.has(p.kind) && f.rooms[p.room]?.type).filter((p) => {
        const outer = outerWallCells(f.rooms[p.room]!, f.rooms, outsideOf(f));
        return !p.cells.some((c) => near(c, outer) || near(c, under) || near(c, wet));
      }).map((p) => `${m.seed}: ${p.kind} in a sealed ${f.rooms[p.room]?.type} on floor ${k}`);
    }));
    expect(wild.some((m) => m.floors.some((f) => f.terrain.some((p) => UNDERGROWTH.has(p.kind))))).toBe(true);
    expect(stray.slice(0, 5)).toEqual([]);
  });

  it('leaves more rooms empty', () => {
    // Measured 0.080 (Fortress) and 0.081 (Mansion) once rooms hold structure only: few rooms hold a piece at all.
    expect(emptyShare(ruined) - emptyShare(plain)).toBeGreaterThanOrEqual(0.05);
  });

  it('combines with crumbling and overgrown', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const model = generateDungeon({ seed, theme, tags: ['ruined', 'crumbling', 'overgrown'], floors: 1 + (seed % 3) });
      expect(model.tags).toEqual(expect.arrayContaining(['ruined', 'crumbling', 'overgrown']));
    }
  });
});

describe('what a ruin keeps of a recipe', () => {
  it('keeps a share of its pieces in their order', () => {
    const pieces: Piece[] = (['statue', 'bust', 'hearth', 'fountain', 'well', 'dais'] as const).map((kind) => ({ kind, verb: 'wall' }));
    for (let seed = 1; seed <= 50; seed++) {
      const rng = rngFrom(seed);
      const share = ruinedKeep(rng);
      expect(share).toBeGreaterThanOrEqual(0.4);
      expect(share).toBeLessThanOrEqual(0.7);
      const kept = keptPieces(rng, pieces, share);
      expect(kept.every((piece, k) => k === 0 || pieces.indexOf(piece) > pieces.indexOf(kept[k - 1]!))).toBe(true);
      expect(kept.length).toBeLessThan(pieces.length);
    }
  });
});

describe('a ruin\'s collapse', () => {
  it('opens only onto a floor below, where its fall lands', () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      for (const theme of ['fortress', 'mansion'] as const) {
        const model = generateDungeon({ seed: seed * 53, theme, tags: ['ruined'], floors: 1 + (seed % 3) });
        model.floors.forEach((floor, f) => {
          for (const piece of floor.terrain) {
            const above = model.floors.slice(0, f).some((up) => up.terrain.some((p) => p.opening?.link === piece.opening?.link));
            if (piece.kind === 'chasm' && piece.opening && !above && piece.opening.bottom === null) problems.push(`${theme} ${seed * 53} floor ${f}: a bottomless chasm in a ${floor.rooms[piece.room]?.type}`);
          }
        });
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  }, 120_000);
});
