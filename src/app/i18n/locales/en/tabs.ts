import type { Message } from '../../types';

export const tabs = {
  'tabs.reorderInstructions': 'Drag a scene tab to reorder it, or press Alt and Left or Right Arrow while the tab is focused.',
  'tabs.moved': '{name} moved to position {position} of {total}.',
  'tabs.reorderCancelled': 'Scene tab reorder canceled.',
  'tabs.allOpen': 'All open maps',
  'tabs.close': 'Close {name}',
  'tabs.openMaps': 'Open maps',
  'tabs.openScene': 'Open scene',
  'tabs.show': 'Show {name} on the player view',
  'tabs.shown': '{name} is shown on the player view',
} as const satisfies Record<string, Message>;
