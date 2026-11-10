import { describe, expect, it } from 'vitest';
import type { RoomArea } from '../../src/app/lighting/rooms';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import { enclosedSpaces } from '../../src/app/lighting/wallSpaces';
import { Q_SCALE } from '../../src/app/types/shapeTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';

let next = 0;
const wall = (x1: number, y1: number, x2: number, y2: number, more: Partial<WallSegment> = {}): WallSegment => ({ id: `w${next++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...more });
/** The walls of a rectangle, one per side, starting with the top one and going round. */
const box = (x: number, y: number, w: number, h: number): WallSegment[] => [wall(x, y, x + w, y), wall(x + w, y, x + w, y + h), wall(x + w, y + h, x, y + h), wall(x, y + h, x, y)];
const size = (area: RoomArea): number => {
  let twice = 0;
  for (const ring of area) for (let i = 0; i < ring.length; i += 2) twice += ring[i]! * ring[(i + 3) % ring.length]! - ring[(i + 2) % ring.length]! * ring[i + 1]!;
  return twice / 2 / (Q_SCALE * Q_SCALE);
};
const spaceAt = (spaces: readonly RoomArea[], point: { x: number; y: number }): RoomArea | null => spaces.find((space) => shapeContains(space, point)) ?? null;
const corners = (area: RoomArea): number[][] => area.map((ring) => ring.map((value) => value / Q_SCALE));

describe('the spaces walls close in', () => {
  it('finds a rectangle of four walls, on the middle of its walls and with its four corners', () => {
    const spaces = enclosedSpaces(box(100, 100, 300, 200));
    expect(spaces).toHaveLength(1);
    expect(size(spaces[0]!)).toBeCloseTo(60_000, 0);
    expect(corners(spaces[0]!)[0]).toHaveLength(8);
    expect(new Set(corners(spaces[0]!)[0])).toEqual(new Set([100, 400, 300]));
    expect(spaceAt(spaces, { x: 250, y: 200 })).toBe(spaces[0]);
    expect(spaceAt(spaces, { x: 50, y: 50 })).toBeNull();
  });

  it('finds none where a side is missing', () => {
    expect(enclosedSpaces(box(100, 100, 300, 200).slice(0, 3))).toEqual([]);
  });

  it('tells two rooms that share a wall apart, and takes a wall standing free in a room for no wall of it', () => {
    const walls = [...box(0, 0, 200, 200), wall(200, 0, 400, 0), wall(400, 0, 400, 200), wall(400, 200, 200, 200), wall(60, 100, 140, 100)];
    const spaces = enclosedSpaces(walls);
    expect(spaces.map(size).map(Math.round).sort()).toEqual([40_000, 40_000]);
  });

  it('keeps an L-shaped room\'s inner corner and a pillar\'s hole', () => {
    const el = [wall(0, 0, 300, 0), wall(300, 0, 300, 100), wall(300, 100, 100, 100), wall(100, 100, 100, 300), wall(100, 300, 0, 300), wall(0, 300, 0, 0)];
    const [space] = enclosedSpaces(el);
    expect(size(space!)).toBeCloseTo(50_000, 0);
    expect(corners(space!)[0]).toHaveLength(12);
    const [hall, pillar] = enclosedSpaces([...box(0, 0, 400, 400), ...box(150, 150, 100, 100)]).sort((a, b) => size(b) - size(a));
    expect(size(hall!)).toBeCloseTo(150_000, 0);
    expect(size(pillar!)).toBeCloseTo(10_000, 0);
    expect(spaceAt([hall!], { x: 200, y: 200 })).toBeNull();
  });

  it('counts a door, open or closed, as a side', () => {
    const [top, right, bottom, left] = box(0, 0, 200, 200);
    const walls = [top!, right!, bottom!, wall(0, 200, 0, 130), wall(0, 130, 0, 70, { type: 'door', closed: false }), wall(0, 70, 0, 0)];
    expect(left).toBeDefined();
    expect(enclosedSpaces(walls).map(size).map(Math.round)).toEqual([40_000]);
  });
});
