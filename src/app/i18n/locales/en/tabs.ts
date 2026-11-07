import type { Message } from '../../types';

export const tabs = {
  'tabs.allOpen': 'All open maps',
  'tabs.close': 'Close {name}',
  'tabs.processing': 'Processing · {percent}%',
  'tabs.openMaps': 'Open maps',
  'tabs.openScene': 'Open scene',
  'tabs.show': 'Show {name} on the player view',
  'tabs.shown': '{name} is shown on the player view',
} as const satisfies Record<string, Message>;
