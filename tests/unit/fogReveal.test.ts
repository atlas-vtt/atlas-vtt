import { describe, expect, it } from 'vitest';
import { findFogChange, layoutPuffs, MAX_PUFFS, revealCellSize, type FogMask } from '../../src/app/pixi/fog/fogReveal';

const bounds = { x: 100, y: 200, width: 40, height: 20 };
/** A 4x2 mask with cell size 10; `fogged` lists the cells with fog. */
const mask = (...fogged: number[]): FogMask => ({
  alpha: Array.from({ length: 8 }, (_, i) => (fogged.includes(i) ? 255 : 0)),
  columns: 4,
  rows: 2,
});

function seeded(seed = 1): () => number {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

describe('fog reveal', () => {
  it('finds the cells an edit uncovered and covered, in world space', () => {
    const { revealed, covered } = findFogChange(mask(0, 1, 5), mask(1, 2), bounds, 10);
    expect(revealed.points).toEqual([{ x: 105, y: 205 }, { x: 115, y: 215 }]);
    expect(covered.points).toEqual([{ x: 125, y: 205 }]);
  });

  it('finds no change when the fog stayed the same', () => {
    const { revealed, covered } = findFogChange(mask(1, 6), mask(1, 6), bounds, 10);
    expect([...revealed.points, ...covered.points]).toEqual([]);
  });

  it('keeps the sampling grid small on large maps', () => {
    const cell = revealCellSize({ x: 0, y: 0, width: 12000, height: 9000 });
    expect((12000 / cell) * (9000 / cell)).toBeLessThanOrEqual(60_000);
  });

  it('moves the puffs along paths left and right of the area middle', () => {
    const points = Array.from({ length: 200 }, (_, i) => ({ x: (i % 20) * 10, y: Math.floor(i / 20) * 10 }));
    const puffs = [...layoutPuffs({ points, cellSize: 10 }, 'part', seeded()), ...layoutPuffs({ points, cellSize: 10 }, 'gather', seeded(5))];
    expect(puffs.some((puff) => puff.motion === 'gather')).toBe(true);
    for (const puff of puffs) {
      expect(Math.abs(puff.dx)).toBeGreaterThan(Math.abs(puff.dy));
      if (puff.x < 60) expect(puff.dx).toBeLessThan(0);
      if (puff.x > 130) expect(puff.dx).toBeGreaterThan(0);
    }
  });

  it('caps the puffs of a huge reveal', () => {
    const points = Array.from({ length: 5000 }, (_, i) => ({ x: (i % 100) * 50, y: Math.floor(i / 100) * 50 }));
    expect(layoutPuffs({ points, cellSize: 50 }, 'part', seeded())).toHaveLength(MAX_PUFFS);
  });
});
