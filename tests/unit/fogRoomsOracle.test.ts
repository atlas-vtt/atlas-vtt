import { describe, expect, it } from 'vitest';
import { roomAt, roomsOfWalls, type RoomCorners } from '../../src/app/fog/fogRooms';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { worldTexel } from '../../src/app/lighting/lightingConstants';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { shapeContains } from '../../src/app/lighting/shapeContains';
import { enclosedSpaces } from '../../src/app/lighting/wallSpaces';
import { Q_SCALE } from '../../src/app/types/shapeTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';

/**
 * Rooms are found on a raster and put back on the walls; the lighting tool's rooms mode finds the
 * spaces walls close in with the clipping library (`enclosedSpaces`). The two must agree on what
 * a room covers. `VITE_ROOM_TRIALS` runs more maps (2000 held it).
 */
const TRIALS = Number(import.meta.env.VITE_ROOM_TRIALS ?? 60);
const SIZE = 1400;
const MAP: MapRect = { x: 0, y: 0, width: SIZE, height: SIZE };
const CELL = 70;
/** How far a room's area may be off the clipping's, as a share: the clipping cuts sharp corners by a pixel or two itself. */
const TOLERANCE = 0.02;

let next = 0;
const wall = (x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id: `w${next++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
const closed = (corners: readonly (readonly [number, number])[]): WallSegment[] => corners.map(([x, y], index) => {
  const [nx, ny] = corners[(index + 1) % corners.length]!;
  return wall(x, y, nx, ny);
});

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Boxes, eight-sided rooms and slanted walls on a lattice of cells, `jitter` pixels off it: they share walls, cross and nest. */
function dungeon(random: () => number, count: number, jitter: number): WallSegment[] {
  const walls: WallSegment[] = [];
  const cells = Math.floor(SIZE / CELL);
  while (walls.length < count) {
    const [w, h] = [2 + Math.floor(random() * 6), 2 + Math.floor(random() * 6)];
    const x = (1 + Math.floor(random() * (cells - w - 2))) * CELL + (random() - 0.5) * jitter;
    const y = (1 + Math.floor(random() * (cells - h - 2))) * CELL + (random() - 0.5) * jitter;
    const [x2, y2] = [x + w * CELL, y + h * CELL];
    const kind = random();
    const cut = CELL * 0.7;
    if (kind < 0.7) walls.push(...closed([[x, y], [x2, y], [x2, y2], [x, y2]]));
    else if (kind < 0.85) walls.push(wall(x, y, x2, y2));
    else walls.push(...closed([[x + cut, y], [x2 - cut, y], [x2, y + cut], [x2, y2 - cut], [x2 - cut, y2], [x + cut, y2], [x, y2 - cut], [x, y + cut]]));
  }
  return walls;
}

/** Caves: closed walls of many short pieces, some with a wall into them and one out of them. */
function caves(random: () => number): WallSegment[] {
  const walls: WallSegment[] = [];
  for (let cave = 1 + Math.floor(random() * 4); cave > 0; cave--) {
    const [cx, cy, radius] = [250 + random() * 900, 250 + random() * 900, 60 + random() * 180];
    const pieces = 12 + Math.floor(random() * 150);
    const [phase, lobes, depth] = [random() * 6.28, 2 + Math.floor(random() * 5), random() * 0.35];
    const corners = Array.from({ length: pieces }, (_, index): [number, number] => {
      const angle = (index / pieces) * Math.PI * 2;
      const far = radius * (1 + depth * Math.sin(angle * lobes + phase)) + (random() - 0.5) * 4;
      return [cx + Math.cos(angle) * far, cy + Math.sin(angle) * far];
    });
    walls.push(...closed(corners));
    const [first, fourth] = [corners[0]!, corners[3]!];
    if (random() < 0.6) walls.push(wall(first[0], first[1], cx + (random() - 0.5) * 30, cy + (random() - 0.5) * 30));
    if (random() < 0.4) walls.push(wall(fourth[0], fourth[1], fourth[0] + (fourth[0] - cx) * 0.5, fourth[1] + (fourth[1] - cy) * 0.5));
  }
  return walls;
}

const areaOf = (outline: RoomCorners): number => {
  let twice = 0;
  outline.forEach((corner, index) => {
    const after = outline[(index + 1) % outline.length]!;
    twice += corner.x * after.y - after.x * corner.y;
  });
  return Math.abs(twice) / 2;
};

const ringArea = (ring: readonly number[]): number => {
  let twice = 0;
  for (let i = 0; i < ring.length; i += 2) twice += ring[i]! * ring[(i + 3) % ring.length]! - ring[(i + 2) % ring.length]! * ring[i + 1]!;
  return Math.abs(twice) / 2 / (Q_SCALE * Q_SCALE);
};

/** A place inside the outline: the middle of its widest stretch along a level line through it. */
function placeIn(outline: RoomCorners): Point | null {
  const ys = outline.map((corner) => corner.y);
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  for (const share of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = top + (bottom - top) * share + 0.123;
    const crossings: number[] = [];
    outline.forEach((a, index) => {
      const b = outline[(index + 1) % outline.length]!;
      if ((a.y > y) !== (b.y > y)) crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    });
    crossings.sort((a, b) => a - b);
    let [widest, x] = [0, 0];
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      if (crossings[i + 1]! - crossings[i]! > widest) [widest, x] = [crossings[i + 1]! - crossings[i]!, (crossings[i]! + crossings[i + 1]!) / 2];
    }
    if (widest > 12) return { x, y };
  }
  return null;
}

/** The rooms of `walls` that have a space of the clipping's around a place in them, and how far each is off it. */
function compared(walls: readonly WallSegment[]): { compared: number; off: string[] } {
  const spaces = enclosedSpaces(sealedWalls(walls, worldTexel(MAP)));
  const off: string[] = [];
  let count = 0;
  for (const room of roomsOfWalls(walls, MAP, CELL)) {
    const place = placeIn(room);
    // A place in a room inside this room is that room's, and one right beside a wall lies in the strip the clipping gives the wall.
    if (!place || ![[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dy]) => roomAt({ x: place.x + dx!, y: place.y + dy! }, walls, MAP, CELL) === room)) continue;
    const space = spaces.find((candidate) => shapeContains(candidate, place));
    count++;
    const truth = space ? ringArea(space[0]!) : 0;
    if (Math.abs(areaOf(room) - truth) > TOLERANCE * truth) off.push(`${areaOf(room).toFixed(0)} px² for ${truth.toFixed(0)} px² around ${place.x.toFixed(0)},${place.y.toFixed(0)}`);
  }
  return { compared: count, off };
}

describe('rooms from walls against the spaces the clipping finds', () => {
  it('agree on boxes, eight-sided rooms and slanted walls that share walls, cross and nest', () => {
    let rooms = 0;
    for (let trial = 1; trial <= TRIALS; trial++) {
      // On the lattice, a few pixels off it (joints that sealing closes), and far off it.
      const walls = dungeon(seeded(trial), 12 + (trial % 5) * 8, [0, 6, 40][trial % 3]!);
      const result = compared(walls);
      expect({ trial, off: result.off }).toEqual({ trial, off: [] });
      rooms += result.compared;
    }
    expect(rooms).toBeGreaterThan(TRIALS * 5);
  }, 20_000 + TRIALS * 50);

  it('agree on caves of many short walls', () => {
    let rooms = 0;
    for (let trial = 1; trial <= Math.ceil(TRIALS / 2); trial++) {
      const result = compared(caves(seeded(trial * 7919)));
      expect({ trial, off: result.off }).toEqual({ trial, off: [] });
      rooms += result.compared;
    }
    expect(rooms).toBeGreaterThan(TRIALS / 2);
  }, 20_000 + TRIALS * 50);
});
