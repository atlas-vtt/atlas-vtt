import type { CellDir, CellPoint, DungeonFloor, DungeonModel, DungeonProp, DungeonTerrain, PropKind, TerrainKind } from '../../src/app/dungeons/model';
import { draft, type DraftOptions } from '../../src/app/dungeons/terrain/catalog';
import { addDoor, addRoom, emptyFloor } from '../fixtures/dungeonModelBuilder';
import { DUNGEON_GENERATOR_VERSION } from '../../src/app/dungeons/model';

/**
 * Every kind of terrain, every prop, every passage and a stairwell on one specimen of two floors,
 * for the terrain sheet: a hall of ground, hazards, height and cover, a room of props, and a room of
 * holes over the floor below (a chasm with a rope bridge, a shaft, a gallery) beside a pool.
 */

const box = (x: number, y: number, w = 1, h = 1): CellPoint[] => Array.from({ length: w * h }, (_, k) => ({ x: x + (k % w), y: y + Math.floor(k / w) }));
const down: CellDir = { x: 0, y: 1 };

function place(floor: DungeonFloor, kind: TerrainKind, room: number, cells: CellPoint[], extra: DraftOptions & Partial<DungeonTerrain> = {}): DungeonTerrain {
  const { traits, name, facing, steps, ...rest } = extra;
  const piece: DungeonTerrain = { id: floor.terrain.length, ...draft(kind, room, cells, { ...(traits && { traits }), ...(name && { name }), ...(facing && { facing }), ...(steps && { steps }) }), ...rest };
  floor.terrain.push(piece);
  return piece;
}

function rooms(floor: DungeonFloor): void {
  addRoom(floor, { x: 0, y: 0, w: 22, h: 12 });
  addRoom(floor, { x: 23, y: 0, w: 6, h: 13 });
  addRoom(floor, { x: 0, y: 13, w: 22, h: 8 });
  addDoor(floor, 5, 12, down, 'opening', 0, 2);
}

function upper(): DungeonFloor {
  const f = emptyFloor();
  rooms(f);
  addDoor(f, -1, 5, { x: 1, y: 0 }, 'opening', null, 0);
  addDoor(f, 22, 2, { x: 1, y: 0 }, 'door', 0, 1);
  addDoor(f, 22, 8, { x: 1, y: 0 }, 'steps', 0, 1).descends = true;
  place(f, 'rubble-field', 0, box(5, 1, 2, 2));
  place(f, 'broken-floor', 0, box(8, 1, 2, 1));
  place(f, 'mosaic', 0, box(11, 1, 2, 2));
  place(f, 'chasm-floor', 0, box(14, 1, 2, 1));
  place(f, 'pit', 0, box(17, 1));
  place(f, 'deep-water', 0, box(19, 1, 2, 2));
  place(f, 'platform', 0, box(1, 4, 3, 2), { facing: down, steps: box(2, 6) });
  place(f, 'ledge', 0, box(5, 4, 2, 1), { facing: down, steps: box(5, 5), traits: { elevation: 2 } });
  const lava = place(f, 'channel', 0, box(9, 4, 1, 4), { traits: { hazard: 'lava' } });
  place(f, 'bridge', 0, box(9, 5), { facing: { x: 1, y: 0 }, spans: lava.id });
  place(f, 'low-wall', 0, box(11, 4, 3, 1));
  place(f, 'rubble-heap', 0, box(1, 9));
  place(f, 'pillar', 0, box(3, 9));
  place(f, 'pillar', 0, box(5, 8, 2, 2));
  place(f, 'statue', 0, box(8, 9), { facing: down });
  place(f, 'wall-fragment', 0, box(10, 9, 3, 1));
  place(f, 'obelisk', 0, box(14, 9));
  place(f, 'pool', 0, box(16, 8, 2, 2));
  place(f, 'portal-ring', 0, box(19, 8, 3, 3));
  const chasm = place(f, 'chasm', 2, box(3, 15, 3, 3), { opening: { bottom: 1, link: 1 } });
  place(f, 'bridge', 2, box(4, 15, 1, 3), { facing: down, spans: chasm.id });
  place(f, 'shaft', 2, box(9, 15), { opening: { bottom: 1, link: 2 } });
  place(f, 'gallery', 2, box(12, 15, 3, 2), { opening: { bottom: 1, link: 3 } });
  const water = place(f, 'channel', 2, box(17, 13, 1, 8), { traits: { hazard: 'deep-water' }, name: 'dungeon.terrain.waterChannel' });
  place(f, 'bridge', 2, box(17, 16), { facing: { x: 1, y: 0 }, spans: water.id });
  f.columns.push({ x: 4, y: 7, radius: 0.28, square: false, shattered: false }, { x: 7, y: 7, radius: 0.26, square: true, shattered: false }, { x: 13, y: 7, radius: 0.28, square: false, shattered: true });
  f.props.push(...props());
  f.water.push({ outline: [{ x: 19, y: 17.6 }, { x: 20.6, y: 17.4 }, { x: 21.6, y: 18.4 }, { x: 21.5, y: 20.5 }, { x: 19.6, y: 20.7 }, { x: 18.6, y: 19.6 }] });
  f.rubble.push({ points: [{ x: 7.3, y: 11.3 }, { x: 7.5, y: 11.25 }, { x: 7.55, y: 11.45 }, { x: 7.35, y: 11.5 }] });
  f.cracks.push({ points: [{ x: 21.95, y: 6.2 }, { x: 21.5, y: 6.35 }, { x: 21.2, y: 6.2 }, { x: 20.9, y: 6.45 }], width: 0.06 });
  f.stairs.push({ x: 19, y: 18, w: 1, h: 2, down: { x: 0, y: -1 }, to: 1, link: 0 });
  return f;
}

function props(): DungeonProp[] {
  const at = (kind: PropKind, x: number, y: number, rotation = 0, scale = 1): DungeonProp => ({ kind, x, y, rotation, scale, room: 1 });
  return [
    at('fountain', 24.6, 4),
    at('well', 27, 4),
    at('statue', 24.5, 6.6),
    at('dais', 26, 13),
  ];
}

function lower(): DungeonFloor {
  const f = emptyFloor();
  rooms(f);
  place(f, 'chasm-floor', 2, box(3, 15, 3, 3), { under: 1, name: 'dungeon.terrain.chasmFloor' });
  place(f, 'chasm-floor', 2, box(9, 15), { under: 2 });
  place(f, 'platform', 2, box(11, 14, 5, 4));
  place(f, 'chasm', 0, box(4, 3, 4, 3), { opening: { bottom: null, link: 4 } });
  place(f, 'bridge', 0, box(4, 4, 4, 1), { facing: { x: 1, y: 0 }, spans: 0 });
  f.stairs.push({ x: 19, y: 18, w: 1, h: 2, down: { x: 0, y: -1 }, to: 0, link: 0 });
  return f;
}

export function specimen(): DungeonModel {
  const model: DungeonModel = { version: DUNGEON_GENERATOR_VERSION, seed: 7, tags: [], floors: [upper(), lower()] };
  const below = model.floors[1]!;
  // The bottomless chasm's bridge spans it by its own id on this floor.
  below.terrain[below.terrain.length - 1]!.spans = below.terrain.length - 2;
  return model;
}
