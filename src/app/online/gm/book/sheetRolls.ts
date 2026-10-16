import { bookLine, MAX_FORMULA } from '../../protocol/index.ts';
import type { TemplateBlock } from '../../../statblocks/model/templateTypes';
import { valueRoll } from '../../../statblocks/values/valueRolls';

/** Whether a block rolls the whole numbers it shows as a bonus ("Roll as a bonus"). */
export function rollableBlock(block: TemplateBlock): boolean {
  return 'rollable' in block && block.rollable === true;
}

/**
 * What a click on a value of the sheet rolls: the formula the Atlas card's link on the same text
 * rolls (`valueRoll`), where the whole value is one roll; null where it rolls nothing, or where the
 * formula is no line a page takes as a roll.
 */
export function sheetRoll(text: string, rollable: boolean): string | null {
  const roll = valueRoll(text, rollable);
  return roll === null ? null : bookLine(roll, MAX_FORMULA);
}

/**
 * The rolls of a table's cells, shaped as the cells the sheet sends (`shown`, null for a cell it
 * leaves empty) and read from the texts the card shows in them; undefined where no cell rolls.
 */
export function cellRolls(texts: readonly (readonly string[])[], shown: readonly (readonly (string | null)[])[], rollable: boolean): (string | null)[][] | undefined {
  const rolls = shown.map((row, r) => row.map((cell, c) => (cell === null ? null : sheetRoll(texts[r]?.[c] ?? '', rollable))));
  return rolls.some((row) => row.some((roll) => roll !== null)) ? rolls : undefined;
}
