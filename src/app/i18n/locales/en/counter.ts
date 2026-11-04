import type { Message } from '../../types';

export const counter = {
  'counter.decrease': 'Decrease',
  'counter.increase': 'Increase',
} as const satisfies Record<string, Message>;
