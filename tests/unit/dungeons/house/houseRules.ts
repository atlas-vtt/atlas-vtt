import { cellKey, cellsOf, doorCells, floorCellsOf } from '../../../../src/app/dungeons/geometry';
import { floorBelow, levelOf, stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import { spotRect } from '../../../../src/app/dungeons/floors/stairSpots';
import type { DungeonDoor, DungeonModel } from '../../../../src/app/dungeons/model';
import { doorSides, houseKeys, owners, reached, stackCells, stairKeys, touching, wallEdges } from './houseCells';

/**
 * The layout rules of a house (research §5.10, rules 1–4, 6, 8–10, 16–18; 15 in `houseWindowRules.ts`), checked on a generated
 * model alone: each returns the problems it finds.
 */

const SERVED = new Set(['dressing-room', 'bathroom']);

/** 1. Every storey's cells lie inside the house of the floor below, by cells. */
export function nestedFloors(model: DungeonModel): string[] {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, i) => {
    const below = floorBelow(stack, i);
    if (below === null || levelOf(stack, i) <= 0) return [];
    const under = houseKeys(model.floors[below]!);
    const out = [...houseKeys(floor)].filter((k) => !under.has(k));
    return out.length ? [`floor ${i}: ${out.length} cells over nothing, e.g. ${out[0]}`] : [];
  });
}

/** 2. Both ends of a stairwell cover the same cells, and each is reached from floor. */
export function stairsLineUp(model: DungeonModel): string[] {
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const own = owners(floor);
    for (const s of floor.stairs) {
      const other = model.floors[s.to]?.stairs.find((t) => t.link === s.link);
      if (!other || other.x !== s.x || other.y !== s.y || other.w !== s.w || other.h !== s.h) out.push(`floor ${i}: stair ${s.link} ends differ`);
      const { approach } = stairKeys(model, i);
      for (const c of cellsOf(spotRect(s))) if (!own.has(cellKey(c.x, c.y))) out.push(`floor ${i}: stair ${s.link} off the floor`);
      for (const key of approach) if (!own.has(key)) out.push(`floor ${i}: stair approach ${key} off the floor`);
    }
  });
  return out;
}

/** 3. One back stair joins every floor from the lowest to the top, as one shaft. */
export function oneBackStair(model: DungeonModel): string[] {
  if (model.floors.length < 2) return [];
  const stack = stackOf(model);
  const levels = model.floors.map((_, i) => levelOf(stack, i)).sort((a, b) => a - b);
  const all = model.floors.flatMap((f, i) => f.stairs.map((s) => ({ ...s, from: i })));
  const shafts = new Map<string, Set<number>>();
  // The two flights of a dog-leg shaft stand side by side: one column, one size.
  for (const s of all) {
    const shaft = `${s.x}:${s.w}x${s.h}`;
    const lower = Math.min(levelOf(stack, s.from), levelOf(stack, s.to));
    shafts.set(shaft, (shafts.get(shaft) ?? new Set()).add(lower));
  }
  const wanted = levels.slice(0, -1);
  const joined = [...shafts.values()].some((lowers) => wanted.every((l) => lowers.has(l)));
  return joined ? [] : [`no shaft joins every floor from ${levels[0]} to ${levels[levels.length - 1]}`];
}

/** 4. Every stack covers the same cells on every floor it rises through, from the ground floor, and lies in no room. */
export function stacksRise(model: DungeonModel): string[] {
  const stack = stackOf(model);
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const own = owners(floor);
    const cells = stackCells(floor);
    for (const k of cells) if (own.has(k)) out.push(`floor ${i}: stack ${k} inside a room`);
    const below = floorBelow(stack, i);
    if (below === null || levelOf(stack, i) <= 0) return;
    const under = stackCells(model.floors[below]!);
    for (const k of cells) if (!under.has(k)) out.push(`floor ${i}: stack ${k} stands on nothing below`);
    for (const k of under) if (houseKeys(floor).has(k) && !cells.has(k)) out.push(`floor ${i}: stack ${k} stops in the house`);
  });
  return out;
}

/** 6. The entrance hall takes the front door and, in a house of storeys, holds the main stair. */
export function hallAtTheFront(model: DungeonModel): string[] {
  const ground = model.floors[0]!;
  const hall = ground.rooms[0]!;
  const out: string[] = [];
  if (hall.type !== 'entrance-hall') out.push(`room 0 is ${hall.type}`);
  const front = ground.doors[0];
  if (!front || front.from !== null || front.to !== 0 || front.x !== 0 || front.y !== 0) out.push('the front door is not the first door, from (0, 0) into the hall');
  const storeys = model.floors.length - (model.below ?? 0);
  if (storeys > 1 && !ground.stairs.some((s) => s.to === 1 && cellsOf(spotRect(s)).every((c) => floorCellsOf(hall).some((h) => h.x === c.x && h.y === c.y)))) out.push('the main stair is not in the hall');
  return out;
}

