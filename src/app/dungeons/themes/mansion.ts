/**
 * The Haunted Mansion programme: the entrance hall is the pivot, the reception rooms lie in front,
 * the service wing on its own branch of the entrance floor, the private rooms deep and upstairs.
 * The haunting is made of rooms (a sealed nursery, a portrait gallery, a ritual room upstairs as a
 * climax), never of story objects. No hazards.
 */

import { MANSION_ROOMS } from './mansionRooms';
import type { ArenaSpec, RoomProgramme } from './themeTypes';

export const BALLROOM_ARENA: ArenaSpec = { setPieces: [['statues', 1]], mirrored: ['pillar', 'statue'], hazards: [] };
export const BEDCHAMBER_ARENA: ArenaSpec = { setPieces: [], mirrored: ['statue'], hazards: [] };
export const RITUAL_ARENA: ArenaSpec = { setPieces: [['mosaic', 1]], mirrored: ['statue'], hazards: [] };

export const MANSION: RoomProgramme = {
  entrance: [['entrance-hall', 1]],
  pivot: ['entrance-hall'],
  stairs: 'landing',
  climax: [
    { type: 'master-bedroom', weight: 0.35, arena: BEDCHAMBER_ARENA },
    { type: 'ritual-room', weight: 0.3, arena: RITUAL_ARENA },
    { type: 'ballroom', weight: 0.35, arena: BALLROOM_ARENA, onlyOnEntranceFloor: true, onlyInLargest: true },
  ],
  clusters: [
    { id: 'service', core: 'kitchen', members: ['scullery', 'servery', 'servants-hall', 'wine-cellar', 'laundry'], anchor: 'pivot', link: 'near', floor: 'entrance' },
    { id: 'reception', core: 'drawing-room', members: ['dining-room', 'library'], anchor: 'pivot', link: 'next', apartFrom: 'service' },
    { id: 'private', core: 'master-bedroom', members: ['bedroom', 'bathroom', 'nursery'], floor: 'beyond' },
  ],
  stages: {
    entrance: ['entrance-hall'],
    puzzle: ['portrait-gallery', 'library'],
    setback: ['conservatory', 'nursery'],
    climax: [],
    reward: ['study', 'master-bedroom'],
  },
  filler: [
    ['bedroom', 2],
    ['study', 1],
    ['scullery', 1],
    ['attic-room', 1],
  ],
  rooms: MANSION_ROOMS,
};
