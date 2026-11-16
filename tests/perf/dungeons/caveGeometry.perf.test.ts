import { describe, expect, it } from 'vitest';
import { cellKey } from '../../../src/app/dungeons/geometry';
import { rngFrom } from '../../../src/app/dungeons/rng';
import { caveOutline } from '../../../src/app/dungeons/render/cave/caveOutline';
import { PolyField } from '../../../src/app/dungeons/render/cave/polyField';
import type { CellGrid } from '../../../src/app/dungeons/water/wetGrid';
import { scatteredCave, wobblyRing } from '../../helpers/caveMasks';
import { timeBound } from '../../helpers/timeBound';

/** How long a cave's drawn shape takes: the outline and the distance field the drawing reads. Run alone (`npm run test:perf`). */
describe('a cave’s drawn shape', () => {
  it('traces a 120 × 120 cave in under 40 ms', () => {
    const mask = scatteredCave(rngFrom(5));
    const box: CellGrid = { x0: -1, y0: -1, w: 122, h: 122 };
    const times: number[] = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      caveOutline(run, 0, (x, y) => mask.has(cellKey(x, y)), box, []);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(timeBound(40));
  });

  it('answers a distance from a 400-vertex outline in under 0.02 ms', () => {
    const rng = rngFrom(11);
    const field = new PolyField([wobblyRing(rng)]);
    const points = Array.from({ length: 2000 }, () => ({ x: rng() * 34 - 2, y: rng() * 34 - 2 }));
    for (const p of points) field.distance(p.x, p.y);
    const start = performance.now();
    for (let round = 0; round < 5; round++) for (const p of points) field.distance(p.x, p.y);
    expect((performance.now() - start) / (points.length * 5)).toBeLessThan(0.02);
  });
});
