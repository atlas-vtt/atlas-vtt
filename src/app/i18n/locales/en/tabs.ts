import type { Message } from '../../types';

export const tabs = {
  'tabs.allOpen': 'All open maps',
  'tabs.close': 'Close {name}',
  'tabs.openMaps': 'Open maps',
  'tabs.openScene': 'Open scene',
  'tabs.presentTo': 'Present {name} to {target}',
  'tabs.show': 'Show {name} on the player view',
  'tabs.shown': '{name} is shown on the player view',
  'tabs.stopPresenting': 'Stop presenting {name}',
} as const satisfies Record<string, Message>;
