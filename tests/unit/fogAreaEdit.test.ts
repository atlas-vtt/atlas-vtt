import { describe, expect, it } from 'vitest';
import { cornerAt, edgeAt, isAreaOutline, movedOutline, outlineCrossesItself, rectangleBetween, withCornerAdded, withCornerAt, withoutCorner } from '../../src/app/fog/fogAreaEdit';
import type { Point } from '../../src/app/types/visionTypes';

/** A square of 100, its corners from the top left round to the bottom left. */
const SQUARE: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

describe('the corner or edge of an area under the pointer', () => {
  it('finds the corner within reach, and the nearer of two', () => {
    expect(cornerAt(SQUARE, { x: 96, y: 3 }, 9)).toBe(1);
    expect(cornerAt(SQUARE, { x: 90, y: 0 }, 9)).toBeNull();
    expect(cornerAt(SQUARE, { x: 100, y: 109 }, 9)).toBe(2);
    expect(cornerAt([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }], { x: 6, y: 0 }, 9)).toBe(1);
    // Two corners in one place: the first.
    expect(cornerAt([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 50 }], { x: 1, y: 0 }, 9)).toBe(0);
  });

  it('finds the edge within reach and the place on it under the pointer', () => {
    expect(edgeAt(SQUARE, { x: 40, y: 4 }, 6)).toEqual({ index: 0, point: { x: 40, y: 0 } });
    expect(edgeAt(SQUARE, { x: 103, y: 70 }, 6)).toEqual({ index: 1, point: { x: 100, y: 70 } });
    // The edge that closes the outline starts at its last corner.
    expect(edgeAt(SQUARE, { x: -2, y: 30 }, 6)).toEqual({ index: 3, point: { x: 0, y: 30 } });
    expect(edgeAt(SQUARE, { x: 50, y: 50 }, 6)).toBeNull();
    // Past an edge's end, its end is the nearest place.
    expect(edgeAt(SQUARE, { x: 103, y: -3 }, 6)).toEqual({ index: 0, point: { x: 100, y: 0 } });
  });

  it('passes over an edge without length', () => {
    expect(edgeAt([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], { x: 0, y: 0 }, 6)).toBeNull();
  });
});

describe('the outline an area may have', () => {
  it('is three corners or more that enclose ground', () => {
    expect(isAreaOutline(SQUARE)).toBe(true);
    expect(isAreaOutline(SQUARE.slice(0, 3))).toBe(true);
    expect(isAreaOutline(SQUARE.slice(0, 2))).toBe(false);
    expect(isAreaOutline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])).toBe(false);
    expect(isAreaOutline([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 100, y: 100 }])).toBe(false);
  });

  it('never crosses itself', () => {
    // A bow tie: the second and third corners swapped.
    const bow = [SQUARE[0]!, SQUARE[2]!, SQUARE[1]!, SQUARE[3]!];
    expect(outlineCrossesItself(bow)).toBe(true);
    expect(isAreaOutline(bow)).toBe(false);
    expect(outlineCrossesItself(SQUARE)).toBe(false);
    // A corner pulled inward leaves a dart, which is an outline.
    expect(outlineCrossesItself(withCornerAt(SQUARE, 2, { x: 30, y: 30 }))).toBe(false);
    // Pulled past the opposite edge, two edges cross.
    expect(outlineCrossesItself(withCornerAt(SQUARE, 2, { x: 50, y: -40 }))).toBe(true);
  });

  it('may touch itself, as an outline with a corner on one of its edges does', () => {
    expect(outlineCrossesItself([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 0 }, { x: 0, y: 100 }])).toBe(false);
  });
});

describe('a corner moved, added or removed', () => {
  it('moves one corner and leaves the outline it was given alone', () => {
    const moved = withCornerAt(SQUARE, 1, { x: 150, y: -20 });
    expect(moved).toEqual([{ x: 0, y: 0 }, { x: 150, y: -20 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    expect(SQUARE[1]).toEqual({ x: 100, y: 0 });
  });

  it('adds a corner after the corner its edge starts at', () => {
    expect(withCornerAdded(SQUARE, 0, { x: 40, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    expect(withCornerAdded(SQUARE, 3, { x: 0, y: 30 })).toEqual([...SQUARE, { x: 0, y: 30 }]);
    // On its edge the new corner changes nothing of the area.
    expect(isAreaOutline(withCornerAdded(SQUARE, 0, { x: 40, y: 0 }))).toBe(true);
  });

  it('removes a corner, never below three, and never into an outline that is none', () => {
    expect(withoutCorner(SQUARE, 1)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]);
    expect(withoutCorner(SQUARE.slice(0, 3), 0)).toBeNull();
    expect(withoutCorner(SQUARE, 4)).toBeNull();
    // What is left lies on one line.
    expect(withoutCorner([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 40 }], 3)).toBeNull();
  });

  it('moves every corner alike', () => {
    expect(movedOutline(SQUARE, 10, -5)).toEqual([{ x: 10, y: -5 }, { x: 110, y: -5 }, { x: 110, y: 95 }, { x: 10, y: 95 }]);
  });
});

describe('a rectangle whose corner is dragged', () => {
  it('reaches from the corner opposite to the pointer, so two edges follow', () => {
    expect(rectangleBetween({ x: 0, y: 0 }, { x: 140, y: 70 })).toEqual({ x: 0, y: 0, width: 140, height: 70 });
  });

  it('turns over when the corner is dragged past the one opposite', () => {
    expect(rectangleBetween({ x: 100, y: 100 }, { x: 30, y: 160 })).toEqual({ x: 30, y: 100, width: 70, height: 60 });
    expect(rectangleBetween({ x: 100, y: 100 }, { x: 30, y: 20 })).toEqual({ x: 30, y: 20, width: 70, height: 80 });
  });

  it('is none without a width or a height, or to a place that is none', () => {
    expect(rectangleBetween({ x: 0, y: 0 }, { x: 0, y: 70 })).toBeNull();
    expect(rectangleBetween({ x: 0, y: 0 }, { x: 70, y: 0 })).toBeNull();
    expect(rectangleBetween({ x: 0, y: 0 }, { x: Number.NaN, y: 70 })).toBeNull();
  });
});
