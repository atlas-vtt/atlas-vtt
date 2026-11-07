import { describe, expect, it } from 'vitest';
import { pathBounds } from '../../../src/app/dungeons/render/art/paths';

describe('the bounds a path traces through', () => {
  it('holds a cubic curve that bulges past its ends', () => {
    const box = pathBounds(path => {
      path.moveTo(0, 0);
      path.bezierCurveTo(0, -1, 1, -1, 1, 0);
    })!;
    expect(box.minY).toBeLessThanOrEqual(-0.75);
  });

  it('holds a turned ellipse', () => {
    const box = pathBounds(path => path.ellipse(0, 0, 0.5, 0.2, Math.PI / 2, 0, Math.PI * 2))!;
    expect(box.minY).toBeLessThanOrEqual(-0.5 + 1e-9);
    expect(box.maxY).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(box.maxX).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });
});
