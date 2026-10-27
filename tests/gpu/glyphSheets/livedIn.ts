import type { CellPoint, DungeonModel, PropKind } from '../../../src/app/dungeons/model';
import { addRoom, emptyModel } from '../../fixtures/dungeonModelBuilder';
import type { GlyphSpecimen } from './types';

const QUARTER = Math.PI / 2;

const box = (x: number, y: number, w: number, h: number): CellPoint[] => Array.from({ length: w * h }, (_, i) => ({ x: x + (i % w), y: y + Math.floor(i / w) }));

/** A lived-in cave chamber on natural rock: a fire pit in its middle and the stones round it. */
function camp(): DungeonModel {
  const model = emptyModel(53);
  model.theme = 'cavern';
  const floor = model.floors[0]!;
  floor.cave = { lane: [], heights: [0, 0], faults: [], basins: [], streams: [], dams: [] };
  const cells = box(0, 0, 10, 8).filter(c => !((c.x === 0 || c.x === 9) && (c.y === 0 || c.y === 7)));
  addRoom(floor, { x: 0, y: 0, w: 10, h: 8, cells });
  const prop = (kind: PropKind, x: number, y: number): void => {
    floor.props.push({ kind, x, y, room: 0, rotation: 0, scale: 1 });
  };
  prop('campfire', 4.5, 3.5);
  prop('boulder', 1.5, 1.5);
  prop('boulder', 7.5, 5.5);
  return model;
}

export const SPECIMEN: GlyphSpecimen = {
  family: 'livedIn',
  pieces: [0, QUARTER].map(rotation => ({ kind: 'campfire', rotation })),
  crowded: [
    { kind: 'campfire', rotation: 0, at: { x: 1, y: 0 } },
    { kind: 'boulder', rotation: 0, at: { x: 0, y: 0 } },
    { kind: 'boulder', rotation: 0, at: { x: 2, y: 0 } },
  ],
  scenes: [
    { name: 'camp', model: camp, floor: 0, window: { x: -1, y: -1, cells: 12, rows: 10 } },
    // The same camp where people live: its fire burns.
    { name: 'camp-lit', model: () => ({ ...camp(), tags: ['inhabited'] }), floor: 0, window: { x: 2, y: 1, cells: 5, rows: 5 } },
  ],
};
