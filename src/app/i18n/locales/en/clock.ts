import type { Message } from '../../types';

export const clock = {
  'clock.clear': 'Clear a segment',
  'clock.fill': 'Fill a segment',
} as const satisfies Record<string, Message>;
