import { describe, expect, it } from 'vitest';
import { floorFilesProblem, floorPlacement, floorsProblem, type FloorCandidate } from '../../src/app/import/uvtt/uvttFloors';
import { UVTT_LIMITS } from '../../src/app/import/uvtt/uvttTypes';

const floor = (fileName: string, change: Partial<FloorCandidate> = {}, map: Partial<FloorCandidate['map']> = {}): FloorCandidate => ({
  fileName,
  bytes: 1000,
  cellSize: 100,
  ...change,
  map: { origin: { x: 0, y: 0 }, polylines: [], portals: [], lights: [], ...map },
});

const line = (points: number): { x: number; y: number }[] => Array.from({ length: points }, (_, x) => ({ x, y: 0 }));
const light = { position: { x: 1, y: 1 }, range: 2, intensity: 1, color: '#ffffff' };

describe('files as the floors of one scene', () => {
  it('can be floors when their cells are the same size, whatever their sizes and origins', () => {
    expect(floorsProblem([floor('a', {}, { origin: { x: 4, y: 2 } }), floor('b', { cellSize: 101.5 })])).toBeNull();
  });

  it('cannot be where the cells differ by more than an exporter rounds, which names both files', () => {
    expect(floorsProblem([floor('Ground.dd2vtt'), floor('Attic.dd2vtt', { cellSize: 99 }), floor('Tower.dd2vtt', { cellSize: 70 })]))
      .toBe('The cells of Ground.dd2vtt are 100 pixels wide, those of Tower.dd2vtt 70 pixels, so they do not share a grid.');
    expect(floorsProblem([floor('a', { cellSize: 98 }), floor('b', { cellSize: 100 }), floor('c', { cellSize: 102 })])).not.toBeNull();
  });

  it('cannot be more than a scene takes', () => {
    const many = Array.from({ length: UVTT_LIMITS.floors + 1 }, (_, index) => floor(`f${index}`));
    expect(floorsProblem(many)).toBe(`One scene takes at most ${UVTT_LIMITS.floors} floors.`);
    expect(floorsProblem(many.slice(1))).toBeNull();
  });

  it('cannot be larger together than the import holds at once, which is known before a file is read', () => {
    const half = UVTT_LIMITS.floorsBytes / 2;
    expect(floorFilesProblem([{ bytes: half }, { bytes: half }])).toBeNull();
    expect(floorFilesProblem([{ bytes: half }, { bytes: half + 1 }])).toBe('Together the files are larger than 400 MB.');
  });

  it('cannot hold more walls and doors, or lights, together than one file may', () => {
    const walls = UVTT_LIMITS.wallSegments / 2;
    const segments = (count: number): Partial<FloorCandidate['map']> => ({ polylines: [line(count)], portals: [{ bounds: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: true }] });
    expect(floorsProblem([floor('a', {}, segments(walls)), floor('b', {}, segments(walls))])).toBeNull();
    expect(floorsProblem([floor('a', {}, segments(walls)), floor('b', {}, segments(walls + 1))])).toBe(`Together the files have more than ${UVTT_LIMITS.wallSegments.toLocaleString('en')} wall segments.`);
    const lights = (count: number): Partial<FloorCandidate['map']> => ({ lights: Array.from({ length: count }, () => light) });
    expect(floorsProblem([floor('a', {}, lights(1000)), floor('b', {}, lights(1000))])).toBeNull();
    expect(floorsProblem([floor('a', {}, lights(1000)), floor('b', {}, lights(1001))])).toBe(`Together the files have more than ${UVTT_LIMITS.lights.toLocaleString('en')} lights.`);
  });

  it('is no question for one file', () => {
    expect(floorsProblem([floor('a')])).toBeNull();
  });
});

describe('where floors lie', () => {
  it('lie at the scene\'s corner when they share their origin', () => {
    expect(floorPlacement([{ origin: { x: 2, y: 1 } }, { origin: { x: 2, y: 1 } }])).toEqual({ origin: { x: 2, y: 1 }, at: [{ x: 0, y: 0 }, { x: 0, y: 0 }] });
  });

  it('begin at the least origin on each axis, so no floor lies before the scene\'s corner', () => {
    const placed = floorPlacement([{ origin: { x: 0, y: 3 } }, { origin: { x: 4.5, y: 0 } }, { origin: { x: -2, y: 5 } }]);
    expect(placed.origin).toEqual({ x: -2, y: 0 });
    expect(placed.at).toEqual([{ x: 2, y: 3 }, { x: 6.5, y: 0 }, { x: 0, y: 5 }]);
  });
});
