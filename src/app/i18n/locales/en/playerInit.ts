import type { Message } from '../../types';

export const playerInit = {
  'playerInit.conditions': 'Conditions',
  'playerInit.defeated': 'Defeated',
  'playerInit.delayed': 'Delayed',
  'playerInit.order': 'Initiative order',
  'playerInit.round': 'Round {round}',
} as const satisfies Record<string, Message>;
