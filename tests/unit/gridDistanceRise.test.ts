import { describe, expect, it } from 'vitest';
import { cellsByRule, flatCells, pathLengthInCells, type GridGeometry } from '../../src/app/grid/gridDistance';
import { axialToPixel, createHexLayout } from '../../src/app/grid/hexGeometry';
import type { DiagonalRule } from '../../src/app/types/collectionSettingsTypes';

const SQUARE: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const cell = (col: number, row: number): { x: number; y: number } => ({ x: 35 + col * 70, y: 35 + row * 70 });
const RULES: readonly DiagonalRule[] = ['equidistant', 'alternating', 'manhattan', 'euclidean'];

/**
 * The cheapest way from one corner of a box of `dx` × `dy` × `dz` cells to the opposite one, walked
 * step by step: a step moves one cell along one, two or three axes. `equidistant` prices every step
 * 1, `manhattan` allows only steps along one axis, `alternating` prices every second step along
 * more than one axis 2.
 */
function walked(dx: number, dy: number, dz: number, rule: Exclude<DiagonalRule, 'euclidean'>): number {
  const best = new Map<string, number>([['0,0,0,0', 0]]);
  let least = Infinity;
  // Every step moves towards the far corner, so states are met in order of their coordinates' sum.
  for (let x = 0; x <= dx; x++) for (let y = 0; y <= dy; y++) for (let z = 0; z <= dz; z++) for (const odd of [0, 1]) {
    const cost = best.get(`${x},${y},${z},${odd}`);
    if (cost === undefined) continue;
    if (x === dx && y === dy && z === dz) least = Math.min(least, cost);
    for (const [sx, sy, sz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]] as const) {
      if (x + sx > dx || y + sy > dy || z + sz > dz) continue;
      const diagonal = sx + sy + sz > 1;
      if (diagonal && rule === 'manhattan') continue;
      const step = diagonal && rule === 'alternating' && odd === 1 ? 2 : 1;
      const key = `${x + sx},${y + sy},${z + sz},${diagonal ? 1 - odd : odd}`;
      best.set(key, Math.min(best.get(key) ?? Infinity, cost + step));
    }
  }
  return least;
}

