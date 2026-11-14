import type { Message } from '../../types';

export const player = {
  'player.frozen': 'Player view paused',
  'player.unfrozen': 'Player view playing again',
  'player.nothingToFreeze': 'Players are not shown this scene yet, so there is nothing to pause',
  'player.notOpen': 'Player window is not open',
  'player.isMain': 'Error: Player window is the main window',
  'player.connecting': 'Connecting to game session…',
  'player.paused': 'Camera paused',
  'player.title': 'Atlas player view',
  'player.setupFailed': 'Failed to set up player window',
  'player.toggleFullScreen': 'Toggle player window full screen',
} as const satisfies Record<string, Message>;
