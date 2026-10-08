import type { Message } from '../../types';

export const player = {
  'player.frozen': 'Player view camera frozen',
  'player.unfrozen': 'Player view camera unfrozen',
  'player.nothingToFreeze': 'Players are not shown this scene yet, so there is nothing to freeze',
  'player.notOpen': 'Player window is not open',
  'player.isMain': 'Error: Player window is the main window',
  'player.connecting': 'Connecting to game session...',
  'player.paused': 'Camera paused',
  'player.title': 'Atlas player view',
  'player.setupFailed': 'Failed to set up player window',
} as const satisfies Record<string, Message>;
