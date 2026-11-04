import type { Message } from '../../types';

export const token = {
  'token.unknownCreature': 'Unknown Creature',
  'token.clickToName': 'Click to name',
  'token.size.medium': 'Medium (1×1)',
  'token.size.large': 'Large (2×2)',
  'token.size.huge': 'Huge (3×3)',
  'token.size.gargantuan': 'Gargantuan (4×4)',
  'token.kill': 'Kill',
  'token.show': 'Show',
  'token.hide': 'Hide',
  'token.saveEncounter': 'Save as Encounter',
  'token.addInitiative': 'Add to Initiative',
  'token.editStatblock': 'Edit Statblock',
  'token.makePlayerCharacter': 'Make player character',
  'token.noLongerPlayerCharacter': 'No longer a player character',
  'token.playerCharacterFailed': 'Could not change whether this token is a player character.',
  'token.linkFailed': 'Could not link the statblock',
  'token.ringColor': 'Ring Color',
  'token.reset': 'Reset (Full HP, Clear Status)',
} as const satisfies Record<string, Message>;
