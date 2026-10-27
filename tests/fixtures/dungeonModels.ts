import type { DoorKind, DungeonFloor, DungeonModel, DungeonRoom, PropKind } from '../../src/app/dungeons/model';
import { rngFrom, type Rng } from '../../src/app/dungeons/rng';
import { addDoor, addRoom, colonnade, emptyModel, entryFloor, pool, scatter } from './dungeonModelBuilder';

/**
 * Three dungeons to render against: a small one that holds every door kind, a stairwell, every
 * prop, a rotunda with a colonnade, water and a secret wing; a medium and a large one built by a loop.
 */

export function smallDungeon(): DungeonModel {
  const m = emptyModel(4242);
  const f = entryFloor(m);
  const hall = addRoom(f, { x: -2, y: -5, w: 5, h: 5 });
  const rotunda = addRoom(f, { x: -2, y: -11, w: 5, h: 5, rotunda: true, colonnade: true, parent: 0 });
  const corridor = addRoom(f, { x: 4, y: -3, w: 4, h: 1, parent: 0, axis: { x: 1, y: 0 } });
  const junction = addRoom(f, { x: 9, y: -3, w: 1, h: 1, parent: 2, axis: { x: 1, y: 0 } });
  const pond = addRoom(f, { x: 7, y: -9, w: 5, h: 5, parent: 3 });
  const throne = addRoom(f, { x: 6, y: -1, w: 7, h: 6, parent: 3, colonnade: true, boss: true, axis: { x: 0, y: 1 } });
  const secret = addRoom(f, { x: -7, y: -5, w: 4, h: 5, parent: 0, wing: 'secret', axis: { x: -1, y: 0 } });
  const store = addRoom(f, { x: -8, y: -11, w: 5, h: 5, parent: 1, axis: { x: -1, y: 0 } });
  const shrine = addRoom(f, { x: 4, y: -11, w: 2, h: 5, parent: 1, axis: { x: 1, y: 0 } });

  addDoor(f, 0, 0, { x: 0, y: -1 }, 'opening', null, hall.id);
  addDoor(f, 0, -6, { x: 0, y: -1 }, 'door', hall.id, rotunda.id);
  addDoor(f, 3, -3, { x: 1, y: 0 }, 'opening', hall.id, corridor.id);
  addDoor(f, 8, -3, { x: 1, y: 0 }, 'opening', corridor.id, junction.id);
  addDoor(f, 9, -4, { x: 0, y: -1 }, 'door', junction.id, pond.id);
  addDoor(f, 9, -2, { x: 0, y: 1 }, 'door', junction.id, throne.id);
  addDoor(f, -3, -3, { x: -1, y: 0 }, 'secret', hall.id, secret.id);
  addDoor(f, -3, -9, { x: -1, y: 0 }, 'door', rotunda.id, store.id);
  addDoor(f, 3, -9, { x: 1, y: 0 }, 'door', rotunda.id, shrine.id);
  const steps = addDoor(f, 6, -8, { x: 1, y: 0 }, 'steps', shrine.id, pond.id);
  steps.descends = true;
  f.stairs.push({ x: 11, y: 2, w: 1, h: 2, down: { x: 0, y: 1 }, to: 1, link: 0 });

  f.columns.push(...colonnade(rotunda, 1 / 6), ...colonnade(throne, 1 / 6));
  f.columns[3] = { ...f.columns[3]!, shattered: true };
  const props: [PropKind, number, number, number, number, number][] = [
    ['fountain', 0.5, -2.5, 0, 1, hall.id],
    ['statue', 0.5, -8.5, 0, 1, rotunda.id],
    ['well', 8.5, -7.5, 0, 1, pond.id],
    ['dais', 9.5, 5, 0, 1, throne.id],
    ['bust', -5.5, -4.4, 0.3, 1, secret.id],
    ['statue', -4.5, -2, Math.PI / 2, 1, secret.id],
    ['boulder', -7.5, -10.5, 0, 1, store.id],
    ['stalagmites', -7.5, -6.5, 0, 1, store.id],
    ['hearth', -5.5, -10.5, Math.PI, 1, store.id],
    ['campfire', 5.5, -9.5, 0, 1, shrine.id],
  ];
  for (const [kind, x, y, rotation, scale, room] of props) f.props.push({ kind, x, y, rotation, scale, room });
  f.water.push(pool(rngFrom(7), 10.4, -5.8, 2.1, 1.7));
  scatter(f, hall, 11, 4, 2);
  scatter(f, store, 12, 3, 1);
  scatter(f, throne, 13, 5, 2);
  return m;
}

const CONNECTORS: readonly DoorKind[] = ['door', 'door', 'door', 'opening', 'opening', 'steps'];
const ROOM_PROPS: readonly PropKind[] = ['fountain', 'well', 'statue', 'bust', 'boulder', 'campfire', 'stalagmites', 'crystals'];

