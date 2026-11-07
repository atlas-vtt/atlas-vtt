import type { CaveWay } from '../../src/app/dungeons/caveModel';
import type { CellDir, CellPoint, DungeonModel, DungeonTerrain } from '../../src/app/dungeons/model';
import { addDoor, addRoom, emptyModel } from '../fixtures/dungeonModelBuilder';

/**
 * A cave chamber with a door of every way a cave's exit roll gives, each into a short passage, an
 * aven in its roof and a squeeze leading on from its far wall: what the ways of Veins of the Earth
 * are drawn on in the glyph sheets and the ways' render test.
 */

/** A way's door, the passage it leads into and where the way's drawing may reach. */
export interface WaySpot {
  way: CaveWay;
  door: CellPoint;
  dir: CellDir;
  passage: { x: number; y: number; w: number; h: number };
}

export const WAY_SPOTS: readonly WaySpot[] = [
  { way: 'crawl', door: { x: 13, y: 6 }, dir: { x: 1, y: 0 }, passage: { x: 14, y: 6, w: 3, h: 1 } },
  { way: 'squeeze', door: { x: 13, y: 10 }, dir: { x: 1, y: 0 }, passage: { x: 14, y: 10, w: 3, h: 1 } },
  { way: 'letterbox', door: { x: 3, y: 6 }, dir: { x: -1, y: 0 }, passage: { x: 0, y: 6, w: 3, h: 1 } },
  { way: 'sump', door: { x: 3, y: 10 }, dir: { x: -1, y: 0 }, passage: { x: 0, y: 10, w: 3, h: 1 } },
  { way: 'traverse', door: { x: 6, y: 3 }, dir: { x: 0, y: -1 }, passage: { x: 6, y: 0, w: 2, h: 3 } },
  { way: 'breakdown', door: { x: 10, y: 3 }, dir: { x: 0, y: -1 }, passage: { x: 10, y: 0, w: 1, h: 3 } },
  { way: 'walk', door: { x: 5, y: 13 }, dir: { x: 0, y: 1 }, passage: { x: 5, y: 14, w: 1, h: 3 } },
];

/** The aven's cell, in the chamber. */
export const AVEN_CELL: CellPoint = { x: 8, y: 8 };

/** What lies in the passages behind the special ways, as the terrain puts it there; the same with the ways or without. */
function passageTerrain(): DungeonTerrain[] {
  const piece = (id: number, room: number, kind: DungeonTerrain['kind'], cells: CellPoint[], hazard?: DungeonTerrain['traits']['hazard']): DungeonTerrain =>
    ({ id, room, kind, name: `dungeon.terrain.${kind}`, cells, traits: hazard ? { hazard } : {} });
  const chasm = { ...piece(1, 5, 'chasm', [{ x: 7, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }], 'chasm'), opening: { bottom: null, link: 9 } };
  return [
    piece(0, 4, 'deep-water', [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }], 'deep-water'),
    chasm,
    piece(2, 6, 'boulder-choke', [{ x: 10, y: 1 }, { x: 10, y: 2 }]),
  ];
}

/**
 * The chamber and its passages; `ways` false gives the same cave with every door a plain walk, no
 * aven and no squeeze leading on: what the ways' drawings are measured against.
 */
export function caveVeinWaysModel(ways = true): DungeonModel {
  const model = emptyModel(733);
  model.theme = 'cavern';
  model.cave = { variant: 'limestone', faults: [Math.PI / 3] };
  const floor = model.floors[0]!;
  const chamber = addRoom(floor, { x: 4, y: 4, w: 9, h: 9 });
  for (const spot of WAY_SPOTS) {
    const passage = addRoom(floor, { ...spot.passage, kind: 'corridor', parent: 0, axis: spot.dir });
    const door = addDoor(floor, spot.door.x, spot.door.y, spot.dir, 'opening', chamber.id, passage.id);
    if (ways) door.way = spot.way;
  }
  floor.cave = { lane: [], heights: floor.rooms.map(() => 0), faults: [], basins: [], streams: [], dams: [] };
  floor.terrain = passageTerrain();
  if (ways) floor.terrain.push({ id: 3, room: chamber.id, kind: 'aven', name: 'dungeon.terrain.aven', cells: [AVEN_CELL], traits: {} });
  return model;
}
