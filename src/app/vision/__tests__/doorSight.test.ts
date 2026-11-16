import { describe, expect, it } from 'vitest';
import type { WallSegment, WallType } from '../../types/wallTypes';
import { doorsInSight } from '../doorSight';
import { SEES_ALL, computeSight, lightReach, sceneSight, type SightSource } from '../sight';
import { darkvision, tremorsense } from './senseSources';

function wall(id: string, type: WallType, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment {
  return { id, kind: 'wall', type, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, closed: true, ...extra };
}

/**
 * The hero stands at (100, 100) in a room that a solid wall at x = 200 closes to the east.
 * `near`, `locked` and `secret` are in the room; `behind` is past the wall.
 */
const WALLS: WallSegment[] = [
  wall('east', 'solid', 200, -1000, 200, 1000),
  wall('near', 'door', 50, 80, 50, 120),
  wall('locked', 'door', 80, 50, 120, 50, { locked: true }),
  wall('secret', 'secret-door', 80, 150, 120, 150),
  wall('behind', 'door', 300, 80, 300, 120),
];
const HERO: SightSource = { tokenId: 'hero', origin: { x: 100, y: 100 }, range: 1000, senses: [] };
const DAY = { ambient: 1 };
const NIGHT = { ambient: 0 };

const seen = (sight = computeSight([HERO], WALLS), ambient = DAY, lights = [] as ReturnType<typeof lightReach>[]): string[] =>
  [...doorsInSight(WALLS, sight, ambient, lights)].sort();

describe('doorsInSight', () => {
  it('shows the ordinary doors the party sees on lit floor, and none past a wall', () => {
    expect(seen()).toEqual(['locked', 'near']);
  });

  it('shows a door from either side: the party sees one face of a closed door', () => {
    const west: SightSource = { ...HERO, origin: { x: 20, y: 100 } };
    expect(seen(computeSight([west], WALLS))).toContain('near');
  });

  it('shows no door in darkness, and one a light reaches', () => {
    expect(seen(undefined, NIGHT)).toEqual([]);
    expect(seen(undefined, NIGHT, [lightReach({ x: 70, y: 100 }, 30, WALLS)])).toEqual(['near']);
  });

  it('shows a door in darkness to a sense that shows the map there', () => {
    expect(seen(computeSight([{ ...HERO, senses: [darkvision(60)] }], WALLS), NIGHT)).toEqual(['locked', 'near']);
  });

  it('shows no door that only a sense of creatures reaches: the picture does not show the map there', () => {
    expect(seen(computeSight([{ ...HERO, senses: [tremorsense(500)] }], WALLS))).toEqual(['locked', 'near']);
  });

  it('never shows a secret door, whoever looks', () => {
    expect(seen()).not.toContain('secret');
    expect(seen(SEES_ALL)).not.toContain('secret');
  });

  it('shows every ordinary door on lit floor without a vision token or with token vision off', () => {
    expect(seen(computeSight([], WALLS))).toEqual(['behind', 'locked', 'near']);
    expect(seen(sceneSight({ tokenVision: false }, [HERO], WALLS, undefined, { sceneHasVision: true }))).toEqual(['behind', 'locked', 'near']);
    expect(seen(SEES_ALL, NIGHT)).toEqual([]);
    expect(seen(SEES_ALL, NIGHT, [lightReach({ x: 320, y: 100 }, 40, WALLS)])).toEqual(['behind']);
  });
});
