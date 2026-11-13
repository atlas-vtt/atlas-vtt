import { describe, expect, it } from 'vitest';
import { hasRoomWalls, roomAt, roomsOfWalls, roomTexel, type RoomCorners } from '../../src/app/fog/fogRooms';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { sealTolerance, worldTexel } from '../../src/app/lighting/lightingConstants';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { pointInPolygon } from '../../src/app/vision/visibility';

const MAP: MapRect = { x: 0, y: 0, width: 1400, height: 1050 };
const CELL = 70;
/** A texel of this map's raster. */
const TEXEL = roomTexel(MAP, CELL);

let next = 0;
const wall = (x1: number, y1: number, x2: number, y2: number, more: Partial<WallSegment> = {}): WallSegment => ({ id: `w${next++}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...more });
/** The walls of a rectangle, one per side, from the top one round. */
const box = (x: number, y: number, w: number, h: number): WallSegment[] => [wall(x, y, x + w, y), wall(x + w, y, x + w, y + h), wall(x + w, y + h, x, y + h), wall(x, y + h, x, y)];
/** The walls along a closed line of corners. */
const ring = (...corners: [number, number][]): WallSegment[] => corners.map(([x, y], index) => {
  const [nx, ny] = corners[(index + 1) % corners.length]!;
  return wall(x, y, nx, ny);
});

const at = (x: number, y: number): Point => ({ x, y });
const areaOf = (outline: RoomCorners): number => {
  let twice = 0;
  outline.forEach((corner, index) => {
    const after = outline[(index + 1) % outline.length]!;
    twice += corner.x * after.y - after.x * corner.y;
  });
  return Math.abs(twice) / 2;
};
/** The corners as a set of "x,y", whatever corner the outline starts at. */
const cornersOf = (outline: RoomCorners | null): Set<string> => new Set((outline ?? []).map(({ x, y }) => `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`));
const places = (...corners: [number, number][]): Set<string> => new Set(corners.map(([x, y]) => `${x},${y}`));
const inside = (point: Point, outline: RoomCorners): boolean => pointInPolygon(point, [...outline]);

describe('the raster rooms are found on', () => {
  it('has texels of a cell\'s eighth, never under two pixels nor over four, and coarser where the map is too large', () => {
    expect(roomTexel(MAP, 24)).toBe(3);
    // A gap wider than the 13 px sealing closes must leave texels free: no coarser than four pixels.
    expect(roomTexel(MAP, 70)).toBe(4);
    expect(roomTexel(MAP, 8)).toBe(2);
    expect(roomTexel(MAP, 0)).toBe(2);
    expect(roomTexel(MAP, Number.NaN)).toBe(2);
    // At most 2048 texels a side, two of them the rim around the map.
    expect(roomTexel({ x: 0, y: 0, width: 8192, height: 4096 }, 16)).toBeCloseTo(8192 / 2046, 9);
    expect(roomTexel({ x: 0, y: 0, width: 8192, height: 4096 }, 70)).toBeCloseTo(8192 / 2046, 9);
    expect(roomTexel({ x: 0, y: 0, width: 16384, height: 4096 }, 70)).toBeCloseTo(16384 / 2046, 9);
  });
});

describe('the room around a point', () => {
  it('is a closed rectangle of four walls, with the walls\' own ends as its four corners', () => {
    const walls = box(140, 140, 420, 280);
    const room = roomAt(at(300, 300), walls, MAP, CELL);
    expect(cornersOf(room)).toEqual(places([140, 140], [560, 140], [560, 420], [140, 420]));
    expect(room).toHaveLength(4);
    // The same room from any point in it, and the same corners while the walls stay.
    expect(roomAt(at(150, 150), walls, MAP, CELL)).toBe(room);
    expect(roomAt(at(550, 410), walls, MAP, CELL)).toBe(room);
  });

  it('is none in a wall, outside all walls, off the map, without walls or without a map', () => {
    const walls = box(140, 140, 420, 280);
    expect(roomAt(at(300, 140), walls, MAP, CELL)).toBeNull();
    expect(roomAt(at(560, 300), walls, MAP, CELL)).toBeNull();
    expect(roomAt(at(700, 700), walls, MAP, CELL)).toBeNull();
    expect(roomAt(at(-20, 300), walls, MAP, CELL)).toBeNull();
    expect(roomAt(at(300, 2000), walls, MAP, CELL)).toBeNull();
    expect(roomAt(at(300, 300), [], MAP, CELL)).toBeNull();
    expect(roomAt(at(300, 300), walls, { x: 0, y: 0, width: 0, height: 0 }, CELL)).toBeNull();
    expect(roomAt(at(300, 300), walls, { x: 0, y: 0, width: Number.NaN, height: 100 }, CELL)).toBeNull();
  });

  it('gives two rooms that share a wall outlines that meet on that wall', () => {
    // One wall along the top and one along the bottom of both rooms, and the wall between them from one to the other.
    const walls = [wall(140, 140, 700, 140), wall(700, 140, 700, 420), wall(700, 420, 140, 420), wall(140, 420, 140, 140), wall(420, 140, 420, 420)];
    const left = roomAt(at(200, 200), walls, MAP, CELL)!;
    const right = roomAt(at(600, 200), walls, MAP, CELL)!;
    expect(cornersOf(left)).toEqual(places([140, 140], [420, 140], [420, 420], [140, 420]));
    expect(cornersOf(right)).toEqual(places([420, 140], [700, 140], [700, 420], [420, 420]));
    expect(left).not.toBe(right);
    // No point a texel inside one room lies in the other.
    for (let y = 150; y < 420; y += 20) {
      expect(inside(at(420 - TEXEL, y), right)).toBe(false);
      expect(inside(at(420 + TEXEL, y), left)).toBe(false);
    }
  });

  it('ends at a door, open or closed, and at a wall that stops sight one way', () => {
    const shell = [wall(140, 140, 700, 140), wall(700, 140, 700, 420), wall(700, 420, 140, 420), wall(140, 420, 140, 140)];
    const between = (door: Partial<WallSegment>): WallSegment[] => [...shell, wall(420, 140, 420, 245), wall(420, 245, 420, 315, door), wall(420, 315, 420, 420)];
    for (const door of [{ type: 'door', closed: true }, { type: 'door', closed: false }, { type: 'secret-door', closed: false }, { direction: 'left' }] as Partial<WallSegment>[]) {
      const walls = between(door);
      expect(cornersOf(roomAt(at(200, 200), walls, MAP, CELL))).toEqual(places([140, 140], [420, 140], [420, 420], [140, 420]));
      expect(cornersOf(roomAt(at(600, 200), walls, MAP, CELL))).toEqual(places([420, 140], [700, 140], [700, 420], [420, 420]));
    }
  });

  it('ends at a wall that stops only sight, and at none that stops only light or only a token', () => {
    const shell = [wall(140, 140, 700, 140), wall(700, 140, 700, 420), wall(700, 420, 140, 420), wall(140, 420, 140, 140)];
    const whole = places([140, 140], [700, 140], [700, 420], [140, 420]);
    expect(cornersOf(roomAt(at(200, 200), [...shell, wall(420, 140, 420, 420, { blocks: 'sight' })], MAP, CELL))).toEqual(places([140, 140], [420, 140], [420, 420], [140, 420]));
    expect(cornersOf(roomAt(at(200, 200), [...shell, wall(420, 140, 420, 420, { blocks: 'light' })], MAP, CELL))).toEqual(whole);
    expect(cornersOf(roomAt(at(200, 200), [...shell, wall(420, 140, 420, 420, { blocks: 'movement' })], MAP, CELL))).toEqual(whole);
    // A room whose only walls let sight through is none.
    const glass = box(140, 140, 420, 280).map((side) => ({ ...side, blocks: 'light' as const }));
    expect(hasRoomWalls(glass)).toBe(false);
    expect(roomAt(at(300, 300), glass, MAP, CELL)).toBeNull();
    expect(hasRoomWalls(shell)).toBe(true);
    expect(hasRoomWalls([wall(10, 10, 10, 10)])).toBe(false);
  });

  it('is open where a gap is wider than what sealing closes, and closed where the gap is within it', () => {
    const seal = sealTolerance(worldTexel(MAP));
    expect(seal).toBe(13);
    // The top wall stops short of the corner.
    const gapped = (gap: number): WallSegment[] => [wall(140, 140, 560 - gap, 140), wall(560, 140, 560, 420), wall(560, 420, 140, 420), wall(140, 420, 140, 140)];
    expect(roomAt(at(300, 300), gapped(40), MAP, CELL)).toBeNull();
    const sealed = roomAt(at(300, 300), gapped(10), MAP, CELL);
    // The outline runs over the gap to the corner, on the line of the wall that stops short.
    expect(cornersOf(sealed)).toEqual(places([140, 140], [560, 140], [560, 420], [140, 420]));
    // A wall that stops short of the one it runs up to: the room ends at that wall, the gap closed.
    const short = [...box(140, 140, 420, 280), wall(350, 140, 350, 412)];
    expect(cornersOf(roomAt(at(200, 300), short, MAP, CELL))).toEqual(places([140, 140], [350, 140], [350, 420], [140, 420]));
    // Stopping farther short, it divides nothing: the room is the whole box.
    expect(cornersOf(roomAt(at(200, 300), [...box(140, 140, 420, 280), wall(350, 140, 350, 380)], MAP, CELL))).toEqual(places([140, 140], [560, 140], [560, 420], [140, 420]));
  });

  it('leaves a room inside a room out of the outline, and gives it as a room of its own', () => {
    const walls = [...box(140, 140, 700, 560), ...box(350, 350, 210, 140)];
    const outer = roomAt(at(200, 200), walls, MAP, CELL)!;
    // The outline runs round the outer walls, and on a slit to the inner room and round it the other way.
    expect(cornersOf(outer)).toEqual(places([140, 140], [840, 140], [840, 700], [140, 700], [350, 350], [560, 350], [560, 490], [350, 490]));
    expect(outer).toHaveLength(10);
    expect(areaOf(outer)).toBe(700 * 560 - 210 * 140);
    expect(inside(at(200, 200), outer)).toBe(true);
    expect(inside(at(450, 420), outer)).toBe(false);
    const inner = roomAt(at(450, 420), walls, MAP, CELL)!;
    expect(cornersOf(inner)).toEqual(places([350, 350], [560, 350], [560, 490], [350, 490]));
    expect(inner).toHaveLength(4);
    // A wall standing free inside a room takes nothing from it.
    const free = [...box(140, 140, 700, 560), wall(300, 300, 500, 300)];
    expect(cornersOf(roomAt(at(200, 200), free, MAP, CELL))).toEqual(places([140, 140], [840, 140], [840, 700], [140, 700]));
    // Nor does one that sticks into the room from its wall.
    const stub = [...box(140, 140, 700, 560), wall(490, 140, 490, 300)];
    const stubbed = roomAt(at(200, 200), stub, MAP, CELL)!;
    expect(areaOf(stubbed)).toBeCloseTo(700 * 560, 6);
    expect(cornersOf(stubbed)).toEqual(places([140, 140], [840, 140], [840, 700], [140, 700]));
  });

  it('gives a corridor all round two rooms the corridor alone: the rooms inside are no part of it', () => {
    const walls = [...box(140, 140, 700, 560), ...box(210, 210, 560, 420), wall(490, 210, 490, 630)];
    const corridor = roomAt(at(175, 400), walls, MAP, CELL)!;
    expect(cornersOf(corridor)).toEqual(places([140, 140], [840, 140], [840, 700], [140, 700], [210, 210], [770, 210], [770, 630], [210, 630]));
    expect(areaOf(corridor)).toBe(700 * 560 - 560 * 420);
    // Every side of the corridor is in it, and neither room.
    for (const [x, y] of [[175, 400], [500, 175], [805, 400], [500, 665]] as const) expect(inside(at(x, y), corridor)).toBe(true);
    expect(inside(at(350, 420), corridor)).toBe(false);
    expect(inside(at(630, 420), corridor)).toBe(false);
    expect(roomAt(at(805, 600), walls, MAP, CELL)).toBe(corridor);
    // The rooms inside are rooms of their own, and the map has the three.
    expect(cornersOf(roomAt(at(350, 420), walls, MAP, CELL))).toEqual(places([210, 210], [490, 210], [490, 630], [210, 630]));
    expect(cornersOf(roomAt(at(630, 420), walls, MAP, CELL))).toEqual(places([490, 210], [770, 210], [770, 630], [490, 630]));
    const rooms = roomsOfWalls(walls, MAP, CELL);
    expect(rooms).toHaveLength(3);
    expect(rooms.map(areaOf).reduce((sum, area) => sum + area, 0)).toBe(700 * 560);
  });

  it('leaves a room inside a room inside a room to the room around it', () => {
    const walls = [...box(140, 140, 700, 560), ...box(280, 280, 420, 280), ...box(420, 350, 140, 140)];
    const [outer, middle, inner] = [roomAt(at(200, 200), walls, MAP, CELL)!, roomAt(at(300, 300), walls, MAP, CELL)!, roomAt(at(490, 420), walls, MAP, CELL)!];
    expect(areaOf(outer)).toBe(700 * 560 - 420 * 280);
    expect(areaOf(middle)).toBe(420 * 280 - 140 * 140);
    expect(areaOf(inner)).toBe(140 * 140);
    expect(inside(at(490, 420), outer)).toBe(false);
    expect(inside(at(490, 420), middle)).toBe(false);
  });

  it('gives an L-shaped room its six corners', () => {
    const walls = ring([140, 140], [560, 140], [560, 280], [350, 280], [350, 560], [140, 560]);
    const room = roomAt(at(200, 500), walls, MAP, CELL);
    expect(room).toHaveLength(6);
    expect(cornersOf(room)).toEqual(places([140, 140], [560, 140], [560, 280], [350, 280], [350, 560], [140, 560]));
  });

  it('lets no flood past a slanted wall', () => {
    // A square cut in two by a wall from corner to corner, and one cut by a wall at a shallow slant.
    for (const [to, low, high] of [[[560, 560], at(200, 500), at(500, 200)], [[560, 203], at(200, 500), at(500, 150)]] as const) {
      const walls = [...box(140, 140, 420, 420), wall(140, 140, to[0], to[1])];
      const below = roomAt(low, walls, MAP, CELL)!;
      const above = roomAt(high, walls, MAP, CELL)!;
      expect(below).not.toBe(above);
      expect(areaOf(below) + areaOf(above)).toBeCloseTo(420 * 420, 4);
      expect(inside(high, below)).toBe(false);
      expect(inside(low, above)).toBe(false);
      // Both end on the slanted wall, whose ends are corners of each.
      for (const room of [below, above]) expect([...cornersOf(room)]).toEqual(expect.arrayContaining(['140,140', `${to[0]},${to[1]}`]));
    }
    // A triangle of slanted walls is three corners.
    const triangle = ring([200, 600], [650, 250], [900, 800]);
    expect(cornersOf(roomAt(at(600, 550), triangle, MAP, CELL))).toEqual(places([200, 600], [650, 250], [900, 800]));
  });

  it('puts the corner where walls cross without ending there', () => {
    // Two long walls crossing two others: the room in the middle has the four crossings as corners.
    const walls = [wall(70, 210, 910, 210), wall(70, 630, 910, 630), wall(210, 70, 210, 910), wall(700, 70, 700, 910)];
    expect(cornersOf(roomAt(at(400, 400), walls, MAP, CELL))).toEqual(places([210, 210], [700, 210], [700, 630], [210, 630]));
  });

  it('takes a wall along the map\'s own edge for a wall, and the map\'s edge without one for open ground', () => {
    const map: MapRect = { x: 0, y: 0, width: 700, height: 700 };
    // Walls on the right and bottom edges of the map close the corner room.
    const walls = [wall(350, 350, 700, 350), wall(350, 350, 350, 700), wall(700, 350, 700, 700), wall(350, 700, 700, 700)];
    expect(cornersOf(roomAt(at(500, 500), walls, map, CELL))).toEqual(places([350, 350], [700, 350], [700, 700], [350, 700]));
    expect(roomAt(at(500, 500), walls.slice(0, 2), map, CELL)).toBeNull();
  });
  it('finds the room of a point right beside a wall, on the wall\'s side it lies on, and none on the wall\'s line', () => {
    const walls = [wall(140, 140, 700, 140), wall(700, 140, 700, 420), wall(700, 420, 140, 420), wall(140, 420, 140, 140), wall(420, 140, 420, 420)];
    const left = roomAt(at(200, 200), walls, MAP, CELL);
    const right = roomAt(at(600, 200), walls, MAP, CELL);
    expect(roomAt(at(418.5, 300), walls, MAP, CELL)).toBe(left);
    expect(roomAt(at(421.5, 300), walls, MAP, CELL)).toBe(right);
    expect(roomAt(at(419.9, 300), walls, MAP, CELL)).toBe(left);
    expect(roomAt(at(420.1, 300), walls, MAP, CELL)).toBe(right);
    expect(roomAt(at(420, 300), walls, MAP, CELL)).toBeNull();
    // A hair inside the outer wall is the room, a hair outside it the open ground.
    expect(roomAt(at(300, 141), walls, MAP, CELL)).toBe(left);
    expect(roomAt(at(300, 139), walls, MAP, CELL)).toBeNull();
    // In the corner, on the room's side of both walls.
    expect(roomAt(at(141, 141), walls, MAP, CELL)).toBe(left);
    expect(roomAt(at(139, 141), walls, MAP, CELL)).toBeNull();
  });

  it('reaches into the tip of a sharp corner, and ends at a wall that cuts the tip off', () => {
    // Two walls that part at nine degrees, closed at their wide end: the ground does not reach the tip, the outline does.
    const wedge = [wall(140, 420, 980, 420), wall(140, 420, 980, 280), wall(980, 280, 980, 420)];
    expect(cornersOf(roomAt(at(900, 380), wedge, MAP, CELL))).toEqual(places([140, 420], [980, 280], [980, 420]));
    // A wall across it near the tip: the room ends there, at the two places where that wall meets the others.
    const cut = roomAt(at(900, 380), [...wedge, wall(260, 380, 260, 440)], MAP, CELL);
    expect(cornersOf(cut)).toEqual(places([260, 420], [260, 400], [980, 280], [980, 420]));
    // Two walls that stop short of each other at the tip, their joint sealed: the outline runs over the seal.
    const sealed = roomAt(at(900, 380), [wall(146, 420, 980, 420), wall(140, 414, 980, 280), wall(980, 280, 980, 420)], MAP, CELL)!;
    expect([...cornersOf(sealed)]).toEqual(expect.arrayContaining(['146,420', '140,414', '980,280', '980,420']));
    expect(sealed).toHaveLength(4);
  });

  it('goes round a slot in a wall that is wider than what sealing closes, and across the mouth of one that is not', () => {
    const slotted = (width: number): WallSegment[] => ring([140, 140], [560, 140], [560, 280], [630, 280], [630, 280 + width], [560, 280 + width], [560, 420], [140, 420]);
    expect(cornersOf(roomAt(at(300, 300), slotted(16), MAP, CELL))).toEqual(places([140, 140], [560, 140], [560, 280], [630, 280], [630, 296], [560, 296], [560, 420], [140, 420]));
    // Six pixels wide, the slot's mouth is a joint that light takes for closed.
    expect(cornersOf(roomAt(at(300, 300), slotted(6), MAP, CELL))).toEqual(places([140, 140], [560, 140], [560, 420], [140, 420]));
  });

  it('leaves out a room inside the room that a wall joins to the room\'s own, and a wall that stands across a ring of ground', () => {
    // The inner box hangs on the outer wall by one wall: the room is what lies round the box.
    const hung = [...box(140, 140, 700, 560), ...box(420, 350, 210, 140), wall(840, 420, 630, 420)];
    const outer = roomAt(at(200, 200), hung, MAP, CELL)!;
    expect(cornersOf(outer)).toEqual(places([140, 140], [840, 140], [840, 700], [140, 700], [420, 350], [630, 350], [630, 490], [420, 490]));
    expect(areaOf(outer)).toBe(700 * 560 - 210 * 140);
    expect(inside(at(500, 400), outer)).toBe(false);
    expect(cornersOf(roomAt(at(500, 400), hung, MAP, CELL))).toEqual(places([420, 350], [630, 350], [630, 490], [420, 490]));
    // An inner box that touches the outer wall with one corner.
    const touching = [...box(140, 140, 700, 560), ...ring([840, 420], [735, 490], [630, 420], [735, 350])];
    const touched = roomAt(at(200, 200), touching, MAP, CELL)!;
    expect(areaOf(touched)).toBe(700 * 560 - 210 * 70);
    expect(inside(at(735, 420), touched)).toBe(false);
    expect(inside(at(700, 300), touched)).toBe(true);
    // A passage all round a block, with one wall across it: the room is the passage, without the block.
    const round = [...box(140, 140, 700, 560), ...box(280, 280, 420, 280), wall(140, 420, 280, 420)];
    const passage = roomAt(at(200, 200), round, MAP, CELL)!;
    expect(cornersOf(passage)).toEqual(places([140, 140], [840, 140], [840, 700], [140, 700], [280, 280], [700, 280], [700, 560], [280, 560]));
    expect(areaOf(passage)).toBe(700 * 560 - 420 * 280);
    expect(roomAt(at(200, 600), round, MAP, CELL)).toBe(passage);
  });

  it('follows a curved wall of short pieces from end to end of each piece', () => {
    // A circle of 90 walls, each about nine pixels long.
    const pieces = Array.from({ length: 90 }, (_, index): [number, number] => [700 + 130 * Math.cos((index / 90) * 2 * Math.PI), 500 + 130 * Math.sin((index / 90) * 2 * Math.PI)]);
    const room = roomAt(at(700, 500), ring(...pieces), MAP, CELL)!;
    const ends = new Set(pieces.map(([x, y]) => `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`));
    expect(room.length).toBeGreaterThan(40);
    for (const corner of cornersOf(room)) expect(ends.has(corner)).toBe(true);
    // Within half a pixel of the circle's own polygon.
    expect(areaOf(room)).toBeGreaterThan(0.99 * 0.5 * 90 * 130 * 130 * Math.sin((2 * Math.PI) / 90));
    expect(areaOf(room)).toBeLessThanOrEqual(0.5 * 90 * 130 * 130 * Math.sin((2 * Math.PI) / 90) + 1e-6);
  });
});

describe('every room of a map', () => {
  it('finds each enclosed room once, as the room around a point in it, and none of the open ground', () => {
    const walls = [wall(140, 140, 700, 140), wall(700, 140, 700, 420), wall(700, 420, 140, 420), wall(140, 420, 140, 140), wall(420, 140, 420, 420), ...box(840, 560, 280, 210)];
    const rooms = roomsOfWalls(walls, MAP, CELL);
    expect(rooms).toHaveLength(3);
    expect(rooms).toContain(roomAt(at(200, 200), walls, MAP, CELL));
    expect(rooms).toContain(roomAt(at(600, 200), walls, MAP, CELL));
    expect(rooms).toContain(roomAt(at(900, 600), walls, MAP, CELL));
    // Asked again, the same rooms.
    expect(roomsOfWalls(walls, MAP, CELL)).toBe(rooms);
    expect(roomsOfWalls([], MAP, CELL)).toEqual([]);
  });

  it('leaves out what is smaller than half a cell', () => {
    // 49 by 49 is half a cell of 70; a closet of 40 by 40 is less.
    const walls = [...box(140, 140, 280, 280), ...box(700, 140, 40, 40), ...box(700, 350, 56, 56)];
    const rooms = roomsOfWalls(walls, MAP, CELL);
    expect(rooms.map(areaOf).sort((a, b) => a - b)).toEqual([56 * 56, 280 * 280]);
    // A click still finds the closet.
    expect(areaOf(roomAt(at(720, 160), walls, MAP, CELL)!)).toBe(1600);
  });

  it('leaves out rock that rooms close in between them, which their walls turn their rock side to', () => {
    // Two rooms whose walls know their floor side, and a wall at each end closing the rock between them.
    const room = (x: number): WallSegment[] => box(x, 140, 210, 280).map((side) => ({ ...side, floor: 'right' as const }));
    const walls = [...room(140), ...room(490), wall(350, 140, 490, 140), wall(350, 420, 490, 420)];
    const rooms = roomsOfWalls(walls, MAP, CELL);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((outline) => outline[0]!.x).sort((a, b) => a - b)).toEqual([140, 490]);
    // The rock is closed in all the same: a click finds it.
    expect(cornersOf(roomAt(at(420, 300), walls, MAP, CELL))).toEqual(places([350, 140], [490, 140], [490, 420], [350, 420]));
    // Walls drawn by hand say nothing of a side: what they close in is a room.
    const plain = walls.map(({ floor: _floor, ...rest }) => rest);
    expect(roomsOfWalls(plain, MAP, CELL)).toHaveLength(3);
  });
});
