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
  'playerBar.freeze': 'Pause the player view',
  'playerBar.unfreeze': 'Play: the player view follows you again',
  'playerBar.freezeTrueScale': 'With TrueScale on, pin the players on the frame on your map',
  'playerBar.takeBack': 'Take back the handout',
  'playerBar.openHint': 'Show the presented scene on a screen at the table too',
  'playerBar.freezeOnline': "Online players can't move their tokens while paused",
  'playerBar.playMode': 'Play mode',
  'playerBar.modeTable': 'Token control',
  'playerBar.modeRemote': 'Remote control',
  'playerBar.modeTableHint': 'Each player moves their tokens on their own map',
  'playerBar.modeRemoteHint': 'Phones are remotes for the shared screen',
} as const satisfies Record<string, Message>;
