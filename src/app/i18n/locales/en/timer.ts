import type { Message } from '../../types';

export const timer = {
  'timer.pause': 'Pause',
  'timer.placeholder': 'MM:SS',
  'timer.start': 'Start',
} as const satisfies Record<string, Message>;
