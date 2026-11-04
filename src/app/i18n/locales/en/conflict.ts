import type { Message } from '../../types';

export const conflict = {
  'conflict.bothChanged': 'You and the update both changed it.',
  'conflict.deletedByYou': 'You deleted it; the update changes it.',
  'conflict.keepMine': 'Keep mine',
  'conflict.keepMineAll': 'Keep mine for all',
  'conflict.removedByUpdate': 'The update removes it, but you changed it.',
  'conflict.unknownOrigin': 'Your version differs from the update.',
  'conflict.useUpdate': 'Use update',
  'conflict.useUpdateAll': 'Use update for all',
} as const satisfies Record<string, Message>;
