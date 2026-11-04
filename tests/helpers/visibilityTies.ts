import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import { along, chainWalls, wall, type Rand, type VisibilityCall, type VisibilityTrial } from './visibilityScenes';

/** The kinds of ties a trial of the ties family holds, counted by the equivalence test. */
export const TIE_KINDS = ['on a wall', 'at an end', 'at a junction', 'beside the row', 'on the row', 'through the origin', 'duplicate', 'near duplicate', 'overlapping', 'zero length', 'shared bearing'] as const;
export type TieKind = (typeof TIE_KINDS)[number];

export interface TiesTrial extends VisibilityTrial {
  kinds: TieKind[];
}

/**
 * Walls left of `origin` along its row: one whose end lies a hair above the row (`a` radians past
 * the left of the row), one hidden end a hair below it (`b` radians before), and a farther wall
 * across the row. `a + b` stays below the sweep's ray offset, so the hidden end's outer ray passes
 * the visible end.
 */
export function rowSeam(origin: Point, a: number, b: number, near = 100, far = 500): WallSegment[] {
  const end = { x: origin.x - near, y: origin.y - near * Math.tan(a) };
  const hidden = { x: origin.x - near * 3, y: origin.y + near * 3 * Math.tan(b) };
  return [
    wall(end, { x: origin.x - near, y: origin.y + near / 5 }),
    wall(hidden, { x: hidden.x - 50, y: hidden.y + 80 }),
    wall({ x: origin.x - far, y: origin.y - far / 5 }, { x: origin.x - far, y: origin.y + far / 5 }),
  ];
}

/** Hidden ends behind `w` as seen from `origin`: short walls on the far side of it. */
function behind(rand: Rand, origin: Point, w: WallSegment, count: number): WallSegment[] {
  const out: WallSegment[] = [];
  for (let i = 0; i < count; i++) {
    const p = along(w, 0.05 + rand() * 0.9);
    const k = 1.2 + rand() * 1.5, a = rand() * Math.PI * 2, l = 5 + rand() * 40;
    const q = { x: origin.x + (p.x - origin.x) * k, y: origin.y + (p.y - origin.y) * k };
    out.push(wall(q, { x: q.x + Math.cos(a) * l, y: q.y + Math.sin(a) * l }));
  }
  return out;
}

/** A slanted visible wall at `distance` from `origin`, facing it, `length` long, at bearing `bearing`. */
function facing(origin: Point, bearing: number, distance: number, length: number, slant: number): WallSegment {
  const centre = { x: origin.x + Math.cos(bearing) * distance, y: origin.y + Math.sin(bearing) * distance };
  const d = { x: Math.cos(bearing + Math.PI / 2 + slant) * length / 2, y: Math.sin(bearing + Math.PI / 2 + slant) * length / 2 };
  return wall({ x: centre.x - d.x, y: centre.y - d.y }, { x: centre.x + d.x, y: centre.y + d.y });
}

/**
 * Degenerate ties: duplicate, near-duplicate and overlapping collinear walls in plain view with
 * hidden ends behind them, ends on and beside the origin's row, walls through the origin,
 * zero-length walls, ends sharing a bearing, and calls from a wall, an end and a junction.
 */
export function tiesTrial(seed: number): TiesTrial {
  const rand = rng(seed * 92821);
  const origin = { x: 1000 + rand() * 48, y: 1000 + rand() * 48 };
  const walls: WallSegment[] = [];
  const kinds = new Set<TieKind>();
  const visible: WallSegment[] = [];
  for (let i = 0; i < 4; i++) {
    const w = facing(origin, (i * Math.PI) / 2 + 0.3 + rand() * 0.9, 120 + rand() * 200, 150 + rand() * 250, (rand() - 0.5) * 1.2);
    visible.push(w);
    walls.push(w, ...behind(rand, origin, w, 25));
    const pick = (i + seed) % 4;
    if (pick === 0) { walls.push({ ...w, id: `${w.id}-copy` }); kinds.add('duplicate'); }
    if (pick === 1) {
      const n = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y), off = 10 ** (-12 + rand() * 3);
      const nx = -(w.p2.y - w.p1.y) / n * off, ny = (w.p2.x - w.p1.x) / n * off;
      walls.push(wall({ x: w.p1.x + nx, y: w.p1.y + ny }, { x: w.p2.x + nx, y: w.p2.y + ny }));
      kinds.add('near duplicate');
    }
    if (pick >= 2) {
      const f = rand() * 0.3;
      walls.push(wall(along(w, f), along(w, f + 0.4 + rand() * 0.3)), wall(along(w, 0.15 + f), along(w, 0.9)));
      kinds.add('overlapping');
    }
  }
  if (seed % 2 === 0) {
    const a = 1e-7 + rand() * 4e-6, b = 1e-7 + rand() * 4e-6;
    walls.push(...rowSeam(origin, a, b, 60 + rand() * 60, 600 + rand() * 300));
    kinds.add('beside the row');
  } else {
    const left = 80 + rand() * 100;
    walls.push(wall({ x: origin.x - left, y: origin.y }, { x: origin.x - left - 40, y: origin.y + 60 }), wall({ x: origin.x - left * 3, y: origin.y - 70 }, { x: origin.x - left * 3, y: origin.y + 70 }));
    walls.push(wall({ x: origin.x - left, y: origin.y + 0.01 }, { x: origin.x - left + 30, y: origin.y + 50 }));
    kinds.add('on the row');
  }
  const through = rand() * Math.PI;
  walls.push(wall({ x: origin.x - Math.cos(through) * 30, y: origin.y - Math.sin(through) * 30 }, { x: origin.x + Math.cos(through) * 30, y: origin.y + Math.sin(through) * 30 }));
  kinds.add('through the origin');
  const still = { x: origin.x + 300 * rand(), y: origin.y - 200 };
  walls.push(wall(still, still), wall(still, { x: still.x + 1e-12, y: still.y }));
  kinds.add('zero length');
  const step = { x: 3, y: -4 };
  for (const s of [16, 32, 64]) walls.push(wall({ x: origin.x + step.x * s, y: origin.y + step.y * s }, { x: origin.x + step.x * s + 30, y: origin.y + step.y * s + 7 }));
  kinds.add('shared bearing');
  walls.push(...chainWalls(rand, 60, 2048, 2048));
  const sealed = sealedWalls(walls, 2);
  const onWall = along(visible[Math.floor(rand() * 4)]!, 0.37);
  const atEnd = { ...visible[Math.floor(rand() * 4)]!.p2 };
  const chain = walls[walls.length - 60 + Math.floor(rand() * 7)]!;
  const atJunction = { ...chain.p2 };
  kinds.add('on a wall').add('at an end').add('at a junction');
  const calls: VisibilityCall[] = [
    { origin, radius: 2900, channel: 'sight' },
    { origin, radius: 600, channel: 'light' },
    ...[onWall, atEnd, atJunction].flatMap((o): VisibilityCall[] => [{ origin: o, radius: 2900, channel: 'sight' }, { origin: o, radius: 250 }]),
  ];
  return { family: 'ties', seed, walls: sealed, calls, kinds: [...kinds] };
}
