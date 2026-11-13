import { describe, expect, it } from 'vitest';
import { heldToEighth, keepsDirection, squaredCorner } from '../../src/app/fog/fogConstrain';
import { NO_SNAP, fogGridPoint, snapHeldPoint, snapPoint, type FogSnapCandidates } from '../../src/app/fog/fogSnap';
import type { GridGeometry } from '../../src/app/grid/gridDistance';

const SQUARES: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
/** A reach of ten pixels at a zoom of one. */
const REACH = 10;
const only = (parts: Partial<FogSnapCandidates>): FogSnapCandidates => ({ ...NO_SNAP, ...parts });
/** Half the height of a 70 px hex's pointed end: its circumradius is 70 / √3. */
const RADIUS = 70 / Math.sqrt(3);

describe('the points of a grid a fog shape lands on', () => {
  it('are the corners of a square grid\'s cells, with the grid\'s offsets', () => {
    expect(fogGridPoint(SQUARES, { x: 33, y: 37 })).toEqual({ x: 0, y: 70 });
    expect(fogGridPoint({ type: 'square', size: 70, offsetX: 10, offsetY: 20 }, { x: 85, y: 95 })).toEqual({ x: 80, y: 90 });
    expect(fogGridPoint({ type: 'square', size: 70, offsetX: 10, offsetY: 20 }, { x: -30, y: 0 })).toEqual({ x: -60, y: 20 });
    // A grid without a type is a square grid.
    expect(fogGridPoint({ size: 50 }, { x: 74, y: 76 })).toEqual({ x: 50, y: 100 });
  });

  it('are a hex\'s centre and its corners, for pointed and for flat tops', () => {
    const pointy: GridGeometry = { type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 };
    // The first hex stands in the corner of the map: 70 wide, its centre a circumradius down.
    const centre = fogGridPoint(pointy, { x: 36, y: 42 })!;
    expect(centre.x).toBeCloseTo(35, 9);
    expect(centre.y).toBeCloseTo(RADIUS, 9);
    const corner = fogGridPoint(pointy, { x: 68, y: 22 })!;
    expect(corner.x).toBeCloseTo(70, 9);
    expect(corner.y).toBeCloseTo(RADIUS / 2, 9);
    const top = fogGridPoint(pointy, { x: 33, y: 3 })!;
    expect(top.x).toBeCloseTo(35, 9);
    expect(top.y).toBeCloseTo(0, 9);

    const flat: GridGeometry = { type: 'hex-horizontal', size: 70, offsetX: 5, offsetY: 0 };
    const flatCorner = fogGridPoint(flat, { x: 64, y: 2 })!;
    expect(flatCorner.x).toBeCloseTo(5 + 1.5 * RADIUS, 9);
    expect(flatCorner.y).toBeCloseTo(0, 9);
    const flatCentre = fogGridPoint(flat, { x: 44, y: 37 })!;
    expect(flatCentre.x).toBeCloseTo(5 + RADIUS, 9);
    expect(flatCentre.y).toBeCloseTo(35, 9);
  });

  it('are none on a grid without a cell size', () => {
    expect(fogGridPoint({ size: 0 }, { x: 5, y: 5 })).toBeNull();
    expect(fogGridPoint({ size: Number.NaN }, { x: 5, y: 5 })).toBeNull();
    expect(fogGridPoint({ size: Number.POSITIVE_INFINITY }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('snapping a point of a fog shape', () => {
  const area = [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }];
  const wall = { p1: { x: 104, y: 97 }, p2: { x: 304, y: 97 } };

  it('lands on each kind of place within reach, and says which', () => {
    expect(snapPoint({ x: 203, y: 196 }, only({ areas: [area] }), REACH)).toEqual({ point: { x: 200, y: 200 }, to: { kind: 'area-corner', point: { x: 200, y: 200 } } });
    expect(snapPoint({ x: 100, y: 100 }, only({ walls: [wall] }), REACH)).toEqual({ point: { x: 104, y: 97 }, to: { kind: 'wall-end', point: { x: 104, y: 97 } } });
    expect(snapPoint({ x: 66, y: 73 }, only({ grid: SQUARES }), REACH)).toEqual({ point: { x: 70, y: 70 }, to: { kind: 'grid', point: { x: 70, y: 70 } } });
    // The place on the line nearest the pointer, with the line it lies on.
    expect(snapPoint({ x: 250, y: 204 }, only({ areas: [area] }), REACH)).toEqual({ point: { x: 250, y: 200 }, to: { kind: 'area-edge', point: { x: 250, y: 200 }, from: { x: 200, y: 200 }, to: { x: 300, y: 200 } } });
    expect(snapPoint({ x: 180, y: 91 }, only({ walls: [wall] }), REACH)).toEqual({ point: { x: 180, y: 97 }, to: { kind: 'wall', point: { x: 180, y: 97 }, from: wall.p1, to: wall.p2 } });
    // The edge that closes an area's outline is one of its edges.
    expect(snapPoint({ x: 196, y: 250 }, only({ areas: [area] }), REACH).to).toMatchObject({ kind: 'area-edge', point: { x: 200, y: 250 }, from: { x: 200, y: 300 }, to: { x: 200, y: 200 } });
  });

  it('prefers an area\'s corner, then a wall\'s end, then the grid, then an edge, whichever is nearer', () => {
    // An area's corner eight pixels away, a wall's end and a point of the grid at one or two.
    const pointer = { x: 206, y: 205 };
    const corner = [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }];
    const end = { p1: { x: 207, y: 206 }, p2: { x: 207, y: 500 } };
    const grid: GridGeometry = { type: 'square', size: 10, offsetX: 5, offsetY: 5 };
    const all = only({ areas: [corner], walls: [end], grid });
    expect(snapPoint(pointer, all, REACH).to).toMatchObject({ kind: 'area-corner', point: { x: 200, y: 200 } });
    expect(snapPoint(pointer, only({ walls: [end], grid }), REACH).to).toMatchObject({ kind: 'wall-end', point: { x: 207, y: 206 } });
    // The grid's point lies on the pointer; the wall's line passes a pixel away.
    expect(snapPoint({ x: 206, y: 255 }, only({ walls: [end], grid }), REACH).to).toMatchObject({ kind: 'grid', point: { x: 205, y: 255 } });
    // On a coarse grid no point is near: the wall's line takes the pointer.
    expect(snapPoint({ x: 206, y: 255 }, only({ walls: [end], grid: SQUARES }), REACH).to).toMatchObject({ kind: 'wall', point: { x: 207, y: 255 } });
    // Of an area's edge and a wall on the same line, the area's.
    const edge = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(snapPoint({ x: 50, y: 3 }, only({ areas: [edge], walls: [{ p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } }] }), REACH).to?.kind).toBe('area-edge');
  });

  it('reaches no farther than its reach, but always finds the grid while there is one', () => {
    expect(snapPoint({ x: 93, y: 97 }, only({ walls: [wall] }), REACH)).toEqual({ point: { x: 93, y: 97 }, to: null });
    expect(snapPoint({ x: 94, y: 97 }, only({ walls: [wall] }), REACH).to?.kind).toBe('wall-end');
    expect(snapPoint({ x: 180, y: 108 }, only({ walls: [wall] }), REACH).to).toBeNull();
    // Zoomed out, the same ten pixels on screen are more of the map.
    expect(snapPoint({ x: 80, y: 97 }, only({ walls: [wall] }), REACH * 4).to?.kind).toBe('wall-end');
    // Far from every corner and line: the nearest point of the grid, however far.
    expect(snapPoint({ x: 33, y: 33 }, only({ grid: SQUARES, walls: [wall] }), REACH)).toEqual({ point: { x: 0, y: 0 }, to: { kind: 'grid', point: { x: 0, y: 0 } } });
    // Without a reach only the grid is left.
    expect(snapPoint({ x: 104, y: 98 }, only({ grid: SQUARES, walls: [wall] }), 0).to).toMatchObject({ kind: 'grid', point: { x: 70, y: 70 } });
    expect(snapPoint({ x: 104, y: 98 }, only({ walls: [wall] }), Number.NaN).to).toBeNull();
  });

  it('leaves a point where the pointer is with nothing to snap to: the grid\'s Snap off, or Ctrl held', () => {
    expect(snapPoint({ x: 33.5, y: 12.25 }, NO_SNAP, REACH)).toEqual({ point: { x: 33.5, y: 12.25 }, to: null });
  });

  it('passes over what is no place: a wall without length or with an end that is no number, and a pointer that is none', () => {
    const broken = only({ walls: [{ p1: { x: Number.NaN, y: 0 }, p2: { x: 50, y: 50 } }, { p1: { x: 20, y: 20 }, p2: { x: 20, y: 20 } }] });
    expect(snapPoint({ x: 48, y: 49 }, broken, REACH).to).toMatchObject({ kind: 'wall-end', point: { x: 50, y: 50 } });
    // A wall of no length has ends and no line.
    expect(snapPoint({ x: 21, y: 21 }, broken, REACH).to?.kind).toBe('wall-end');
    expect(snapPoint({ x: 30, y: 31 }, broken, REACH).to).toBeNull();
    const nowhere = snapPoint({ x: Number.NaN, y: 4 }, only({ grid: SQUARES }), REACH);
    expect(nowhere.to).toBeNull();
    expect(nowhere.point.y).toBe(4);
  });
});

describe('Shift on a fog shape', () => {
  it('holds an edge to the nearest eighth of a turn', () => {
    const from = { x: 0, y: 0 };
    expect(heldToEighth(from, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 });
    expect(heldToEighth(from, { x: -10, y: -3 })).toEqual({ x: -10, y: 0 });
    expect(heldToEighth(from, { x: 1, y: 10 })).toEqual({ x: 0, y: 10 });
    expect(heldToEighth(from, { x: 2, y: -10 })).toEqual({ x: 0, y: -10 });
    // On a diagonal: where the pointer's place falls on it.
    expect(heldToEighth(from, { x: 10, y: 9 })).toEqual({ x: 9.5, y: 9.5 });
    expect(heldToEighth(from, { x: -10, y: 9 })).toEqual({ x: -9.5, y: 9.5 });
    expect(heldToEighth(from, { x: 9, y: -10 })).toEqual({ x: 9.5, y: -9.5 });
    expect(heldToEighth({ x: 100, y: 50 }, { x: 80, y: 31 })).toEqual({ x: 80.5, y: 30.5 });
    // A pointer on the corner gives no direction.
    expect(heldToEighth({ x: 7, y: 7 }, { x: 7, y: 7 })).toEqual({ x: 7, y: 7 });
  });

  it('snaps a held edge\'s end only where that keeps its direction', () => {
    const grid = only({ grid: SQUARES });
    // From a corner of the grid, a level edge ends on a corner of that line, a diagonal one on the diagonal's.
    expect(snapHeldPoint({ x: 0, y: 0 }, { x: 100, y: 8 }, grid, REACH)).toEqual({ point: { x: 70, y: 0 }, to: { kind: 'grid', point: { x: 70, y: 0 } } });
    expect(snapHeldPoint({ x: 0, y: 0 }, { x: 100, y: 90 }, grid, REACH).point).toEqual({ x: 70, y: 70 });
    // From a place off the grid's lines no corner lies that way: the edge stays as held.
    expect(snapHeldPoint({ x: 10, y: 5 }, { x: 110, y: 9 }, grid, REACH)).toEqual({ point: { x: 110, y: 5 }, to: null });
    // A wall's end on the held line takes the edge's end.
    expect(snapHeldPoint({ x: 0, y: 97 }, { x: 100, y: 99 }, only({ walls: [{ p1: { x: 104, y: 97 }, p2: { x: 104, y: 300 } }] }), REACH).to?.kind).toBe('wall-end');
    expect(keepsDirection({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 70, y: 0 })).toBe(true);
    expect(keepsDirection({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: -70, y: 0 })).toBe(false);
    expect(keepsDirection({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });

  it('makes a rectangle a square as long as its longer side, towards the pointer', () => {
    expect(squaredCorner({ x: 0, y: 0 }, { x: 30, y: -10 })).toEqual({ x: 30, y: -30 });
    expect(squaredCorner({ x: 0, y: 0 }, { x: -5, y: 20 })).toEqual({ x: -20, y: 20 });
    expect(squaredCorner({ x: 10, y: 10 }, { x: 10, y: 40 })).toEqual({ x: 40, y: 40 });
    expect(squaredCorner({ x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
  });
});
