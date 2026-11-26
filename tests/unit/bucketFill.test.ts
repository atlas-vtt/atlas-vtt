import { describe, expect, it } from 'vitest';
import { blurredLab, edgeStrength } from '../../src/app/lighting/bucketFill/bucketCost';
import { squaredDistanceTo } from '../../src/app/lighting/bucketFill/closeGaps';
import { pourBucket } from '../../src/app/lighting/bucketFill/bucketFill';
import { withHolesFilled } from '../../src/app/lighting/bucketFill/fillHoles';
import { areaOf } from '../../src/app/lighting/rooms';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import { maskOutline } from '../../src/app/lighting/bucketFill/maskOutline';
import { straightened } from '../../src/app/lighting/bucketFill/straightened';
import type { Point } from '../../src/app/types/visionTypes';

const area = (ring: readonly Point[]): number =>
  Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]!; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;

describe('maskOutline', () => {
  it('goes round an L of pixels along their edges', () => {
    const inside = (x: number, y: number): boolean => (x < 2 && y < 3) || (y === 2 && x < 4);
    const ring = maskOutline(inside, 5, 5)!;
    expect(ring).toHaveLength(6);
    expect(area(ring)).toBe(8);
  });

  it('leaves holes out', () => {
    expect(area(maskOutline((x, y) => !(x === 1 && y === 1), 3, 3)!)).toBe(9);
  });
});

describe('pourBucket', () => {
  /** A pale room (x 40–160, y 60–140) in dark walls on grey rock, with a printed grid and a prop on its floor. */
  function paintedRoom(): { data: Uint8ClampedArray; width: number; height: number } {
    const [width, height] = [200, 200];
    const data = new Uint8ClampedArray(width * height * 4);
    let noise = 7;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        noise = (noise * 1103515245 + 12345) & 0x7fffffff;
        const grain = (noise % 12) - 6;
        const inRoom = x >= 40 && x < 160 && y >= 60 && y < 140;
        const inWall = x >= 34 && x < 166 && y >= 54 && y < 146 && !inRoom;
        const gridLine = inRoom && (x % 24 === 0 || y % 24 === 0);
        const prop = (x - 100) ** 2 + (y - 100) ** 2 < 64;
        const value = inWall ? 30 : prop ? 90 : inRoom ? (gridLine ? 185 : 210) : 120;
        data.set([value + grain, value + grain, value + grain, 255], (y * width + x) * 4);
      }
    }
    return { data, width, height };
  }

  it('fills the room up to its walls, across the grid and over a prop', () => {
    const ring = pourBucket({ image: paintedRoom(), seeds: [{ x: 100, y: 100 }], radius: 95, cell: 24, sensitivity: 5, gap: 1 })!;
    const xs = ring.map((p) => p.x);
    const ys = ring.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThan(36);
    expect(Math.min(...xs)).toBeLessThan(44);
    expect(Math.max(...xs)).toBeGreaterThan(156);
    expect(Math.max(...xs)).toBeLessThan(164);
    expect(Math.min(...ys)).toBeGreaterThan(56);
    expect(Math.max(...ys)).toBeLessThan(144);
    expect(area(ring)).toBeGreaterThan(0.9 * 120 * 80);
  });

  /** A small room (x 20–100) opening through a doorway (y 92–108) into a long hall (x 112–250) that runs past the bucket's reach. */
  function roomAndHall(): { data: Uint8ClampedArray; width: number; height: number } {
    const [width, height] = [260, 200];
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const room = x >= 20 && x < 100 && y >= 60 && y < 140;
        const hall = x >= 112 && x < 250 && y >= 40 && y < 160;
        const door = x >= 100 && x < 112 && y >= 92 && y < 108;
        const wall = (x >= 14 && x < 106 && y >= 54 && y < 146) || (x >= 106 && x < 256 && y >= 34 && y < 166);
        const value = room || hall || door ? 210 : wall ? 30 : 120;
        data.set([value, value, value, 255], (y * width + x) * 4);
      }
    }
    return { data, width, height };
  }

  it('closes a doorway rather than spill through it', () => {
    const pour = { image: roomAndHall(), seeds: [{ x: 60, y: 100 }], radius: 100, cell: 24, sensitivity: 5 };
    const spilled = pourBucket({ ...pour, gap: 0 })!;
    expect(Math.max(...spilled.map((p) => p.x))).toBeGreaterThan(130);
    const closed = pourBucket({ ...pour, gap: 1 })!;
    // Cut in the doorway (x 100–112), short of the hall.
    expect(Math.max(...closed.map((p) => p.x))).toBeLessThan(116);
    expect(area(closed)).toBeGreaterThan(0.9 * 80 * 80);
  });

  it('stops at its radius where the floor goes on', () => {
    const ring = pourBucket({ image: paintedRoom(), seeds: [{ x: 70, y: 100 }], radius: 20, cell: 24, sensitivity: 5, gap: 1 })!;
    expect(area(ring)).toBeLessThan(Math.PI * 22 * 22);
  });

  it('pours along a dragged path, its radius from the nearest point', () => {
    const one = pourBucket({ image: paintedRoom(), seeds: [{ x: 60, y: 80 }], radius: 20, cell: 24, sensitivity: 5, gap: 1 })!;
    const path = pourBucket({ image: paintedRoom(), seeds: [60, 72, 84, 96, 108, 120, 132, 144].map((x) => ({ x, y: 80 })), radius: 20, cell: 24, sensitivity: 5, gap: 1 })!;
    expect(Math.max(...path.map((p) => p.x))).toBeGreaterThan(140);
    expect(area(path)).toBeGreaterThan(2 * area(one));
  });
});

