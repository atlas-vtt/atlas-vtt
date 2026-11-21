import { describe, expect, it } from 'vitest';
import { ExploredEditStack, editPolygons, packCoverage, strokePolygons, travelledCoverage, unpackCoverage, type ExploredStep } from '../../src/app/lighting/exploredEdits';
import type { Point } from '../../src/app/types/visionTypes';

/** Whether `point` lies in one of the polygons (even-odd). */
function covers(polygons: Point[][], point: Point): boolean {
  return polygons.some((polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!, b = polygon[j]!;
      if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  });
}

describe('strokePolygons', () => {
  it('is the rectangle itself', () => {
    expect(strokePolygons({ type: 'rectangle', x: 10, y: 20, width: 30, height: 40 })).toEqual([[{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 }]]);
  });

  it('covers what a lasso encloses, and nothing for one of two points', () => {
    const lasso = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 40 }];
    const polygons = strokePolygons({ type: 'lasso', points: lasso });
    for (const inside of [{ x: 25, y: 10 }, { x: 10, y: 5 }, { x: 25, y: 35 }]) expect(covers(polygons, inside)).toBe(true);
    for (const outside of [{ x: 5, y: 30 }, { x: 45, y: 30 }, { x: 25, y: 45 }]) expect(covers(polygons, outside)).toBe(false);
    expect(strokePolygons({ type: 'lasso', points: lasso.slice(0, 2) })).toEqual([]);
  });

  it('covers both loops of a lasso that crosses itself, and nothing beyond its outline', () => {
    // A figure of eight drawn in one go.
    const polygons = strokePolygons({ type: 'lasso', points: [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 90 }] });
    expect(covers(polygons, { x: 30, y: 50 })).toBe(true);
    expect(covers(polygons, { x: 70, y: 50 })).toBe(true);
    expect(covers(polygons, { x: 50, y: 20 })).toBe(false);
    expect(covers(polygons, { x: 50, y: 80 })).toBe(false);
    for (const corner of polygons.flat()) {
      expect(corner.x).toBeGreaterThanOrEqual(10);
      expect(corner.x).toBeLessThanOrEqual(90);
    }
  });

  it('keeps a long freehand lasso to a few hundred corners without changing what it covers', () => {
    // A circle of 4,000 pointer positions.
    const points = Array.from({ length: 4000 }, (_, i) => ({ x: 500 + Math.cos((i / 4000) * Math.PI * 2) * 400, y: 500 + Math.sin((i / 4000) * Math.PI * 2) * 400 }));
    const polygons = strokePolygons({ type: 'lasso', points });
    expect(polygons.length).toBeLessThan(900);
    expect(covers(polygons, { x: 500, y: 500 })).toBe(true);
    expect(covers(polygons, { x: 500, y: 898 })).toBe(true);
    expect(covers(polygons, { x: 500, y: 902 })).toBe(false);
    expect(covers(polygons, { x: 102, y: 500 })).toBe(true);
    expect(covers(polygons, { x: 98, y: 500 })).toBe(false);
  });

  it('covers a brush stroke a radius wide all along it, with round ends', () => {
    const polygons = strokePolygons({ type: 'brush', brushRadius: 10, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
    expect(polygons).toHaveLength(2);
    for (const inside of [{ x: 50, y: 9 }, { x: 50, y: -9 }, { x: -9, y: 0 }, { x: 100, y: 50 }, { x: 109, y: 50 }, { x: 100, y: 109 }, { x: 106, y: -6 }]) expect(covers(polygons, inside)).toBe(true);
    for (const outside of [{ x: 50, y: 11 }, { x: -11, y: 0 }, { x: 89, y: 50 }, { x: 100, y: 111 }, { x: 108, y: -8 }, { x: -8, y: 8 }]) expect(covers(polygons, outside)).toBe(false);
  });

  it('covers a single press of the brush as a disc', () => {
    const polygons = strokePolygons({ type: 'brush', brushRadius: 10, points: [{ x: 50, y: 50 }] });
    expect(polygons).toHaveLength(1);
    expect(covers(polygons, { x: 58, y: 50 })).toBe(true);
    expect(covers(polygons, { x: 50, y: 41 })).toBe(true);
    expect(covers(polygons, { x: 58, y: 58 })).toBe(false);
  });

  it('leaves out points that add nothing, never the last one', () => {
    const points = Array.from({ length: 101 }, (_, i) => ({ x: i * 0.1, y: 0 }));
    // 10 px in steps of a tenth: a brush of 20 px keeps every twentieth point.
    const polygons = strokePolygons({ type: 'brush', brushRadius: 20, points });
    expect(polygons.length).toBeLessThan(10);
    expect(covers(polygons, { x: 29, y: 0 })).toBe(true);
    expect(covers(polygons, { x: 31, y: 0 })).toBe(false);
  });

  it('covers nothing with a brush that has no size or no points', () => {
    expect(strokePolygons({ type: 'brush', brushRadius: 0, points: [{ x: 5, y: 5 }] })).toEqual([]);
    expect(strokePolygons({ type: 'brush', brushRadius: Number.NaN, points: [{ x: 5, y: 5 }] })).toEqual([]);
    expect(strokePolygons({ type: 'brush', brushRadius: 10, points: [] })).toEqual([]);
  });

  it('covers the whole map for an edit of everything', () => {
    expect(editPolygons({ mode: 'forget', area: 'everything' }, { width: 300, height: 200 })).toEqual([[{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }]]);
    expect(editPolygons({ mode: 'reveal', area: { type: 'rectangle', x: 1, y: 2, width: 3, height: 4 } }, { width: 300, height: 200 })).toHaveLength(1);
  });
});

