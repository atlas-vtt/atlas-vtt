import type { Message } from '../../types';

/** The bar below the scene tabs while the player window is open: TrueScale and the table TV's quick actions. */
export const playerBar = {
  'playerBar.bar': 'Player window',
  'playerBar.fullScreen': 'Full screen on the TV',
  'playerBar.fullScreenHint': 'Fills your second screen with the player window',
  'playerBar.leaveFullScreen': 'Leave full screen',
  'playerBar.connectScreen': 'Connect a second screen',
  'playerBar.curtainDown': 'Hide the map',
  'playerBar.curtainUp': 'Reveal the map',
  'playerBar.toggleCurtain': 'Hide or reveal the map on the player window',
  'playerBar.playersSee': 'What players see',
  'playerBar.close': 'Close player window',
  'playerBar.takeBack': 'Take back the handout',
} as const satisfies Record<string, Message>;
