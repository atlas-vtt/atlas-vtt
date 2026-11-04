import type { Message } from '../../types';

export const history = {
  'history.redo': 'Redo',
  'history.undo': 'Undo',
} as const satisfies Record<string, Message>;