describe('withHolesFilled', () => {
  const box = (x0: number, y0: number, x1: number, y1: number): Point[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  // A room open at the bottom, closed by a pour along it: the rock between (x and y 20–80) is a hole.
  const floor = [areaOf([box(0, 0, 100, 20), box(0, 0, 20, 100), box(80, 0, 100, 100)])];
  const poured = areaOf([box(0, 80, 100, 100)]);
  const path = [{ x: 50, y: 90 }];

  it('fills a hole that lies wholly within reach of the path', () => {
    expect(shapeContains(withHolesFilled(poured, floor, path, 80), { x: 50, y: 50 })).toBe(true);
  });

  it('leaves a hole that reaches beyond it', () => {
    const area = withHolesFilled(poured, floor, path, 40);
    expect(shapeContains(area, { x: 50, y: 50 })).toBe(false);
    expect(shapeContains(area, { x: 50, y: 90 })).toBe(true);
  });
});

describe('straightened', () => {
  it('makes a wobbly wall one wall and keeps the corners', () => {
    // A 10 × 6 cell room whose top wall wobbles and has a short jog.
    const ring = [
      { x: 0, y: 0 }, { x: 3, y: 0.08 }, { x: 5, y: -0.05 }, { x: 5.1, y: 0.1 }, { x: 10, y: 0 },
      { x: 10, y: 6 }, { x: 0, y: 6 },
    ];
    expect(straightened(ring, 1)).toHaveLength(4);
  });

  it('keeps a curve round', () => {
    const circle = Array.from({ length: 24 }, (_, i) => ({ x: 5 * Math.cos((i * Math.PI) / 12), y: 5 * Math.sin((i * Math.PI) / 12) }));
    expect(straightened(circle, 1)).toHaveLength(24);
  });

  it('keeps an alcove', () => {
    const ring = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
    expect(straightened(ring, 1)).toHaveLength(8);
  });
});

describe('the bucket near its path', () => {
  it('works out edges as over the whole window wherever they count', () => {
    const [width, height] = [90, 70];
    const data = new Uint8ClampedArray(width * height * 4);
    let noise = 3;
    for (let i = 0; i < data.length; i++) {
      noise = (noise * 1103515245 + 12345) & 0x7fffffff;
      data[i] = i % 4 === 3 ? 255 : noise % 256;
    }
    const image = { data, width, height };
    const toSeed = squaredDistanceTo((i) => i === 30 * width + 40, width, height);
    const limit = 12;
    const full = edgeStrength(blurredLab(image, 1.5), width, height);
    const near = edgeStrength(blurredLab(image, 1.5, { toSeed, limit: limit + 8 }), width, height, { toSeed, limit });
    for (let i = 0; i < full.length; i++) if (toSeed[i]! <= limit * limit) expect(near[i]).toBe(full[i]);
  });
});
