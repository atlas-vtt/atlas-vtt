import type { Message } from '../../types';

export const editToken = {
  'editToken.none': 'None',
  'editToken.statblockDefault': 'Statblock default: {value}',
  'editToken.title': 'Edit Token',
  'editToken.name': 'Name',
  'editToken.namePlaceholder': 'Token name',
  'editToken.showNameplate': 'Show nameplate',
  'editToken.resources': 'Resources',
  'editToken.token': 'Token',
  'editToken.resetStatblock': 'Reset to statblock default',
} as const satisfies Record<string, Message>;
