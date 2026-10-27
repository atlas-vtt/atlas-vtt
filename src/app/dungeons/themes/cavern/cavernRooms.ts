/**
 * The rooms of a Cavern (report §6.8, §2.5): what nature made of each chamber and where it lies.
 * Where a room type stands besides its traits (a lake in a low chamber, a gallery along a fault,
 * a sulphur spring deep on a fault) the Cavern's facts decide (`caveFacts.ts`). A hazard room
 * keeps only the formations nature made in it.
 */

import type { RoomTypeSpec } from '../themeTypes';

export const CAVERN_ROOMS: readonly RoomTypeSpec[] = [
  {
    id: 'cave-mouth',
    count: [0, 1],
    floor: 'entrance',
    depth: 'front',
    terrain: {},
    furnish: { pieces: [{ kind: 'boulder', verb: 'corner', count: [1, 2], chance: 0.7 }] },
    mayStandEmpty: true,
  },
  {
    id: 'passage-chamber',
    count: [0, 64],
    terrain: { allows: ['rubble-field'] },
    furnish: {
      pieces: [
        { kind: 'stalagmites', verb: 'corner', count: [1, 3], chance: 0.7 },
        { kind: 'boulder', verb: 'centre', chance: 0.4 },
      ],
    },
    mayStandEmpty: true,
  },
  {
    id: 'grand-cavern',
    count: [0, 1],
    size: 'largest',
    degree: 'hub',
    terrain: { allows: ['rubble-heap', 'rubble-field', 'ledge', 'pool'] },
    furnish: {
      pieces: [
        { kind: 'stalagmites', verb: 'wall', count: [2, 4] },
        { kind: 'column-formation', verb: 'withParent', parent: 'stalagmites', count: [0, 2], chance: 0.6 },
      ],
    },
  },
  {
    id: 'flowstone-gallery',
    count: [0, 2],
    shape: 'long',
    terrain: {},
    furnish: {
      defining: { kind: 'flowstone', verb: 'wall' },
      pieces: [
        { kind: 'flowstone', verb: 'wall', chance: 0.5 },
        { kind: 'curtain', verb: 'wall', chance: 0.6 },
        { kind: 'stalagmites', verb: 'corner', count: [0, 2], chance: 0.5 },
      ],
    },
  },
  {
    id: 'lake-cavern',
    count: [0, 2],
    terrain: { features: ['cave-lake'], hazards: ['deep-water'], allows: ['ledge'] },
    furnish: { pieces: [{ kind: 'crystals', verb: 'shore', count: [0, 2], chance: 0.6 }] },
  },
  {
    id: 'stream-passage',
    count: [0, 3],
    terrain: { features: ['cave-stream'], hazards: ['channel'], allows: ['ledge'] },
    furnish: { pieces: [] },
    mayStandEmpty: true,
  },
  {
    id: 'sump',
    count: [0, 1],
    perFloor: true,
    degree: 'dead-end',
    terrain: { features: ['sump'], hazards: ['deep-water'] },
    furnish: { pieces: [] },
    mayStandEmpty: true,
  },
  {
    id: 'chasm-hall',
    count: [0, 2],
    terrain: { features: ['fault-chasm'], hazards: ['chasm'] },
    furnish: { pieces: [] },
    mayStandEmpty: true,
  },
  {
    id: 'collapse-chamber',
    count: [0, 2],
    terrain: { features: ['sinkhole'], holes: ['chasm'], allows: ['rubble-heap', 'rubble-field'] },
    furnish: { pieces: [{ kind: 'boulder', verb: 'centre', count: [1, 3] }] },
  },
  {
    id: 'shaft-room',
    count: [0, 64],
    holdsStairs: true,
    mayStandEmpty: true,
    terrain: { features: ['pitch'], holes: ['shaft'] },
    furnish: { pieces: [] },
  },
  {
    id: 'fungus-grove',
    count: [0, 2],
    depth: ['middle', 'deep'],
    terrain: { allows: ['tangled-roots'] },
    furnish: { defining: { kind: 'mushrooms', verb: 'grid', count: [2, 5] }, pieces: [] },
  },
  {
    id: 'crystal-grotto',
    count: [0, 1],
    depth: 'deep',
    degree: 'dead-end',
    terrain: {},
    furnish: { defining: { kind: 'crystals', verb: 'wall', count: [2, 4] }, pieces: [] },
  },
  {
    id: 'lava-tube',
    count: [0, 2],
    shape: 'long',
    terrain: { features: ['lava-flow'], hazards: ['channel'], allows: ['ledge'] },
    furnish: { pieces: [] },
    mayStandEmpty: true,
  },
  {
    id: 'sulphur-spring',
    count: [0, 1],
    terrain: { features: ['sulphur-spring'], hazards: ['channel', 'deep-water'] },
    furnish: { pieces: [] },
    mayStandEmpty: true,
  },
  {
    id: 'roost',
    count: [0, 1],
    terrain: {},
    furnish: { pieces: [] },
    mayStandEmpty: true,
  },
  {
    id: 'den',
    count: [0, 1],
    climaxOnly: true,
    depth: 'deepest',
    degree: 'dead-end',
    terrain: { allows: ['platform', 'ledge', 'pool'] },
    furnish: { pieces: [] },
  },
  // A lived-in cave's (`inhabited.ts`): its hollows near the mouth and near water.
  {
    id: 'guard-post',
    count: [0, 1],
    floor: 'entrance',
    depth: 'front',
    terrain: {},
    furnish: { defining: { kind: 'campfire', verb: 'centre' }, pieces: [{ kind: 'boulder', verb: 'rows', count: [2, 3] }] },
  },
  {
    id: 'lived-in-hollow',
    count: [0, 3],
    terrain: {},
    // Sleepers round their fire: the fire first, so every hollow has one.
    furnish: { defining: { kind: 'campfire', verb: 'centre' }, pieces: [] },
  },
  {
    id: 'fire-hollow',
    count: [0, 1],
    terrain: {},
    furnish: { defining: { kind: 'campfire', verb: 'centre' }, pieces: [] },
  },
  {
    id: 'pen',
    count: [0, 1],
    terrain: {},
    furnish: { pieces: [] },
  },
  {
    id: 'store-hollow',
    count: [0, 1],
    terrain: {},
    furnish: { pieces: [] },
  },
  {
    id: 'chief-den',
    count: [0, 1],
    climaxOnly: true,
    depth: 'deepest',
    degree: 'dead-end',
    terrain: { allows: ['platform', 'ledge'] },
    furnish: { pieces: [{ kind: 'campfire', verb: 'centre' }] },
  },
];
