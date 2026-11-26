import { describe, expect, it } from 'vitest';
import { fogBoundsChanged, fogCanvasBounds } from '../../src/app/pixi/fog/fogBounds';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { fogRectangle } from '../helpers/fogOperations';

const MAP = { x: 0, y: 0, width: 1000, height: 800 };

describe('the fog canvas\' bounds', () => {
  it('are the map image with room around it, whatever was painted', () => {
    const fog = { far: fogRectangle({ x: 5000, y: 5000, width: 100, height: 100 }) };
    expect(fogCanvasBounds(MAP, fog)).toEqual({ x: -200, y: -200, width: 1400, height: 1200 });
    expect(fogCanvasBounds(MAP, undefined)).toEqual({ x: -200, y: -200, width: 1400, height: 1200 });
  });

  it('are the box around what hides while there is no map image: reveals and saved offsets counted as the fog is drawn', () => {
    const fog = {
      a: fogRectangle({ id: 'a', x: 100, y: 100, width: 50, height: 50 }),
      b: fogRectangle({ id: 'b', x: 0, y: 0, width: 20, height: 20, offsetX: 300, offsetY: 40 }),
      hole: fogRectangle({ id: 'hole', x: -900, y: -900, width: 10, height: 10, isErasing: true }),
    };
    // From (100, 40) to (320, 150), padded by 200
    expect(fogCanvasBounds(null, fog)).toEqual({ x: -100, y: -160, width: 620, height: 510 });
  });

  it('are a default area without a map image and without fog that hides, or with geometry that cannot be read', () => {
    const fallback = { x: -2000, y: -2000, width: 4000, height: 4000 };
    expect(fogCanvasBounds(null, undefined)).toEqual(fallback);
    expect(fogCanvasBounds(null, {})).toEqual(fallback);
    expect(fogCanvasBounds(null, { hole: fogRectangle({ isErasing: true }) })).toEqual(fallback);
    const broken = { id: 'broken', kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points: [null, { x: 1, y: 1 }, { x: 2, y: 5 }] } as unknown as FogOperation;
    expect(fogCanvasBounds(null, { broken, paint: fogRectangle() })).toEqual(fallback);
  });

  it('count as changed only past ten pixels, so the canvas is not sized anew for a rounding', () => {
    const bounds = { x: 0, y: 0, width: 1000, height: 800 };
    expect(fogBoundsChanged({ ...bounds, x: 10, height: 790 }, bounds)).toBe(false);
    expect(fogBoundsChanged({ ...bounds, x: 11 }, bounds)).toBe(true);
    expect(fogBoundsChanged({ ...bounds, width: 1011 }, bounds)).toBe(true);
  });
});
