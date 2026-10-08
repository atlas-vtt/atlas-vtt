import type { Message } from '../../types';

export const dice = {
  'dice.formulaError.syntax': 'Use dice and numbers separated by + or −, such as 2d6+3. Dice must have 2–1,000 faces and numbers at most 4 digits.',
  'dice.formulaError.length': 'A dice formula can have at most 64 characters.',
  'dice.formulaError.terms': 'A dice formula can have at most 10 terms.',
  'dice.formulaError.dice': 'A dice formula can roll at most 100 dice before explosions.',
  'dice.formulaError.faces': 'Dice must have between 2 and 1,000 faces.',
  'dice.clearHistory': 'Clear history',
  'dice.clearSelection': 'Clear selection',
  'dice.closeHint': 'Close (Enter or Esc)',
  'dice.details': 'Details',
  'dice.log': 'Dice Log',
  'dice.noRolls': 'No rolls yet',
  'dice.pin': 'Pin panel open',
  'dice.rollAgain': 'Roll again',
  'dice.unknown': 'Unknown',
  'dice.unpin': 'Unpin panel',
  'dice.player': 'Player',
  'dice.rollFormula': 'Roll {formula}',
  'dice.showRollsToPlayers': 'Show my rolls to players',
  'dice.showRollsToPlayersHint': 'Your rolls appear in the player window too.',
} as const satisfies Record<string, Message>;
