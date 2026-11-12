import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { circleCorners, EDGE_TOLERANCE, shapedArea, type ShapedArea } from '../measureGeometry';
import type { Measurement } from '../measureTypes';
import { AREA_SHAPES, distanceToOutline, inOutline, RULES, seeded } from './areaTestKit';

function area(shape: Measurement['shape'], origin: Point, end: Point, rules = RULES, width?: number): ShapedArea {
  const made = shapedArea({ shape, points: [origin, end], ...(width !== undefined && { width }) }, rules);
  if (!made) throw new Error('no area');
  return made;
}

const along = (from: Point, degrees: number, length: number): Point => ({
  x: from.x + length * Math.cos((degrees * Math.PI) / 180),
  y: from.y + length * Math.sin((degrees * Math.PI) / 180),
});

describe('shapedArea', () => {
  it('has no area for a ruler, a drag without length or points that are no place', () => {
    expect(shapedArea({ shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, RULES)).toBeNull();
    expect(shapedArea({ shape: 'circle', points: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }, RULES)).toBeNull();
    expect(shapedArea({ shape: 'circle', points: [{ x: 5, y: 5 }] }, RULES)).toBeNull();
    expect(shapedArea({ shape: 'cone', points: [{ x: Number.NaN, y: 0 }, { x: 10, y: 0 }] }, RULES)).toBeNull();
    expect(shapedArea({ shape: 'square', points: [{ x: 0, y: 0 }, { x: Infinity, y: 0 }] }, RULES)).toBeNull();
    expect(shapedArea({ shape: 'cone', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, { ...RULES, coneAngle: 0 })).toBeNull();
    expect(shapedArea({ shape: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], width: 0 }, RULES)).toBeNull();
  });

  it('answers for the shape itself wherever the outline is not within a pixel', () => {
    const random = seeded(7);
    for (const shape of AREA_SHAPES) {
      for (const coneEnd of ['round', 'flat'] as const) {
        for (let run = 0; run < 6; run++) {
          const origin = { x: random() * 400 - 200, y: random() * 400 - 200 };
          const made = area(shape, origin, along(origin, random() * 360, 40 + random() * 500), { coneAngle: 20 + random() * 300, coneEnd, lineWidth: 30 + random() * 200 });
          const { minX, minY, maxX, maxY } = made.bounds;
          for (let i = 0; i < 400; i++) {
            const point = { x: minX - 20 + random() * (maxX - minX + 40), y: minY - 20 + random() * (maxY - minY + 40) };
            if (distanceToOutline(made, point) > 1) expect(made.contains(point)).toBe(inOutline(made, point));
          }
        }
      }
    }
  });

  it('keeps every point it holds within its bounds and its reach', () => {
    const random = seeded(11);
    for (const shape of AREA_SHAPES) {
      for (const coneEnd of ['round', 'flat'] as const) {
        for (let run = 0; run < 8; run++) {
          const origin = { x: random() * 100, y: random() * 100 };
          const made = area(shape, origin, along(origin, random() * 360, 50 + random() * 300), { coneAngle: 10 + random() * 340, coneEnd, lineWidth: 70 });
          const { minX, minY, maxX, maxY } = made.bounds;
          for (let i = 0; i < 300; i++) {
            const point = along(origin, random() * 360, random() * made.reach * 1.3);
            if (!made.contains(point)) continue;
            expect(Math.hypot(point.x - origin.x, point.y - origin.y)).toBeLessThanOrEqual(made.reach + 2 * EDGE_TOLERANCE);
            expect(point.x >= minX - 1e-5 && point.x <= maxX + 1e-5 && point.y >= minY - 1e-5 && point.y <= maxY + 1e-5).toBe(true);
          }
        }
      }
    }
  });

  describe('circle', () => {
    it('lies around its origin as far as its end, its edge included', () => {
      const made = area('circle', { x: 100, y: 50 }, { x: 100, y: 330 });
      expect(made.reach).toBe(280);
      expect(made.towards).toBeNull();
      expect(made.bounds).toEqual({ minX: -180, minY: -230, maxX: 380, maxY: 330 });
      for (let degrees = 0; degrees < 360; degrees += 7) {
        expect(made.contains(along(made.origin, degrees, 280))).toBe(true);
        expect(made.contains(along(made.origin, degrees, 280.001))).toBe(false);
      }
    });

    it('has a polygon within a quarter pixel of the circle, with corners on both axes and diagonals', () => {
      for (const radius of [10, 70, 280, 840]) {
        const [ring] = area('circle', { x: 0, y: 0 }, { x: radius, y: 0 }).rings;
        expect(ring!.length).toBe(circleCorners(radius));
        expect(ring!.length % 8).toBe(0);
        const eighth = ring!.length / 8;
        for (let i = 0; i < 8; i++) expect(Math.hypot(ring![i * eighth]!.x, ring![i * eighth]!.y)).toBeCloseTo(radius, 9);
        expect(radius * (1 - Math.cos(Math.PI / ring!.length))).toBeLessThanOrEqual(0.26);
      }
    });

    it('has between 32 and 128 corners, more for a larger one', () => {
      expect(circleCorners(1)).toBe(32);
      expect(circleCorners(70)).toBe(40);
      expect(circleCorners(280)).toBe(80);
      expect(circleCorners(840)).toBe(128);
      expect(circleCorners(1e7)).toBe(128);
    });
  });

  describe('cone', () => {
    it('with a round end is the outline the cone was always drawn with: its apex, then the arc at the drag\'s length', () => {
      const origin = { x: 40, y: -10 };
      const end = along(origin, 30, 300);
      const [ring] = area('cone', origin, end, { ...RULES, coneAngle: 90, coneEnd: 'round' }).rings;
      expect(ring![0]).toEqual(origin);
      const arc = ring!.slice(1);
      for (const corner of arc) expect(Math.hypot(corner.x - origin.x, corner.y - origin.y)).toBeCloseTo(300, 9);
      const first = along(origin, 30 - 45, 300);
      const last = along(origin, 30 + 45, 300);
      expect(arc[0]!.x).toBeCloseTo(first.x, 9);
      expect(arc[0]!.y).toBeCloseTo(first.y, 9);
      expect(arc[arc.length - 1]!.x).toBeCloseTo(last.x, 9);
      expect(arc[arc.length - 1]!.y).toBeCloseTo(last.y, 9);
      // As round as a circle of its size.
      expect(arc.length - 1).toBe(circleCorners(300) / 4);
    });

    it('with a flat end is the triangle whose far side crosses the drag at its length', () => {
      const made = area('cone', { x: 0, y: 0 }, { x: 0, y: 200 }, { ...RULES, coneAngle: 53.13010235415598, coneEnd: 'flat' });
      const [apex, left, right] = made.rings[0]!;
      expect(made.rings[0]).toHaveLength(3);
      expect(apex).toEqual({ x: 0, y: 0 });
      // A cone as wide at its end as it is long.
      expect(left!.x).toBeCloseTo(100, 9);
      expect(left!.y).toBeCloseTo(200, 9);
      expect(right!.x).toBeCloseTo(-100, 9);
      expect(right!.y).toBeCloseTo(200, 9);
      expect(made.contains({ x: 99, y: 199.5 })).toBe(true);
      expect(made.contains({ x: 0, y: 200.5 })).toBe(false);
      expect(made.reach).toBeCloseTo(Math.hypot(100, 200), 9);
    });

    it('with a round end reaches its length to the side, a flat one only straight ahead', () => {
      const rules = { ...RULES, coneAngle: 90 };
      const beside = along({ x: 0, y: 0 }, 40, 199);
      expect(area('cone', { x: 0, y: 0 }, { x: 200, y: 0 }, { ...rules, coneEnd: 'round' }).contains(beside)).toBe(true);
      expect(area('cone', { x: 0, y: 0 }, { x: 200, y: 0 }, { ...rules, coneEnd: 'flat' }).contains({ x: 199, y: 150 })).toBe(true);
      expect(area('cone', { x: 0, y: 0 }, { x: 200, y: 0 }, { ...rules, coneEnd: 'round' }).contains({ x: 199, y: 150 })).toBe(false);
    });

    it('is round from half a turn on, whatever its end, and a circle at a full turn', () => {
      const wide = area('cone', { x: 0, y: 0 }, { x: 100, y: 0 }, { ...RULES, coneAngle: 270, coneEnd: 'flat' });
      expect(wide.reach).toBe(100);
      expect(wide.contains({ x: -60, y: 60 })).toBe(true);
      expect(wide.contains({ x: -60, y: 10 })).toBe(false);
      expect(wide.bounds.minY).toBeCloseTo(-100, 9);
      const full = area('cone', { x: 0, y: 0 }, { x: 100, y: 0 }, { ...RULES, coneAngle: 360 });
      expect(full.rings[0]).toHaveLength(circleCorners(100));
      expect(full.contains({ x: -99, y: 0 })).toBe(true);
    });
  });

  it('makes a square from the middle of its near side, as long and as wide as the drag', () => {
    const made = area('square', { x: 100, y: 100 }, { x: 100, y: 240 });
    expect(made.rings[0]!.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual([[170, 100], [30, 100], [30, 240], [170, 240]]);
    expect(made.bounds).toEqual({ minX: 30, minY: 100, maxX: 170, maxY: 240 });
    expect(made.contains({ x: 30, y: 100 })).toBe(true);
    expect(made.contains({ x: 100, y: 99.9 })).toBe(false);
  });

  it('makes a line along the drag, its width across it, one cell where it names none', () => {
    const named = area('line', { x: 0, y: 0 }, { x: 300, y: 0 }, RULES, 20);
    expect(named.bounds).toEqual({ minX: 0, minY: -10, maxX: 300, maxY: 10 });
    expect(area('line', { x: 0, y: 0 }, { x: 300, y: 0 }).bounds).toEqual({ minX: 0, minY: -35, maxX: 300, maxY: 35 });
    expect(named.contains({ x: 150, y: 10 })).toBe(true);
    expect(named.contains({ x: 150, y: 10.01 })).toBe(false);
    expect(named.contains({ x: -0.01, y: 0 })).toBe(false);
  });
});
