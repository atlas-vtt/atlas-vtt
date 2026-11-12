import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { BEYOND_SPEED, dragMove, movedGameUnits } from '../dragMovement';
import type { MovementRules } from '../movementRules';

const MOVE = { name: 'Move', multiple: 1, color: '#22c55e' };
const DASH = { name: 'Dash', multiple: 2, color: '#f59e0b' };
const RULES: MovementRules = { steps: [MOVE, DASH], countPerTurn: false };

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const METRES: MeasurementSettings = { ...FEET, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 };
const BANDS: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 6 }] };

const move = (cells: number, speed: number | null = 30, extra: Partial<Parameters<typeof dragMove>[0]> = {}): ReturnType<typeof dragMove> =>
  dragMove({ cells, earlier: 0, speed, rules: RULES, settings: FEET, ...extra });

describe('dragMove', () => {
  it('reads the moved distance against the speed and takes the colour of the step it lies in', () => {
    expect(move(5)).toEqual({ label: '25 / 30ft', color: MOVE.color });
    expect(move(6)).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(7)).toEqual({ label: '35 / 30ft', color: DASH.color });
    expect(move(12)).toEqual({ label: '60 / 30ft', color: DASH.color });
  });

  it('is beyond every step past the last one', () => {
    expect(move(13)).toEqual({ label: '65 / 30ft', color: BEYOND_SPEED });
  });

  it('goes on from what the token moved earlier in its turn', () => {
    expect(move(2, 30, { earlier: 20 })).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(2, 30, { earlier: 25 })).toEqual({ label: '35 / 30ft', color: DASH.color });
    expect(move(2, 30, { earlier: 55 })).toEqual({ label: '65 / 30ft', color: BEYOND_SPEED });
    // An earlier distance that is no number above 0 adds nothing.
    for (const earlier of [0, -10, NaN, Infinity]) expect(move(2, 30, { earlier })?.label).toBe('10 / 30ft');
  });

  it('writes distances as the map does: the scene\'s distance per cell, one decimal, a unit of its own name', () => {
    expect(move(3, 9, { settings: METRES })).toEqual({ label: '4.5 / 9m', color: MOVE.color });
    expect(move(3, 7.5, { settings: METRES })?.label).toBe('4.5 / 7.5m');
    // A scene whose cells span 10 ft in a collection of 5 ft cells: the speed stays what it is.
    expect(move(3, 30, { settings: { ...FEET, unitDistance: 10 } })).toEqual({ label: '30 / 30ft', color: MOVE.color });
    expect(move(3, 30, { settings: { ...FEET, unitType: 'custom', unitName: 'pc' } })?.label).toBe('15 / 30 pc');
    expect(move(3, 30, { settings: { ...FEET, unitType: 'units' } })?.label).toBe('15 / 30u');
  });

  it('is none where a drag reads as a plain distance: no steps, no speed, range bands', () => {
    expect(move(5, null)).toBeNull();
    for (const speed of [0, -30, NaN, Infinity]) expect(move(5, speed), String(speed)).toBeNull();
    expect(move(5, 30, { rules: { steps: [], countPerTurn: true } })).toBeNull();
    expect(move(5, 30, { rules: undefined })).toBeNull();
    expect(move(5, 30, { settings: BANDS })).toBeNull();
    expect(move(NaN)).toBeNull();
  });
});

describe('movedGameUnits', () => {
  it('is the cells times what a cell spans on the map, and none in range bands', () => {
    expect(movedGameUnits(5, FEET)).toBe(25);
    expect(movedGameUnits(3, METRES)).toBe(4.5);
    expect(movedGameUnits(5, BANDS)).toBeNull();
    expect(movedGameUnits(NaN, FEET)).toBeNull();
  });
});
