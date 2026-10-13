import type { Point } from '../../src/app/types/visionTypes';
import type { WallChannel, WallSegment } from '../../src/app/types/wallTypes';
import type { VisionCone } from '../../src/app/vision/visionCone';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { fuzzRooms, rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';

/** One call of the sweep: from where, how far, through which cone and for which channel. */
export interface VisibilityCall {
  origin: Point;
  radius: number;
  cone?: VisionCone;
  channel?: WallChannel;
}

/** Walls and the calls a trial makes on them. */
export interface VisibilityTrial {
  family: string;
  seed: number;
  walls: readonly WallSegment[];
  calls: VisibilityCall[];
}

export type Rand = () => number;

const MAP = 2048;
const UNLIMITED = Math.hypot(MAP, MAP);
const CHANNELS: (WallChannel | undefined)[] = ['sight', 'light', undefined];

let ids = 0;
/** A plain solid wall from `a` to `b`. */
export function wall(a: Point, b: Point, extra: Partial<WallSegment> = {}): WallSegment {
  return { id: `v${ids++}`, kind: 'wall', type: 'solid', p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y }, ...extra };
}

function roomOrigins(seed: number, count: number, gap: boolean | number = false): { walls: WallSegment[]; origins: Point[] } {
  const rooms = fuzzRooms(seed, count, gap);
  const origins = rooms.flatMap((room) => [{ x: room.centre[0], y: room.centre[1] }, ...room.lights.map(([x, y]) => ({ x, y }))]);
  return { walls: rooms.flatMap((room) => room.walls), origins };
}

/** The leak fuzz's rooms, sealed: hand-drawn joints, T-junction chains, doors, one-way walls. */
export function roomsTrial(seed: number): VisibilityTrial {
  const { walls, origins } = roomOrigins(seed, 3 + (seed % 7), seed % 3 === 0 ? 0.25 : false);
  const calls = origins.flatMap((origin, i): VisibilityCall[] => [
    { origin, radius: UNLIMITED, channel: 'sight' },
    { origin, radius: 400, channel: 'light' },
    ...(i % 3 === 0 ? [{ origin, radius: 900 }] : []),
  ]);
  return { family: 'rooms', seed, walls: sealedWalls(walls, 2), calls };
}

/** Random chains of walls, as the lighting performance scene builds them. */
export function chainWalls(rand: Rand, count: number, width: number, height: number): WallSegment[] {
  const walls: WallSegment[] = [];
  while (walls.length < count) {
    let x = rand() * width, y = rand() * height;
    for (let z = 0; z < 8 && walls.length < count; z++) {
      const a = rand() * Math.PI * 2, l = 40 + rand() * 150;
      const next = { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l };
      walls.push(wall({ x, y }, next));
      x = next.x;
      y = next.y;
    }
  }
  return walls;
}

/** Random chains, with all-around sight and lights of every radius from random places. */
export function chainsTrial(seed: number, count = 1000): VisibilityTrial {
  const rand = rng(seed);
  const width = 3682, height = 4555;
  const walls = sealedWalls(chainWalls(rand, count, width, height), 2);
  const calls: VisibilityCall[] = [];
  for (let i = 0; i < 4; i++) {
    const origin = { x: rand() * width, y: rand() * height };
    calls.push({ origin, radius: Math.hypot(width, height), channel: 'sight' }, { origin, radius: 200 + rand() * 7992, channel: 'light' });
  }
  return { family: 'chains', seed, walls, calls };
}

/** Rooms whose walls are doors (open, closed, locked, secret), one-way, or block sight or light only. */
export function wallKindsTrial(seed: number): VisibilityTrial {
  const rand = rng(seed * 7919);
  const { walls, origins } = roomOrigins(seed, 4 + (seed % 4));
  const kinds = walls.map((w): WallSegment => {
    const pick = rand();
    if (pick < 0.12) return { ...w, type: 'door', closed: rand() < 0.5 };
    if (pick < 0.18) return { ...w, type: 'door', closed: true, locked: true };
    if (pick < 0.24) return { ...w, type: 'secret-door', closed: rand() < 0.7 };
    if (pick < 0.34) return { ...w, direction: rand() < 0.5 ? 'left' : 'right' };
    if (pick < 0.44) return { ...w, blocks: 'sight' };
    if (pick < 0.54) return { ...w, blocks: 'light' };
    return w;
  });
  const calls = origins.flatMap((origin, i): VisibilityCall[] => CHANNELS.map((channel) => ({ origin, radius: i % 2 ? 600 : UNLIMITED, ...(channel && { channel }) })));
  return { family: 'wall kinds', seed, walls: sealedWalls(kinds, 2), calls };
}

