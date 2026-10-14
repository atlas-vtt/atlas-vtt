import { describe, expect, it } from 'vitest';
import { snapToGridCorner } from '../../src/app/grid/gridCorner';
import { axialToPixel, createHexLayout, hexVertices } from '../../src/app/grid/hexGeometry';
import { wallPoint } from '../../src/app/pixi/lighting/wallPoint';
import type { GridState } from '../../src/app/types/gridTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';

const GRID: GridState = { enabled: true, size: 70, offsetX: 11, offsetY: -13, opacity: 1, snapToGrid: true };

describe('wall grid corners', () => {
  it('snaps to square intersections with offsets and negative coordinates', () => {
    expect(snapToGridCorner({ x: 86, y: -91 }, GRID)).toEqual({ x: 81, y: -83 });
    expect(snapToGridCorner({ x: -57, y: 55 }, GRID)).toEqual({ x: -59, y: 57 });
  });

  it.each(['hex-horizontal', 'hex-vertical'] as const)('snaps to the nearest %s corner, not its centre', (type) => {
    const layout = createHexLayout(type, GRID.size, GRID.offsetX, GRID.offsetY);
    for (const q of [-3, 0, 2]) for (const r of [-2, 0, 4]) {
      const centre = axialToPixel(layout, { q, r });
      for (const corner of hexVertices(layout, centre)) {
        const at = { x: corner.x * 0.95 + centre.x * 0.05, y: corner.y * 0.95 + centre.y * 0.05 };
        const snapped = snapToGridCorner(at, { ...GRID, type });
        expect(snapped.x).toBeCloseTo(corner.x, 8);
        expect(snapped.y).toBeCloseTo(corner.y, 8);
      }
    }
  });

  it('keeps free placement with snapping off or no usable grid, independently of grid visibility', () => {
    const point = { x: 23, y: 41 };
    for (const grid of [null, { ...GRID, snapToGrid: false }, { ...GRID, size: 0 }, { ...GRID, size: NaN }]) {
      expect(snapToGridCorner(point, grid)).toBe(point);
    }
    expect(snapToGridCorner(point, { ...GRID, enabled: false })).toEqual({ x: 11, y: 57 });
  });

  it('prioritizes nearby wall joints and segments, scales proximity on screen, and bypasses both with Alt', () => {
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 } };
    const walls = { w: wall };
    expect(wallPoint({ x: 104, y: 104 }, walls, GRID, 1)).toEqual({ point: wall.p1, joined: true });
    expect(wallPoint({ x: 200, y: 104 }, walls, GRID, 1)).toEqual({ point: { x: 200, y: 100 }, joined: true });
    expect(wallPoint({ x: 200, y: 104 }, walls, GRID, 4).joined).toBe(false);
    const point = { x: 104, y: 104 };
    expect(wallPoint(point, walls, GRID, 1, true)).toEqual({ point, joined: false });
    expect(wallPoint(point, {}, { ...GRID, snapToGrid: false }, 1).point).toBe(point);
  });
});
