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
  /** The dice look setting: Atlas's own dice, or a look another plugin added (`dice.registerLook`). */
  /** The dice tray's colour picker (`dice.registerColours`). */
  'dice.colour.label': 'Colour of the next dice',
  'dice.colour.none': 'No colour',
  /** What the tray holds in one colour, e.g. "Fire: 2d6 + 1d20". */
  'dice.colour.group': '{name}: {dice}',
  'dice.look.name': 'Dice look',
  'dice.look.desc': "Atlas's dice in the colour and numbers below, or a look another plugin added. A look's numbers that it has no art for use the numbers below.",
  'dice.look.atlas': 'Atlas dice',
  /** A chosen look whose plugin is not loaded; `{id}` is the look's id. */
  'dice.look.notLoaded': '{id} (not loaded)',
  'dice.look.notLoadedHint': "The plugin that adds this look is not loaded, so Atlas's own dice show until it is.",
  /** A log entry that lists only some of a roll's dice; the total counts them all. */
  'dice.moreDice': '+{count} more',
  'dice.showRollsToPlayers': 'Show my rolls to players',
  'dice.showRollsToPlayersHint': 'Your rolls appear in the player window too.',
} as const satisfies Record<string, Message>;
