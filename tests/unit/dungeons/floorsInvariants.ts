/** Checks of what joins a dungeon's floors and what only the entry floor has: stairwells and entrances. */

import { type FloorStack, stackOf, stairEnd } from '../../../src/app/dungeons/floors/floorStack';
import { type CellRect, floorRect, inRect, wallRect } from '../../../src/app/dungeons/geometry';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonRoom, DungeonStair } from '../../../src/app/dungeons/model';
import { distances, normals } from './dungeonInvariants';

const key = (c: CellPoint): string => `${c.x},${c.y}`;

function cellsOf(s: Pick<DungeonStair, 'x' | 'y' | 'w' | 'h'>): CellPoint[] {
  const out: CellPoint[] = [];
  for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) out.push({ x, y });
  return out;
}

/** The row a stair end is reached from: before its high end on the upper floor, past its low end on the lower. */
function approach(stair: DungeonStair, upper: boolean): CellPoint[] {
  const d = upper ? { x: -stair.down.x, y: -stair.down.y } : stair.down;
  return cellsOf(stair)
    .map((c) => ({ x: c.x + d.x, y: c.y + d.y }))
    .filter((c) => !cellsOf(stair).some((s) => s.x === c.x && s.y === c.y));
}

function roomHolding(floor: DungeonFloor, stair: DungeonStair): DungeonRoom | undefined {
  return floor.rooms.find((room) => cellsOf(stair).every((c) => inRect(floorRect(room), c.x, c.y)));
}

function doorApproaches(floor: DungeonFloor, room: DungeonRoom): CellPoint[] {
  return floor.doors.flatMap((door) => {
    if (door.from === room.id) return [{ x: door.x - door.dir.x, y: door.y - door.dir.y }];
    if (door.to === room.id) return [{ x: door.x + door.dir.x, y: door.y + door.dir.y }];
    return [];
  });
}

function againstWall(stair: DungeonStair, room: DungeonRoom): boolean {
  const f = floorRect(room);
  return stair.x === f.x0 || stair.y === f.y0 || stair.x + stair.w - 1 === f.x1 || stair.y + stair.h - 1 === f.y1;
}

