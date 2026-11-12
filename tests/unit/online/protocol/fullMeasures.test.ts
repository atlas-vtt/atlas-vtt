import { describe, expect, it } from 'vitest';
import { MAX_UNIT_NAME as GRID_UNIT_NAME } from '../../../../src/app/grid/measurementFormat';
import { MAX_KEPT, MAX_MARK_KEPT, MAX_RULER_NUMBERS, MAX_UNIT_NAME, parseGmMessage, parsePlayerMessage } from '../../../../src/app/online/protocol/index.ts';

const PLAYER = 'a'.repeat(20);
const older = { color: '#66ffa9', live: { shape: 'cone', a: [0, 0], b: [70, 0] }, kept: [{ shape: 'line', a: [1, 1], b: [2, 2] }] };
const measure = { t: 'measure', scene: 's1', ...older };
const marks = (state: object): object => ({ t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', ...state }, { who: PLAYER, ...older }] });
const ruler = (points: number): { shape: string; pts: number[] } => ({ shape: 'ruler', pts: Array.from({ length: 2 * points }, (_, index) => index * 10) });
const square = { shape: 'square', pts: [0, 0, 70, 0] };

describe('measurements told in full', () => {
  const shapes = [
    ruler(2), ruler(5), ruler(MAX_RULER_NUMBERS / 2),
    { shape: 'circle', pts: [0, 0, 70, 0] }, { shape: 'cone', pts: [0, 0, 0, 70], free: true }, { ...square, free: true },
    { shape: 'line', pts: [10.5, -20, 300, 40], width: 70 }, { shape: 'line', pts: [0, 0, 70, 0] },
  ];

  it('are read of every shape, from a player and from the GM, beside the older words', () => {
    for (const shape of shapes) {
      const full = { live: shape, kept: [shape, square] };
      expect(parsePlayerMessage({ ...measure, full }), JSON.stringify(shape)).toEqual({ ...measure, full });
      expect(parseGmMessage(marks({ ...older, full, span: 33 })), JSON.stringify(shape)).toEqual(marks({ ...older, full, span: 33 }));
    }
    const none = { live: null, kept: [] };
    expect(parsePlayerMessage({ ...measure, live: null, kept: [], full: none })).toEqual({ ...measure, live: null, kept: [], full: none });
  });

  it('are not there for a sender that tells none: the older words read as they always did', () => {
    expect(parsePlayerMessage(measure)).toEqual(measure);
    expect(parsePlayerMessage(measure)).not.toHaveProperty('full');
    expect(parseGmMessage(marks(older))).toEqual(marks(older));
  });

  it('keep only what the protocol names of a measurement', () => {
    const full = { live: { ...square, colour: 'red', effect: 'fire' }, kept: [], more: 1 };
    expect(parsePlayerMessage({ ...measure, full })).toEqual({ ...measure, full: { live: square, kept: [] } });
  });

  it('refuse the whole message for one that is malformed', () => {
    const bad: unknown[] = [
      ruler(MAX_RULER_NUMBERS / 2 + 1), ruler(1), { shape: 'ruler', pts: [0, 0, 70] }, { shape: 'ruler', pts: [] },
      { shape: 'circle', pts: [0, 0, 70, 0, 70, 70] }, { shape: 'square', pts: [0, 0] }, { shape: 'line', pts: [0, 0, 70, 0, 140, 0], width: 70 },
      { shape: 'sphere', pts: [0, 0, 70, 0] }, { shape: 'line', a: [0, 0], b: [70, 0] }, { shape: 'cone', pts: [0, 0, Number.NaN, 0] },
      { shape: 'cone', pts: [0, 0, 2e6, 0] }, { shape: 'cone', pts: [0, 0, '70', 0] }, { shape: 'cone', pts: 'all' },
      { shape: 'line', pts: [0, 0, 70, 0], width: 0 }, { shape: 'line', pts: [0, 0, 70, 0], width: -5 }, { shape: 'line', pts: [0, 0, 70, 0], width: 2e6 },
      { shape: 'line', pts: [0, 0, 70, 0], width: '70' }, { shape: 'circle', pts: [0, 0, 70, 0], width: 70 }, { ...ruler(3), width: 70 },
      { ...square, free: false }, { ...square, free: 1 }, { ...ruler(3), free: true },
      'ruler', [],
    ];
    for (const shape of bad) {
      expect(parsePlayerMessage({ ...measure, full: { live: shape, kept: [] } }), JSON.stringify(shape)).toBeNull();
      expect(parsePlayerMessage({ ...measure, full: { live: null, kept: [square, shape] } }), JSON.stringify(shape)).toBeNull();
      expect(parseGmMessage(marks({ ...older, full: { live: null, kept: [shape] } })), JSON.stringify(shape)).toBeNull();
    }
    for (const full of [null, 'all', [], { live: null }, { kept: [] }, { live: null, kept: 'all' }]) expect(parsePlayerMessage({ ...measure, full }), JSON.stringify(full)).toBeNull();
  });

  it('hold as many kept ones as the older words: a player\'s fewer than a sender\'s in the GM\'s marks', () => {
    const kept = (count: number): object => ({ live: null, kept: Array.from({ length: count }, () => square) });
    expect(parsePlayerMessage({ ...measure, full: kept(MAX_KEPT) })).not.toBeNull();
    expect(parsePlayerMessage({ ...measure, full: kept(MAX_KEPT + 1) })).toBeNull();
    expect(parseGmMessage(marks({ ...older, full: kept(MAX_MARK_KEPT) }))).not.toBeNull();
    expect(parseGmMessage(marks({ ...older, full: kept(MAX_MARK_KEPT + 1) }))).toBeNull();
  });
});

describe('the rules that came later', () => {
  const measurement = { mode: 'metric', unitType: 'custom', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
  const rules = { t: 'rules', scene: 's1', grid: { type: 'square', size: 70, offsetX: 0, offsetY: 0 }, snap: true, measurement, accent: null };
  const read = (later: object): unknown => {
    const parsed = parseGmMessage({ ...rules, measurement: { ...measurement, ...later } });
    return parsed?.t === 'rules' ? parsed.measurement : null;
  };

  it('are read where a GM tells them', () => {
    const later = { manhattan: true, coneEnd: 'flat', cellRule: 'any', unitName: 'ly' };
    expect(read(later)).toEqual({ ...measurement, ...later });
    expect(read({ cellRule: 'centre', unitName: 'x'.repeat(MAX_UNIT_NAME) })).toEqual({ ...measurement, cellRule: 'centre', unitName: 'x'.repeat(MAX_UNIT_NAME) });
    expect(read({})).toEqual(measurement);
    expect(MAX_UNIT_NAME).toBe(GRID_UNIT_NAME);
  });

  it('are left out one by one where malformed, and the measurement is read by its older fields', () => {
    for (const later of [
      { manhattan: false }, { manhattan: 'yes' }, { coneEnd: 'round' }, { coneEnd: 'spiral' }, { cellRule: 'half' }, { cellRule: 'diagram' }, { cellRule: 3 },
      { unitName: '' }, { unitName: 'x'.repeat(MAX_UNIT_NAME + 1) }, { unitName: 7 }, { unitName: null },
    ]) expect(read(later), JSON.stringify(later)).toEqual(measurement);
    expect(read({ manhattan: 1, coneEnd: 'flat', cellRule: 'diagram', unitName: 'mi' })).toEqual({ ...measurement, coneEnd: 'flat', unitName: 'mi' });
  });

  it('do not make room for a diagonal rule the older field cannot say', () => {
    expect(read({ diagonalRule: 'manhattan', manhattan: true })).toBeNull();
  });
});
