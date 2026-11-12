import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { rangeBandName } from '../../grid/measurementFormat';
import { movementStepFor, NO_MOVEMENT_RULES, type MovementRules } from '../movementRules';
import { bandRings, MAX_RANGE_RINGS, rangeRings, rangesOffered, stepRings } from '../rangeRings';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };
const BANDS = [
  { name: 'Melee', maxSquares: 1 },
  { name: 'Very Close', maxSquares: 3 },
  { name: 'Close', maxSquares: 6 },
  { name: 'Far', maxSquares: 12 },
  { name: 'Very Far', maxSquares: 13 },
];
const BANDED: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: BANDS };
const MOVES: MovementRules = { steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }, { name: 'Dash', multiple: 2, color: '#eab308' }], countPerTurn: false };

describe('bandRings', () => {
  it('gives every band but the last a ring, since the last names every longer distance', () => {
    expect(bandRings(BANDS).map(({ name, label, color }) => [name, label, color])).toEqual([
      ['Melee', 'Melee', null], ['Very Close', 'Very Close', null], ['Close', 'Close', null], ['Far', 'Far', null],
    ]);
    expect(bandRings([{ name: 'Near', maxSquares: 6 }])).toEqual([]);
    expect(bandRings([])).toEqual([]);
  });

  it('ends each ring where the band\'s name ends: half a cell past its threshold', () => {
    for (const ring of bandRings(BANDS)) {
      // Twentieths of a cell, so the halves a band ends at are met to the bit.
      for (let twentieth = 0; twentieth <= 280; twentieth++) {
        const cells = twentieth / 20;
        const named = BANDS.findIndex((band) => band.name === rangeBandName(cells, BANDS));
        const ringed = BANDS.findIndex((band) => band.name === ring.name);
        expect(cells <= ring.reach, `${ring.name} at ${cells}`).toBe(named <= ringed);
      }
    }
  });

  it('leaves out a band an earlier one covers, one without a threshold, and rings past the most', () => {
    const odd = [{ name: 'A', maxSquares: 4 }, { name: 'B', maxSquares: 4 }, { name: 'C', maxSquares: 2 }, { name: 'D', maxSquares: 0 }, { name: 'E', maxSquares: 2.5 }, { name: 'F', maxSquares: 9 }, { name: 'Last', maxSquares: 10 }];
    expect(bandRings(odd).map((ring) => ring.name)).toEqual(['A', 'F']);
    const many = Array.from({ length: 30 }, (_, index) => ({ name: `Band ${index}`, maxSquares: index + 1 }));
    expect(bandRings(many)).toHaveLength(MAX_RANGE_RINGS);
  });
});

describe('stepRings', () => {
  it('gives each step a ring as far as the token moves in it, in the step\'s colour, named with its distance', () => {
    expect(stepRings(30, MOVES, FEET).map(({ name, label, color, reach }) => [name, label, color, Math.round(reach)])).toEqual([
      ['Move', 'Move · 30ft', '#22c55e', 6], ['Dash', 'Dash · 60ft', '#eab308', 12],
    ]);
    const metres: MeasurementSettings = { ...FEET, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5 };
    expect(stepRings(9, MOVES, metres).map(({ label, reach }) => [label, Math.round(reach)])).toEqual([['Move · 9m', 6], ['Dash · 18m', 12]]);
  });

  it('ends each ring where the step ends for a move', () => {
    const [move, dash] = stepRings(30, MOVES, FEET);
    for (let cells = 0; cells <= 14; cells += 0.25) {
      const step = movementStepFor(cells * 5, 30, MOVES);
      expect(cells <= move!.reach, `Move at ${cells}`).toBe(step !== 'beyond' && step?.name === 'Move');
      expect(cells <= dash!.reach, `Dash at ${cells}`).toBe(step !== 'beyond');
    }
  });

  it('has none without a speed, steps or a distance per cell', () => {
    expect(stepRings(0, MOVES, FEET)).toEqual([]);
    expect(stepRings(Number.NaN, MOVES, FEET)).toEqual([]);
    expect(stepRings(Infinity, MOVES, FEET)).toEqual([]);
    expect(stepRings(30, NO_MOVEMENT_RULES, FEET)).toEqual([]);
    expect(stepRings(30, MOVES, { ...FEET, unitDistance: 0 })).toEqual([]);
  });
});

describe('rangeRings', () => {
  it('reads the bands where the map measures in bands, whatever is clicked, and never its steps', () => {
    expect(rangeRings(BANDED, MOVES, null).map((ring) => ring.name)).toEqual(['Melee', 'Very Close', 'Close', 'Far']);
    expect(rangeRings(BANDED, MOVES, 30).map((ring) => ring.name)).toEqual(['Melee', 'Very Close', 'Close', 'Far']);
  });

  it('reads the steps of a token with a speed where the map measures distances, and nothing for a point or a token without', () => {
    expect(rangeRings(FEET, MOVES, 30).map((ring) => ring.name)).toEqual(['Move', 'Dash']);
    expect(rangeRings(FEET, MOVES, null)).toEqual([]);
    expect(rangeRings({ ...FEET, rangeBands: BANDS }, NO_MOVEMENT_RULES, 30)).toEqual([]);
  });
});

describe('rangesOffered', () => {
  it('offers the mode where bands end somewhere, or steps are set on a map that measures distances', () => {
    expect(rangesOffered(BANDED, NO_MOVEMENT_RULES)).toBe(true);
    expect(rangesOffered(FEET, MOVES)).toBe(true);
    expect(rangesOffered(FEET, NO_MOVEMENT_RULES)).toBe(false);
    expect(rangesOffered({ ...BANDED, rangeBands: [] }, MOVES)).toBe(false);
    expect(rangesOffered({ ...BANDED, rangeBands: [{ name: 'Only', maxSquares: 3 }] }, MOVES)).toBe(false);
    expect(rangesOffered(FEET, { steps: [], countPerTurn: true })).toBe(false);
  });
});
