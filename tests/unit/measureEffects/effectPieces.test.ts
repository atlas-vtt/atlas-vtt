import { describe, expect, it } from 'vitest';
import { areaFrame, effectPieces, movedBy, reachFrom, type Ring } from '../../../src/app/pixi/measure/effects/effectPieces';

const box = (x: number, y: number, width: number, height: number): Ring => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
const reversed = (ring: Ring): Ring => [...ring].reverse();

describe('the pieces of an area an effect draws', () => {
  it('takes rings apart from each other as pieces of their own', () => {
    const pieces = effectPieces([box(0, 0, 10, 10), box(20, 0, 10, 10)]);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((piece) => piece.holes.length === 0)).toBe(true);
  });

  it('takes a ring inside another as its hole, and a ring inside that as a piece again', () => {
    const outer = box(0, 0, 100, 100);
    const hole = reversed(box(20, 20, 60, 60));
    const island = box(40, 40, 20, 20);
    const other = box(200, 0, 50, 50);
    const pieces = effectPieces([island, other, hole, outer]);
    expect(pieces).toHaveLength(3);
    expect(pieces.find((piece) => piece.outline === outer)?.holes).toEqual([hole]);
    expect(pieces.find((piece) => piece.outline === island)?.holes).toEqual([]);
    expect(pieces.find((piece) => piece.outline === other)?.holes).toEqual([]);
  });

  it('leaves out what is no area', () => {
    expect(effectPieces([[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 2, y: 2 }], []])).toEqual([]);
    expect(effectPieces([])).toEqual([]);
  });
});

describe('rings that only moved', () => {
  const rings = [box(0, 0, 10, 10), box(20, 0, 10, 10)];
  const shifted = (dx: number, dy: number): Ring[] => rings.map((ring) => ring.map(({ x, y }) => ({ x: x + dx, y: y + dy })));

  it('tells how far the same rings moved as a whole', () => {
    expect(movedBy(rings, shifted(7.5, -3))).toEqual({ x: 7.5, y: -3 });
    expect(movedBy(rings, shifted(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it('sees another shape, however little', () => {
    const grown = shifted(5, 5);
    grown[1] = grown[1]!.map((point, index) => (index === 2 ? { x: point.x + 0.01, y: point.y } : point));
    expect(movedBy(rings, grown)).toBeNull();
    expect(movedBy(rings, [rings[0]!])).toBeNull();
    expect(movedBy(rings, [rings[0]!, rings[1]!.slice(0, 3)])).toBeNull();
    expect(movedBy([], [])).toBeNull();
    expect(movedBy(rings, shifted(NaN, 0))).toBeNull();
  });
});

describe('the frame of an area', () => {
  it('finds the middle of a box and the way it is long', () => {
    const frame = areaFrame(effectPieces([box(100, 200, 80, 10)]))!;
    expect(frame.centre.x).toBeCloseTo(140, 9);
    expect(frame.centre.y).toBeCloseTo(205, 9);
    expect(Math.abs(frame.axis.x)).toBeCloseTo(1, 9);
    expect(frame.axis.y).toBeCloseTo(0, 9);
    // Eight times as long as wide.
    expect(frame.stretch).toBeCloseTo(1 - 1 / 8, 9);
  });

  it('follows a line that lies askew, whichever way its ring runs', () => {
    const along = { x: Math.cos(0.5), y: Math.sin(0.5) };
    const across = { x: -along.y, y: along.x };
    const ring: Ring = [[0, -5], [300, -5], [300, 5], [0, 5]].map(([a, b]) => ({ x: 50 + along.x * a! + across.x * b!, y: 70 + along.y * a! + across.y * b! }));
    for (const way of [ring, reversed(ring)]) {
      const frame = areaFrame(effectPieces([way]))!;
      expect(Math.abs(frame.axis.x * along.x + frame.axis.y * along.y)).toBeCloseTo(1, 9);
      expect(frame.centre.x).toBeCloseTo(50 + along.x * 150, 6);
      expect(frame.centre.y).toBeCloseTo(70 + along.y * 150, 6);
    }
  });

  it('gives a round or square area no way of its own', () => {
    const circle: Ring = Array.from({ length: 64 }, (_, i) => ({ x: 500 + 90 * Math.cos((i / 64) * 2 * Math.PI), y: -300 + 90 * Math.sin((i / 64) * 2 * Math.PI) }));
    for (const ring of [circle, box(0, 0, 40, 40)]) {
      const frame = areaFrame(effectPieces([ring]))!;
      expect(frame.stretch).toBeLessThan(0.02);
      expect(frame.axis).toEqual({ x: 1, y: 0 });
    }
    expect(areaFrame(effectPieces([circle]))!.centre.x).toBeCloseTo(500, 6);
  });

  it('counts a hole out and pieces together', () => {
    // A square with a hole on its right: its middle moves left of the square's.
    const holed = areaFrame(effectPieces([box(0, 0, 100, 100), box(60, 30, 30, 40)]))!;
    expect(holed.centre.x).toBeCloseTo((100 * 100 * 50 - 30 * 40 * 75) / (100 * 100 - 30 * 40), 9);
    expect(holed.centre.y).toBeCloseTo(50, 9);
    // Two squares side by side are long the way they lie.
    const pair = areaFrame(effectPieces([box(0, 0, 10, 10), box(40, 0, 10, 10)]))!;
    expect(pair.centre.x).toBeCloseTo(25, 9);
    expect(pair.centre.y).toBeCloseTo(5, 9);
    expect(Math.abs(pair.axis.x)).toBeCloseTo(1, 9);
    expect(pair.stretch).toBeGreaterThan(0.8);
  });

  it('has none for nothing', () => {
    expect(areaFrame([])).toBeNull();
    expect(areaFrame([{ outline: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }], holes: [] }])).toBeNull();
  });
});

describe('how far an area reaches', () => {
  it('is the distance of its farthest corner', () => {
    expect(reachFrom({ x: 0, y: 0 }, [box(0, 0, 30, 40), box(-10, -10, 5, 5)])).toBe(50);
    expect(reachFrom({ x: 3, y: 3 }, [])).toBe(0);
  });
});
