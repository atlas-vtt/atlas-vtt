/**
 * The lobes and bites that keep a chamber from reading as its rectangle: a few ellipses, each turned
 * a little from the line it stands on. One lobe stands out past an end of the rectangle along the
 * cave's fault (so the chamber reaches on along it), the others out past its edges anywhere (bays
 * the chamber grows into); a bite stands on a long side (an alcove of rock it gives up, so it
 * narrows across) or takes a corner of the rectangle. Seeded per chamber, never mirrored.
 */

import type { DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { faultFrame } from './chamberField';

export interface Lobes {
  /** Whether the cell's middle lies in a lobe. */
  grows(x: number, y: number): boolean;
  /** Whether the cell's middle lies in a bite. */
  bitten(x: number, y: number): boolean;
}

interface Ellipse {
  x: number;
  y: number;
  along: number;
  across: number;
  /** The way its long axis runs. */
  ux: number;
  uy: number;
}

/** One lobe for every this many cells round the rectangle, at least one; bites half as many. */
const EDGE_PER_LOBE = 5;
/** How far a lobe or bite turns from the line it stands on, at most. */
const TILT = (35 * Math.PI) / 180;

const span = (rng: Rng, range: readonly [number, number]): number => range[0] + rng() * (range[1] - range[0]);

function tilted(rng: Rng, angle: number, x: number, y: number, along: number, across: number): Ellipse {
  const a = angle + (rng() * 2 - 1) * TILT;
  return { x, y, along, across, ux: Math.cos(a), uy: Math.sin(a) };
}

/** A point on the rectangle's edge, pushed out by `push`, and the way that edge runs. */
function onEdge(rng: Rng, room: DungeonRoom, push: number): { x: number; y: number; angle: number } {
  let at = rng() * 2 * (room.w + room.h);
  if (at < room.w) return { x: room.x + at, y: room.y - push, angle: 0 };
  if ((at -= room.w) < room.w) return { x: room.x + at, y: room.y + room.h + push, angle: 0 };
  if ((at -= room.w) < room.h) return { x: room.x - push, y: room.y + at, angle: Math.PI / 2 };
  return { x: room.x + room.w + push, y: room.y + at - room.h, angle: Math.PI / 2 };
}

export function chamberLobes(rng: Rng, room: DungeonRoom, faults: readonly number[]): Lobes {
  const { angle, ux, uy, cx, cy, reachAlong, reachAcross } = faultFrame(room, faults);
  const at = (t: number, s: number): { x: number; y: number } => ({ x: cx + ux * t - uy * s, y: cy + uy * t + ux * s });
  const count = Math.max(1, Math.round((2 * (room.w + room.h)) / EDGE_PER_LOBE));
  // The first lobe reaches on along the fault past one end; the others stand anywhere round the rectangle.
  const end = rng() < 0.5 ? 1 : -1;
  const first = at(end * (reachAlong + span(rng, [-0.2, 0.8])), (rng() * 2 - 1) * reachAcross * 0.6);
  const lobes = [
    tilted(rng, angle, first.x, first.y, span(rng, [1.4, 2.6]), span(rng, [1, 1.6])),
    ...Array.from({ length: count - 1 }, () => {
      const p = onEdge(rng, room, span(rng, [0.4, 1.4]));
      return tilted(rng, p.angle, p.x, p.y, span(rng, [1.2, 2.4]), span(rng, [0.9, 1.6]));
    }),
  ];
  // Every other bite takes a corner of the rectangle, the rest stand on a long side.
  const bites = Array.from({ length: count }, (_, k) => {
    if (k % 2 === 1) {
      const p = { x: rng() < 0.5 ? room.x : room.x + room.w, y: rng() < 0.5 ? room.y : room.y + room.h };
      return tilted(rng, angle, p.x, p.y, span(rng, [1.4, 2.2]), span(rng, [1.1, 1.7]));
    }
    const side = rng() < 0.5 ? 1 : -1;
    const p = at((rng() * 2 - 1) * reachAlong * 0.7, side * (reachAcross + span(rng, [-0.3, 0.2])));
    return tilted(rng, angle, p.x, p.y, span(rng, [1, 2]), span(rng, [0.8, 1.3]));
  });
  const holds = (e: Ellipse, x: number, y: number): boolean => {
    const dx = x + 0.5 - e.x;
    const dy = y + 0.5 - e.y;
    const a = (dx * e.ux + dy * e.uy) / e.along;
    const b = (-dx * e.uy + dy * e.ux) / e.across;
    return a * a + b * b <= 1;
  };
  return { grows: (x, y) => lobes.some((e) => holds(e, x, y)), bitten: (x, y) => bites.some((e) => holds(e, x, y)) };
}
