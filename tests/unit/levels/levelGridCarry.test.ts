import { describe, expect, it } from 'vitest';
import { imageToWorld, worldToImage } from '../../../src/app/grid/mapStretch';
import { levelImagePlacement } from '../../../src/app/levels/levelAlignment';
import { levelsCarriedWithGrid, type GridCarryScene } from '../../../src/app/levels/levelGridCarry';
import type { GridState } from '../../../src/app/types/gridTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { TokenEntity } from '../../../src/app/types';

const level = (id: string): SceneLevel => ({ id, name: id, elevation: { bottom: 0, top: 10 }, background: null });
const LEVELS = [level('ground'), level('upper')];
const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 5, offsetY: 5, opacity: 0.5 };
const IMAGE = { width: 1000, height: 800 };
const token = (id: string, x: number, y: number, onLevel?: string): TokenEntity => ({ id, kind: 'token', x, y, imagePath: 't.png', ...(onLevel ? { level: onLevel } : {}) });

function scene(): GridCarryScene {
  return {
    levels: LEVELS,
    grid: GRID,
    // The upper image's grid: cells of 50 px from (10, 20), fitted to the scene's
    levelAlignments: { upper: { offset: { x: 61, y: 47 }, scale: 1.4, stretch: { x: 1, y: 1 } } },
    objects: { tokens: { guard: token('guard', 100, 100), mage: token('mage', 215, 117, 'upper') }, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
  };
}

/** How far `value` lies from the nearest line of a grid of `size` from `offset`, as a share of a cell. */
const offLine = (value: number, size: number, offset: number): number => {
  const cells = (value - offset) / size;
  return Math.abs(cells - Math.round(cells));
};

describe('a grid change on the first level', () => {
  it('keeps every fitted floor\'s cells on the same pixels of its art and its objects on the same image points', () => {
    const before = scene();
    const next: GridState = { ...GRID, size: 64, offsetX: 30, offsetY: -12 };
    const carried = levelsCarriedWithGrid(before, next)!;

    const after = { ...before, ...carried, grid: next };
    const placed = levelImagePlacement(after, 'upper');
    // A corner of the art's own grid lies on a corner of the new grid
    for (const corner of [{ x: 10, y: 20 }, { x: 10 + 7 * 50, y: 20 + 3 * 50 }]) {
      const world = imageToWorld(corner, IMAGE, placed);
      expect(offLine(world.x, 64, 30)).toBeLessThan(1e-4);
      expect(offLine(world.y, 64, -12)).toBeLessThan(1e-4);
    }
    // Its tokens stand on the same pixels of its art; the first level's stay where they are
    const mageBefore = worldToImage(before.objects.tokens.mage!, IMAGE, levelImagePlacement(before, 'upper'));
    const mageAfter = worldToImage(carried.objects.tokens.mage!, IMAGE, placed);
    expect(mageAfter.x).toBeCloseTo(mageBefore.x, 4);
    expect(mageAfter.y).toBeCloseTo(mageBefore.y, 4);
    expect(carried.objects.tokens.guard).toBe(before.objects.tokens.guard);
    expect(after.levelAlignments!.upper!.offset.y).toBeGreaterThanOrEqual(0);
  });

  it('carries nothing in a scene without fitted levels, nor where the grid only changed what it looks like', () => {
    expect(levelsCarriedWithGrid({ ...scene(), levelAlignments: undefined }, { ...GRID, size: 90 })).toBeNull();
    expect(levelsCarriedWithGrid({ ...scene(), levels: undefined, levelAlignments: undefined }, { ...GRID, size: 90 })).toBeNull();
    expect(levelsCarriedWithGrid(scene(), { ...GRID, opacity: 0.2, visible: false })).toBeNull();
  });

  it('keeps the floors as they are and names them where the grid changes type', () => {
    const before = scene();
    const carried = levelsCarriedWithGrid(before, { ...GRID, type: 'hex-vertical', size: 80 })!;

    expect(carried.refit).toEqual(['upper']);
    expect(carried.levelAlignments).toBe(before.levelAlignments);
    expect(carried.objects).toBe(before.objects);
  });
});
