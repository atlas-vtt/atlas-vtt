import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { worldTexel } from '../../src/app/lighting/lightingConstants';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { chainWalls, wall, type Rand, type VisibilityCall, type VisibilityTrial } from './visibilityScenes';

/** A map of walls on a grid of cells, as imported maps draw them, with places to look from. */
export interface WallMap {
  name: string;
  size: number;
  /** The walls as drawn, before sealing. */
  drawn: WallSegment[];
  /** The drawn walls sealed at the map's texel, as the lighting reads them. */
  walls: readonly WallSegment[];
  origins: Point[];
}

type Drawn = Omit<WallMap, 'walls'>;

export const BUDGET_SCENES = ['rooms', 'doorways', 'pillars', 'corridors', 'chains'] as const;
export type BudgetScene = (typeof BUDGET_SCENES)[number];

const BIG = 8192;

function sealed(map: Drawn): WallMap {
  return { ...map, walls: sealedWalls(map.drawn, worldTexel({ width: map.size, height: map.size })) };
}

/** Closed rectangular rooms in rows, each a few cells wide, seen from inside. */
function closedRooms(rand: Rand, cols: number, rows: number, size: number): Drawn {
  const walls: WallSegment[] = [], origins: Point[] = [];
  const cw = size / cols, ch = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + 10 + rand() * 10, y = r * ch + 10 + rand() * 10;
      const w = cw - 30 - rand() * 20, h = ch - 30 - rand() * 20;
      const corners = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      corners.forEach((p, i) => walls.push(wall(p, corners[(i + 1) % 4]!)));
      if (origins.length < 64 && rand() < 0.05) origins.push({ x: x + w * (0.2 + rand() * 0.6), y: y + h * (0.2 + rand() * 0.6) });
    }
  }
  return { name: 'rooms', size, drawn: walls, origins };
}

/** Rooms sharing their walls on a grid, each wall with a doorway, so long lines of sight run through rows of doors. */
function doorways(rand: Rand, cells: number, size: number, aligned: boolean): Drawn {
  const walls: WallSegment[] = [], origins: Point[] = [];
  const cell = size / cells, door = cell * 0.25;
  const split = (a: Point, b: Point, open: boolean): void => {
    if (!open) return void walls.push(wall(a, b));
    const f = aligned ? 0.5 : 0.25 + rand() * 0.5;
    const m = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, len = Math.hypot(b.x - a.x, b.y - a.y);
    const u = { x: (b.x - a.x) / len * door / 2, y: (b.y - a.y) / len * door / 2 };
    walls.push(wall(a, { x: m.x - u.x, y: m.y - u.y }), wall({ x: m.x + u.x, y: m.y + u.y }, b));
  };
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j < cells; j++) {
      const edge = i === 0 || i === cells;
      split({ x: j * cell, y: i * cell }, { x: (j + 1) * cell, y: i * cell }, !edge);
      split({ x: i * cell, y: j * cell }, { x: i * cell, y: (j + 1) * cell }, !edge);
    }
  }
  for (let k = 0; k < 64; k++) origins.push({ x: (Math.floor(rand() * cells) + 0.3 + rand() * 0.4) * cell, y: (Math.floor(rand() * cells) + 0.3 + rand() * 0.4) * cell });
  return { name: 'doorways', size, drawn: walls, origins };
}

/** An open hall of square pillars: long sight lines between them. */
function pillars(rand: Rand, count: number, size: number): Drawn {
  const walls: WallSegment[] = [], origins: Point[] = [];
  for (let i = 0; i < count; i++) {
    const cx = 100 + rand() * (size - 200), cy = 100 + rand() * (size - 200), s = 10 + rand() * 30;
    const c = [{ x: cx - s, y: cy - s }, { x: cx + s, y: cy - s }, { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s }];
    c.forEach((p, k) => walls.push(wall(p, c[(k + 1) % 4]!)));
  }
  for (let k = 0; k < 64; k++) origins.push({ x: 200 + rand() * (size - 400), y: 200 + rand() * (size - 400) });
  return { name: 'pillars', size, drawn: walls, origins };
}

/** A long corridor drawn in short pieces, with side rooms' walls beyond it. */
function corridor(rand: Rand, total: number, size: number): Drawn {
  const walls: WallSegment[] = [], origins: Point[] = [];
  const mid = size / 2, piece = size / 128;
  for (let x = piece; x < size - piece; x += piece) walls.push(wall({ x, y: mid - 64 }, { x: x + piece, y: mid - 64 }), wall({ x, y: mid + 64 }, { x: x + piece, y: mid + 64 }));
  walls.push(wall({ x: piece, y: mid - 64 }, { x: piece, y: mid + 64 }), wall({ x: size - piece, y: mid - 64 }, { x: size - piece, y: mid + 64 }));
  while (walls.length < total) {
    const x = piece + rand() * (size - 2 * piece), y = rand() < 0.5 ? 200 + rand() * (mid - 400) : mid + 200 + rand() * (mid - 400);
    const a = rand() * Math.PI * 2, l = 30 + rand() * 120;
    walls.push(wall({ x, y }, { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l }));
  }
  for (let k = 0; k < 64; k++) origins.push({ x: piece + 10 + rand() * (size - 2 * piece - 20), y: mid - 63 + rand() * 126 });
  return { name: 'corridors', size, drawn: walls, origins };
}

