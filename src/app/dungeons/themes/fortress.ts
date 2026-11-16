/**
 * The Fortress programme: a gatehouse at the entrance, a great hall as the pivot, the service
 * cluster at the hall's low end, the private cluster on another branch, the chapel a dead end off
 * the hall, barracks and armoury near the gate, stores, cistern and gaol on the entrance floor's
 * back branches, and the throne room as one of its climaxes.
 */

import { FORTRESS_ROOMS } from './fortressRooms';
import type { ArenaSpec, RoomProgramme } from './themeTypes';

export const THRONE_ARENA: ArenaSpec = { setPieces: [['statues', 3], ['pillars', 2]], mirrored: ['pillar', 'statue'], hazards: [] };
export const HALL_ARENA: ArenaSpec = { setPieces: [['pillars', 1]], mirrored: ['pillar'], hazards: [] };
export const CHAPEL_ARENA: ArenaSpec = { setPieces: [['statues', 1]], mirrored: ['pillar'], hazards: [] };

export const FORTRESS: RoomProgramme = {
  entrance: [['gatehouse', 1]],
  pivot: ['great-hall', 'lower-hall'],
  stairs: 'stair-hall',
  climax: [
    { type: 'throne-room', weight: 0.35, arena: THRONE_ARENA },
    { type: 'great-hall', weight: 0.4, arena: HALL_ARENA },
    { type: 'chapel', weight: 0.25, arena: CHAPEL_ARENA },
  ],
  clusters: [
    { id: 'service', core: 'kitchen', members: ['buttery', 'storeroom'], anchor: 'pivot', link: 'next' },
    { id: 'private', core: 'solar', members: ['chamber', 'garderobe'], anchor: 'pivot', link: 'near', apartFrom: 'service', floor: 'beyond' },
    { id: 'guard', core: 'barracks', members: ['armoury', 'stable'], anchor: 'entrance', link: 'near' },
  ],
  stages: {
    entrance: ['gatehouse'],
    puzzle: ['gallery', 'library'],
    setback: ['barracks', 'armoury'],
    climax: [],
    reward: ['solar'],
  },
  filler: [
    ['storeroom', 3],
    ['chamber', 1],
    ['barracks', 1],
  ],
  rooms: FORTRESS_ROOMS,
};