/** A corridor of short collinear pieces at a slant, seen along its length from beside its walls. */
export function corridorsTrial(seed: number): VisibilityTrial {
  const rand = rng(seed * 104729);
  const angle = rand() * Math.PI * 2, along = { x: Math.cos(angle), y: Math.sin(angle) }, across = { x: -along.y, y: along.x };
  const start = { x: 1024 - along.x * 900, y: 1024 - along.y * 900 }, width = 40 + rand() * 80, piece = 16 + rand() * 64;
  const at = (s: number, d: number): Point => ({ x: start.x + along.x * s + across.x * d, y: start.y + along.y * s + across.y * d });
  const walls: WallSegment[] = [];
  for (let s = 0; s + piece <= 1800; s += piece) {
    walls.push(wall(at(s, 0), at(s + piece, 0)), wall(at(s, width), at(s + piece, width)));
    if (rand() < 0.08) walls.push(wall(at(s, width), at(s, width + 30 + rand() * 90)), wall(at(s, 0), at(s, -30 - rand() * 90)));
  }
  walls.push(...chainWalls(rand, 120, MAP, MAP));
  const calls: VisibilityCall[] = [];
  for (let i = 0; i < 6; i++) {
    const s = 10 + rand() * 1700, d = [0.25, 0.5 + rand(), width - 0.5, width / 2, 1e-6, width - 1e-6][i]!;
    calls.push({ origin: at(s, d), radius: UNLIMITED, channel: 'sight' }, { origin: at(s, d), radius: 500, channel: 'light' });
  }
  return { family: 'corridors', seed, walls: sealedWalls(walls, 2), calls };
}

/** `trial` with every place scaled by `scale` about zero and then moved by (`dx`, `dy`), its radii and apexes scaled alike. */
export function placedTrial(trial: VisibilityTrial, dx: number, dy: number, scale = 1): VisibilityTrial {
  const at = (p: Point): Point => ({ x: p.x * scale + dx, y: p.y * scale + dy });
  return {
    ...trial,
    walls: trial.walls.map((w) => ({ ...w, p1: at(w.p1), p2: at(w.p2) })),
    calls: trial.calls.map((call) => ({ ...call, origin: at(call.origin), radius: call.radius * scale, ...(call.cone?.apex && { cone: { ...call.cone, apex: call.cone.apex * scale } }) })),
  };
}

/** A point on `w` at `f` of its way from p1 to p2. */
export function along(w: WallSegment, f: number): Point {
  return { x: w.p1.x + (w.p2.x - w.p1.x) * f, y: w.p1.y + (w.p2.y - w.p1.y) * f };
}

/** Rooms and chains seen through cones and beams, some from a wall, some with a corner a hair from the origin. */
export function conesTrial(seed: number): VisibilityTrial {
  const rand = rng(seed * 31337);
  const base = seed % 2 ? roomOrigins(seed, 3 + (seed % 5)) : { walls: chainWalls(rand, 300, MAP, MAP), origins: [] as Point[] };
  const origins = [...base.origins.slice(0, 6)];
  while (origins.length < 6) origins.push({ x: 300 + rand() * 1448, y: 300 + rand() * 1448 });
  const solid = base.walls.filter((w) => w.type === 'solid' && !w.direction);
  const onWall = solid[Math.floor(rand() * solid.length)]!;
  origins.push(along(onWall, 0.3 + rand() * 0.4));
  const corner = solid[Math.floor(rand() * solid.length)]!;
  origins.push({ x: corner.p1.x + 4e-4 * Math.cos(seed), y: corner.p1.y + 4e-4 * Math.sin(seed) });
  const widths = [Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 3];
  const calls = origins.flatMap((origin, i): VisibilityCall[] => {
    const facing = rand() * Math.PI * 4 - Math.PI * 2;
    const apex = i % 3 === 2 ? 0 : 35;
    return [
      { origin, radius: UNLIMITED, channel: 'sight', cone: { facing, angle: widths[i % 3]!, ...(apex && { apex }) } },
      { origin, radius: UNLIMITED, channel: 'sight', cone: { facing: -facing, angle: Math.PI / 2 } },
      { origin, radius: 300 + rand() * 900, channel: 'light', cone: { facing, angle: (15 + rand() * 300) * (Math.PI / 180), apex: 17.5 } },
    ];
  });
  return { family: 'cones', seed, walls: sealedWalls(base.walls, 2), calls };
}

/** Rooms and chains with radii short enough that walls cross the circle. */
export function shortReachTrial(seed: number): VisibilityTrial {
  const rand = rng(seed * 65537);
  const base = seed % 2 ? roomOrigins(seed, 3 + (seed % 6)) : { walls: chainWalls(rand, 400, MAP, MAP), origins: [] as Point[] };
  const origins = [...base.origins.slice(0, 8)];
  while (origins.length < 8) origins.push({ x: 200 + rand() * 1648, y: 200 + rand() * 1648 });
  const calls = origins.flatMap((origin): VisibilityCall[] => [
    { origin, radius: 40 + rand() * 260, channel: 'sight' },
    { origin, radius: 60 + rand() * 140, channel: 'light' },
    { origin, radius: 10 + rand() * 30, channel: 'sight' },
  ]);
  return { family: 'short reach', seed, walls: sealedWalls(base.walls, 2), calls };
}

/** Rooms with limited walls in reach, through the sweep and the light mask alike. */
export function limitedTrial(seed: number): VisibilityTrial {
  const rand = rng(seed * 4099);
  const { walls, origins } = roomOrigins(seed, 3 + (seed % 4));
  const marked = walls.map((w) => (rand() < 0.35 ? { ...w, limited: true } : w));
  const calls = origins.flatMap((origin): VisibilityCall[] => [
    { origin, radius: UNLIMITED, channel: 'sight' },
    { origin, radius: 500, channel: 'light' },
  ]);
  return { family: 'limited walls', seed, walls: sealedWalls(marked, 2), calls };
}
