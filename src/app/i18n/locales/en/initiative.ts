import type { Message } from '../../types';

export const initiative = {
  'initiative.card': 'initiative card',
  'initiative.edit': 'Edit Initiative',
  'initiative.editHint': 'Enter to save · Esc to cancel',
  'initiative.remove': 'Remove from Initiative',
  'initiative.roll': 'Roll Initiative',
  'initiative.toBack': 'Move to Back',
  'initiative.toFront': 'Move to Front',
  'initiative.token': 'Token',
  'initiative.modifierField': 'Statblock Modifier Field',
  'initiative.modifierPlaceholder': 'Automatic: modifier, then initiative',
  'initiative.modifierHint': 'Leave blank to read modifier, then initiative. Enter a field path such as combat.initiative to use another field. Signed whole numbers are added to each roll; missing or invalid values add zero.',
  'initiative.modifierReadError': 'Could not read the linked statblocks. Initiative was not rolled. Try again after the notes finish loading.',
} as const satisfies Record<string, Message>;
