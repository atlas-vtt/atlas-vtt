/**
 * Checks the converter's promises about code: an import keeps every piece of
 * a layout's JavaScript (in script blocks, `fsExtras` or `importedFrom.extras`)
 * unless it became a pattern, an option, a formula, a lookup table or a
 * Value's `rollFrom`, and its output parses.
 */

import { expect } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { callbackPattern, entryTextKey, modifierFormula, returnsItemUnchanged } from '../../../../src/app/statblocks/fs/fsCallbackPatterns';
import { diceCallbackKey } from '../../../../src/app/statblocks/fs/fsDiceCallbacks';
import { replacedIntegration } from '../../../../src/app/statblocks/fs/fsIntegrations';
import { lookupCallback } from '../../../../src/app/statblocks/fs/fsLookupCallbacks';
import { findCode, type CodePath } from '../../../../src/app/statblocks/model/fsCodeKeys';
import { isLegalSubtree } from '../../../../src/app/statblocks/model/treeEdit';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';

function valueAt(value: unknown, path: CodePath): unknown {
  let current = value;
  for (const step of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = Array.isArray(current) ? current[Number(step)] : (current as Record<string, unknown>)[String(step)];
  }
  return current;
}

function strings(value: unknown, into: string[]): void {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, into));
  else if (typeof value === 'object' && value !== null) Object.values(value).forEach((item) => strings(item, into));
}

/** Every text under the places `findCode` names. */
export function codeTexts(value: unknown): string[] {
  const texts: string[] = [];
  for (const path of findCode(value)) strings(valueAt(value, path), texts);
  return texts.filter((text) => text.trim() !== '');
}

/**
 * Code the converter may replace instead of keeping (a pattern, an option, a
 * formula, a lookup table, a Value's `rollFrom`), or leave out with the button
 * for a plugin Atlas stands in for. Where it cannot use what it read, it keeps
 * the code, so recognising it here hides no loss.
 */
function recognised(code: string): boolean {
  return callbackPattern(code) !== null || entryTextKey(code) !== null || returnsItemUnchanged(code) || modifierFormula(code) !== null
    || lookupCallback(code) !== null || diceCallbackKey(code) !== null || replacedIntegration({ type: 'action', callback: code }) !== null;
}

/** The layout's code that the template neither keeps nor expresses otherwise; empty when nothing was lost. */
export function lostCode(layout: unknown, template: StatblockTemplate): string[] {
  const kept = new Set(codeTexts(template));
  return codeTexts(layout).filter((code) => !kept.has(code) && !recognised(code));
}

/**
 * The template parses as written and after a save, with no problems, and the
 * editor can work on it: every container holds only what it may, ids are unique.
 */
export function expectParses(template: StatblockTemplate): void {
  for (const input of [template, serializeTemplate(template)]) {
    const parsed = parseTemplate(input);
    expect(parsed.status).toBe('ok');
    expect(parsed.problems).toEqual([]);
  }
  expect(template.layout.blocks.every(isLegalSubtree)).toBe(true);
  const ids = flattenReadingOrder(template.layout.blocks).map((block) => block.id);
  expect(new Set(ids).size).toBe(ids.length);
}
