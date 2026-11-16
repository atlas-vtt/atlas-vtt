import type { CellPoint, DungeonModel, PropKind, TerrainKind } from '../../../src/app/dungeons/model';
import { draft } from '../../../src/app/dungeons/terrain/catalog';
import { addRoom, emptyModel } from '../../fixtures/dungeonModelBuilder';
import type { GlyphSpecimen, SpecimenPiece } from './types';

const QUARTER = Math.PI / 2;
const CELL_KINDS = ['stalagmites', 'column-formation', 'crystals', 'boulder', 'mushrooms'] as const;

const box = (x: number, y: number, w: number, h: number): CellPoint[] => Array.from({ length: w * h }, (_, i) => ({ x: x + (i % w), y: y + Math.floor(i / w) }));

/**
 * Two cave chambers on natural rock, the formations among what they stand beside in a cavern: a
 * stalagmite clump round a column, flowstone and a curtain on one wall, crystals on a pool's shore,
 * boulders by a rubble heap, tangled roots near the wall, and a grove's mushrooms.
 */
function cave(): DungeonModel {
  const model = emptyModel(37);
  model.theme = 'cavern';
  const floor = model.floors[0]!;
  floor.cave = { lane: [], heights: [0, 0], faults: [], basins: [1], streams: [], dams: [] };
  for (const [x, y, w, h] of [[0, 0, 9, 7], [10, 0, 8, 7]] as const) {
    const cells = box(x, y, w, h).filter(c => !((c.x === x || c.x === x + w - 1) && (c.y === y || c.y === y + h - 1)));
    addRoom(floor, { x, y, w, h, cells });
  }
  const prop = (kind: PropKind, room: number, x: number, y: number, rotation = 0, along?: number): void => {
    floor.props.push({ kind, x, y, room, rotation, scale: 1, ...(along && { size: { along, out: 0 } }) });
  };
  const terrain = (kind: TerrainKind, room: number, cells: CellPoint[]): void => {
    floor.terrain.push({ id: floor.terrain.length, ...draft(kind, room, cells) });
  };
  // The dripstone chamber: a clump of stalagmites round a column, flowstone and a curtain on its back wall.
  prop('stalagmites', 0, 2.5, 2.5);
  prop('stalagmites', 0, 3.5, 3.5, QUARTER);
  prop('column-formation', 0, 3.5, 2.5);
  prop('stalagmites', 0, 2.5, 3.5, QUARTER * 2);
  prop('flowstone', 0, 2.5, 6.9, 0, 3);
  prop('curtain', 0, 6, 6.9, 0, 2);
  prop('boulder', 0, 6.5, 2.5);
  prop('boulder', 0, 7.5, 3.5, QUARTER);
  terrain('rubble-heap', 0, [{ x: 7, y: 2 }]);
  terrain('tangled-roots', 0, box(1, 5, 2, 1));
  // The grotto: crystals on a pool's shore and against the wall.
  terrain('pool', 1, box(12, 2, 3, 3));
  prop('crystals', 1, 15.5, 3.5, QUARTER);
  prop('crystals', 1, 13.5, 0.5, Math.PI);
  prop('crystals', 1, 16.5, 0.5, Math.PI);
  prop('stalagmites', 1, 11.5, 5.5);
  prop('mushrooms', 1, 16.5, 5.5);
  prop('mushrooms', 1, 15.5, 5.5, QUARTER);
  return model;
}

/** Every kind at 0° and a quarter turn; the stretched wall pieces at their shortest and longest. */
const pieces: SpecimenPiece[] = [
  ...CELL_KINDS.flatMap(kind => [0, QUARTER].map(rotation => ({ kind, rotation, ...(kind === 'crystals' && { against: 'wall' as const }) }))),
  ...[1, 3].flatMap(along => [0, QUARTER].map(rotation => ({ kind: 'flowstone' as const, rotation, size: { along, out: 0 } }))),
  ...[1, 2].flatMap(along => [0, QUARTER].map(rotation => ({ kind: 'curtain' as const, rotation, size: { along, out: 0 } }))),
];

export const SPECIMEN: GlyphSpecimen = {
  family: 'formations',
  pieces,
  crowded: [
    // A stalagmite clump over three cells round its column.
    { kind: 'stalagmites', rotation: 0, at: { x: 0, y: 0 } },
    { kind: 'column-formation', rotation: 0, at: { x: 1, y: 0 } },
    { kind: 'stalagmites', rotation: QUARTER, at: { x: 0, y: 1 } },
    { kind: 'stalagmites', rotation: QUARTER * 2, at: { x: 1, y: 1 } },
    // Flowstone and a curtain along the wall, crystals against it, boulders fallen together.
    { kind: 'flowstone', rotation: 0, size: { along: 3, out: 0 }, at: { x: 2.5, y: 0 } },
    { kind: 'curtain', rotation: 0, size: { along: 2, out: 0 }, at: { x: 5.5, y: 0 } },
    { kind: 'crystals', rotation: 0, against: 'wall', at: { x: 7.5, y: 1 } },
    { kind: 'boulder', rotation: 0, at: { x: 9, y: 0 } },
    { kind: 'boulder', rotation: QUARTER, at: { x: 10, y: 1 } },
    // A grove's mushrooms, patch beside patch.
    { kind: 'mushrooms', rotation: 0, at: { x: 12, y: 0 } },
    { kind: 'mushrooms', rotation: QUARTER, at: { x: 13, y: 0 } },
    { kind: 'mushrooms', rotation: QUARTER * 2, at: { x: 12, y: 1 } },
  ],
  scenes: [{ name: 'cave', model: cave, floor: 0, window: { x: -1, y: -1, cells: 20, rows: 9 } }],
};