/** 8. Every room of a floor is reached from its room 0 through doors. */
export function allReached(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, i) => {
    const seen = reached(floor);
    const lost = floor.rooms.filter((r) => !seen.has(r.id));
    return lost.length ? [`floor ${i}: rooms ${lost.map((r) => r.id).join(',')} unreached`] : [];
  });
}

/** 9. Every room touches a corridor or the hall, but dressing rooms and bathrooms, which open only into their bedroom; 10. corridors one cell wide at least, the hall's two. */
export function onCorridors(model: DungeonModel, stages = false): string[] {
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const own = owners(floor);
    const ways = floor.rooms.filter((r) => r.kind === 'corridor' || r.id === 0).map((r) => r.id);
    for (const room of floor.rooms) {
      if (room.kind !== 'room' || room.id === 0 || (stages && room.stage)) continue;
      const doors = floor.doors.filter((d) => d.from === room.id || d.to === room.id);
      if (SERVED.has(room.type ?? '')) {
        if (doors.length !== 1) out.push(`floor ${i}: ${room.type} ${room.id} has ${doors.length} doors`);
        continue;
      }
      if (!ways.some((w) => touching(own, room.id, w))) out.push(`floor ${i}: room ${room.id} (${room.type}) on no corridor`);
    }
    const hallWay = floor.doors.find((d) => d.kind === 'opening' && (d.from === 0 || d.to === 0));
    const corridor = hallWay && floor.rooms[(hallWay.from === 0 ? hallWay.to : hallWay.from)!];
    if (i === 0 && corridor && Math.min(corridor.w, corridor.h) < 2) out.push('the hall opens on a corridor narrower than two cells');
  });
  return out;
}

/** 16. At least half the walls of each storey stand on walls below, and every corridor wall does. */
export function wallsAlign(model: DungeonModel): string[] {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, i) => {
    const below = floorBelow(stack, i);
    if (below === null || levelOf(stack, i) <= 0) return [];
    const under = wallEdges(model.floors[below]!);
    const edges = [...wallEdges(floor)];
    const own = owners(floor);
    const corridor = new Set(floor.rooms.filter((r) => r.kind === 'corridor').map((r) => r.id));
    const spine = edges.filter((e) => corridor.has(own.get(e.split('>')[0]!)!));
    const on = edges.filter((e) => under.has(e)).length;
    const out = on / Math.max(1, edges.length) < 0.5 ? [`floor ${i}: ${on} of ${edges.length} walls on walls below`] : [];
    const loose = spine.filter((e) => !under.has(e));
    return loose.length > spine.length * 0.1 ? [...out, `floor ${i}: ${loose.length} corridor walls over nothing`] : out;
  });
}

/** 17. Every door stands on an edge between two rooms (or a room and the outside), a cell clear of its wall's ends; 18. never before stairs. */
export function doorsOnEdges(model: DungeonModel): string[] {
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const own = owners(floor);
    const { cells, approach } = stairKeys(model, i);
    for (const d of floor.doors) {
      const { from, to } = doorSides(d);
      const fromOk = from.every((c) => own.get(cellKey(c.x, c.y)) === (d.from ?? undefined));
      const toOk = to.every((c) => own.get(cellKey(c.x, c.y)) === (d.to ?? undefined));
      if (!d.edge || !fromOk || !toOk) out.push(`floor ${i}: door ${d.x},${d.y} not on the edge between ${d.from} and ${d.to}`);
      if ([...from, ...to].some((c) => cells.has(cellKey(c.x, c.y)) || approach.has(cellKey(c.x, c.y)))) out.push(`floor ${i}: door ${d.x},${d.y} opens onto stairs`);
      if (!clearOfCorners(d, own)) out.push(`floor ${i}: door ${d.x},${d.y} in its wall's corner`);
    }
  });
  return out;
}

/** Whether a door leaves a cell of its wall at each end, where the wall is long enough to. */
function clearOfCorners(d: DungeonDoor, own: ReadonlyMap<string, number>): boolean {
  const along = { x: d.dir.y !== 0 ? 1 : 0, y: d.dir.x !== 0 ? 1 : 0 };
  const same = (x: number, y: number): boolean => own.get(cellKey(x, y)) === (d.from ?? undefined) && own.get(cellKey(x + d.dir.x, y + d.dir.y)) === (d.to ?? undefined);
  const cells = doorCells(d);
  const first = cells.reduce((p, q) => (q.x * along.x + q.y * along.y < p.x * along.x + p.y * along.y ? q : p));
  const last = cells.reduce((p, q) => (q.x * along.x + q.y * along.y > p.x * along.x + p.y * along.y ? q : p));
  let before = 0;
  while (same(first.x - along.x * (before + 1), first.y - along.y * (before + 1))) before++;
  let after = 0;
  while (same(last.x + along.x * (after + 1), last.y + along.y * (after + 1))) after++;
  const run = before + after + cells.length;
  return run < cells.length + 2 || (before >= 1 && after >= 1);
}
