import type { Message } from '../../types';

export const pinMenu = {
  'pinMenu.open': 'Open Note',
  'pinMenu.edit': 'Edit Pin',
  'pinMenu.rollEncounter': 'Roll Encounter',
  'pinMenu.readable': 'Show to players',
  'pinMenu.showName': 'Show name',
  'pinMenu.rename': 'Rename…',
  'pinMenu.renameTitle': 'Pin name',
  'pinMenu.openOnLevel': 'Opens on level',
  'pinMenu.levelAsLeft': 'The level last shown',
} as const satisfies Record<string, Message>;
