import type { Message } from '../../types';

export const editToken = {
  'editToken.none': 'None',
  'editToken.statblockDefault': 'Statblock default: {value}',
  'editToken.title': 'Edit token',
  'editToken.name': 'Name',
  'editToken.namePlaceholder': 'Token name',
  'editToken.showNameplate': 'Show nameplate',
  'editToken.speed': 'Speed',
  'editToken.speedDefault': 'Default: {value}',
  'editToken.resources': 'Resources',
  'editToken.token': 'Token',
  'editToken.resetStatblock': 'Reset to statblock default',
  'editToken.sounds': 'Sounds',
  'editToken.soundsHint': 'Played from the token\'s menu, on this computer only.',
  'editToken.addSound': 'Add sound',
  'editToken.soundsFull': 'A token holds up to {max} sounds.',
  'editToken.soundVolume': 'Volume of {name}',
} as const satisfies Record<string, Message>;
