import type { Message } from '../../types';

/** The remote view: a map view another plugin feeds. Its title and status texts come from that plugin. */
export const remote = {
  'remote.defaultTitle': 'Remote view',
  'remote.rollDiceCount': 'Roll 1 to {max} dice.',
  'remote.rollNotSent': 'The roll could not be sent.',
  'remote.cannotRollAgain': "Can't roll that again.",
  'remote.fogTooLarge': 'This scene has too much fog to show, so the map stays covered.',
} as const satisfies Record<string, Message>;