/** A stair end inside a normal room's floor, against its wall, reached from free floor, the room passable around every stair in it. */
function endProblems(floor: DungeonFloor, index: number, stair: DungeonStair, stack: FloorStack): string[] {
  const where = `floor ${index} stair ${stair.link}`;
  const room = roomHolding(floor, stair);
  if (!room || room.kind !== 'room' || room.rotunda) return [`${where} not inside a normal room`];
  if (!againstWall(stair, room)) return [`${where} not against a wall`];
  const f = floorRect(room);
  const inside = floor.stairs.filter((s) => roomHolding(floor, s) === room);
  const taken = new Set(inside.flatMap(cellsOf).map(key));
  const needed = [...doorApproaches(floor, room), ...inside.flatMap((s) => approach(s, stairEnd(stack, index, s.to) === 'upper'))];
  if (needed.some((c) => !inRect(f, c.x, c.y) || taken.has(key(c)))) return [`${where} blocks a door or the way onto stairs`];
  const free = new Set<string>();
  for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) if (!taken.has(`${x},${y}`)) free.add(`${x},${y}`);
  const seen = new Set([key(needed[0] as CellPoint)]);
  const queue = [needed[0] as CellPoint];
  while (queue.length > 0) {
    const at = queue.shift() as CellPoint;
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      if (free.has(key(next)) && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return needed.every((c) => seen.has(key(c))) ? [] : [`${where} cuts room ${room.id} in two`];
}

/**
 * Stairwells: two ends per link on floors next to each other, the same rectangle and way down,
 * each leading to the other's floor; every end sound in its room; no prop on a stairwell.
 */
export function stairProblems(model: DungeonModel): string[] {
  const out: string[] = [];
  const ends = model.floors.flatMap((floor, index) => floor.stairs.map((stair) => ({ stair, index })));
  const links = new Map<number, typeof ends>();
  ends.forEach((end) => links.set(end.stair.link, [...(links.get(end.stair.link) ?? []), end]));
  for (const [link, pair] of links) {
    const [a, b] = pair;
    if (pair.length !== 2 || !a || !b) {
      out.push(`stair ${link} has ${pair.length} ends`);
      continue;
    }
    const same = a.stair.x === b.stair.x && a.stair.y === b.stair.y && a.stair.w === b.stair.w && a.stair.h === b.stair.h;
    if (!same || a.stair.down.x !== b.stair.down.x || a.stair.down.y !== b.stair.down.y) out.push(`stair ${link}: its ends differ`);
    if (Math.abs(a.index - b.index) !== 1 || a.stair.to !== b.index || b.stair.to !== a.index) out.push(`stair ${link}: ends do not lead to each other`);
    const long = Math.max(a.stair.w, a.stair.h);
    const short = Math.min(a.stair.w, a.stair.h);
    if (long < 2 || long > 3 || short < 1 || short > 2) out.push(`stair ${link} is ${a.stair.w} × ${a.stair.h}`);
  }
  const stack = stackOf(model);
  model.floors.forEach((floor, index) => {
    for (const stair of floor.stairs) out.push(...endProblems(floor, index, stair, stack));
    const cells = new Set(floor.stairs.flatMap(cellsOf).map(key));
    for (const prop of floor.props) if (cells.has(`${Math.floor(prop.x)},${Math.floor(prop.y)}`)) out.push(`floor ${index}: a ${prop.kind} on the stairs`);
  });
  return out;
}

/**
 * A Fortress's or Haunted Mansion's floors rise: every stairwell from floor `k` to `k + 1` is
 * entered on floor `k` past its low end (the side of `down`), on floor `k + 1` before its high end.
 */
export function riseProblems(model: DungeonModel): string[] {
  if (model.theme === 'cavern') return [];
  return model.floors.flatMap((floor, index) =>
    floor.stairs.flatMap((stair) => {
      const room = roomHolding(floor, stair);
      const row = approach(stair, stair.to < index);
      return room && row.every((c) => inRect(floorRect(room), c.x, c.y)) ? [] : [`floor ${index} stair ${stair.link} is not entered from the ${stair.to > index ? 'low' : 'high'} end`];
    }),
  );
}

/** The outer walls of a floor: the box round every room's walls. */
function extentOf(floor: DungeonFloor): CellRect {
  const walls = floor.rooms.map(wallRect);
  return { x0: Math.min(...walls.map((r) => r.x0)), y0: Math.min(...walls.map((r) => r.y0)), x1: Math.max(...walls.map((r) => r.x1)), y1: Math.max(...walls.map((r) => r.y1)) };
}

/** A building's storeys stand on the floor below: no room of one, walls included, reaches past the outer walls of the floor under it. */
export function storeyProblems(model: DungeonModel): string[] {
  const stack = stackOf(model);
  if (stack.rise !== 'up') return [];
  return model.floors.flatMap((floor, k) => {
    const below = model.floors[k - 1];
    if (!below) return [];
    const box = extentOf(below);
    return floor.rooms.filter((room) => {
      const r = wallRect(room);
      return r.x0 < box.x0 || r.y0 < box.y0 || r.x1 > box.x1 || r.y1 > box.y1;
    }).map((room) => `floor ${k} room ${room.id} overhangs the floor below`);
  });
}

/** Of the floors past the entrance floor, the share that lies within the walls of the floor before it, plus two cells either way. */
export function withinShare(models: readonly DungeonModel[]): number {
  const later = models.flatMap((model) => model.floors.slice(1).map((floor, k) => ({ floor, earlier: model.floors[k] as DungeonFloor })));
  const box = (floor: DungeonFloor): { x0: number; y0: number; x1: number; y1: number } => {
    const walls = floor.rooms.map(wallRect);
    return { x0: Math.min(...walls.map((r) => r.x0)), y0: Math.min(...walls.map((r) => r.y0)), x1: Math.max(...walls.map((r) => r.x1)), y1: Math.max(...walls.map((r) => r.y1)) };
  };
  const inside = later.filter(({ floor, earlier }) => {
    const [a, b] = [box(floor), box(earlier)];
    return a.x0 >= b.x0 - 2 && a.y0 >= b.y0 - 2 && a.x1 <= b.x1 + 2 && a.y1 <= b.y1 + 2;
  });
  return inside.length / Math.max(1, later.length);
}

/** The rooms holding the stairs between floor `upper` and the one below, on each of the two. */
function linkRooms(model: DungeonModel, upper: number): { above: number; below: number }[] {
  const top = model.floors[upper] as DungeonFloor;
  const bottom = model.floors[upper + 1] as DungeonFloor;
  return top.stairs
    .filter((s) => s.to === upper + 1)
    .map((s) => ({ above: roomHolding(top, s)?.id ?? -1, below: roomHolding(bottom, bottom.stairs.find((t) => t.link === s.link) as DungeonStair)?.id ?? -1 }));
}

/** Two stairwells between floors that both have six rooms or more, else one; two lie at least two doors apart on both. */
export function connectionProblems(model: DungeonModel): string[] {
  const out: string[] = [];
  for (let upper = 0; upper + 1 < model.floors.length; upper++) {
    const links = linkRooms(model, upper);
    const both = normals(model.floors[upper] as DungeonFloor).length >= 6 && normals(model.floors[upper + 1] as DungeonFloor).length >= 6;
    if (links.length < (both ? 2 : 1)) out.push(`floors ${upper} and ${upper + 1}: ${links.length} stairwells`);
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        const a = links[i]!;
        const b = links[j]!;
        const apart = Math.min(distances(model.floors[upper] as DungeonFloor, a.above).get(b.above) ?? 0, distances(model.floors[upper + 1] as DungeonFloor, a.below).get(b.below) ?? 0);
        if (apart < 2) out.push(`floors ${upper} and ${upper + 1}: stairwells ${apart} doors apart`);
      }
    }
  }
  return out;
}

