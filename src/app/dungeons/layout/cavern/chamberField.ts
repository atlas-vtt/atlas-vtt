/**
 * The shape a cave chamber wants, as a field over cells: high where the chamber should be. A
 * chamber is not one blob filling its room's rectangle but a few overlapping lobes, each an
 * ellipse stretched along the cave's fault, set along the fault through the room, with a small
 * lobe at every opening so a passage meets the chamber through a flared mouth, and low-frequency
 * noise over it all for bays and bulges. Growth follows the field (`chambers.ts`), so a chamber
 * gets lobes, alcoves between them and tapering ends; past its rectangle the field falls off.
 */

import type { CellPoint, DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { fractalNoise } from '../../water/noise';

/** How much of the chamber a cell is: about 1 in a lobe's middle, 0 at its rim, below past it. */
export type ChamberField = (x: number, y: number) => number;

interface Lobe {
  x: number;
  y: number;
  along: number;
  across: number;
}

/** One lobe for every this many cells of the rectangle, besides the middle one, at most this many in all. */
const CELLS_PER_LOBE = 18;
const MOST_LOBES = 5;
/** The radius of a lobe at a chamber's opening, in cells. */
const MOUTH_RADIUS = 1.8;
/** How strongly the noise moves the field, and over how many cells it changes. */
const NOISE = 0.45;
const NOISE_PERIOD = 3.5;
/** How fast the field falls off past the rectangle, per cell. */
const OUTSIDE_FALL = 0.2;

/** The fault the room runs along best: the one nearest its own long side. */
function roomFault(room: DungeonRoom, faults: readonly number[]): number {
  const long = room.w >= room.h ? 0 : Math.PI / 2;
  return faults.reduce((best, f) => (Math.abs(Math.cos(f - long)) > Math.abs(Math.cos(best - long)) ? f : best), faults[0] ?? long);
}

/** The room's fault and its way along it, the room's middle, and how far the room reaches each way from it along the fault and across. */
export interface FaultFrame {
  angle: number;
  ux: number;
  uy: number;
  cx: number;
  cy: number;
  reachAlong: number;
  reachAcross: number;
}

export function faultFrame(room: DungeonRoom, faults: readonly number[]): FaultFrame {
  const angle = roomFault(room, faults);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return {
    angle,
    ux,
    uy,
    cx: room.x + room.w / 2,
    cy: room.y + room.h / 2,
    reachAlong: (Math.abs(ux) * room.w + Math.abs(uy) * room.h) / 2,
    reachAcross: (Math.abs(uy) * room.w + Math.abs(ux) * room.h) / 2,
  };
}

/** The field of a chamber in `room`, elongated by up to `stretch` along the cave's faults, with mouths at `openings`. */
export function chamberField(rng: Rng, room: DungeonRoom, faults: readonly number[], stretch: number, openings: readonly CellPoint[]): ChamberField {
  const { ux, uy, cx, cy, reachAlong, reachAcross } = faultFrame(room, faults);
  const area = room.w * room.h;
  const count = Math.min(MOST_LOBES, 1 + Math.floor(area / CELLS_PER_LOBE));
  const base = Math.sqrt(area / Math.PI);
  const lobes: Lobe[] = Array.from({ length: count }, (_, k) => {
    const t = k === 0 ? (rng() - 0.5) * 0.3 : (rng() * 2 - 1) * 0.9;
    const s = k === 0 ? (rng() - 0.5) * 0.3 : (rng() * 2 - 1) * 0.6;
    const radius = base * (k === 0 ? 0.7 + rng() * 0.2 : 0.45 + rng() * 0.35);
    const elongation = 1 + (stretch - 1) * rng();
    return {
      x: cx + ux * t * reachAlong - uy * s * reachAcross,
      y: cy + uy * t * reachAlong + ux * s * reachAcross,
      along: radius * Math.sqrt(elongation),
      across: radius / Math.sqrt(elongation),
    };
  });
  for (const c of openings) lobes.push({ x: c.x + 0.5, y: c.y + 0.5, along: MOUTH_RADIUS, across: MOUTH_RADIUS });
  const noise = fractalNoise(rng, 2, 0.5, NOISE_PERIOD);
  const x0 = room.x;
  const y0 = room.y;
  const x1 = room.x + room.w - 1;
  const y1 = room.y + room.h - 1;
  return (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    let best = -Infinity;
    for (const lobe of lobes) {
      const dx = px - lobe.x;
      const dy = py - lobe.y;
      const a = (dx * ux + dy * uy) / lobe.along;
      const b = (-dx * uy + dy * ux) / lobe.across;
      best = Math.max(best, 1 - Math.sqrt(a * a + b * b));
    }
    const outside = Math.max(x0 - x, x - x1, y0 - y, y - y1, 0);
    return best + NOISE * noise(px, py) - OUTSIDE_FALL * outside;
  };
}
