import { describe, expect, it } from 'vitest';
import { isAura, measureList, measureMovedWithMap, measuresFromFile, readMeasure } from '../../../src/app/measure/keptMeasures';
import { MAX_AURA, MAX_MEASURES, MAX_RULER_POINTS, type KeptMeasure } from '../../../src/app/measure/measureTypes';
import { measureShownToPlayers } from '../../../src/app/vision/measureOrigin';

const A = { x: 0, y: 0 };
const B = { x: 140, y: 70 };
const ruler = (id: string, overrides: Record<string, unknown> = {}): KeptMeasure => ({ id, kind: 'measure', shape: 'ruler', points: [A, B], ...overrides }) as KeptMeasure;
const path = (count: number): { x: number; y: number }[] => Array.from({ length: count }, (_, index) => ({ x: index * 70, y: 0 }));

describe('kept measurements as they are read', () => {
  it('reads a measurement with nothing wrong as itself, so an unchanged one compares as unchanged', () => {
    const kept = ruler('m', { color: '#aa3300', hidden: true, by: 'player-1', level: 'upper', origin: { tokenIds: ['t1'], unseenAtStart: false } });
    const record = { m: kept };
    expect(measureList(record)).toEqual([kept]);
    expect(measureList(record)[0]).toBe(kept);
  });

  it('passes over what is no measurement: no object, an unknown shape, points that are none or do not fit the shape', () => {
    const record = {
      text: 'ruler',
      none: null,
      shape: ruler('shape', { shape: 'spiral' }),
      missing: { id: 'missing', kind: 'measure', shape: 'ruler' },
      short: ruler('short', { points: [A] }),
      broken: ruler('broken', { points: [A, { x: Number.NaN, y: 0 }] }),
      infinite: ruler('infinite', { points: [A, { x: Infinity, y: 0 }] }),
      strings: ruler('strings', { points: [A, { x: '1', y: 0 }] }),
      long: ruler('long', { points: path(MAX_RULER_POINTS + 1) }),
      area: ruler('area', { shape: 'circle', points: [A, B, A] }),
      good: ruler('good', { points: path(MAX_RULER_POINTS) }),
      cone: ruler('cone', { shape: 'cone' }),
    } as unknown as Record<string, KeptMeasure>;
    expect(measureList(record).map(({ id }) => id)).toEqual(['good', 'cone']);
    expect(measureList(undefined)).toEqual([]);
    expect(measureList('measures' as never)).toEqual([]);
    expect(measureList([] as never)).toEqual([]);
  });

  it('reads fields a hand edit broke as unset, and names a measurement by its place in the record', () => {
    const record = { place: ruler('other', { kind: 'ruler', color: 'red', hidden: 'yes', by: 7, width: -3, level: 4 }) };
    expect(measureList(record)).toEqual([{ id: 'place', kind: 'measure', shape: 'ruler', points: [A, B] }]);
    const line = { l: ruler('l', { shape: 'line', width: 35, color: '#00ff00' }) };
    expect(measureList(line)[0]).toMatchObject({ width: 35, color: '#00ff00' });
  });

  it('keeps on a mended view what this Atlas does not know, and hands out the same view each time', () => {
    const value = ruler('m', { color: 'red', glow: 't9', effect: { kind: 'fire' } });
    const first = readMeasure('m', value);
    expect(first).toEqual({ id: 'm', kind: 'measure', shape: 'ruler', points: [A, B], glow: 't9', effect: { kind: 'fire' } });
    expect(readMeasure('m', value)).toBe(first);
    expect(value).toMatchObject({ color: 'red' });
  });

  it('reads an aura only as a circle that names its token and its reach: one of them alone, or on another shape, says nothing', () => {
    const circle = (more: Record<string, unknown>): KeptMeasure => ruler('m', { shape: 'circle', ...more });
    const sound = circle({ follows: 't1', aura: 10 });
    expect(readMeasure('m', sound)).toBe(sound);
    expect(isAura(readMeasure('m', sound)!)).toBe(true);
    for (const broken of [{ follows: 't1' }, { aura: 10 }, { follows: '', aura: 10 }, { follows: 7, aura: 10 }, { follows: 't1', aura: 0 }, { follows: 't1', aura: -5 }, { follows: 't1', aura: '10' }, { follows: 't1', aura: Infinity }, { follows: 't1', aura: MAX_AURA + 1 }]) {
      const value = circle(broken);
      const read = readMeasure('m', value)!;
      expect(read).toEqual({ id: 'm', kind: 'measure', shape: 'circle', points: [A, B] });
      expect(isAura(read)).toBe(false);
      // The record stays as it came, for the next save.
      expect(value).toMatchObject(broken);
    }
    expect(isAura(readMeasure('m', ruler('m', { follows: 't1', aura: 10 }))!)).toBe(false);
    expect(readMeasure('m', ruler('m', { shape: 'cone', follows: 't1', aura: 10 }))).toEqual({ id: 'm', kind: 'measure', shape: 'cone', points: [A, B] });
  });

  it('never shows players a measurement whose origin cannot be read', () => {
    const seen = (): boolean => true;
    const read = (origin: unknown): KeptMeasure => readMeasure('m', ruler('m', { origin }))!;
    expect(read(undefined).origin).toBeUndefined();
    expect(measureShownToPlayers(read({ tokenIds: ['t1'], unseenAtStart: false }).origin!, seen)).toBe(true);
    for (const broken of ['t1', { tokenIds: 't1', unseenAtStart: false }, { tokenIds: [1], unseenAtStart: false }, { tokenIds: ['t1'] }, { tokenIds: Array.from({ length: 500 }, String), unseenAtStart: false }]) {
      expect(measureShownToPlayers(read(broken).origin!, seen)).toBe(false);
    }
  });

  it('reads the first measurements up to the limit, in the order they were made', () => {
    const record: Record<string, KeptMeasure> = {};
    for (let index = 0; index < MAX_MEASURES + 20; index++) record[`m${index}`] = ruler(`m${index}`);
    const list = measureList(record);
    expect(list).toHaveLength(MAX_MEASURES);
    expect(list[0]!.id).toBe('m0');
    expect(list[MAX_MEASURES - 1]!.id).toBe(`m${MAX_MEASURES - 1}`);
  });

  it('is the same list while the record is the same', () => {
    const record = { m: ruler('m') };
    expect(measureList(record)).toBe(measureList(record));
    expect(measureList({ ...record })).not.toBe(measureList(record));
  });

  it('keeps a file\'s record as it is, and nothing where the file holds something else', () => {
    const record = { m: ruler('m'), junk: 3 };
    expect(measuresFromFile(record)).toBe(record);
    expect(measuresFromFile(undefined)).toBeUndefined();
    expect(measuresFromFile([ruler('m')])).toBeUndefined();
    expect(measuresFromFile('measures')).toBeUndefined();
  });
});

describe('a kept measurement when the map under it is drawn another way', () => {
  const move = (point: { x: number; y: number }): { x: number; y: number } => ({ x: point.x * 2 + 10, y: point.y * 3 });

  it('moves every point and keeps a width and everything else', () => {
    const line = ruler('l', { shape: 'line', width: 35, color: '#00ff00', follows: 't9' });
    expect(measureMovedWithMap(line, move)).toEqual({ ...line, points: [{ x: 10, y: 0 }, { x: 290, y: 210 }] });
  });

  it('leaves one whose points cannot be read as it is', () => {
    const broken = ruler('b', { points: [A, { x: 'far', y: 0 }] });
    expect(measureMovedWithMap(broken, move)).toBe(broken);
    const pointless = { id: 'p', kind: 'measure' };
    expect(measureMovedWithMap(pointless, move)).toBe(pointless);
  });
});
