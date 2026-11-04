import type { Message } from '../../types';

export const text = {
  'text.default': 'Click to add text',
  'text.add': 'Add text',
  'text.placeholder': 'Enter your text...',
  'text.edit': 'Edit Text',
  'text.color': 'Text Color',
  'text.background': 'Background Color',
  'text.fontSize': 'Font Size',
  'text.bold': 'Bold',
  'text.italic': 'Italic',
  'text.editTitle': 'Edit text',
} as const satisfies Record<string, Message>;