describe('packCoverage', () => {
  it('gives the same bytes back', () => {
    const edges = Uint8Array.from([0, 0, 0, 12, 200, 255, 255, 255, 255, 90, 0, 0]);
    expect(unpackCoverage(packCoverage(edges), edges.length)).toEqual(edges);
    expect(unpackCoverage(packCoverage(new Uint8Array(0)), 0)).toEqual(new Uint8Array(0));
    const noise = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) % 256);
    expect(unpackCoverage(packCoverage(noise), noise.length)).toEqual(noise);
  });

  it('keeps runs longer than a byte counts', () => {
    const flat = new Uint8Array(100_000).fill(255);
    flat[70_000] = 3;
    const packed = packCoverage(flat);
    expect(unpackCoverage(packed, flat.length)).toEqual(flat);
  });

  it('shrinks a memory that is flat but for its edges to a small share of its size', () => {
    // A 1,024 px square with a revealed room and a soft edge on each of its rows.
    const side = 1024;
    const memory = new Uint8Array(side * side);
    for (let y = 200; y < 800; y++) {
      memory.fill(255, y * side + 300, y * side + 700);
      memory[y * side + 299] = 128;
      memory[y * side + 700] = 128;
    }
    expect(packCoverage(memory).length).toBeLessThan(memory.length / 50);
  });

  it('never writes past the length it is asked for', () => {
    expect(unpackCoverage(Uint8Array.from([200, 9]), 4)).toEqual(Uint8Array.from([9, 9, 9, 9]));
  });
});

