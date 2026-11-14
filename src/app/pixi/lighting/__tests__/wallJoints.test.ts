import { describe, expect, it } from 'vitest';
import type { WallInput, WallSegment } from '../../../types/wallTypes';
import { placeDoor } from '../wallEdits';
import { chainEndingAt, connectedChain, wallEndNear } from '../wallEnds';
import { removeDoor, removeJoint } from '../wallJoints';

function walls(...list: Array<WallInput & { id: string }>): Record<string, WallSegment> {
  return Object.fromEntries(list.map((wall) => [wall.id, { ...wall, kind: 'wall' as const }]));
}

const room = walls(
  { id: 'a', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, chainId: 'c' },
  { id: 'b', type: 'solid', p1: { x: 100, y: 0 }, p2: { x: 100, y: 100 }, chainId: 'c', direction: 'left' },
  { id: 'c', type: 'door', p1: { x: 100, y: 100 }, p2: { x: 0, y: 100 }, closed: true },
);

describe('wallEndNear', () => {
  it('finds the nearest end within ten screen pixels, at any zoom', () => {
    expect(wallEndNear({ x: 108, y: 3 }, room, 1)).toEqual({ x: 100, y: 0 });
    expect(wallEndNear({ x: 108, y: 3 }, room, 2)).toBeNull();
    expect(wallEndNear({ x: 130, y: 0 }, room, 0.25)).toEqual({ x: 100, y: 0 });
  });

  it('passes over the walls it is told to skip and the places to avoid, and counts the extra points', () => {
    expect(wallEndNear({ x: 98, y: 2 }, room, 1, { skip: new Set(['a', 'b']) })).toBeNull();
    expect(wallEndNear({ x: 2, y: 2 }, room, 1, { avoid: [{ x: 0, y: 0 }] })).toBeNull();
    expect(wallEndNear({ x: 52, y: 52 }, room, 1, { also: [{ x: 50, y: 50 }] })).toEqual({ x: 50, y: 50 });
  });
});

describe('chainEndingAt', () => {
  it('names the chain of the one wall ending at a point, and none where walls meet', () => {
    expect(chainEndingAt({ x: 0, y: 0 }, room)).toBe('c');
    expect(chainEndingAt({ x: 100, y: 0 }, room)).toBeUndefined();
    expect(chainEndingAt({ x: 0, y: 100 }, room)).toBeUndefined();
  });
});

describe('connectedChain', () => {
  // One carve writes every piece of a room's edge with one chain id, also pieces that never meet.
  const carved = walls(
    { id: 'top', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, chainId: 'room' },
    { id: 'nib', type: 'solid', p1: { x: 101, y: 1 }, p2: { x: 110, y: 20 }, chainId: 'room' },
    { id: 'bottom', type: 'solid', p1: { x: 0, y: 300 }, p2: { x: 100, y: 300 }, chainId: 'room' },
    { id: 'side', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 0, y: 300 }, chainId: 'other' },
    { id: 'lone', type: 'solid', p1: { x: 100, y: 0 }, p2: { x: 200, y: 0 } },
  );

  it('takes the walls of the chain that reach the wall end to end, and none of its parts elsewhere', () => {
    expect(connectedChain('top', carved).sort()).toEqual(['nib', 'top']);
    expect(connectedChain('nib', carved).sort()).toEqual(['nib', 'top']);
    expect(connectedChain('bottom', carved)).toEqual(['bottom']);
  });

  it('never reaches a part of the chain through a wall of another chain', () => {
    expect(connectedChain('side', carved)).toEqual(['side']);
  });

  it('is the wall alone without a chain, and nothing for a wall that is not there', () => {
    expect(connectedChain('lone', carved)).toEqual(['lone']);
    expect(connectedChain('gone', carved)).toEqual([]);
  });
});

describe('removeJoint', () => {
  it('joins two walls meeting at the point into one, keeping the first one\'s direction of travel', () => {
    expect(removeJoint(room, { x: 100, y: 0 })).toEqual({ remove: ['a', 'b'], add: [{ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 100, y: 100 }, chainId: 'c' }] });
  });

  it('removes the wall whose open end it is', () => {
    expect(removeJoint(room, { x: 0, y: 0 })).toEqual({ remove: ['a'], add: [] });
  });

  it('never joins a wall and a door, nor three walls', () => {
    expect(removeJoint(room, { x: 100, y: 100 })).toBeNull();
    const star = { ...room, ...walls({ id: 'd', type: 'solid', p1: { x: 100, y: 0 }, p2: { x: 200, y: 0 } }) };
    expect(removeJoint(star, { x: 100, y: 0 })).toBeNull();
  });
});

describe('removeDoor', () => {
  it('gives back the wall a door was placed in', () => {
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 280, y: 0 }, chainId: 'c', direction: 'right' };
    const pieces = placeDoor(wall, { x: 140, y: 0 }, 70, 'door').map((piece, i) => ({ ...piece, id: `p${i}` }));
    const placed = walls(...pieces);
    expect(removeDoor(placed, 'p1')).toEqual({
      remove: ['p1', 'p0', 'p2'],
      add: [{ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 280, y: 0 }, chainId: 'c', direction: 'right' }],
    });
  });

  it('makes a door wall again without joining walls that turn away from it', () => {
    expect(removeDoor(room, 'c')).toEqual({ remove: ['c'], add: [{ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 0, y: 100 } }] });
    expect(removeDoor(room, 'a')).toBeNull();
  });
});
