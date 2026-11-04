import { describe, expect, it } from 'vitest';

import { chainDepth, DIE_BODIES, layoutDice, restingFrame, sceneFromRolls } from '../../../src/app/dice3d/diceScene';

/** The percentile reading: each die shows its digit with 10 as 0, 00 + 0 = 100. */
function readPercentile(faces: number[]): number {
  const total = (faces[0]! % 10) * 10 + (faces[1]! % 10);
  return total === 0 ? 100 : total;
}

describe('scene from rolls', () => {
  it('shows real bodies as they landed', () => {
    for (const sides of DIE_BODIES) {
      expect(sceneFromRolls([{ max: sides, value: 1 }])).toEqual({
        plan: [{ sides, role: 'plain' }],
        faces: [1],
      });
    }
    const scene = sceneFromRolls([
      { max: 6, value: 4 },
      { max: 6, value: 2 },
      { max: 20, value: 17 },
    ]);
    expect(scene?.plan.map((die) => die.sides)).toEqual([6, 6, 20]);
    expect(scene?.faces).toEqual([4, 2, 17]);
  });

  it('throws d2 and d3 on a d6, landing on the highest face of the band', () => {
    const d2 = sceneFromRolls([{ max: 2, value: 1 }]);
    expect(d2?.plan).toEqual([{ sides: 6, role: 'plain', fold: 3 }]);
    expect(d2?.faces).toEqual([3]);
    expect(sceneFromRolls([{ max: 2, value: 2 }])?.faces).toEqual([6]);

    const d3 = sceneFromRolls([{ max: 3, value: 2 }]);
    expect(d3?.plan).toEqual([{ sides: 6, role: 'plain', fold: 2 }]);
    expect([1, 2, 3].map((value) => sceneFromRolls([{ max: 3, value }])?.faces[0])).toEqual([
      2, 4, 6,
    ]);
  });

  it('folds each mimicked face back to the rolled value', () => {
    for (const max of [2, 3]) {
      for (let value = 1; value <= max; value++) {
        const scene = sceneFromRolls([{ max, value }])!;
        expect(Math.ceil(scene.faces[0]! / scene.plan[0]!.fold!)).toBe(value);
      }
    }
  });

  it('makes a d100 two d10s, tens and units', () => {
    const scene = sceneFromRolls([{ max: 100, value: 37 }])!;
    expect(scene.plan).toEqual([
      { sides: 10, role: 'tens' },
      { sides: 10, role: 'units' },
    ]);
    expect(scene.faces).toEqual([3, 7]);
    expect(sceneFromRolls([{ max: 100, value: 19 }])?.faces).toEqual([1, 9]);
    expect(sceneFromRolls([{ max: 100, value: 5 }])?.faces).toEqual([10, 5]);
    expect(sceneFromRolls([{ max: 100, value: 100 }])?.faces).toEqual([10, 10]);
    expect(sceneFromRolls([{ max: 100, value: 10 }])?.faces).toEqual([1, 10]);
  });

  it('reads every percentile value back through the printed rule', () => {
    for (let value = 1; value <= 100; value++) {
      const scene = sceneFromRolls([{ max: 100, value }])!;
      for (const face of scene.faces) {
        expect(face).toBeGreaterThanOrEqual(1);
        expect(face).toBeLessThanOrEqual(10);
      }
      expect(readPercentile(scene.faces)).toBe(value);
    }
  });

  it('rejects rolls without a body', () => {
    expect(sceneFromRolls([])).toBeNull();
    for (const max of [1, 5, 7, 13, 30]) {
      expect(sceneFromRolls([{ max, value: 1 }])).toBeNull();
    }
    expect(
      sceneFromRolls([
        { max: 6, value: 3 },
        { max: 13, value: 5 },
      ]),
    ).toBeNull();
  });

  it('rejects subtracted dice', () => {
    expect(
      sceneFromRolls([
        { max: 20, value: 12 },
        { max: 4, value: 2, negative: true },
      ]),
    ).toBeNull();
  });

  it('rejects more dice than fit on the stage', () => {
    const d6 = { max: 6, value: 3 };
    expect(sceneFromRolls(Array.from({ length: 20 }, () => d6))?.plan).toHaveLength(20);
    expect(sceneFromRolls(Array.from({ length: 21 }, () => d6))).toBeNull();
  });

  it('rejects a percentile die in company', () => {
    expect(
      sceneFromRolls([
        { max: 100, value: 42 },
        { max: 6, value: 3 },
      ]),
    ).toBeNull();
    expect(
      sceneFromRolls([
        { max: 100, value: 42 },
        { max: 100, value: 7 },
      ]),
    ).toBeNull();
  });
});

