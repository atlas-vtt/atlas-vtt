import type { Message } from '../../types';

export const atlasLinks = {
  'atlasLinks.copied': 'Link copied. Paste it into a note, with ! before it to embed it.',
  'atlasLinks.copyLink': 'Copy link',
  'atlasLinks.encounterMissing': 'This encounter is no longer in your library.',
  'atlasLinks.fileMissing': 'Its file is no longer in the vault.',
  'atlasLinks.insertCommand': 'Insert link to scene or encounter',
  'atlasLinks.insertPlaceholder': 'Link to a scene or encounter…',
  'atlasLinks.kindEncounter': 'Encounter',
  'atlasLinks.kindScene': 'Scene',
  'atlasLinks.more': 'More',
  'atlasLinks.openFailed': 'Could not open the scene',
  'atlasLinks.openWithAtlas': 'Open with Atlas',
  'atlasLinks.placeFailed': 'Could not place the encounter',
  'atlasLinks.placeOnMap': 'Place on map',
  'atlasLinks.startFight': 'Start fight',
  'atlasLinks.addBeside': 'Add to initiative without placing',
  'atlasLinks.snapshotMissing': 'This scene has no snapshot named "{name}".',
  'atlasLinks.snapshotOf': 'Snapshot of {scene}',
  'atlasLinks.tokenCount': { one: '{count} token', other: '{count} tokens' },
} as const satisfies Record<string, Message>;
