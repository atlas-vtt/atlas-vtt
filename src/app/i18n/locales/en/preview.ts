import type { Message } from '../../types';

export const preview = {
  'preview.loading': 'Loading...',
  'preview.pin': 'Pin window',
  'preview.unpin': 'Unpin window',
  'preview.openFile': 'Open file',
  'preview.close': 'Close window',
  'preview.notFound': 'Error: File not found',
  'preview.openLinkFailed': 'Could not open the linked note',
} as const satisfies Record<string, Message>;
