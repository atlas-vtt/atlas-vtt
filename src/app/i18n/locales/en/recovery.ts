import type { Message } from '../../types';

export const recovery = {
  'recovery.uncertain': 'Could not verify whether the token was saved. Import stopped; keep its image and check vault storage before retrying.',
} as const satisfies Record<string, Message>;
