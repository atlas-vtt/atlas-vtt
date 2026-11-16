/**
 * Colonnades: a row of columns one cell in from each long wall, one per grid line along the room,
 * or a ring in a round room. Columns stand on grid vertices. Size and shape are the dungeon's.
 */

import type { DungeonColumn, DungeonRoom } from '../model';
import { type Rng, chance, normalish } from '../rng';

export interface ColumnStyle {
  radius: number;
  square: boolean;
  shatteredChance: number;
}

/** One look for every column of a dungeon: 1/8 to 1/4 of a cell, square one time in four. */
export function columnStyle(rng: Rng, shatteredChance: number): ColumnStyle {
  return { radius: 0.125 + normalish(rng) * 0.125, square: chance(rng, 0.25), shatteredChance };
}

function column(rng: Rng, style: ColumnStyle, x: number, y: number): DungeonColumn {
  return { x, y, radius: style.radius, square: style.square, shattered: chance(rng, style.shatteredChance) };
}

function ring(rng: Rng, room: DungeonRoom, style: ColumnStyle): DungeonColumn[] {
  const r = room.w / 2 - 1;
  const count = 4 * Math.floor((Math.PI * r) / 2);
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  return Array.from({ length: count }, (_, k) => {
    const angle = ((k + 0.5) / count) * Math.PI * 2;
    return column(rng, style, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  });
}

function rows(rng: Rng, room: DungeonRoom, style: ColumnStyle): DungeonColumn[] {
  const out: DungeonColumn[] = [];
  if (room.axis.x !== 0) {
    for (let x = room.x + 1; x <= room.x + room.w - 1; x++) {
      out.push(column(rng, style, x, room.y + 1), column(rng, style, x, room.y + room.h - 1));
    }
  } else {
    for (let y = room.y + 1; y <= room.y + room.h - 1; y++) {
      out.push(column(rng, style, room.x + 1, y), column(rng, style, room.x + room.w - 1, y));
    }
  }
  return out;
}

export function colonnadeOf(rng: Rng, room: DungeonRoom, style: ColumnStyle): DungeonColumn[] {
  if (!room.colonnade) return [];
  return room.rotunda ? ring(rng, room, style) : rows(rng, room, style);
}
