import { describe, expect, it } from 'vitest';
import { FAR_RANGE_CELLS, fieldDistance, liquidField } from '../../../src/app/pixi/liquids/liquidField';
import type { Point } from '../../../src/app/types/visionTypes';

/** The exact distance of `point` from the nearest edge of the rings, signed by even-odd. */
function exact(point: Point, rings: readonly (readonly Point[])[]): number {
  let nearest = Infinity;
  let inside = false;
  for (const ring of rings) {
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t));
      if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + ((point.y - a.y) / (b.y - a.y)) * dx) inside = !inside;
    });
  }
  return inside ? nearest : -nearest;
}

const CELL = 70;
const blob = (r: number, n: number): Point[] => Array.from({ length: n }, (_, k) => {
  const angle = (k / n) * Math.PI * 2;
  const radius = r * CELL * (1 + 0.25 * Math.sin(angle * 5));
  return { x: 400 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius };
});

describe('the distance field of a liquid surface', () => {
  it('holds each texel\'s distance from the shore, in cells, exactly at the shore and within a tenth of a cell inside, its holes counted', () => {
    const polygon = blob(4, 160);
    const hole = [{ x: 380, y: 280 }, { x: 440, y: 280 }, { x: 440, y: 330 }, { x: 380, y: 330 }];
    const field = liquidField(polygon, CELL, [hole]);
    let worst = 0;
    let worstAtShore = 0;
    for (let j = 0; j < field.height; j++) {
      for (let i = 0; i < field.width; i++) {
        const point = { x: field.origin.x + (i + 0.5) * field.texel, y: field.origin.y + (j + 0.5) * field.texel };
        const expected = Math.max(-field.outside, Math.min(FAR_RANGE_CELLS, exact(point, [polygon, hole]) / CELL));
        const error = Math.abs(fieldDistance(field, i, j) - expected);
        worst = Math.max(worst, error);
        if (Math.abs(expected) < 0.4) worstAtShore = Math.max(worstAtShore, error);
      }
    }
    // The shore's fade reads the near channel, in steps of a 300th of a cell; carrying on errs a little at corners.
    expect(worstAtShore).toBeLessThan(0.02);
    expect(worst).toBeLessThan(0.1);
  });

  it('never grows past its side limit, whatever the surface\'s size', () => {
    const field = liquidField(blob(200, 400), CELL);
    expect(Math.max(field.width, field.height)).toBeLessThanOrEqual(512);
  });
});
