import type { Message } from '../../types';

export const tabletDiag = {
  'tabletDiag.command': 'Tablet diagnostics',
} as const satisfies Record<string, Message>;
