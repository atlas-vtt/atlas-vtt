import type { Message } from '../../types';

export const pinMenu = {
  'pinMenu.open': 'Open Note',
  'pinMenu.edit': 'Edit Pin',
  'pinMenu.copyLink': 'Copy link to pin',
  'pinMenu.linkCopied': 'Link to pin copied',
  'pinMenu.linkCopyFailed': 'Could not copy the link to the pin',
  'pinMenu.linkTargetMissing': 'This link points to a pin that no longer exists.',
  'pinMenu.rollEncounter': 'Roll Encounter',
  'pinMenu.readable': 'Show to players',
  'pinMenu.showName': 'Show name',
  'pinMenu.rename': 'Rename…',
  'pinMenu.renameTitle': 'Pin name',
  'pinMenu.openOnLevel': 'Opens on level',
  'pinMenu.levelAsLeft': 'The level last shown',
} as const satisfies Record<string, Message>;
