import type { Message } from '../../types';

export const audio = {
  'audio.title': 'Sound Source',
  'audio.sound': 'Sound',
  'audio.preview': 'Preview sound',
  'audio.volume': 'Volume',
  'audio.range': 'Range',
  'audio.loop': 'Loop',
} as const satisfies Record<string, Message>;