describe('stage layout', () => {
  it('puts a single die in the centre', () => {
    const { offsets, radius } = layoutDice(1);
    expect(offsets).toEqual([[0, 0]]);
    expect(radius).toBeCloseTo(0.92, 6);
  });

  it('moves several dice closer instead of overlapping them', () => {
    for (let count = 2; count <= 20; count++) {
      const { offsets, radius } = layoutDice(count);
      expect(offsets).toHaveLength(count);
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = offsets[i]![0] - offsets[j]![0];
          const dy = offsets[i]![1] - offsets[j]![1];
          expect(Math.hypot(dx, dy)).toBeGreaterThan(radius * 2);
        }
      }
    }
  });

  it('keeps the rows inside the stage', () => {
    for (let count = 1; count <= 20; count++) {
      const { offsets, radius } = layoutDice(count);
      for (const [x, y] of offsets) {
        expect(Math.abs(x) + radius).toBeLessThanOrEqual(2.0);
        expect(Math.abs(y) + radius).toBeLessThanOrEqual(2.0);
      }
    }
  });
});

describe('restingFrame', () => {
  it('frames every resting die of a layout in a field shaped like it', () => {
    for (let count = 1; count <= 20; count++) {
      const { offsets, radius } = layoutDice(count);
      const { halfWidth, aspect } = restingFrame(offsets, radius);
      expect(aspect).toBeGreaterThanOrEqual(1);
      expect(aspect).toBeLessThanOrEqual(3);
      for (const [x, z] of offsets) {
        expect(Math.abs(x) + radius).toBeLessThan(halfWidth);
        // The field shows `aspect` times less table in depth than across.
        expect(Math.abs(z) + radius).toBeLessThan(halfWidth / aspect);
      }
    }
  });

  it('frames a single die closely in a square', () => {
    const { offsets, radius } = layoutDice(1);
    expect(restingFrame(offsets, radius)).toEqual({ halfWidth: expect.closeTo(1.16, 1), aspect: 1 });
  });
});

describe('exploded dice on the stage', () => {
  const d6 = (value: number, more: object = {}): { max: number; value: number } => ({ max: 6, value, ...more });

  it('plans each extra die after the die it was rolled for', () => {
    const scene = sceneFromRolls([d6(6), d6(6, { exploded: true }), d6(2, { exploded: true }), d6(3)]);
    expect(scene?.plan.map((die) => die.follows)).toEqual([undefined, 0, 1, undefined]);
    expect(scene?.faces).toEqual([6, 6, 2, 3]);
    expect(chainDepth(scene!.plan)).toBe(2);
  });

  it('shows a die that an explosion subtracts, but no other subtracted die', () => {
    const fumble = sceneFromRolls([{ max: 10, value: 1 }, { max: 10, value: 7, exploded: true, negative: true }]);
    expect(fumble?.plan[1]).toEqual({ sides: 10, role: 'plain', follows: 0, subtracts: true });
    expect(sceneFromRolls([d6(4), { max: 4, value: 2, negative: true }])).toBeNull();
  });

  it('has no chain without an explosion', () => {
    expect(chainDepth(sceneFromRolls([d6(4), d6(6)])!.plan)).toBe(0);
  });
});

