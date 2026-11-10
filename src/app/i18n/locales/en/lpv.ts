import type { Message } from '../../types';

export const lpv = {
  'lpv.alreadyOpen': 'Player window is already open',
  'lpv.interface': 'Interface',
  'lpv.notePreviews': 'Note previews',
  'lpv.notePreviewsHint': 'Note previews are not shared with the player window.',
  'lpv.openWindow': 'Open player window',
  'lpv.showCursors': 'Show everyone\'s cursors',
  'lpv.showDiceRolls': 'Show dice rolls',
  'lpv.view4k': 'Render up to 4K',
  'lpv.view4kHint': 'A 4K TV or an ultrawide gets a rendered pixel for every pixel of its screen instead of an upscaled 1440p picture, at up to 2.25 times the graphics work for the player view. This device only.',
  'lpv.showInitiative': 'Show initiative panel',
  'lpv.showWidgets': 'Show widgets',
  'lpv.tokens': 'Tokens',
} as const satisfies Record<string, Message>;
