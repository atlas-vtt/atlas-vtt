/**
 * The directions a cave's faults run in: one, or two at 60–90° to each other, shared by the whole
 * cave. Chambers stretch along them, chasms lie along them, and each floor has a few fault lines
 * through its rooms.
 */

import type { CaveFault, DungeonFloor, DungeonRoom } from '../../model';
import { type Rng, chance } from '../../rng';

const TURN = (20 * Math.PI) / 180;
const SECOND_CHANCE = 0.7;
/** The share of the rooms longer the other way from which a cave always has a second fault. */
const BOTH_WAYS = 0.25;
const SECOND_FROM = (60 * Math.PI) / 180;
const SECOND_TO = (90 * Math.PI) / 180;
/** One fault line per floor, and one more for every this many normal rooms. */
const ROOMS_PER_LINE = 8;

/** Radians in [0, π): a fault has no way along it. */
function axial(angle: number): number {
  const a = angle % Math.PI;
  return a < 0 ? a + Math.PI : a;
}

/**
 * The first along the axis most normal rooms are longer on, turned by up to 20°; a second, 60–90°
 * from it on the side that brings it nearer the other axis, where a quarter of the rooms are
 * longer that way, else 70 % of the time.
 */
export function faultDirections(rng: Rng, rooms: readonly DungeonRoom[]): number[] {
  const normal = rooms.filter((room) => room.kind === 'room');
  const wide = normal.filter((room) => room.w > room.h).length;
  const tall = normal.filter((room) => room.h > room.w).length;
  const axis = tall > wide ? Math.PI / 2 : 0;
  const first = axial(axis + (rng() * 2 - 1) * TURN);
  // Rooms that run both ways follow two faults; else a second one 70 % of the time.
  const second = chance(rng, SECOND_CHANCE) || Math.min(wide, tall) >= BOTH_WAYS * (wide + tall);
  const apart = SECOND_FROM + rng() * (SECOND_TO - SECOND_FROM);
  const other = axis + Math.PI / 2;
  const off = (a: number): number => {
    const d = Math.abs(axial(a) - axial(other));
    return Math.min(d, Math.PI - d);
  };
  const toward = off(first + apart) <= off(first - apart) ? 1 : -1;
  return second ? [first, axial(first + toward * apart)] : [first];
}

/** A floor's fault lines, each through a random normal room's middle, the directions in turn. */
export function faultLines(rng: Rng, floor: Pick<DungeonFloor, 'rooms'>, angles: readonly number[]): CaveFault[] {
  const normal = floor.rooms.filter((room) => room.kind === 'room');
  if (normal.length === 0 || angles.length === 0) return [];
  const count = 1 + Math.floor(normal.length / ROOMS_PER_LINE);
  return Array.from({ length: count }, (_, k) => {
    const room = normal[Math.floor(rng() * normal.length)]!;
    return { angle: angles[k % angles.length]!, x: room.x + room.w / 2, y: room.y + room.h / 2 };
  });
}

/** Whether `angle` lies within `tolerance` of a fault direction, either way along it. */
export function nearFault(angle: number, faults: readonly number[], tolerance: number): boolean {
  return faults.some((fault) => {
    const d = Math.abs(axial(angle) - axial(fault));
    return Math.min(d, Math.PI - d) <= tolerance;
  });
}
