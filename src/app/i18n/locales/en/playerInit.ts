import type { Message } from '../../types';

export const playerInit = {
  'playerInit.defeated': 'Defeated',
  'playerInit.delayed': 'Delayed',
  'playerInit.more': { one: '{count} more combatant', other: '{count} more combatants' },
  'playerInit.order': 'Initiative order',
  'playerInit.round': 'Round {round}',
} as const satisfies Record<string, Message>;
