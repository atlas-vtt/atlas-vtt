import type { Message } from '../../types';

export const text = {
  'text.add': 'Add text',
  'text.placeholder': 'Enter your text…',
  'text.editTitle': 'Edit text',
} as const satisfies Record<string, Message>;
