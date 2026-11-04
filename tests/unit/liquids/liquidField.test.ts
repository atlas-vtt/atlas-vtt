import { describe, expect, it } from 'vitest';
import { courseFrame } from '../../../src/app/pixi/liquids/liquidCourse';
import { FAR_RANGE_CELLS, fieldDistance, liquidField } from '../../../src/app/pixi/liquids/liquidField';
import type { Point } from '../../../src/app/types/visionTypes';

/** The exact distance of `point` from the nearest edge of the rings, signed by even-odd. */
function exact(point: Point, rings: readonly (readonly Point[])[]): number {
  let nearest = Infinity;
  let inside = false;
  for (const ring of rings) {
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t));
      if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + ((point.y - a.y) / (b.y - a.y)) * dx) inside = !inside;
    });
  }
  return inside ? nearest : -nearest;
}

const CELL = 70;
const blob = (r: number, n: number): Point[] => Array.from({ length: n }, (_, k) => {
  const angle = (k / n) * Math.PI * 2;
  const radius = r * CELL * (1 + 0.25 * Math.sin(angle * 5));
  return { x: 400 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius };
});

describe('the distance field of a liquid surface', () => {
  it('holds each texel\'s distance from the shore, in cells, exactly at the shore and within a tenth of a cell inside, its holes counted', () => {
    const polygon = blob(4, 160);
    const hole = [{ x: 380, y: 280 }, { x: 440, y: 280 }, { x: 440, y: 330 }, { x: 380, y: 330 }];
    const field = liquidField(polygon, CELL, [hole]);
    let worst = 0;
    let worstAtShore = 0;
    for (let j = 0; j < field.height; j++) {
      for (let i = 0; i < field.width; i++) {
        const point = { x: field.origin.x + (i + 0.5) * field.texel, y: field.origin.y + (j + 0.5) * field.texel };
        const expected = Math.max(-field.outside, Math.min(FAR_RANGE_CELLS, exact(point, [polygon, hole]) / CELL));
        const error = Math.abs(fieldDistance(field, i, j) - expected);
        worst = Math.max(worst, error);
        if (Math.abs(expected) < 0.4) worstAtShore = Math.max(worstAtShore, error);
      }
    }
    // The shore's fade reads the near channel, in steps of a 300th of a cell; carrying on errs a little at corners.
    expect(worstAtShore).toBeLessThan(0.02);
    expect(worst).toBeLessThan(0.1);
  });

  it('never grows past its side limit, whatever the surface\'s size', () => {
    const field = liquidField(blob(200, 400), CELL);
    expect(Math.max(field.width, field.height)).toBeLessThanOrEqual(512);
  });

  it('draws no shore along an open edge: the water there is as deep as the banks make it, past it too', () => {
    // A channel three cells wide, running off the right edge (edge 1 is open).
    const polygon = [{ x: 0, y: 0 }, { x: 10 * CELL, y: 0 }, { x: 10 * CELL, y: 3 * CELL }, { x: 0, y: 3 * CELL }];
    const field = liquidField(polygon, CELL, [], [1]);
    const j = Math.floor((1.5 * CELL - field.origin.y) / field.texel);
    const y = field.origin.y + (j + 0.5) * field.texel;
    const middle = Math.min(y, 3 * CELL - y) / CELL;
    const edge = Math.floor((10 * CELL - field.origin.x) / field.texel);
    // At the open edge and a texel past it, the middle lies as far from the banks as anywhere along it.
    for (const i of [edge - 1, edge, edge + 1]) expect(Math.abs(fieldDistance(field, i, j) - middle)).toBeLessThan(0.02);
    // The closed left end is still a shore.
    const left = Math.floor((0.05 * CELL - field.origin.x) / field.texel);
    expect(fieldDistance(field, left, j)).toBeLessThan(0.1);
  });
});

describe('the frame of a surface that flows along a course', () => {
  /** The frame at the texel holding (x, y), and that texel's middle. */
  const at = (frame: ReturnType<typeof courseFrame>, field: ReturnType<typeof liquidField>, x: number, y: number): [number, number, number, number] => {
    const i = Math.floor((x - field.origin.x) / field.texel);
    const j = Math.floor((y - field.origin.y) / field.texel);
    return [frame.values[(j * frame.width + i) * 2]!, frame.values[(j * frame.width + i) * 2 + 1]!, field.origin.x + (i + 0.5) * field.texel, field.origin.y + (j + 0.5) * field.texel];
  };

  it('is a straight flow\'s own frame along a straight course: across to its left, along it downstream, in cells', () => {
    const polygon = [{ x: 0, y: 0 }, { x: 10 * CELL, y: 0 }, { x: 10 * CELL, y: 4 * CELL }, { x: 0, y: 4 * CELL }];
    const field = liquidField(polygon, CELL);
    const frame = courseFrame([{ x: 0, y: 2 * CELL }, { x: 10 * CELL, y: 2 * CELL }], CELL, field);
    // Flowing right (+x), the frame's across axis is (-flow.y, flow.x) = (0, 1): down the map is its left.
    const [across, along, x, y] = at(frame, field, 4 * CELL, 3 * CELL);
    expect(across).toBeCloseTo((y - 2 * CELL) / CELL, 5);
    expect(along).toBeCloseTo(x / CELL, 5);
  });

  it('follows a bend without a jump: neighbouring texels of the water differ by about a texel', () => {
    // A quarter circle of radius 6 cells, the water two cells either side.
    const course = Array.from({ length: 25 }, (_, k) => {
      const angle = (k / 24) * (Math.PI / 2);
      return { x: (6 - 6 * Math.cos(angle)) * CELL + 2 * CELL, y: 6 * Math.sin(angle) * CELL + 2 * CELL };
    });
    const outer = course.map((p, k) => ({ x: p.x - 2 * CELL * Math.cos((k / 24) * (Math.PI / 2)), y: p.y + 2 * CELL * Math.sin((k / 24) * (Math.PI / 2)) }));
    const inner = course.map((p, k) => ({ x: p.x + 2 * CELL * Math.cos((k / 24) * (Math.PI / 2)), y: p.y - 2 * CELL * Math.sin((k / 24) * (Math.PI / 2)) }));
    const polygon = [...outer, ...inner.reverse()];
    const field = liquidField(polygon, CELL);
    const frame = courseFrame(course, CELL, field);
    const step = field.texel / CELL;
    let worst = 0;
    // Within the water: beyond the inner bank the nearest point of the course jumps where the bend's middle lies.
    const wet = (i: number, j: number): boolean => fieldDistance(field, i, j) > 0;
    for (let j = 0; j + 1 < frame.height; j++) {
      for (let i = 0; i + 1 < frame.width; i++) {
        if (!wet(i, j) || !wet(i + 1, j) || !wet(i, j + 1)) continue;
        const here = (j * frame.width + i) * 2;
        for (const next of [here + 2, here + frame.width * 2]) {
          worst = Math.max(worst, Math.abs(frame.values[next]! - frame.values[here]!), Math.abs(frame.values[next + 1]! - frame.values[here + 1]!));
        }
      }
    }
    // Along stretches on the outer bank (radius 8 over the course's 6), never by a jump.
    expect(worst).toBeLessThan(step * 2);
    expect(Math.abs(at(frame, field, course[24]!.x, course[24]!.y)[1] - 3 * Math.PI)).toBeLessThan(0.1);
  });
});
