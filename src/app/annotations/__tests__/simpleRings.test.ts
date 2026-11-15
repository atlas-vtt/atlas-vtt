import { describe, expect, it } from 'vitest';
import { subtractShapes, unionShapes } from '../../lighting/polygonClip';
import type { QPolygon } from '../../types/shapeTypes';
import { partHolds, pointInPart, ringArea, simpleParts } from '../simpleRings';
import { seeded } from './annotationKit';

type Cell = readonly [number, number];
const SIDE = 80;
const square = ([column, row]: Cell): number[] => [column * SIDE, row * SIDE, (column + 1) * SIDE, row * SIDE, (column + 1) * SIDE, (row + 1) * SIDE, column * SIDE, (row + 1) * SIDE];
const keyOf = ([column, row]: Cell): string => `${column},${row}`;

/** How many groups `cells` fall into where cells that share an edge are one group. */
function islands(cells: readonly Cell[]): number {
  const left = new Set(cells.map(keyOf));
  let count = 0;
  while (left.size > 0) {
    count++;
    const [first] = left;
    const queue = [first!];
    left.delete(first!);
    while (queue.length > 0) {
      const [column, row] = queue.pop()!.split(',').map(Number) as [number, number];
      for (const next of [[column + 1, row], [column - 1, row], [column, row + 1], [column, row - 1]] as const) {
        if (left.delete(keyOf(next))) queue.push(keyOf(next));
      }
    }
  }
  return count;
}

function passesTwice(ring: QPolygon): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < ring.length; i += 2) {
    const corner = `${ring[i]},${ring[i + 1]}`;
    if (seen.has(corner)) return true;
    seen.add(corner);
  }
  return false;
}

describe('the areas of a clipped shape', () => {
  it('keeps two squares on a diagonal apart, however the clipping joined them', () => {
    // One ring through the point they share, as the clipping library gives it in larger shapes.
    const pinched = [[0, 0, 80, 0, 80, 80, 160, 80, 160, 160, 80, 160, 80, 80, 0, 80]];
    expect(simpleParts(pinched).map(({ outline }) => outline.length / 2).sort()).toEqual([4, 4]);
    expect(simpleParts(unionShapes([square([0, 0]), square([1, 1])], []))).toHaveLength(2);
  });

  it('makes two areas of an area and a hole that touch it in two points', () => {
    // Four cells and three cells that meet at two corners, around an empty cell: the library's outer ring and hole.
    const shape = [[2, 0, 5, 0, 5, 1, 6, 1, 6, 3, 4, 3, 4, 2, 3, 2, 3, 1, 2, 1], [4, 1, 4, 2, 5, 2, 5, 1]].map((ring) => ring.map((value) => value * SIDE));
    const parts = simpleParts(shape);
    expect(parts).toHaveLength(2);
    expect(parts.every(({ holes }) => holes.length === 0)).toBe(true);
    expect(parts.map(({ outline }) => ringArea(outline) / (2 * SIDE * SIDE)).sort()).toEqual([3, 4]);
  });

  it('keeps a hole in the area around it, and an island in that hole apart', () => {
    const ring: Cell[] = [];
    for (let column = 0; column < 5; column++) for (let row = 0; row < 5; row++) if (column % 4 === 0 || row % 4 === 0) ring.push([column, row]);
    const parts = simpleParts(unionShapes([...ring.map(square), square([2, 2])], []));
    expect(parts).toHaveLength(2);
    expect(parts.map(({ holes }) => holes.length).sort()).toEqual([0, 1]);
    const island = parts.find(({ holes }) => holes.length === 0)!;
    expect(pointInPart(island)).toEqual({ x: 2.5 * SIDE, y: 2.5 * SIDE });
  });

  it('gives random cells, and what a cut leaves of them, as the islands they are', () => {
    const random = seeded(3);
    for (let round = 0; round < 300; round++) {
      const cells: Cell[] = [];
      const gone: Cell[] = [];
      for (let column = 0; column < 6; column++) {
        for (let row = 0; row < 6; row++) {
          if (random() < 0.55) cells.push([column, row]);
          if (round % 2 === 1 && random() < 0.3) gone.push([column, row]);
        }
      }
      const whole = unionShapes(cells.map(square), []);
      const shape = gone.length > 0 ? subtractShapes(whole, unionShapes(gone.map(square), [])) : whole;
      const rest = cells.filter((cell) => !gone.some((other) => keyOf(other) === keyOf(cell)));
      const parts = simpleParts(shape);
      expect(parts).toHaveLength(islands(rest));
      for (const part of parts) {
        for (const one of [part.outline, ...part.holes]) expect(passesTwice(one)).toBe(false);
        const inside = pointInPart(part)!;
        expect(partHolds(part, inside.x, inside.y)).toBe(true);
      }
      // Every cell left is in exactly one area, every other cell in none.
      for (let column = 0; column < 6; column++) {
        for (let row = 0; row < 6; row++) {
          const holding = parts.filter((part) => partHolds(part, (column + 0.5) * SIDE, (row + 0.5) * SIDE)).length;
          expect(holding).toBe(rest.some((cell) => keyOf(cell) === keyOf([column, row])) ? 1 : 0);
        }
      }
    }
  });
});
