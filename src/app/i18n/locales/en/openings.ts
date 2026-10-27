import type { Message } from '../../types';

export const openings = {
  'openings.mode': 'Openings',
  'openings.needsLevels': 'Openings look down to the level below: add a level to the scene first',
  'openings.title': 'Opening',
  'openings.kind': 'What this area is',
  'openings.open': 'Open to below',
  'openings.floor': 'Floor',
  'openings.chasm': 'No level lies below this one: the opening shows black and tokens put down in it stay.',
  'openings.full': 'A level holds at most {count} openings and floors. Delete some to draw more.',
  'openings.fell': { one: '{count} token fell through to {name}', other: '{count} tokens fell through to {name}' },
} as const satisfies Record<string, Message>;
