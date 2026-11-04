import type { Message } from '../../types';

export const tokens = {
  'tokens.showBadges': 'Show instance badges',
  'tokens.showBadgesHint': 'Numbers tokens that share an image',
  'tokens.showNameplates': 'Show nameplates',
  'tokens.showResourceBars': 'Show {name} bars',
  'tokens.showResourceWheels': 'Show {name} wheels',
} as const satisfies Record<string, Message>;
