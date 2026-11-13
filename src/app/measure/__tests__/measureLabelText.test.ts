import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { measureLabelText } from '../measureLabelText';

const GRID: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
const O = { x: 35, y: 35 };

describe('measureLabelText', () => {
  it('gives a circle and a cone their size', () => {
    expect(measureLabelText({ shape: 'circle', points: [O, { x: 315, y: 35 }] }, GRID, FEET)).toBe('20ft');
    expect(measureLabelText({ shape: 'cone', points: [O, { x: 35, y: 140 }] }, GRID, FEET)).toBe('7.5ft');
  });

  it('measures an area straight, whatever the diagonal rule', () => {
    const diagonal = { x: O.x + 280 * Math.SQRT1_2, y: O.y + 280 * Math.SQRT1_2 };
    expect(measureLabelText({ shape: 'circle', points: [O, diagonal] }, GRID, FEET)).toBe('20ft');
  });

  it('gives a line and a square their length and width, the unit once', () => {
    expect(measureLabelText({ shape: 'line', points: [O, { x: 315, y: 35 }] }, GRID, FEET)).toBe('20 × 5ft');
    expect(measureLabelText({ shape: 'line', points: [O, { x: 315, y: 35 }], width: 140 }, GRID, FEET)).toBe('20 × 10ft');
    expect(measureLabelText({ shape: 'square', points: [O, { x: 245, y: 35 }] }, GRID, FEET)).toBe('15 × 15ft');
  });

  it('writes a unit the GM named as distances write it', () => {
    const miles: MeasurementSettings = { ...FEET, unitType: 'custom', unitName: 'mi', unitDistance: 6 };
    expect(measureLabelText({ shape: 'circle', points: [O, { x: 175, y: 35 }] }, GRID, miles)).toBe('12 mi');
    expect(measureLabelText({ shape: 'line', points: [O, { x: 175, y: 35 }] }, GRID, miles)).toBe('12 × 6 mi');
  });

  it('adds the number of tokens in an area', () => {
    expect(measureLabelText({ shape: 'circle', points: [O, { x: 315, y: 35 }] }, GRID, FEET, 4)).toBe('20ft · 4');
    expect(measureLabelText({ shape: 'line', points: [O, { x: 315, y: 35 }] }, GRID, FEET, 1)).toBe('20 × 5ft · 1');
    expect(measureLabelText({ shape: 'circle', points: [O, { x: 315, y: 35 }] }, GRID, FEET, 0)).toBe('20ft');
  });

  it('names the range band of an area\'s length, and no width', () => {
    const bands: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 2 }, { name: 'Far', maxSquares: 6 }] };
    expect(measureLabelText({ shape: 'circle', points: [O, { x: 315, y: 35 }] }, GRID, bands)).toBe('Far');
    expect(measureLabelText({ shape: 'line', points: [O, { x: 175, y: 35 }] }, GRID, bands, 2)).toBe('Close · 2');
  });

  it('measures a ruler along its path by the diagonal rule', () => {
    const path = [O, { x: 175, y: 175 }, { x: 315, y: 175 }];
    expect(measureLabelText({ shape: 'ruler', points: path }, GRID, FEET)).toBe('25ft');
    expect(measureLabelText({ shape: 'ruler', points: path }, GRID, { ...FEET, diagonalRule: 'equidistant' })).toBe('20ft');
  });
});
