/**
 * A Fortress's layout as a castle's, written apart from the generator: its round rooms are towers
 * (few per floor, on the plan's outer edge), and its passages are wide (two cells across at least,
 * three on the main way), one cell only where a reason keeps them narrow.
 */

import { type CellRect, rectsTouch, wallRect } from '../../../src/app/dungeons/geometry';
import { hops, neighbours, openDoor, shortestPath } from '../../../src/app/dungeons/roomGraph';
import type { DungeonFloor, DungeonModel, DungeonRoom } from '../../../src/app/dungeons/model';
import { normals } from './dungeonInvariants';

/** The most towers a floor may have: three, and a fifth of its rooms (one at least). */
function mostTowers(floor: DungeonFloor): number {
  return Math.min(3, Math.max(1, Math.floor(normals(floor).length * 0.2)));
}

/** Whether open ground lies straight out from one of the room's walls: no other room anywhere beyond it. */
function onOuterEdge(floor: DungeonFloor, room: DungeonRoom): boolean {
  const r = wallRect(room);
  const far = 1_000_000;
  const others = floor.rooms.filter((other) => other.id !== room.id).map(wallRect);
  const bands: CellRect[] = [
    { ...r, x0: r.x1 + 1, x1: far },
    { ...r, x0: -far, x1: r.x0 - 1 },
    { ...r, y0: r.y1 + 1, y1: far },
    { ...r, y0: -far, y1: r.y0 - 1 },
  ];
  return bands.some((band) => !others.some((other) => rectsTouch(band, other)));
}

export function towerProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => {
    const rooms = normals(floor);
    const towers = rooms.filter((room) => room.rotunda);
    const many = towers.length > mostTowers(floor) ? [`floor ${f}: ${towers.length} round rooms of ${rooms.length}`] : [];
    return [...many, ...towers.filter((room) => !onOuterEdge(floor, room)).map((room) => `floor ${f}: round room ${room.id} inside the plan`)];
  });
}

/** How many cells across a passage is: square to the way it grew, a junction's narrower side. */
function passageWidth(room: DungeonRoom): number {
  if (room.kind === 'junction') return Math.min(room.w, room.h);
  return room.axis.x !== 0 ? room.h : room.w;
}

/** Whether a reason keeps the passage narrow: a secret wing, a secret door or steps, or the way in from a postern. */
function narrowByReason(floor: DungeonFloor, room: DungeonRoom): boolean {
  if (room.wing === 'secret') return true;
  const entrance = floor.doors.find((d) => d.from === null);
  return floor.doors.some((d) => (d.from === room.id || d.to === room.id) && (d.kind === 'secret' || d.kind === 'steps' || (d.from === null && d !== entrance)));
}

/** The rooms on the way from room 0 to the boss room, else the farthest normal room, through every door but secret ones. */
function mainWay(floor: DungeonFloor): Set<number> {
  const adjacent = neighbours(floor.rooms.length, floor.doors, openDoor);
  const far = hops(adjacent, 0);
  const reached = normals(floor).filter((room) => Number.isFinite(far[room.id]));
  const farthest = reached.reduce<number | undefined>((best, room) => (best === undefined || far[room.id]! > far[best]! ? room.id : best), undefined);
  return new Set(shortestPath(adjacent, 0, floor.rooms.find((room) => room.boss)?.id ?? farthest ?? 0));
}

export function passageProblems(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, f) => {
    const main = mainWay(floor);
    return floor.rooms.filter((room) => room.kind !== 'room').flatMap((room) => {
      const width = passageWidth(room);
      if (main.has(room.id) && width !== 3) return [`floor ${f}: passage ${room.id} on the main way is ${width} across`];
      if (width < 2 && !narrowByReason(floor, room)) return [`floor ${f}: passage ${room.id} is one cell across for no reason`];
      return [];
    });
  });
}
