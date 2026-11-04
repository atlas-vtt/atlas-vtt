import { describe, expect, it } from 'vitest';
import { doorSpan, placeDoor, simplifyStroke, splitWall } from '../wallEdits';
import type { WallSegment } from '../../../types/wallTypes';

const wall: WallSegment = {
  id: 'w', kind: 'wall', type: 'door', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, closed: false, direction: 'left', chainId: 'c',
};

describe('splitWall', () => {
  it('splits at the point projected onto the wall and keeps its properties', () => {
    const [first, second] = splitWall(wall, { x: 30, y: 12 })!;
    expect(first).toEqual({ type: 'door', p1: { x: 0, y: 0 }, p2: { x: 30, y: 0 }, closed: false, direction: 'left', chainId: 'c' });
    expect(second).toEqual({ type: 'door', p1: { x: 30, y: 0 }, p2: { x: 100, y: 0 }, closed: false, direction: 'left', chainId: 'c' });
  });

  it('keeps both halves from collapsing near an end', () => {
    const [first] = splitWall(wall, { x: -50, y: 0 })!;
    expect(first.p2.x).toBeCloseTo(5);
  });

  it('refuses zero-length walls', () => {
    expect(splitWall({ ...wall, p2: { x: 0, y: 0 } }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('simplifyStroke', () => {
  it('keeps the ends and drops points on a straight line', () => {
    expect(simplifyStroke([{ x: 0, y: 0 }, { x: 5, y: 0.5 }, { x: 10, y: 0 }], 2)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  });

  it('keeps corners', () => {
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(simplifyStroke(corner, 2)).toEqual(corner);
  });
});

describe('doorSpan', () => {
  it('centres the door on the point, keeping it on the wall', () => {
    const [start, end] = doorSpan(400, 0.5, 70);
    expect(start).toBeCloseTo(0.4125);
    expect(end).toBeCloseTo(0.5875);
    expect(doorSpan(400, 0.02, 70)).toEqual([0, 70 / 400]);
    expect(doorSpan(400, 0.99, 70)).toEqual([1 - 70 / 400, 1]);
  });

  it('fills a wall no wider than the door, and takes a piece too short to be a wall', () => {
    expect(doorSpan(60, 0.5, 70)).toEqual([0, 1]);
    expect(doorSpan(80, 0.5, 70)).toEqual([0, 1]);
    expect(doorSpan(200, 0.25, 70)[0]).toBe(0);
    const [start, end] = doorSpan(200, 0.3, 70);
    expect(start).toBeCloseTo(0.125);
    expect(end).toBeCloseTo(0.475);
  });
});

describe('placeDoor', () => {
  const solid: WallSegment = { id: 's', kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 280, y: 0 }, chainId: 'c', blocks: 'sight' };

  it('places a closed door one width wide where the pointer is, between two pieces that keep the wall\'s properties', () => {
    expect(placeDoor(solid, { x: 140, y: 9 }, 70, 'door')).toEqual([
      { type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 105, y: 0 }, chainId: 'c', blocks: 'sight' },
      { type: 'door', p1: { x: 105, y: 0 }, p2: { x: 175, y: 0 }, closed: true, chainId: 'c', blocks: 'sight' },
      { type: 'solid', p1: { x: 175, y: 0 }, p2: { x: 280, y: 0 }, chainId: 'c', blocks: 'sight' },
    ]);
  });

  it('turns a wall about a door wide into the door', () => {
    expect(placeDoor({ ...solid, p2: { x: 75, y: 0 } }, { x: 30, y: 0 }, 70, 'secret-door')).toEqual([
      { type: 'secret-door', p1: { x: 0, y: 0 }, p2: { x: 75, y: 0 }, closed: true, chainId: 'c', blocks: 'sight' },
    ]);
  });
});