describe('ExploredEditStack', () => {
  let serial = 0;
  const step = (name: string): { region: string; before: Uint8Array; after: Uint8Array; serial: number } => ({ region: name, before: Uint8Array.from([0]), after: Uint8Array.from([1]), serial: ++serial });
  const names = (stack: ExploredEditStack<ExploredStep<string>>, from: number, to: number): string[] => stack.path(from, to).map((taken) => taken.region);

  it('undoes the newest step first and redoes the oldest first', () => {
    const stack = new ExploredEditStack<ExploredStep<string>>(50);
    stack.record(1, step('a'));
    stack.record(2, step('b'));
    stack.record(3, step('c'));
    expect(names(stack, 3, 2)).toEqual(['c']);
    expect(names(stack, 3, 0)).toEqual(['c', 'b', 'a']);
    expect(names(stack, 0, 2)).toEqual(['a', 'b']);
    expect(names(stack, 2, 2)).toEqual([]);
  });

  it('drops the steps that were undone when a new edit follows', () => {
    const stack = new ExploredEditStack<ExploredStep<string>>(50);
    stack.record(1, step('a'));
    stack.record(2, step('b'));
    stack.record(3, step('c'));
    stack.record(2, step('d'));
    expect(stack.size).toBe(2);
    expect(names(stack, 0, 3)).toEqual(['a', 'd']);
  });

  it('keeps as many steps as the undo history, and leaves out a step it no longer has', () => {
    const stack = new ExploredEditStack<ExploredStep<string>>(3);
    for (let revision = 1; revision <= 5; revision++) stack.record(revision, step(String(revision)));
    expect(stack.size).toBe(3);
    expect(names(stack, 5, 0)).toEqual(['5', '4', '3']);
  });

  it('forgets everything when cleared', () => {
    const stack = new ExploredEditStack<ExploredStep<string>>(50);
    stack.record(1, step('a'));
    stack.clear();
    expect(stack.size).toBe(0);
    expect(names(stack, 1, 0)).toEqual([]);
  });
});

describe('travelledCoverage', () => {
  const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
  /** A Reveal over the first three texels of five: unexplored, half explored and explored before it. */
  const revealed = { before: bytes(0, 100, 255, 0, 255), after: bytes(255, 255, 255, 0, 255), serial: 3 };
  /** A Forget over the first three. */
  const forgotten = { before: bytes(255, 100, 0, 0, 255), after: bytes(0, 0, 0, 0, 255), serial: 3 };

  it('takes a step back and makes it again on the texels it changed', () => {
    expect(travelledCoverage(revealed, revealed.after, null, true)).toEqual(revealed.before);
    expect(travelledCoverage(revealed, revealed.before, null, false)).toEqual(revealed.after);
    expect(travelledCoverage(forgotten, forgotten.after, null, true)).toEqual(forgotten.before);
    expect(travelledCoverage(forgotten, forgotten.before, null, false)).toEqual(forgotten.after);
  });

  it('leaves the texels the step did not change as they are now, whatever was recorded there since', () => {
    // The last two texels are in the step's rectangle and not its own: sight has recorded the fourth since.
    const now = bytes(255, 255, 255, 255, 40);
    expect([...travelledCoverage(revealed, now, null, true)].slice(3)).toEqual([255, 40]);
    expect([...travelledCoverage(revealed, now, null, false)].slice(3)).toEqual([255, 40]);
  });

  it('never lowers a texel when it gives memory back: what was recorded on top stays', () => {
    // The Forget is undone on a texel that was half explored before and that sight has fully seen since.
    expect(travelledCoverage(forgotten, bytes(0, 255, 0, 0, 255), null, true)).toEqual(bytes(255, 255, 0, 0, 255));
    expect(travelledCoverage(revealed, bytes(0, 100, 255, 90, 255), null, false)).toEqual(bytes(255, 255, 255, 90, 255));
  });

  it('does not take away what the party has seen since the step was first made', () => {
    // Sight recorded the first texel while this step (3) or a later one was the newest, the second while an earlier one was.
    const seen = bytes(3, 2, 0, 0, 0);
    expect(travelledCoverage(revealed, revealed.after, seen, true)).toEqual(bytes(255, 100, 255, 0, 255));
    expect(travelledCoverage(revealed, revealed.after, bytes(7, 7, 7, 7, 7), true)).toEqual(revealed.after);
    // A Forget made again forgets what it forgot, except what was seen after it.
    expect(travelledCoverage(forgotten, forgotten.before, seen, false)).toEqual(bytes(255, 0, 0, 0, 255));
  });

  it('counts sight recorded before the step as not seen since', () => {
    expect(travelledCoverage(forgotten, forgotten.before, bytes(2, 2, 2, 2, 2), false)).toEqual(forgotten.after);
  });
});
