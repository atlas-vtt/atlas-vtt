import { describe, expect, it } from 'vitest';
import { sealTolerance } from '../../../../src/app/lighting/lightingConstants';
import { sealedWalls } from '../../../../src/app/lighting/sealWalls';
import { blocksNothing, crosses, distToSeg, segOf } from '../../../../src/app/lighting/segments';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { movementWalls, movePath, reaches, stopAtWalls, type MoveWalls, type Point } from '../../../../src/app/online/movement/index.ts';

const MAP = { width: 2000, height: 2000 };
const TOLERANCE = sealTolerance(2);
const TRIALS = 300;

/** A seeded generator (mulberry32), so a failing trial can be replayed by its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let ids = 0;
function wall(p1: Point, p2: Point, changes: Partial<WallSegment> = {}): WallSegment {
  ids += 1;
  return { id: `w${ids}`, kind: 'wall', type: 'solid', p1: { ...p1 }, p2: { ...p2 }, ...changes };
}

/** A room drawn by hand: a polygon that every ray from `centre` leaves once, its corners in order. */
interface Room {
  readonly centre: Point;
  readonly corners: readonly Point[];
}

function room(random: () => number): Room {
  const centre = { x: 700 + random() * 600, y: 700 + random() * 600 };
  // Four corners or more, each within a fifth of its share of the turn: no gap between corners reaches half a turn, so the centre lies well inside.
  const count = 4 + Math.floor(random() * 8);
  const angles = Array.from({ length: count }, (_, index) => ((index + 0.2 + random() * 0.6) / count) * Math.PI * 2);
  const corners = angles.map((angle) => {
    const radius = 150 + random() * 350;
    return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
  });
  return { centre, corners };
}

/** Whether a point lies inside the room's polygon (even-odd). */
function inside({ corners }: Room, { x, y }: Point): boolean {
  let within = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]!, b = corners[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}

/** The room's walls, each edge drawn short of the next corner by up to `slack` (hand-drawn joints), with one edge changed by `door`. */
function roomWalls({ corners }: Room, random: () => number, slack: number, kind: Partial<WallSegment> = {}, door?: { readonly edge: number; readonly changes: Partial<WallSegment> }): WallSegment[] {
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]!;
    const length = Math.hypot(next.x - corner.x, next.y - corner.y);
    const short = Math.min(slack * random(), length / 4) / length;
    const end = { x: next.x - (next.x - corner.x) * short, y: next.y - (next.y - corner.y) * short };
    return wall(corner, end, door?.edge === index ? { ...kind, ...door.changes } : kind);
  });
}

/** A point in the room: its centre moved a little towards a random corner. */
function pointIn(shape: Room, random: () => number): Point {
  const corner = shape.corners[Math.floor(random() * shape.corners.length)]!;
  const share = random() * 0.6;
  return { x: shape.centre.x + (corner.x - shape.centre.x) * share, y: shape.centre.y + (corner.y - shape.centre.y) * share };
}

/** Somewhere a player might drag to: anywhere around the map, exactly through a corner of the room, or a hair off a wall's centre line. */
function target(shape: Room, from: Point, random: () => number): Point {
  const choice = random();
  if (choice < 0.2) {
    const a = shape.corners[Math.floor(random() * shape.corners.length)]!;
    const b = shape.corners[(shape.corners.indexOf(a) + 1) % shape.corners.length]!;
    const share = random();
    const off = (random() - 0.5) * 10 ** (-9 + random() * 10);
    return { x: a.x + (b.x - a.x) * share - (b.y - a.y) * off, y: a.y + (b.y - a.y) * share + (b.x - a.x) * off };
  }
  if (choice < 0.45) {
    const corner = shape.corners[Math.floor(random() * shape.corners.length)]!;
    const reach = 1 + random() * 2;
    return { x: from.x + (corner.x - from.x) * reach, y: from.y + (corner.y - from.y) * reach };
  }
  return { x: -500 + random() * 3000, y: -500 + random() * 3000 };
}

/** Every segment that stops a token, drawn and sealing bridges, as the lighting reads them. */
const stopping = (walls: readonly WallSegment[]): (readonly [number, number, number, number])[] => sealedWalls(walls, 2).filter((each) => !blocksNothing(each)).map(segOf);

/** A drag of many steps from inside the room: each step starts where the last came to rest. */
function dragAround(shape: Room, walls: MoveWalls, segments: readonly (readonly [number, number, number, number])[], random: () => number, steps: number, onStep: (from: Point, to: Point, at: Point) => void): void {
  let at = pointIn(shape, random);
  for (let step = 0; step < steps; step += 1) {
    const to = target(shape, at, random);
    const path = movePath(walls, at, to);
    const next = path.at(-1)!;
    expect(stopAtWalls(walls, at, to)).toEqual(next);
    for (const segment of segments) {
      for (let leg = 1; leg < path.length; leg += 1) {
        const a = path[leg - 1]!, b = path[leg]!;
        expect(crosses(a.x, a.y, b.x, b.y, segment), 'crossed a wall').toBe(false);
        expect(distToSeg(b.x, b.y, segment), 'nearer a wall than the gap').toBeGreaterThanOrEqual(Math.min(walls.gap - 0.01, distToSeg(a.x, a.y, segment)) - 1e-9);
      }
    }
    onStep(at, to, next);
    at = next;
  }
}

