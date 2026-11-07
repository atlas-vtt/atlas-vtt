import { describe, expect, it } from 'vitest';
import { dashPattern } from '../../src/app/grid/gridDash';
import { drawDashedSegment } from '../../src/app/grid/gridLineStyle';

describe('dashPattern', () => {
  it('centres two dashes on a cell edge, with the same gap at the ends as between them', () => {
    const { count, dash, gap } = dashPattern(70);
    expect(count).toBe(2);
    expect(gap * 3 + dash * 2).toBeCloseTo(70);
    expect(dash).toBeCloseTo(((70 - 12) / 2) * 0.8);
  });

  it('draws one dash on a short edge and none on one too short for a dash', () => {
    expect(dashPattern(12).count).toBe(1);
    expect(dashPattern(12).gap * 2 + dashPattern(12).dash).toBeCloseTo(12);
    expect(dashPattern(9)).toEqual({ count: 0, dash: 0, gap: 9 });
  });

  it('is what the drawer draws', () => {
    const drawn: number[][] = [];
    let cursor = [0, 0];
    const path = {
      moveTo: (x: number, y: number) => { cursor = [x, y]; return path; },
      lineTo: (x: number, y: number) => { drawn.push([...cursor, x, y]); return path; },
      poly: () => path,
    };
    drawDashedSegment(path, 10, 5, 80, 5);
    const { dash, gap } = dashPattern(70);
    expect(drawn).toEqual([[10 + gap, 5, 10 + gap + dash, 5], [10 + 2 * gap + dash, 5, 10 + 2 * gap + 2 * dash, 5]].map((row) => row.map((v) => expect.closeTo(v, 6))));
  });
});
