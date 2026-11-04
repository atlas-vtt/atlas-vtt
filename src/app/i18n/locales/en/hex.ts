import type { Message } from '../../types';

export const hex = {
  'hex.changeNote': 'Change Note',
  'hex.unlink': 'Unlink Hex',
} as const satisfies Record<string, Message>;
