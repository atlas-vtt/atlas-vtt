/**
 * Turns what someone typed into the value a field of its declared type stores.
 * The declared type decides, never the type of the old value. Text that does
 * not fit is never changed: it comes back raw with a problem in plain words,
 * so the pane can keep it as typed and flag it.
 */

import { parseRating } from '../../creatures/creatureValues';
import type { FieldType, FieldValue } from '../model/templateTypes';
import { choiceText, readChoice, unreadProblem, type ChoiceShape } from './choicePicks';
import { parseDiceNotation } from './diceNotation';
import { isDiceValue } from './diceValues';
import { isWholeNumberText, parseNumberText } from './numberText';
import { splitListText } from './listText';
import { parsePairText } from './pairValues';
import { quoted } from './valueText';
import { NUMBER_SUM, withReferencesAsOne } from './fillReferences';
import { namesReference } from './references';

/** `value: undefined` means the key is cleared. */
export type CoercionResult =
  | { ok: true; value: FieldValue | undefined }
  | { ok: false; raw: string; problem: string };

/** What a choice field accepts; other types ignore it. */
export type CoercionConstraints = ChoiceShape;

type Coercer = (text: string, input: string, constraints: CoercionConstraints | undefined) => CoercionResult;

const DICE_EXAMPLE = 'like 2d6 + 3';

function kept(value: FieldValue): CoercionResult {
  return { ok: true, value };
}

function refused(raw: string, problem: string): CoercionResult {
  return { ok: false, raw, problem };
}

function coerceNumber(text: string, input: string): CoercionResult {
  const value = parseNumberText(text);
  if (value !== null) return kept(value);
  // `10 + @dex` is kept as written: the card shows its total
  if (namesReference(text) && NUMBER_SUM.test(withReferencesAsOne(text).trim())) return kept(text);
  return refused(input, `${quoted(text)} isn't a number.`);
}

function coerceRating(text: string, input: string): CoercionResult {
  if (isWholeNumberText(text)) return coerceNumber(text, input);
  return parseRating(text) === null ? refused(input, `${quoted(text)} isn't a rating, like 3 or 1/4.`) : kept(text);
}

function coerceDice(text: string, input: string): CoercionResult {
  // `2d6 + @str` is kept as written: the card shows and rolls it with the number in
  if (isDiceValue(namesReference(text) ? withReferencesAsOne(text) : text)) return kept(text);
  const problem = parseDiceNotation(text) ? `${quoted(text)} rolls no dice, ${DICE_EXAMPLE}.` : `${quoted(text)} isn't dice, ${DICE_EXAMPLE}.`;
  return refused(input, problem);
}

/** Several options, or each with a number: the picks the text names, written as the field writes them. */
function coercePicks(text: string, input: string, constraints: CoercionConstraints): CoercionResult {
  const read = readChoice(constraints, text);
  const problem = (constraints.options ?? []).length > 0 ? unreadProblem(constraints, read.unread) : null;
  return problem === null ? kept(choiceText(constraints, read)) : refused(input, problem);
}

function coerceChoice(text: string, input: string, constraints: CoercionConstraints | undefined): CoercionResult {
  if (constraints && (constraints.several || constraints.numbered)) return coercePicks(text, input, constraints);
  const options = constraints?.options ?? [];
  const wanted = text.toLowerCase();
  const option = options.find((candidate) => candidate.trim().toLowerCase() === wanted);
  if (option !== undefined) return kept(option);
  if (constraints?.open || options.length === 0) return kept(text);
  return refused(input, `${quoted(text)} isn't one of ${options.join(', ')}.`);
}

/**
 * A table's values in slot order: numbers where they read as numbers, text as
 * typed. Values are parted at commas, semicolons, tabs and line breaks (a row
 * copied from a spreadsheet), and numbers also at spaces ("14 12 13"), so a
 * text value may hold spaces ("1 per day, d8").
 */
export function scoreValues(text: string): FieldValue[] {
  return text.split(/[,;\t\r\n]/).flatMap((part): FieldValue[] => {
    const words = part.trim().split(/\s+/).filter((word) => word !== '');
    const numbers = words.map(parseNumberText);
    if (numbers.every((value) => value !== null)) return numbers.filter((value): value is number => value !== null);
    return [part.trim()];
  });
}

function coerceScores(text: string): CoercionResult {
  return kept(scoreValues(text));
}

function coercePairs(text: string, input: string): CoercionResult {
  const pairs: FieldValue[] = [];
  for (const part of splitListText(text)) {
    const pair = parsePairText(part);
    if (!pair) return refused(input, `${quoted(part)} isn't a name and a number, like Dex +5.`);
    pairs.push({ [pair.key]: pair.value });
  }
  return kept(pairs);
}

const COERCERS: Readonly<Record<FieldType, Coercer>> = {
  text: (text) => kept(text),
  markdown: (_text, input) => kept(input.trimEnd()),
  number: coerceNumber,
  rating: coerceRating,
  dice: coerceDice,
  choice: coerceChoice,
  list: (text) => kept(splitListText(text)),
  scores: coerceScores,
  entries: (_text, input) => refused(input, 'Entries are added one at a time.'),
  pairs: coercePairs,
  image: (text) => kept(text),
  spells: (text) => kept(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')),
  counters: (_text, input) => refused(input, 'Counters are changed with their pips.'),
};

/**
 * The value `input` stores in a field of `type`. Blank input clears the key.
 * `constraints` are the field's choice options.
 */
export function coerce(type: FieldType, input: string, constraints?: CoercionConstraints): CoercionResult {
  const text = input.trim();
  if (text === '') return { ok: true, value: undefined };
  // A type from a newer template is not in the table; its text is kept as typed.
  const coercer = Object.hasOwn(COERCERS, type) ? COERCERS[type] : COERCERS.text;
  return coercer(text, input, constraints);
}
