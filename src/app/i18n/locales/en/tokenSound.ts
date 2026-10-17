import type { Message } from '../../types';

export const tokenSound = {
  'tokenSound.play': 'Play sound',
  'tokenSound.stop': 'Stop sounds',
  'tokenSound.missing': 'The sound "{name}" is no longer in the vault.',
  'tokenSound.tooLarge': 'The sound "{name}" is larger than 20 MB, too large to play.',
  'tokenSound.unreadable': 'The sound "{name}" could not be played: Obsidian cannot read its file as audio.',
  'tokenSound.unavailable': 'Sounds cannot play here: this device offers no audio.',
} as const satisfies Record<string, Message>;
