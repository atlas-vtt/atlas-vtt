/**
 * A remote view's fog holds a lit scene's darkness as one operation after every fog operation the
 * GM painted, and the darkness changes on its own. Since #300 the fog is drawn from one
 * committed coverage (`fogCoverage`, clipper unions), so each change must apply only the darkness
 * to the coverage of the GM's operations, never replay them all: with 2,000 GM operations a replay
 * takes seconds. `fogCoverage` keeps the shape before the operation applied last for that.
 */
import { describe, expect, it, vi } from 'vitest';
import type { FogOperation } from '../../src/app/types/fogTypes';

const shaped = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../src/app/fog/fogOperationShape', async (actual) => {
  const module = await actual<typeof import('../../src/app/fog/fogOperationShape')>();
  return { ...module, fogOperationShape: (op: FogOperation) => { shaped.count++; return module.fogOperationShape(op); } };
});
// Imported after the mock, so coverage is built through the counting `fogOperationShape`.
const { fogCoverage } = await import('../../src/app/fog/fogCoverage');
const { FogCoverageCache } = await import('../../src/app/fog/FogCoverageCache');

/** The darkness's id and order as an extension feeds it: after every GM operation. */
const DARKNESS_ID = 'darkness';
const DARKNESS_ORDER = Number.MAX_SAFE_INTEGER;

/** `count` GM brush strokes and as many erases, a heavily fogged scene. */
function heavyFog(count: number): Record<string, FogOperation> {
  const fog: Record<string, FogOperation> = {};
  for (let i = 0; i < count; i++) {
    fog[`p${i}`] = { id: `p${i}`, kind: 'fog', type: 'brush', timestamp: 10 + 2 * i, isErasing: false, brushRadius: 20, points: [{ x: 10 * i, y: 50 }, { x: 10 * i + 40, y: 90 }] };
    fog[`e${i}`] = { id: `e${i}`, kind: 'fog', type: 'rectangle', timestamp: 11 + 2 * i, isErasing: true, x: 10 * i, y: 60, width: 5, height: 5 };
  }
  return fog;
}

/** A lit scene's darkness: one paint lasso after every GM operation. */
function darknessOp(x: number): FogOperation {
  return {
    id: DARKNESS_ID, kind: 'fog', type: 'lasso', timestamp: DARKNESS_ORDER, isErasing: false,
    points: [{ x: 0, y: 0 }, { x, y: 0 }, { x, y: 800 }, { x: 0, y: 800 }],
  };
}

/** Samples where `a` and `b` cover, on a grid over the scene. */
function sameCoverage(a: { covers(p: { x: number; y: number }): boolean }, b: typeof a): boolean {
  for (let x = 0; x < 1100; x += 7) for (let y = 0; y < 800; y += 9) if (a.covers({ x, y }) !== b.covers({ x, y })) return false;
  return true;
}

describe('a darkness change in a remote view costs the same however much fog the GM painted', () => {
  it('shapes only the darkness again, not every GM operation', () => {
    const gmFog = heavyFog(200);
    const cache = new FogCoverageCache();
    cache.get({ ...gmFog, [DARKNESS_ID]: darknessOp(300) }, 'remote:view-1');
    for (const x of [400, 500, 600]) {
      shaped.count = 0;
      const coverage = cache.get({ ...gmFog, [DARKNESS_ID]: darknessOp(x) }, 'remote:view-1');
      expect(shaped.count).toBe(1);
      expect(coverage?.covers({ x: x - 5, y: 700 })).toBe(true);
      expect(coverage?.covers({ x: x + 5, y: 700 })).toBe(false);
    }
  });

  it('gives the coverage a full replay gives, also when the darkness is not the last entry or ties', () => {
    const gmFog = heavyFog(20);
    const records = [
      { ...gmFog, [DARKNESS_ID]: darknessOp(300) },
      { ...gmFog, [DARKNESS_ID]: darknessOp(150) },
      { [DARKNESS_ID]: darknessOp(150), ...gmFog },
      { [DARKNESS_ID]: { ...darknessOp(120), timestamp: 49 }, ...gmFog },
      { [DARKNESS_ID]: { ...darknessOp(90), timestamp: 10 }, ...gmFog },
      { ...gmFog, [DARKNESS_ID]: { ...darknessOp(90), timestamp: 49 } },
      { ...gmFog, [DARKNESS_ID]: { ...darknessOp(60), isErasing: true } },
    ];
    let previous: ReturnType<typeof fogCoverage> | undefined;
    for (const record of records) {
      const grown = fogCoverage(record, previous);
      expect(sameCoverage(grown, fogCoverage(record))).toBe(true);
      previous = grown;
    }
  });

  it('a GM operation changed before the last still replays everything', () => {
    const gmFog = heavyFog(20);
    const first = fogCoverage({ ...gmFog, [DARKNESS_ID]: darknessOp(300) });
    const moved = { ...gmFog, p3: { ...gmFog.p3!, points: [{ x: 500, y: 500 }, { x: 540, y: 540 }] }, [DARKNESS_ID]: darknessOp(300) };
    shaped.count = 0;
    const next = fogCoverage(moved, first);
    expect(shaped.count).toBe(Object.keys(moved).length);
    expect(sameCoverage(next, fogCoverage(moved))).toBe(true);
  });
});
