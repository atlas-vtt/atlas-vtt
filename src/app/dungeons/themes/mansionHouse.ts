/**
 * The rooms a Haunted Mansion built as a house adds to its programme (research §5.8): the saloon
 * behind the hall, the parlours that fill the reception side, the stair hall of the back stair, the
 * dressing room cut from the master bedroom, servants' rooms on the service side and in the attic,
 * and stores. The house planner places them; their pieces are structure only.
 */

import type { RoomTypeSpec } from './themeTypes';

/** A fireplace on the wall a chimney stack stands behind (the Mansion's facts keep it there): every heated room beside a stack has one. */
export const HEARTH = { kind: 'hearth', verb: 'wall', always: true } as const;

export const MANSION_HOUSE_ROOMS: readonly RoomTypeSpec[] = [
  { id: 'saloon', count: [0, 1], size: 'large', floor: 'entrance', terrain: {}, furnish: { pieces: [HEARTH] } },
  { id: 'parlour', count: [0, 8], size: 'medium', floor: 'entrance', terrain: {}, furnish: { pieces: [HEARTH] } },
  { id: 'staircase-hall', count: [0, 8], mayStandEmpty: true, terrain: {}, furnish: { pieces: [] } },
  { id: 'dressing-room', count: [0, 4], size: 'tiny', degree: 'dead-end', next: ['master-bedroom'], terrain: {}, furnish: { pieces: [] } },
  { id: 'servants-room', count: [0, 24], size: 'small', mayStandEmpty: true, terrain: {}, furnish: { pieces: [] } },
  { id: 'storeroom', count: [0, 12], size: 'small', mayStandEmpty: true, terrain: {}, furnish: { pieces: [] } },
];