/** Random chains over the whole map. */
function chains(rand: Rand, count: number, size: number): Drawn {
  const drawn = chainWalls(rand, count, size, size);
  const origins = Array.from({ length: 64 }, () => ({ x: rand() * size, y: rand() * size }));
  return { name: 'chains', size, drawn, origins };
}

/** A budget scene of about 5,000 sealed walls on an 8,192 px map. */
export function budgetScene(name: BudgetScene, seed = 1): WallMap {
  const rand = rng(seed * 2654435761);
  if (name === 'rooms') return sealed(closedRooms(rand, 50, 25, BIG));
  if (name === 'doorways') return sealed(doorways(rand, 35, BIG, true));
  if (name === 'pillars') return sealed(pillars(rand, 1250, BIG));
  if (name === 'corridors') return sealed(corridor(rand, 5000, BIG));
  return sealed(chains(rand, 4600, BIG));
}

/** Turns every wall and origin of `map` by `degrees` about the map's centre. */
export function turned(map: Drawn, degrees: number): WallMap {
  if (degrees === 0) return sealed(map);
  const a = (degrees * Math.PI) / 180, c = map.size / 2, cos = Math.cos(a), sin = Math.sin(a);
  const turn = (p: Point): Point => ({ x: c + (p.x - c) * cos - (p.y - c) * sin, y: c + (p.x - c) * sin + (p.y - c) * cos });
  const drawn = map.drawn.map((w) => ({ ...w, p1: turn(w.p1), p2: turn(w.p2) }));
  return sealed({ name: `${map.name} turned ${degrees}°`, size: map.size, drawn, origins: map.origins.map(turn) });
}

/** Grid-aligned maps of every kind, from about 2,000 to 20,000 walls, turned by 0°, 17° or 31°. */
export function gridMapTrial(seed: number, origins = 3): VisibilityTrial {
  const rand = rng(seed * 40503);
  const kind = seed % 4, scale = 1 + (seed % 3);
  const base = kind === 0 ? doorways(rand, 25 * scale - 5, BIG, seed % 2 === 0)
    : kind === 1 ? pillars(rand, 500 * scale * scale, BIG)
      : kind === 2 ? corridor(rand, 2000 * scale * scale, BIG)
        : diagonalRooms(rand, 22 * scale, BIG);
  const map = turned(base, [0, 17, 31][Math.floor(seed / 4) % 3]!);
  const calls: VisibilityCall[] = map.origins.slice(0, origins).flatMap((origin): VisibilityCall[] => [
    { origin, radius: Math.hypot(BIG, BIG), channel: 'sight' },
    { origin, radius: 300 + rand() * 1500, channel: 'light' },
  ]);
  return { family: 'grid maps', seed, walls: map.walls, calls };
}

/** A grid map seen from its own walls: from wall ends, from the middle of walls and from places on their lines beyond an end. */
export function wallLinesTrial(seed: number): VisibilityTrial {
  const { walls } = gridMapTrial(seed, 0);
  const rand = rng(seed * 69069);
  const calls = Array.from({ length: 9 }, (_, i): VisibilityCall => {
    const w = walls[Math.floor(rand() * walls.length)]!, f = [0, 0.5, -0.31][i % 3]!;
    const origin = { x: w.p1.x + (w.p2.x - w.p1.x) * f, y: w.p1.y + (w.p2.y - w.p1.y) * f };
    return i % 2 ? { origin, radius: 300 + rand() * 1500, channel: 'light' } : { origin, radius: Math.hypot(BIG, BIG), channel: 'sight' };
  });
  return { family: 'wall lines', seed, walls, calls };
}

/** How many walls of a trial lie in line with the origin of one of its calls to the last bit: the sweep's distance to them is zero for every ray. */
export function wallsInLine({ walls, calls }: VisibilityTrial): number {
  return calls.reduce((sum, { origin }) => sum + walls.filter((w) => (w.p1.x - origin.x) * (w.p2.y - w.p1.y) - (w.p1.y - origin.y) * (w.p2.x - w.p1.x) === 0).length, 0);
}

/** Square rooms with doorways and a diagonal wall across each. */
function diagonalRooms(rand: Rand, cells: number, size: number): Drawn {
  const map = doorways(rand, cells, size, false);
  const cell = size / cells, extra: WallSegment[] = [];
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    if (rand() < 0.5) extra.push(wall({ x: i * cell + cell * 0.2, y: j * cell + cell * 0.2 }, { x: i * cell + cell * 0.6, y: j * cell + cell * 0.7 }));
  }
  return { ...map, name: 'diagonal rooms', drawn: [...map.drawn, ...extra] };
}