/** Cells outside every room's walls that reach past the floor's bounds. */
function openGround(floor: DungeonFloor): Set<string> {
  const rects = floor.rooms.map(wallRect);
  const [x0, y0] = [Math.min(...rects.map((r) => r.x0)) - 1, Math.min(...rects.map((r) => r.y0)) - 1];
  const [x1, y1] = [Math.max(...rects.map((r) => r.x1)) + 1, Math.max(...rects.map((r) => r.y1)) + 1];
  const walled = (x: number, y: number): boolean => rects.some((r) => inRect(r, x, y));
  const open = new Set([`${x0},${y0}`]);
  const queue: CellPoint[] = [{ x: x0, y: y0 }];
  while (queue.length > 0) {
    const at = queue.shift() as CellPoint;
    for (const next of [{ x: at.x + 1, y: at.y }, { x: at.x - 1, y: at.y }, { x: at.x, y: at.y + 1 }, { x: at.x, y: at.y - 1 }]) {
      if (next.x < x0 || next.x > x1 || next.y < y0 || next.y > y1 || open.has(key(next)) || walled(next.x, next.y)) continue;
      open.add(key(next));
      queue.push(next);
    }
  }
  return open;
}

/**
 * The entry floor is entered at (0, 0); from six rooms on it has a second way in, facing another
 * way, into a room at least half the floor's farthest way from the first. Every entrance opens
 * onto the open ground around the dungeon. Floors below have none.
 */
export function entranceProblems(model: DungeonModel): string[] {
  const out: string[] = [];
  model.floors.slice(1).forEach((floor, k) => {
    if (floor.doors.some((door) => door.from === null)) out.push(`floor ${k + 1} has an entrance`);
  });
  const entry = model.floors[0] as DungeonFloor;
  const entrances = entry.doors.filter((door) => door.from === null);
  const first = entrances[0];
  if (!first || first.x !== 0 || first.y !== 0 || first.to !== 0 || first.kind !== 'opening') return ['the first entrance is no opening at (0, 0) into room 0'];
  const ground = openGround(entry);
  for (const door of entrances) {
    if (!ground.has(key({ x: door.x - door.dir.x, y: door.y - door.dir.y }))) out.push(`the entrance at ${door.x},${door.y} opens onto rock the rooms close in on`);
  }
  if (normals(entry).length < 6) return out;
  const second = entrances[1];
  if (!second) return [...out, 'one entrance only'];
  const fromFirst = distances(entry, 0);
  const reach = Math.max(...fromFirst.values());
  if ((fromFirst.get(second.to as number) ?? 0) < Math.max(2, Math.ceil(reach / 2))) out.push('the second entrance lies near the first');
  if (second.dir.x === first.dir.x && second.dir.y === first.dir.y) out.push('the second entrance faces as the first');
  return out;
}
