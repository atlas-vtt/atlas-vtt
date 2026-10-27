import { cellKey, floorCellsOf } from '../../../../src/app/dungeons/geometry';
import { levelOf, stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import type { DungeonFloor, DungeonModel } from '../../../../src/app/dungeons/model';
import { houseKeys } from './houseCells';
import { fireplacesOnStacks, mainRoomsWarm } from './houseChimneyRules';

/**
 * The zone and programme rules of a house (research §5.10, rules 5, 11–14, 19, 22), checked on a
 * generated model alone.
 */

const RECEPTION = new Set(['drawing-room', 'dining-room', 'library', 'saloon', 'parlour', 'ballroom']);
const SERVICE = new Set(['kitchen', 'scullery', 'servery', 'servants-hall', 'laundry', 'wine-cellar', 'storeroom']);
const FAMILY = new Set([...RECEPTION, 'study', 'conservatory', 'portrait-gallery', 'bedroom', 'master-bedroom', 'nursery', 'entrance-hall', 'landing']);
const BEDROOMS = new Set(['bedroom', 'master-bedroom', 'nursery']);

const area = (floor: DungeonFloor, id: number): number => floorCellsOf(floor.rooms[id]!).length;

/** 5. The main rooms border a stack, and every fireplace stands against one (`houseChimneyRules.ts`, C5 and C3). */
export function stacksWarm(model: DungeonModel): string[] {
  return [...mainRoomsWarm(model), ...fireplacesOnStacks(model)];
}

/** 11. No door opens drawing room to dining room or kitchen. */
export function receptionApart(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, i) =>
    floor.doors.flatMap((d) => {
      const types = [d.from, d.to].map((id) => (id === null ? null : floor.rooms[id]?.type));
      const bad = types.includes('drawing-room') && (types.includes('dining-room') || types.includes('kitchen'));
      return bad ? [`floor ${i}: a door from ${types.join(' to ')}`] : [];
    }),
  );
}

/**
 * 12. From the kitchen, family rooms are reached only through the baize door, or the servery's door
 * into the dining room; and the way from the kitchen to the dining room keeps out of the hall.
 */
export function baizeDoor(model: DungeonModel): string[] {
  const floor = model.floors[0]!;
  const kitchen = floor.rooms.find((r) => r.type === 'kitchen');
  if (!kitchen || floor.rooms.some((r) => r.stage)) return [];
  // A corridor is the family's where a family room opens on it.
  const serviceSide = (id: number): boolean => {
    const room = floor.rooms[id]!;
    if (room.kind !== 'corridor') return !FAMILY.has(room.type ?? '');
    return !floor.doors.some((d) => [d.from, d.to].includes(id) && [d.from, d.to].some((other) => other !== null && other !== id && FAMILY.has(floor.rooms[other]?.type ?? '')));
  };
  // Walk the kitchen's side: through any door between two rooms of it.
  const seen = new Set([kitchen.id]);
  const crossings = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of floor.doors) {
      if (d.from === null || d.to === null) continue;
      const [a, b] = seen.has(d.from) ? [d.from, d.to] : seen.has(d.to) ? [d.to, d.from] : [null, null];
      if (a === null || b === null || seen.has(b)) continue;
      if (serviceSide(b)) {
        seen.add(b);
        grew = true;
      } else crossings.add(`${floor.rooms[a]!.type ?? floor.rooms[a]!.kind}>${floor.rooms[b]!.type ?? floor.rooms[b]!.kind}`);
    }
  }
  const allowed = (c: string): boolean => c === 'corridor>corridor' || c === 'servery>dining-room';
  const out = [...crossings].filter((c) => !allowed(c)).map((c) => `the service side opens on the family's at ${c}`);
  const baize = [...crossings].filter((c) => c === 'corridor>corridor').length;
  return baize > 1 ? [...out, `${baize} baize doors`] : out;
}


/** 13. The kitchen on the entrance floor; no bedroom there; servants' rooms in the attic or behind the baize door; cellar rooms in the cellar or the service wing. */
export function zones(model: DungeonModel): string[] {
  const stack = stackOf(model);
  const storeys = model.floors.length - (model.below ?? 0);
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const level = levelOf(stack, i);
    for (const room of floor.rooms) {
      if (room.type === 'kitchen' && level !== 0) out.push(`a kitchen on floor ${i}`);
      if (level === 0 && storeys > 1 && BEDROOMS.has(room.type ?? '') && !room.stage) out.push(`a ${room.type} on the entrance floor`);
      if (level > 0 && SERVICE.has(room.type ?? '')) out.push(`a ${room.type} upstairs on floor ${i}`);
    }
  });
  return out;
}

/** 14. No room under two by two; the bathroom the smallest room of its floor; the drawing room (or ballroom) the largest reception room. */
export function roomSizes(model: DungeonModel): string[] {
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const normal = floor.rooms.filter((r) => r.kind === 'room');
    for (const r of normal) if (Math.min(r.w, r.h) < 2) out.push(`floor ${i}: room ${r.id} ${r.w}×${r.h}`);
    for (const bath of normal.filter((r) => r.type === 'bathroom')) if (normal.some((r) => r.type !== 'bathroom' && area(floor, r.id) < area(floor, bath.id))) out.push(`floor ${i}: a room smaller than the bathroom`);
    const reception = normal.filter((r) => RECEPTION.has(r.type ?? ''));
    const top = reception.filter((r) => r.type === 'drawing-room' || r.type === 'ballroom').map((r) => area(floor, r.id));
    if (top.length && reception.some((r) => area(floor, r.id) > Math.max(...top))) out.push(`floor ${i}: a reception room larger than the drawing room`);
  });
  return out;
}

/** 22. No text, no furniture: the only pieces are fireplaces, busts and fountains, and columns. */
export function structureOnly(model: DungeonModel): string[] {
  const kept = new Set(['hearth', 'bust', 'fountain']);
  return model.floors.flatMap((floor, i) => floor.props.filter((p) => !kept.has(p.kind)).map((p) => `floor ${i}: a ${p.kind}`));
}

/** 19. A symmetric footprint mirrors cell for cell about the axis through the front door. */
export function mirrored(model: DungeonModel): boolean {
  const keys = houseKeys(model.floors[0]!);
  const front = model.floors[0]!.doors[0]!;
  const axis2 = 2 * front.x + 1 + (front.wide ? front.wide.x : 0);
  return [...keys].every((k) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return keys.has(cellKey(axis2 - 1 - x, y));
  });
}
