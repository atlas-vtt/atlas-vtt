/**
 * The rooms whose type the layout decides: the entrance room, the boss room (a climax type), the
 * stages of a five-room dungeon, the pivot hall the plan hangs on (a stair room may be it), then
 * the stair rooms left.
 */

import { type Rng, weighted } from '../../rng';
import type { RoomTypeId } from '../roomTypes';
import type { ClimaxSpec } from '../themeTypes';
import { type Assignment, breaksHardRule, heldCount, specOf } from './score';

/**
 * The room a party enters by: room 0 of the entry floor, or the normal room nearest it where room 0
 * is a corridor; never the boss room where the floor has another, since the boss room is its climax.
 */
export function entranceRoom(a: Assignment): number | null {
  const floor0 = a.traits.filter((t) => t.floor === 0);
  const open = floor0.some((t) => !t.boss) ? floor0.filter((t) => !t.boss) : floor0;
  const first = [...open].sort((x, y) => x.depth - y.depth || x.room - y.room)[0];
  return open.find((t) => t.room === 0)?.index ?? first?.index ?? null;
}

/** A draw by weight among the choices the theme allows in room `i`; the first listed where it allows none. */
function draw<T>(rng: Rng, a: Assignment, i: number, choices: readonly (readonly [T, number])[], type: (choice: T) => RoomTypeId): T | undefined {
  const t = a.traits[i];
  const weights = choices.map(([choice, weight]) => [choice, t && a.facts.allows(type(choice), { floor: t.floor, room: t.room }) ? weight : 0] as const);
  const roll = rng();
  if (weights.every(([, weight]) => weight <= 0)) return choices[0]?.[0];
  return weighted(() => roll, weights);
}

function fix(a: Assignment, i: number, id: RoomTypeId): void {
  a.types[i] = id;
  a.fixed[i] = true;
}

/** Entrance, climax and five-room stages, each marked fixed. */
export function placeAnchors(rng: Rng, a: Assignment): void {
  const entrance = entranceRoom(a);
  if (entrance !== null) {
    const id = draw(rng, a, entrance, a.programme.entrance, (type) => type);
    if (id) fix(a, entrance, id);
  }
  const boss = a.traits.find((t) => t.boss && !a.fixed[t.index]);
  if (boss) {
    const onEntranceFloor = boss.floor === 0;
    const largest = boss.size === 'largest';
    const choices = a.programme.climax.map((c): readonly [ClimaxSpec, number] => [c, (c.onlyOnEntranceFloor && !onEntranceFloor) || (c.onlyInLargest && !largest) ? 0 : c.weight]);
    const climax = draw(rng, a, boss.index, choices, (c) => c.type);
    if (climax) {
      fix(a, boss.index, climax.type);
      a.climax = climax;
    }
  }
  for (const t of a.traits) {
    if (!t.stage || t.stage === 'climax' || a.fixed[t.index]) continue;
    const id = a.programme.stages[t.stage].find((type) => !breaksHardRule(a, t.index, type));
    if (id) fix(a, t.index, id);
  }
}

/** Stair rooms no other anchor took, the pivot included, take the programme's stair type, marked fixed. */
export function placeStairRooms(a: Assignment): void {
  for (const t of a.traits) if (t.stairs && !a.fixed[t.index] && !breaksHardRule(a, t.index, a.programme.stairs)) fix(a, t.index, a.programme.stairs);
}

/** The pivot hall: the entrance room where the entrance type is a pivot type, else the largest free front room of the entry floor. */
export function placePivot(a: Assignment): void {
  const entrance = entranceRoom(a);
  const entranceType = entrance === null ? null : a.types[entrance];
  if (entrance !== null && entranceType && a.programme.pivot.includes(entranceType)) {
    a.pivot = entrance;
    return;
  }
  // A hall the plan hangs on is a hub in the front two thirds of the entrance floor where one is, the largest of them.
  const hub = (t: (typeof a.traits)[number]): number => (t.degree === 'hub' ? 1 : 0);
  const room = a.traits
    .filter((t) => t.floor === 0 && !a.fixed[t.index] && (t.floorBand === 'front' || t.floorBand === 'middle'))
    .sort((x, y) => hub(y) - hub(x) || y.area - x.area || x.index - y.index)[0];
  if (!room) return;
  // The pivot hall keeps to its count and the theme, not to its size: it is the largest front room there is.
  const id = a.programme.pivot.find((type) => {
    const spec = specOf(a.programme, type);
    return spec !== undefined && heldCount(a, type, room.index) < spec.count[1] && a.facts.allows(type, { floor: room.floor, room: room.room });
  });
  if (!id) return;
  fix(a, room.index, id);
  a.pivot = room.index;
}
