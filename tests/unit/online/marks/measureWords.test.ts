import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../../../src/app/measure/measureTypes';
import { legacyMeasures, measureFromFull, measureFromShared, measureInFull, toldMeasures, type ToldMeasure } from '../../../../src/app/online/marks/measureWords.ts';
import { MAX_KEPT, MAX_RULER_NUMBERS, type FullMeasure } from '../../../../src/app/online/protocol/index.ts';

const at = (x: number, y = 0): { x: number; y: number } => ({ x, y });

describe('a measurement in the protocol\'s words', () => {
  const told: ToldMeasure[] = [
    { shape: 'ruler', points: [at(0), at(70), at(70, 140)] },
    { shape: 'circle', points: [at(10, 20), at(80, 20)] },
    { shape: 'cone', points: [at(0), at(0, 70)], walls: false },
    { shape: 'square', points: [at(0), at(140)], walls: false },
    { shape: 'line', points: [at(0), at(210)], width: 35 },
  ];

  it('is told in full and read back as it was', () => {
    for (const measure of told) expect(measureFromFull(measureInFull(measure)!), measure.shape).toEqual(measure);
  });

  it('is told to a tenth of a pixel, an area by its origin and its end, and a ruler never as one that walls do not stop', () => {
    expect(measureInFull({ shape: 'circle', points: [at(0.04, 0.06), at(35, 35), at(70.26, 0)] })).toEqual({ shape: 'circle', pts: [0, 0.1, 70.3, 0] });
    expect(measureInFull({ shape: 'ruler', points: [at(0), at(70)], walls: false })).toEqual({ shape: 'ruler', pts: [0, 0, 70, 0] });
  });

  it('keeps a width only for a line, and only one the protocol takes', () => {
    const line: Measurement = { shape: 'line', points: [at(0), at(70)] };
    expect(measureInFull({ ...line, width: 0.04 })).toEqual({ shape: 'line', pts: [0, 0, 70, 0] });
    expect(measureInFull({ ...line, width: Number.NaN })).toEqual({ shape: 'line', pts: [0, 0, 70, 0] });
    expect(measureInFull({ ...line, width: 5e6 })).toEqual({ shape: 'line', pts: [0, 0, 70, 0] });
    expect(measureInFull({ shape: 'square', points: [at(0), at(70)], width: 70 })).toEqual({ shape: 'square', pts: [0, 0, 70, 0] });
  });

  it('is not told where the protocol cannot say it: one point, a point off every map, more points than a message holds', () => {
    const points = (count: number): { x: number; y: number }[] => Array.from({ length: count }, (_, index) => at(index));
    expect(measureInFull({ shape: 'ruler', points: [at(0)] })).toBeNull();
    expect(measureInFull({ shape: 'ruler', points: [at(0), at(Number.NaN)] })).toBeNull();
    expect(measureInFull({ shape: 'circle', points: [at(0), at(1e7)] })).toBeNull();
    expect(measureInFull({ shape: 'ruler', points: points(MAX_RULER_NUMBERS / 2) })?.pts).toHaveLength(MAX_RULER_NUMBERS);
    expect(measureInFull({ shape: 'ruler', points: points(MAX_RULER_NUMBERS / 2 + 1) })).toBeNull();
  });

  it('reads the older words as their sender drew them: a line as a ruler of one leg, a circle or a cone whole', () => {
    expect(measureFromShared({ shape: 'line', a: [0, 0], b: [70, 0] })).toEqual({ shape: 'ruler', points: [at(0), at(70)] });
    expect(measureFromShared({ shape: 'cone', a: [0, 0], b: [70, 0] })).toEqual({ shape: 'cone', points: [at(0), at(70)], walls: false });
  });

  it('takes a sender\'s measurements in full where it tells any, else in the older words', () => {
    const older = { live: { shape: 'line', a: [0, 0], b: [70, 0] }, kept: [] } as const;
    expect(toldMeasures(older)).toEqual({ live: { shape: 'ruler', points: [at(0), at(70)] }, kept: [] });
    expect(toldMeasures({ ...older, full: { live: null, kept: [{ shape: 'square', pts: [0, 0, 70, 0] }] } })).toEqual({ live: null, kept: [{ shape: 'square', points: [at(0), at(70)] }] });
  });
});

describe('the older words made from measurements in full, for a page that keeps its own', () => {
  const route: FullMeasure = { shape: 'ruler', pts: [0, 0, 70, 0, 70, 70, 140, 70] };

  it('are a ruler\'s legs while a message holds them, else one line for each ruler, and of more than that the newest', () => {
    const few = legacyMeasures({ live: route, kept: [route] }, false, MAX_KEPT);
    expect(few.live).toEqual({ shape: 'line', a: [70, 70], b: [140, 70] });
    expect(few.kept).toHaveLength(5);
    const many = legacyMeasures({ live: null, kept: Array.from({ length: 7 }, () => route) }, false, MAX_KEPT);
    expect(many.kept).toEqual(Array.from({ length: 7 }, () => ({ shape: 'line', a: [0, 0], b: [140, 70] })));
    const most = legacyMeasures({ live: null, kept: Array.from({ length: MAX_KEPT + 3 }, (_, index) => ({ shape: 'ruler' as const, pts: [index, 0, 70, 0] })) }, false, MAX_KEPT);
    expect(most.kept.map((measure) => measure.a[0])).toEqual(Array.from({ length: MAX_KEPT }, (_, index) => index + 3));
  });
});
