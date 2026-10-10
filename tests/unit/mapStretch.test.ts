import { describe, expect, it } from 'vitest';
import { imageToWorld, MAX_STRETCH_FACTOR, movedWithMap, NO_STRETCH, readMapStretch, sameStretch, stretchForAspect, turnedBox, worldToImage } from '../../src/app/grid/mapStretch';

describe('map stretch', () => {
  it('grows the map along the axis its cells are too short on, and never shrinks it', () => {
    // Rows 5 % too far apart: the cells are too narrow, the map is drawn wider.
    expect(stretchForAspect(1.05)).toEqual({ x: 1.05, y: 1 });
    // Rows too close together: the map is drawn taller.
    expect(stretchForAspect(0.8)).toEqual({ x: 1, y: 1.25 });
    expect(stretchForAspect(1)).toBe(NO_STRETCH);
    expect(stretchForAspect(Number.NaN)).toBe(NO_STRETCH);
  });

  it('reads a stored stretch only where it is a pair of factors in range', () => {
    expect(readMapStretch({ x: 1.048, y: 1 })).toEqual({ x: 1.048, y: 1 });
    for (const value of [undefined, null, 'wide', { x: 1 }, { x: 1, y: 1 }, { x: 0.9, y: 1 }, { x: 4, y: 1 }, { x: Number.NaN, y: 1 }, { x: '1.1', y: 1 }]) {
      expect(readMapStretch(value)).toBe(NO_STRETCH);
    }
  });

  it('reads back the stretch of every aspect a fit may have', () => {
    for (const aspect of [1, 1.048, 0.8, MAX_STRETCH_FACTOR, 1 / MAX_STRETCH_FACTOR]) {
      const stretch = stretchForAspect(aspect);
      expect(readMapStretch(stretch)).toEqual(stretch);
    }
  });

  it('carries the angle of a map that lies askew, in degrees, and reads it back only in range', () => {
    expect(stretchForAspect(1, (0.5 * Math.PI) / 180)).toEqual({ x: 1, y: 1, rotation: 0.5 });
    expect(stretchForAspect(0.979, (-0.29 * Math.PI) / 180)).toEqual({ x: 1, y: 1.02145, rotation: -0.29 });
    expect(readMapStretch({ x: 1, y: 1, rotation: 0.5 })).toEqual({ x: 1, y: 1, rotation: 0.5 });
    expect(readMapStretch({ x: 1.05, y: 1, rotation: 0 })).toEqual({ x: 1.05, y: 1 });
    for (const value of [{ x: 1, y: 1, rotation: 12 }, { x: 1, y: 1, rotation: 'askew' }, { x: 1, y: 1, rotation: Number.NaN }]) {
      expect(readMapStretch(value)).toBe(NO_STRETCH);
    }
    expect(sameStretch({ x: 1, y: 1, rotation: 0.5 }, { x: 1, y: 1 })).toBe(false);
  });

  it('places a pixel of the image in the world and finds it again, stretched and turned', () => {
    const size = { width: 1200, height: 800 };
    for (const stretch of [NO_STRETCH, { x: 1.05, y: 1 }, { x: 1, y: 1.2 }, { x: 1, y: 1, rotation: 1.5 }, { x: 1.04, y: 1, rotation: -2.5 }]) {
      for (const pixel of [{ x: 0, y: 0 }, { x: 1200, y: 800 }, { x: 600, y: 400 }, { x: 37.5, y: 711.25 }]) {
        const world = imageToWorld(pixel, size, stretch);
        const back = worldToImage(world, size, stretch);
        expect(back.x).toBeCloseTo(pixel.x, 8);
        expect(back.y).toBeCloseTo(pixel.y, 8);
        // Every pixel lies in the box the map has in the world, which begins at the origin.
        const { box } = turnedBox(size.width, size.height, stretch);
        expect(world.x).toBeGreaterThanOrEqual(-1e-9);
        expect(world.y).toBeGreaterThanOrEqual(-1e-9);
        expect(world.x).toBeLessThanOrEqual(box.width * stretch.x + 1e-9);
        expect(world.y).toBeLessThanOrEqual(box.height * stretch.y + 1e-9);
      }
    }
    expect(imageToWorld({ x: 100, y: 200 }, size, NO_STRETCH)).toEqual({ x: 100, y: 200 });
    expect(imageToWorld({ x: 100, y: 200 }, size, { x: 1.05, y: 1 })).toEqual({ x: 105, y: 200 });
  });

  it('keeps a point on its pixel of the image when the map is drawn another way', () => {
    const size = { width: 1200, height: 800 };
    const from = { x: 1, y: 1.1 };
    const to = { x: 1.04, y: 1, rotation: 2 };
    const move = movedWithMap(size, from, to);
    const moved = move({ x: 300, y: 440 });
    // The point stood on pixel (300, 400) and still does.
    const pixel = worldToImage(moved, size, to);
    expect(pixel.x).toBeCloseTo(300, 5);
    expect(pixel.y).toBeCloseTo(400, 5);
    // There and back is where it was.
    const back = movedWithMap(size, to, from)(moved);
    expect(back.x).toBeCloseTo(300, 5);
    expect(back.y).toBeCloseTo(440, 5);
  });

  it('compares stretches by their factors', () => {
    expect(sameStretch({ x: 1.1, y: 1 }, { x: 1.1, y: 1 })).toBe(true);
    expect(sameStretch({ x: 1.1, y: 1 }, { x: 1, y: 1.1 })).toBe(false);
  });
});
