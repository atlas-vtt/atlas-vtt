import type { Message } from '../../types';

export const deviceFiles = {
  'deviceFiles.saved': 'Saved {name} in {folder}.',
  'deviceFiles.share': 'Share',
} as const satisfies Record<string, Message>;
