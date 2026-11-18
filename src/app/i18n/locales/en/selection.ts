import type { Message } from '../../types';

export const selection = {
  'selection.add': 'Add',
  'selection.bar': 'Selection',
  'selection.selectMore': 'Select more',
  'selection.more': 'More',
  'selection.paste': 'Paste',
  'selection.pasteHere': 'Paste here',
  'selection.selectAll': 'Select all',
} as const satisfies Record<string, Message>;