// A room test walks 300 rooms: about 2 s here, three to four times that on a hosted runner.
describe('stopping a token at walls', { timeout: 30_000 }, () => {
  it('never lets a token out of a closed room, whatever path it takes, through joints the sealing closes', () => {
    for (let seed = 1; seed <= TRIALS; seed += 1) {
      const random = seeded(seed);
      const shape = room(random);
      const walls = roomWalls(shape, random, TOLERANCE * 0.9, {}, random() < 0.5 ? { edge: 0, changes: { type: random() < 0.5 ? 'door' : 'secret-door', closed: true, locked: random() < 0.5 } } : undefined);
      const segments = stopping(walls);
      dragAround(shape, movementWalls(walls, MAP), segments, random, 20, (_from, _to, at) => expect(inside(shape, at), `seed ${seed}`).toBe(true));
    }
  });

  it('stops tokens at walls that let sight or light through, one-way walls from both sides and limited walls', () => {
    const kinds: Partial<WallSegment>[] = [{ blocks: 'sight' }, { blocks: 'light' }, { direction: 'left' }, { direction: 'right' }, { limited: true }];
    for (let seed = 1; seed <= TRIALS; seed += 1) {
      const random = seeded(seed * 7);
      const shape = room(random);
      const walls = roomWalls(shape, random, TOLERANCE * 0.9, kinds[seed % kinds.length]);
      dragAround(shape, movementWalls(walls, MAP), stopping(walls), random, 10, (_from, _to, at) => expect(inside(shape, at), `seed ${seed}`).toBe(true));
    }
  });

  it('lets a token leave through an open door, and a closed one stops it', () => {
    for (let seed = 1; seed <= TRIALS; seed += 1) {
      const random = seeded(seed * 13);
      const shape = room(random);
      const edge = Math.floor(random() * shape.corners.length);
      const a = shape.corners[edge]!, b = shape.corners[(edge + 1) % shape.corners.length]!;
      const share = 0.3 + random() * 0.4;
      const doorway = { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
      const outside = { x: shape.centre.x + (doorway.x - shape.centre.x) * 1.5, y: shape.centre.y + (doorway.y - shape.centre.y) * 1.5 };
      const open = roomWalls(shape, random, 0, {}, { edge, changes: { type: 'door', closed: false } });
      expect(stopAtWalls(movementWalls(open, MAP), shape.centre, outside), `seed ${seed}`).toEqual(outside);
      const closed = open.map((each) => (each.type === 'door' ? { ...each, closed: true } : each));
      const stop = stopAtWalls(movementWalls(closed, MAP), shape.centre, outside);
      expect(inside(shape, stop), `seed ${seed}`).toBe(true);
    }
  });

  it('closes the gaps the lighting seals and leaves wider ones open', () => {
    const left = wall({ x: 0, y: 500 }, { x: 495, y: 500 });
    const sealed = [left, wall({ x: 495 + TOLERANCE * 0.95, y: 500 }, { x: 1000, y: 500 })];
    const centre = 495 + (TOLERANCE * 0.95) / 2;
    expect(reaches(movementWalls(sealed, MAP), { x: centre, y: 400 }, { x: centre, y: 600 })).toBe(false);
    const open = [left, wall({ x: 495 + TOLERANCE * 3, y: 500 }, { x: 1000, y: 500 })];
    const middle = 495 + (TOLERANCE * 3) / 2;
    expect(stopAtWalls(movementWalls(open, MAP), { x: middle, y: 400 }, { x: middle, y: 600 })).toEqual({ x: middle, y: 600 });
  });

  it('stops square to the wall the gap before it, and slides along it with the rest of the move', () => {
    const walls = movementWalls([wall({ x: 0, y: 500 }, { x: 1000, y: 500 })], MAP);
    expect(stopAtWalls(walls, { x: 300, y: 300 }, { x: 300, y: 700 })).toEqual({ x: 300, y: 500 - walls.gap });
    const slid = stopAtWalls(walls, { x: 300, y: 300 }, { x: 700, y: 700 });
    expect(slid.y).toBe(500 - walls.gap);
    expect(slid.x).toBeCloseTo(700, 1);
    // Resting against the wall, the same place again moves nothing.
    expect(stopAtWalls(walls, slid, { x: 700, y: 700 })).toEqual(slid);
  });

  it('stops in a corner when the slide runs into the next wall', () => {
    const walls = movementWalls([wall({ x: 0, y: 500 }, { x: 600, y: 500 }), wall({ x: 600, y: 500 }, { x: 600, y: 0 })], MAP);
    const stop = stopAtWalls(walls, { x: 300, y: 300 }, { x: 900, y: 700 });
    expect(stop.y).toBeCloseTo(500 - walls.gap, 5);
    expect(stop.x).toBeCloseTo(600 - walls.gap, 5);
  });

  it('moves freely past walls that are not in the way, and keeps the place it was given', () => {
    const walls = movementWalls([wall({ x: 0, y: 500 }, { x: 1000, y: 500 })], MAP);
    const to = { x: 123.456789, y: 456.789 };
    expect(stopAtWalls(walls, { x: 10, y: 10 }, to)).toBe(to);
    expect(stopAtWalls(movementWalls([], MAP), { x: 10, y: 10 }, { x: 900, y: 900 })).toEqual({ x: 900, y: 900 });
  });
});
