import type { Message } from '../../types';

export const cover = {
  'cover.current': 'Current cover',
  'cover.hint': 'Shown when people import it',
  'cover.none': 'No cover',
  'cover.noneHint': 'Export without a cover image',
  'cover.title': 'Cover',
  'cover.upload': 'Upload image',
  'cover.uploadHint': 'Use an image of your own as the cover',
  'cover.uploaded': 'Uploaded image',
} as const satisfies Record<string, Message>;
