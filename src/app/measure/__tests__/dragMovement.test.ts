import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { BEYOND_SPEED, dragMove, movedGameUnits } from '../dragMovement';
import type { MovementRules } from '../movementRules';

const MOVE = { name: 'Move', multiple: 1, color: '#22c55e' };
const DASH = { name: 'Dash', multiple: 2, color: '#f59e0b' };
const RULES: MovementRules = { steps: [MOVE, DASH], countPerTurn: false };

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const METRES: MeasurementSettings = { ...FEET, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 };
const BANDS: MeasurementSettings = {
  ...FEET, mode: 'abstract',
  rangeBands: [{ name: 'Close', maxSquares: 1 }, { name: 'Near', maxSquares: 6 }, { name: 'Double Near', maxSquares: 12 }, { name: 'Far', maxSquares: 13 }],
};

const move = (cells: number, speed: number | null = 30, extra: Partial<Parameters<typeof dragMove>[0]> = {}): ReturnType<typeof dragMove> =>
  dragMove({ cells, earlier: 0, speed, rules: RULES, settings: FEET, ...extra });

describe('dragMove', () => {
  it('reads the moved distance against how far its step reaches and takes that step\'s colour', () => {
    expect(move(5)).toEqual({ label: '25 / 30ft', color: MOVE.color });
    expect(move(6)).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(7)).toEqual({ label: '35 / 60ft', color: DASH.color });
    expect(move(9)).toEqual({ label: '45 / 60ft', color: DASH.color });
    expect(move(12)).toEqual({ label: '60 / 60ft', color: DASH.color });
  });

  it('is beyond every step past the last one, whose reach it still names', () => {
    expect(move(13)).toEqual({ label: '65 / 60ft', color: BEYOND_SPEED });
  });

  it('names the reach of a first step that is not one move', () => {
    // A third of the stated rate in an encounter, all of it at a run: 120 gives 40 and 120, 90 gives 30 and 90.
    const thirds: MovementRules = { steps: [{ ...MOVE, multiple: 1 / 3 }, { ...DASH, name: 'Run', multiple: 1 }], countPerTurn: false };
    expect(move(8, 120, { rules: thirds })).toEqual({ label: '40 / 40ft', color: MOVE.color });
    expect(move(9, 120, { rules: thirds })).toEqual({ label: '45 / 120ft', color: DASH.color });
    expect(move(6, 90, { rules: thirds })).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(7, 90, { rules: thirds })?.label).toBe('35 / 90ft');
    expect(move(4, 60, { rules: thirds })).toEqual({ label: '20 / 20ft', color: MOVE.color });
    // A move of twice the stat, a run of four times.
    const doubled: MovementRules = { steps: [{ ...MOVE, multiple: 2 }, { ...DASH, multiple: 4 }], countPerTurn: false };
    const metres = { ...METRES, unitDistance: 2, ruleDistance: 2 };
    expect(move(6, 6, { rules: doubled, settings: metres })).toEqual({ label: '12 / 12m', color: MOVE.color });
    expect(move(7, 6, { rules: doubled, settings: metres })).toEqual({ label: '14 / 24m', color: DASH.color });
    expect(move(13, 6, { rules: doubled, settings: metres })).toEqual({ label: '26 / 24m', color: BEYOND_SPEED });
  });

  it('goes on from what the token moved earlier in its turn', () => {
    expect(move(2, 30, { earlier: 20 })).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(2, 30, { earlier: 25 })).toEqual({ label: '35 / 60ft', color: DASH.color });
    expect(move(2, 30, { earlier: 55 })).toEqual({ label: '65 / 60ft', color: BEYOND_SPEED });
    // An earlier distance that is no number above 0 adds nothing.
    for (const earlier of [0, -10, NaN, Infinity]) expect(move(2, 30, { earlier })?.label).toBe('10 / 30ft');
  });

  it('counts a map of range bands like any other and writes both as the bands they reach', () => {
    const bands = (cells: number, extra: Partial<Parameters<typeof dragMove>[0]> = {}): ReturnType<typeof dragMove> => move(cells, 30, { settings: BANDS, ...extra });
    expect(bands(1)).toEqual({ label: `Close · ${MOVE.name}`, color: MOVE.color });
    expect(bands(6)).toEqual({ label: `Near · ${MOVE.name}`, color: MOVE.color });
    expect(bands(7)).toEqual({ label: `Double Near · ${DASH.name}`, color: DASH.color });
    expect(bands(12)).toEqual({ label: `Double Near · ${DASH.name}`, color: DASH.color });
    expect(bands(13)).toEqual({ label: 'Far', color: BEYOND_SPEED });
    // What the token moved earlier in its turn is in game units there too.
    expect(bands(2, { earlier: 30 })).toEqual({ label: `Double Near · ${DASH.name}`, color: DASH.color });
    // Bands without names are written in squares, as a ruler writes them.
    expect(bands(4, { settings: { ...BANDS, rangeBands: [] } })?.label).toBe('4 sq / 6 sq');
  });

  it('writes distances as the map does: the scene\'s distance per cell, one decimal, a unit of its own name', () => {
    expect(move(3, 9, { settings: METRES })).toEqual({ label: '4.5 / 9m', color: MOVE.color });
    expect(move(3, 7.5, { settings: METRES })?.label).toBe('4.5 / 7.5m');
    // A scene whose cells span 10 ft in a collection of 5 ft cells: the speed stays what it is.
    expect(move(3, 30, { settings: { ...FEET, unitDistance: 10 } })).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(3, 30, { settings: { ...FEET, unitType: 'custom', unitName: 'pc' } })?.label).toBe('15 / 30 pc');
    expect(move(3, 30, { settings: { ...FEET, unitType: 'units' } })?.label).toBe('15 / 30u');
  });

  it('is none where a drag reads as a plain distance: no steps, no speed, cells that span nothing', () => {
    expect(move(5, null)).toBeNull();
    for (const speed of [0, -30, NaN, Infinity]) expect(move(5, speed), String(speed)).toBeNull();
    expect(move(5, 30, { rules: { steps: [], countPerTurn: true } })).toBeNull();
    expect(move(5, 30, { rules: undefined })).toBeNull();
    for (const unitDistance of [0, -5, NaN]) expect(move(5, 30, { settings: { ...BANDS, unitDistance } }), String(unitDistance)).toBeNull();
    expect(move(NaN)).toBeNull();
  });
});

describe('movedGameUnits', () => {
  it('is the cells times what a cell spans on the map, range bands included', () => {
    expect(movedGameUnits(5, FEET)).toBe(25);
    expect(movedGameUnits(3, METRES)).toBe(4.5);
    expect(movedGameUnits(5, BANDS)).toBe(25);
    expect(movedGameUnits(NaN, FEET)).toBeNull();
    expect(movedGameUnits(5, { unitDistance: 0 })).toBeNull();
  });
});
