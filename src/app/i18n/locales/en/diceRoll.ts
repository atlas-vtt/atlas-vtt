import type { Message } from '../../types';

export const diceRoll = {
  'diceRoll.roll': 'Roll',
  'diceRoll.label': 'Roll',
  'diceRoll.clear': 'Clear',
  'diceRoll.modifier': 'Modifier',
  'diceRoll.decreaseModifier': 'Decrease modifier',
  'diceRoll.increaseModifier': 'Increase modifier',
  'diceRoll.addDie': 'Add a d{sides}',
  'diceRoll.addDieHeld': 'Add a d{sides}, {held} in the tray',
  'diceRoll.takeBack': 'Take one d{sides} back',
  'diceRoll.trayEmpty': 'The tray is empty.',
  'diceRoll.hide': 'Hide roll',
  'diceRoll.rolling': 'Rolling {formula}',
  'diceRoll.rolled': '{label}: rolled {total}',
  'diceRoll.tensUnits': 'Tens {tens}, units {units}',
  'diceRoll.manyDice': '{number} dice, {total}',
  'diceRoll.folded': '{faces} on the d{sides} counts {values}',
} as const satisfies Record<string, Message>;
