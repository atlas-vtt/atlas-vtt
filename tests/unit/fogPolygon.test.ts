import { describe, expect, it } from 'vitest';
import { PolygonDraft, closedPolygon } from '../../src/app/fog/fogPolygon';

describe('the outline corners close to', () => {
  it('is the corners themselves once three of them enclose an area', () => {
    const corners = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }];
    const outline = closedPolygon(corners);
    expect(outline).toEqual(corners);
    // A copy: the shape that becomes fog is not the corners still being placed.
    expect(outline![0]).not.toBe(corners[0]);
  });

  it('is none for fewer than three corners, or corners on one line', () => {
    expect(closedPolygon([])).toBeNull();
    expect(closedPolygon([{ x: 0, y: 0 }, { x: 70, y: 0 }])).toBeNull();
    expect(closedPolygon([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 140, y: 0 }])).toBeNull();
    expect(closedPolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 35, y: 35 }, { x: 5, y: 5 }])).toBeNull();
  });

  it('counts a corner placed twice in a row once, and leaves out a last corner on the first', () => {
    // Three presses in two places are two corners: no area.
    expect(closedPolygon([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 0 }])).toBeNull();
    expect(closedPolygon([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }]);
  });
});

describe('a polygon under way', () => {
  it('takes corners in the order they are placed, but none on the one before or at no place', () => {
    const draft = new PolygonDraft();
    expect(draft.active).toBe(false);
    expect(draft.first).toBeNull();
    expect(draft.add({ x: 0, y: 0 })).toBe(true);
    expect(draft.active).toBe(true);
    expect(draft.add({ x: 0, y: 0 })).toBe(false);
    expect(draft.add({ x: Number.NaN, y: 3 })).toBe(false);
    expect(draft.add({ x: 70, y: 0 })).toBe(true);
    expect(draft.corners).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }]);
    expect(draft.first).toEqual({ x: 0, y: 0 });
    expect(draft.last).toEqual({ x: 70, y: 0 });
  });

  it('shows the area it would be with the pointer as its next corner', () => {
    const draft = new PolygonDraft();
    draft.add({ x: 0, y: 0 });
    expect(draft.outlineWith({ x: 50, y: 50 })).toBeNull();
    draft.add({ x: 70, y: 0 });
    expect(draft.outlineWith(null)).toBeNull();
    expect(draft.outlineWith({ x: 100, y: 0 })).toBeNull();
    expect(draft.outlineWith({ x: 70, y: 70 })).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }]);
    // The pointer on the first corner, where a click closes it: the corners placed alone.
    draft.add({ x: 70, y: 70 });
    expect(draft.outlineWith(draft.first)).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }]);
    // Looking changes nothing.
    expect(draft.corners).toHaveLength(3);
  });

  it('closes into its outline, and goes on while its corners make no area', () => {
    const draft = new PolygonDraft();
    draft.add({ x: 0, y: 0 });
    draft.add({ x: 70, y: 0 });
    expect(draft.close()).toBeNull();
    expect(draft.corners).toHaveLength(2);
    draft.add({ x: 140, y: 0 });
    expect(draft.close()).toBeNull();
    expect(draft.active).toBe(true);
    draft.add({ x: 140, y: 70 });
    expect(draft.close()).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 70 }]);
    expect(draft.active).toBe(false);
    expect(draft.corners).toEqual([]);
  });

  it('gives its last corner back, and is gone with its only one or when it is dropped', () => {
    const draft = new PolygonDraft();
    draft.add({ x: 0, y: 0 });
    draft.add({ x: 70, y: 0 });
    draft.takeBack();
    expect(draft.corners).toEqual([{ x: 0, y: 0 }]);
    draft.takeBack();
    expect(draft.active).toBe(false);
    draft.takeBack();
    expect(draft.active).toBe(false);
    draft.add({ x: 5, y: 5 });
    draft.drop();
    expect(draft.active).toBe(false);
  });
});