/** Rooms on a grid, joined by corridors along a random spanning tree and a few loops. */
function gridDungeon(seed: number, cols: number, rows: number): DungeonModel {
  const rng = rngFrom(seed);
  const m = emptyModel(seed);
  const f = entryFloor(m);
  const slot = 11;
  const grid: DungeonRoom[][] = [];
  for (let j = 0; j < rows; j++) {
    const row: DungeonRoom[] = [];
    for (let i = 0; i < cols; i++) {
      const w = 3 + 2 * Math.floor(rng() * 3);
      const square = rng() < 0.3;
      const h = square ? w : 3 + 2 * Math.floor(rng() * 3);
      const cx = i * slot;
      const cy = j * slot;
      const rotunda = square && w >= 5 && rng() < 0.5;
      const room = addRoom(f, { x: cx - (w - 1) / 2, y: cy - (h - 1) / 2, w, h, rotunda, colonnade: w >= 5 && h >= 5 && rng() < 0.3 });
      row.push(room);
    }
    grid.push(row);
  }
  const linked = new Set<string>();
  for (const [a, b] of spanningLinks(rng, cols, rows)) connect(f, rng, linked, grid[a[1]]![a[0]]!, grid[b[1]]![b[0]]!, a[0] !== b[0]);
  const first = grid[0]![0]!;
  addDoor(f, first.x + (first.w - 1) / 2, first.y - 1, { x: 0, y: 1 }, 'opening', null, first.id);
  furnish(f, rng);
  return m;
}

function spanningLinks(rng: Rng, cols: number, rows: number): [[number, number], [number, number]][] {
  const seen = new Set<string>(['0,0']);
  const links: [[number, number], [number, number]][] = [];
  const frontier: [number, number][] = [[0, 0]];
  while (frontier.length) {
    const index = Math.floor(rng() * frontier.length);
    const [i, j] = frontier[index]!;
    const options = ([[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as [number, number][])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && !seen.has(`${a},${b}`));
    if (!options.length) {
      frontier.splice(index, 1);
      continue;
    }
    const next = options[Math.floor(rng() * options.length)]!;
    seen.add(`${next[0]},${next[1]}`);
    links.push([[i, j], next]);
    frontier.push(next);
  }
  for (let k = 0; k < Math.floor(cols * rows / 6); k++) {
    const i = Math.floor(rng() * (cols - 1));
    const j = Math.floor(rng() * rows);
    links.push([[i, j], [i + 1, j]]);
  }
  return links;
}

function connect(f: DungeonFloor, rng: Rng, linked: Set<string>, a: DungeonRoom, b: DungeonRoom, horizontal: boolean): void {
  const [first, second] = (horizontal ? a.x < b.x : a.y < b.y) ? [a, b] : [b, a];
  const key = `${first.id}-${second.id}`;
  if (linked.has(key)) return;
  linked.add(key);
  const kindA = CONNECTORS[Math.floor(rng() * CONNECTORS.length)]!;
  const kindB = CONNECTORS[Math.floor(rng() * CONNECTORS.length)]!;
  if (horizontal) {
    const y = first.y + (first.h - 1) / 2;
    const start = first.x + first.w + 1;
    const end = second.x - 2;
    const corridor = addRoom(f, { x: start, y, w: end - start + 1, h: 1, parent: first.id, axis: { x: 1, y: 0 } });
    addDoor(f, start - 1, y, { x: 1, y: 0 }, kindA, first.id, corridor.id);
    addDoor(f, end + 1, y, { x: 1, y: 0 }, kindB, corridor.id, second.id);
  } else {
    const x = first.x + (first.w - 1) / 2;
    const start = first.y + first.h + 1;
    const end = second.y - 2;
    const corridor = addRoom(f, { x, y: start, w: 1, h: end - start + 1, parent: first.id, axis: { x: 0, y: 1 } });
    addDoor(f, x, start - 1, { x: 0, y: 1 }, kindA, first.id, corridor.id);
    addDoor(f, x, end + 1, { x: 0, y: 1 }, kindB, corridor.id, second.id);
  }
}

function furnish(f: DungeonFloor, rng: Rng): void {
  const rooms = f.rooms.filter(r => r.kind === 'room');
  for (const room of rooms) {
    if (room.colonnade) f.columns.push(...colonnade(room, 1 / 8 + rng() / 8, rng() < 0.25));
    if (!room.colonnade && rng() < 0.45) {
      const kind = ROOM_PROPS[Math.floor(rng() * ROOM_PROPS.length)]!;
      f.props.push({ kind, x: room.x + room.w / 2, y: room.y + room.h / 2, rotation: 0, scale: 1, room: room.id });
    }
    if (rng() < 0.2) f.water.push(pool(rng, room.x + rng() * room.w, room.y + rng() * room.h, 1 + rng() * 2, 1 + rng() * 2));
    scatter(f, room, Math.floor(rng() * 1e6), Math.floor(rng() * 4), rng() < 0.4 ? 1 : 0);
  }
}

export function mediumDungeon(): DungeonModel {
  return gridDungeon(9001, 4, 3);
}

export function largeDungeon(): DungeonModel {
  return gridDungeon(31337, 8, 5);
}

export const DUNGEON_FIXTURES = { small: smallDungeon, medium: mediumDungeon, large: largeDungeon } as const;
