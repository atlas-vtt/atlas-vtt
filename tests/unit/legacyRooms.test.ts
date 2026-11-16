import { describe, expect, it } from 'vitest';
import { roomsIntoWalls, wallsOfSavedRooms } from '../../src/app/lighting/legacyRooms';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeVisibility, pointInPolygon } from '../../src/app/vision/visibility';

/** A room as 0.14.0 saved it: its area in eighth pixels. */
const room = (id: string, x: number, y: number, w: number, h: number, more: object = {}): object => ({
  id, kind: 'room', name: '', order: 0, area: [[x * 8, y * 8, (x + w) * 8, y * 8, (x + w) * 8, (y + h) * 8, x * 8, (y + h) * 8]], ...more,
});
const sees = (walls: Record<string, WallSegment>, from: { x: number; y: number }, to: { x: number; y: number }): boolean =>
  pointInPolygon(to, computeVisibility(from, 5000, sealedWalls(Object.values(walls), 2), undefined, 'sight'));

describe('rooms a scene was saved with', () => {
  it('become the walls their outline was: rooms that touched open into each other, rock stays between the others', () => {
    const walls = wallsOfSavedRooms({ a: room('a', 0, 0, 100, 100), b: room('b', 100, 0, 100, 100), c: room('c', 300, 0, 100, 100) });
    expect(Object.values(walls).every((wall) => wall.kind === 'wall' && wall.type === 'solid' && wall.id.startsWith('room_'))).toBe(true);
    expect(sees(walls, { x: 50, y: 50 }, { x: 150, y: 50 })).toBe(true);
    expect(sees(walls, { x: 50, y: 50 }, { x: 350, y: 50 })).toBe(false);
    expect(sees(walls, { x: 50, y: 50 }, { x: 250, y: 50 })).toBe(false);
  });

  it('keep a hidden room closed off, and each level its own walls', () => {
    const hidden = wallsOfSavedRooms({ a: room('a', 0, 0, 100, 100), b: room('b', 100, 0, 100, 100, { hidden: true }) });
    expect(sees(hidden, { x: 50, y: 50 }, { x: 150, y: 50 })).toBe(false);
    const levels = wallsOfSavedRooms({ a: room('a', 0, 0, 100, 100, { level: 'up' }), b: room('b', 100, 0, 100, 100, { level: 'down' }) });
    expect(Object.values(levels).filter((wall) => wall.levels?.[0] === 'up')).toHaveLength(4);
    expect(Object.values(levels).filter((wall) => wall.levels?.[0] === 'down')).toHaveLength(4);
  });

  it('pass over what is no room, and name walls the same each time a file is read', () => {
    const saved = { a: room('a', 0, 0, 100, 100), junk: { area: 'no' }, worse: 7 };
    expect(Object.keys(wallsOfSavedRooms(saved))).toHaveLength(4);
    expect(Object.keys(wallsOfSavedRooms(saved))).toEqual(Object.keys(wallsOfSavedRooms(saved)));
    expect(wallsOfSavedRooms(undefined)).toEqual({});
    expect(wallsOfSavedRooms('rooms')).toEqual({});
  });

  it('leave a scene file with walls and no rooms, its own walls untouched', () => {
    const own: WallSegment = { id: 'w1', kind: 'wall', type: 'door', p1: { x: 0, y: 500 }, p2: { x: 70, y: 500 }, closed: false };
    const objects: Record<string, unknown> = { walls: { w1: own }, rooms: { a: room('a', 0, 0, 100, 100) } };
    roomsIntoWalls(objects);
    expect(objects).not.toHaveProperty('rooms');
    expect((objects.walls as Record<string, WallSegment>).w1).toBe(own);
    expect(Object.keys(objects.walls as object)).toHaveLength(5);
    const untouched = { walls: { w1: own } };
    roomsIntoWalls(untouched);
    expect(untouched.walls).toEqual({ w1: own });
  });

  it('are walls in a map file as the loader reads it', () => {
    const file = migrateMapFile({ schema: 'atlas-vtt/v1', version: 4, grid: null, background: null, camera: { x: 0, y: 0, scale: 1 }, objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, rooms: { a: room('a', 0, 0, 100, 100) } } });
    expect(Object.keys(file.objects.walls)).toHaveLength(4);
    expect(file.objects).not.toHaveProperty('rooms');
  });
});
