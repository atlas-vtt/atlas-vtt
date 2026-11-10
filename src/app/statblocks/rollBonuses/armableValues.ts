/**
 * The values of a card that add to rolls: each whole number a Value, Metric
 * or Labels and values block with `addsToRolls` shows, by its id (`bonusId`),
 * with the label a roll names it by. Worked out once per card from what it
 * shows; the blocks draw their switches from it, and a roll adds the armed ones
 * as they are at that moment. Pure.
 */

import { isContainerBlock, mayAddToRolls, type FieldKey, type TemplateBlock } from '../model/templateTypes';
import { blockDisplay } from '../render/blockDisplay';
import type { SheetState } from '../render/sheetState';
import { numericValue } from '../values/numberText';
import { normalisePairs, pairName } from '../values/pairValues';
import type { FieldValue } from '../model/templateTypes';

export interface ArmableValue {
  label: string;
  value: number;
}

export type ArmableValues = ReadonlyMap<string, ArmableValue>;

/** A value's identity in its statblock: its field, and the pair's name within it for a Labels and values entry. */
export function bonusId(field: FieldKey, pair?: string): string {
  return JSON.stringify(pair === undefined ? [field] : [field, pair]);
}

/** The whole number a value holds, as a roll can add it; null for anything else. */
function wholeNumber(value: FieldValue | undefined): number | null {
  const number = numericValue(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

/** A field that holds a number by its type, and its whole number; null otherwise. */
function numberField(key: FieldKey, sheet: SheetState): number | null {
  return key !== '' && sheet.fields.get(key)?.type === 'number' ? wholeNumber(sheet.reader(key)) : null;
}

function addBlock(block: TemplateBlock, sheet: SheetState, found: Map<string, ArmableValue>): void {
  const add = (id: string, label: string, value: number | null): void => {
    if (value !== null && !found.has(id)) found.set(id, { label, value });
  };
  const labelOf = (key: FieldKey): string => sheet.fields.get(key)?.label ?? key;
  switch (block.type) {
    case 'stat':
      return add(bonusId(block.field), block.label ?? labelOf(block.field), numberField(block.field, sheet));
    case 'metric':
      for (const key of block.fields) add(bonusId(key), labelOf(key), numberField(key, sheet));
      return;
    case 'pairs': {
      const label = block.label ?? labelOf(block.field);
      for (const pair of normalisePairs(sheet.reader(block.field))) add(bonusId(block.field, pair.key), pairName(pair.key) || label, wholeNumber(pair.value));
      return;
    }
    default:
      return;
  }
}

/** The values the card's blocks show that add to rolls, by id; blocks the card hides or shows a stand-in for add none. */
export function armableValues(blocks: readonly TemplateBlock[], sheet: SheetState): ArmableValues {
  const found = new Map<string, ArmableValue>();
  const visit = (list: readonly TemplateBlock[]): void => {
    for (const block of list) {
      if (isContainerBlock(block)) visit(block.blocks);
      else if (mayAddToRolls(block) && block.addsToRolls && blockDisplay(block, sheet)?.state === 'value') addBlock(block, sheet, found);
    }
  };
  visit(blocks);
  return found;
}
