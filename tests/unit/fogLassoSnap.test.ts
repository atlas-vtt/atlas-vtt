import { describe, expect, it } from 'vitest';
import { snapFogLassoPoint } from '../../src/app/pixi/fog/fogLassoSnap';
import { createHexLayout, hexVertices, nearestHexCenter } from '../../src/app/grid/hexGeometry';
import type { GridState } from '../../src/app/types/gridTypes';

const grid: GridState = { enabled: true, type: 'square', size: 50, offsetX: 13, offsetY: -7, opacity: 1 };

describe('fog lasso grid snapping', () => {
  it('uses square corners with grid offsets, including negative coordinates', () => {
    expect(snapFogLassoPoint({ x: 47, y: 12 }, grid, true)).toEqual({ x: 63, y: -7 });
    expect(snapFogLassoPoint({ x: -66, y: -87 }, grid, true)).toEqual({ x: -87, y: -107 });
  });

  it('preserves freehand points when snapping or the grid is off or unavailable', () => {
    const point = { x: 47, y: 12 };
    for (const config of [null, { ...grid, enabled: false }, { ...grid, size: 0 }]) {
      expect(snapFogLassoPoint(point, config, true)).toEqual(point);
    }
    expect(snapFogLassoPoint(point, grid, false)).toEqual(point);
  });

  it('snaps independently of token snapping and grid visibility', () => {
    expect(snapFogLassoPoint({ x: 47, y: 12 }, { ...grid, snapToGrid: false, visible: false }, true))
      .toEqual({ x: 63, y: -7 });
  });

  it.each(['hex-horizontal', 'hex-vertical'] as const)('uses actual %s vertices', (type) => {
    const layout = createHexLayout(type, grid.size, grid.offsetX, grid.offsetY);
    const vertex = hexVertices(layout, nearestHexCenter(layout, { x: 40, y: 30 }))[0]!;
    const snapped = snapFogLassoPoint({ x: vertex.x + 2, y: vertex.y - 3 }, { ...grid, type }, true);
    expect(snapped.x).toBeCloseTo(vertex.x);
    expect(snapped.y).toBeCloseTo(vertex.y);
  });
});
