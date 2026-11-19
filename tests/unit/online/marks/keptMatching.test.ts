import { describe, expect, it } from 'vitest';
import { matchKept } from '../../../../src/app/online/marks/keptMatching';
import type { ToldMeasure } from '../../../../src/app/online/marks/measureWords';

const ruler = (x: number): ToldMeasure => ({ shape: 'ruler', points: [{ x: 0, y: 0 }, { x, y: 0 }] });
const drawing = (told: ToldMeasure): { told: ToldMeasure } => ({ told });

describe('matchKept', () => {
  it('keeps each drawing in its place while as many measurements are told, edited or not', () => {
    const drawings = [drawing(ruler(70)), drawing(ruler(140))];
    expect(matchKept(drawings, [ruler(70), ruler(210)])).toEqual({ drawings, gone: [] });
  });

  it('lets the measurement deleted go and keeps the drawings of those that stay, wherever they stood', () => {
    const [a, b, c] = [drawing(ruler(70)), drawing(ruler(140)), drawing(ruler(210))];
    const match = matchKept([a, b, c], [ruler(70), ruler(210)]);
    expect(match.drawings).toEqual([a, c]);
    expect(match.gone).toEqual([b]);
  });

  it('gives a measurement that came no drawing yet', () => {
    const a = drawing(ruler(70));
    expect(matchKept([a], [ruler(140), ruler(70)])).toEqual({ drawings: [null, a], gone: [] });
  });

  it('tells two alike apart by order, one drawing each', () => {
    const [a, b] = [drawing(ruler(70)), drawing(ruler(70))];
    const match = matchKept([a, b], [ruler(70)]);
    expect(match.drawings).toEqual([a]);
    expect(match.gone).toEqual([b]);
  });
});
