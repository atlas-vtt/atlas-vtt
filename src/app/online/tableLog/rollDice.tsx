import type { SharedDie, SharedRoll } from '../protocol/index.ts';
import type { ReactElement } from 'react';
import { dieLabel } from '../../tools/diceLabels';
import { classes } from './classes.ts';

/** One die as the list shows it: its text, and what sets it apart (`atlas-online-log__die--<modifier>`). */
export interface DieView {
  readonly text: string;
  readonly modifiers: readonly string[];
}

/**
 * How one die of a roll is shown: its label, marked on the high or low side, as a success or a
 * failure, or struck through where it counts for nothing (dropped, or rolled again).
 */
export function dieView(rolls: readonly SharedDie[], index: number): DieView {
  const die = rolls[index]!;
  const modifiers: string[] = [];
  if (die.dropped === true) modifiers.push('dropped');
  else if (die.rerolled === true) modifiers.push('rerolled');
  else {
    if (die.value === die.max) modifiers.push('max');
    if (die.value === (die.min ?? 1)) modifiers.push('min');
    if (die.success === true) modifiers.push('success');
    if (die.failure === true) modifiers.push('failure');
  }
  return { text: dieLabel(rolls, index), modifiers };
}

/** A number with its sign: "+3", "−2". */
const signed = (amount: number): string => (amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`);

/**
 * The constants a roll adds, as the dice list ends with them: the unnamed ones' sum where it is not 0
 * ("+3"), then each named one ("−1 Str mod"), as Atlas's roll steps them.
 */
export function constantChips(roll: Pick<SharedRoll, 'modifiers' | 'namedModifiers'>): string[] {
  const named = roll.namedModifiers ?? [];
  const plain = named.reduce((rest, term) => rest - term.value, roll.modifiers);
  return [...(plain === 0 ? [] : [signed(plain)]), ...named.map((term) => `${signed(term.value)} ${term.label}`)];
}

/**
 * A roll's formula as a line reads it: each labelled constant a term of its own (`1d20+4-1[Str mod]`
 * reads `1d20+4 − 1 Str mod`), where the roll names its constants; a label of dice stays.
 */
export function formulaLine(roll: Pick<SharedRoll, 'formula' | 'namedModifiers'>): string {
  if (roll.namedModifiers === undefined) return roll.formula;
  return roll.formula.replace(/(^|[+\-(])(\d+)\[([^\]]+)\]/g, (_, before: string, amount: string, label: string) => {
    if (before === '+' || before === '-') return ` ${before === '-' ? '−' : '+'} ${amount} ${label}`;
    return `${before}${amount} ${label}`;
  });
}

/** The dice of a roll and the constants it adds, each in a chip: the one place a roll's dice are written out. */
export function RollDice({ roll, id }: { readonly roll: SharedRoll; readonly id?: string }): ReactElement {
  return (
    <div id={id} className="atlas-online-log__roll-dice">
      {roll.rolls.map((_, index) => {
        const { text, modifiers } = dieView(roll.rolls, index);
        return <span key={index} className={classes('atlas-online-log__die', ...modifiers.map((modifier) => `atlas-online-log__die--${modifier}`))}>{text}</span>;
      })}
      {constantChips(roll).map((chip, index) => <span key={`constant-${index}`} className="atlas-online-log__die">{chip}</span>)}
    </div>
  );
}

/** The class a roll's crit gives what shows its total. */
export function critClass(roll: SharedRoll, base: string): string | null {
  if (roll.crit === 'high') return `${base}--crit-success`;
  return roll.crit === 'low' ? `${base}--crit-fail` : null;
}
