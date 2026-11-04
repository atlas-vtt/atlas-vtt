import type { Message } from '../../types';

export const creatureFilter = {
  'creatureFilter.cr': 'Challenge rating',
  'creatureFilter.level': 'Level',
  'creatureFilter.tier': 'Tier',
  'creatureFilter.type': 'Type',
  'creatureFilter.traits': 'Traits',
  'creatureFilter.rarity': 'Rarity',
  'creatureFilter.alignment': 'Alignment',
  'creatureFilter.source': 'Source',
} as const satisfies Record<string, Message>;