describe('a path that climbs', () => {
  it('costs one straight leg what the cheapest walk through the box costs, under every rule that counts steps', () => {
    for (let dx = 0; dx <= 5; dx++) for (let dy = 0; dy <= 5; dy++) for (let dz = 0; dz <= 6; dz++) {
      for (const rule of ['equidistant', 'alternating', 'manhattan'] as const) {
        expect(pathLengthInCells(SQUARE, [cell(1, 2), cell(1 + dx, 2 + dy)], rule, dz), `${rule} ${dx},${dy},${dz}`).toBe(walked(dx, dy, dz, rule));
      }
    }
  });

  it('counts the three axis differences as each rule says', () => {
    const leg = (dx: number, dy: number, rise: number, rule: DiagonalRule): number => pathLengthInCells(SQUARE, [cell(0, 0), cell(dx, dy)], rule, rise);
    // 20 ft across, 20 ft up: a diagonal like one on the floor.
    expect(leg(4, 0, 4, 'equidistant')).toBe(4);
    expect(leg(4, 0, 4, 'alternating')).toBe(6);
    expect(leg(4, 0, 4, 'manhattan')).toBe(8);
    expect(leg(4, 0, 4, 'euclidean')).toBeCloseTo(Math.hypot(4, 4));
    // The largest and the second largest of the three decide the alternating count.
    expect(leg(3, 2, 2, 'alternating')).toBe(4);
    expect(leg(2, 2, 3, 'alternating')).toBe(4);
    expect(leg(1, 1, 5, 'alternating')).toBe(5);
    expect(leg(4, 4, 4, 'alternating')).toBe(6);
    expect(leg(3, 4, 12, 'euclidean')).toBeCloseTo(13);
    // Straight up.
    for (const rule of RULES) expect(leg(0, 0, 6, rule), rule).toBe(6);
  });

  it('counts the climb once over a path with corners', () => {
    // Two diagonals, then two cells straight: four steps, two of them diagonal.
    const path = [cell(0, 0), cell(2, 2), cell(4, 2)];
    const climbing = (rise: number, rule: DiagonalRule): number => pathLengthInCells(SQUARE, path, rule, rise);
    expect([0, 1, 2, 3, 4, 6].map((rise) => climbing(rise, 'alternating'))).toEqual([5, 5, 5, 5, 6, 8]);
    expect([0, 3, 4, 6].map((rise) => climbing(rise, 'equidistant'))).toEqual([4, 4, 4, 6]);
    expect([0, 3, 6].map((rise) => climbing(rise, 'manhattan'))).toEqual([6, 9, 12]);
    expect(climbing(3, 'euclidean')).toBeCloseTo(Math.hypot(2 * Math.SQRT2 + 2, 3));
    // The same climb whichever way the path is walked, and whichever end is the higher one.
    for (const rule of RULES) {
      expect(pathLengthInCells(SQUARE, [...path].reverse(), rule, 3), rule).toBeCloseTo(climbing(3, rule));
      expect(climbing(-3, rule), rule).toBe(climbing(3, rule));
    }
  });

  it('prices a hex step that climbs as the diagonal it is', () => {
    for (const type of ['hex-vertical', 'hex-horizontal'] as const) {
      const grid: GridGeometry = { type, size: 70, offsetX: 13, offsetY: -22 };
      const layout = createHexLayout(type, 70, 13, -22);
      const three = [axialToPixel(layout, { q: 0, r: 0 }), axialToPixel(layout, { q: 3, r: 0 })];
      const hex = (rise: number, rule: DiagonalRule): number => pathLengthInCells(grid, three, rule, rise);
      expect(RULES.map((rule) => hex(0, rule)), type).toEqual([3, 3, 3, 3]);
      expect([hex(2, 'equidistant'), hex(2, 'alternating'), hex(2, 'manhattan')], type).toEqual([3, 4, 5]);
      expect(hex(2, 'euclidean')).toBeCloseTo(Math.hypot(3, 2));
      // Higher than far: the steps across are taken while climbing.
      expect([hex(5, 'equidistant'), hex(5, 'alternating'), hex(5, 'manhattan')], type).toEqual([5, 6, 8]);
    }
  });

  it('takes a climb a rounding error short of whole cells as whole, and no climb for what is no number', () => {
    const flat = flatCells(SQUARE, [cell(0, 0), cell(4, 0)]);
    expect(cellsByRule(flat, 'alternating', 3.9999999999999996)).toBe(6);
    expect(cellsByRule(flat, 'alternating', 0.3 / 0.1)).toBe(5);
    for (const rise of [NaN, Infinity, -Infinity]) expect(cellsByRule(flat, 'alternating', rise)).toBe(4);
  });

  it('costs a path that does not climb exactly what it cost before heights were counted', () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let trial = 0; trial < 300; trial++) {
      const points = Array.from({ length: 2 + Math.floor(random() * 4) }, () => (
        trial % 2 === 0 ? cell(Math.floor(random() * 12), Math.floor(random() * 12)) : { x: random() * 900, y: random() * 900 }
      ));
      let straight = 0;
      let diagonal = 0;
      let euclidean = 0;
      for (let i = 1; i < points.length; i++) {
        const whole = (cells: number): number => (Math.abs(cells - Math.round(cells)) < 1e-6 ? Math.round(cells) : cells);
        const dx = whole(Math.abs(points[i]!.x - points[i - 1]!.x) / 70);
        const dy = whole(Math.abs(points[i]!.y - points[i - 1]!.y) / 70);
        straight += Math.abs(dx - dy);
        diagonal += Math.min(dx, dy);
        euclidean += Math.hypot(dx, dy);
      }
      const before = { equidistant: straight + diagonal, alternating: straight + diagonal + Math.floor(diagonal / 2), manhattan: straight + 2 * diagonal, euclidean };
      for (const rule of RULES) {
        expect(pathLengthInCells(SQUARE, points, rule), `${rule} ${trial}`).toBe(before[rule]);
        expect(pathLengthInCells(SQUARE, points, rule, 0), `${rule} ${trial}`).toBe(before[rule]);
      }
    }
  });
});
