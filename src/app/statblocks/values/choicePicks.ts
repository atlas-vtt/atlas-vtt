/**
 * The picks of a choice field that takes several options or a number with
 * each, and the one line a note stores them as: "darkvision 60 ft.,
 * blindsight 10 ft.", "Common, Elvish". It is the line a statblock writes by
 * hand, so Fantasy Statblocks, Atlas's own reading (senses for vision) and
 * notes written before the field had options read it as before. A part of
 * the line that is no pick is kept as it is written. Pure.
 */

import type { FieldValue, TemplateField } from '../model/templateTypes';
import { splitListText } from './listText';
import { formatNumber, parseNumberText } from './numberText';
import { quoted, valueText } from './valueText';

export type ChoiceShape = Pick<TemplateField, 'options' | 'open' | 'several' | 'numbered' | 'unit'>;

export interface ChoicePick {
  /** The option as the template spells it; in an open field, what was typed. */
  option: string;
  /** With `numbered`: the pick's number, null while it has none. */
  number: number | null;
  /** With `numbered`: what follows the number, as read ("ft.", or "" for "passive Perception 12"); a new pick takes the field's unit. */
  unit: string;
}

export interface ChoiceRead {
  picks: ChoicePick[];
  /** Parts of the line that are no pick: in a field without `open`, text that names no option. */
  unread: string[];
}

/** Whether a choice field is edited as picks: several of its options, or a number with each. */
export function picksChoice(field: Pick<TemplateField, 'type' | 'several' | 'numbered'>): boolean {
  return field.type === 'choice' && (field.several === true || field.numbered === true);
}

const NUMBER_AND_REST = /^([+-]?\d+(?:\.\d+)?)(.*)$/;

/** The field's option the part starts with, the longest where several do ("Small" and "Small swarm"). */
function optionAtStart(options: readonly string[], part: string): string | undefined {
  const lower = part.toLowerCase();
  let found: string | undefined;
  for (const option of options) {
    const wanted = option.trim().toLowerCase();
    if (!wanted || !lower.startsWith(wanted)) continue;
    const next = part.charAt(wanted.length);
    if (next !== '' && !/\s/.test(next)) continue;
    if (!found || wanted.length > found.trim().length) found = option;
  }
  return found;
}

/** What follows an option in a numbered field: nothing, or a number and its unit. */
function numberAfter(rest: string, unit: string | undefined): Pick<ChoicePick, 'number' | 'unit'> | null {
  if (rest === '') return { number: null, unit: unit ?? '' };
  const match = NUMBER_AND_REST.exec(rest.replace(/[−–]/g, '-'));
  const number = match?.[1] === undefined ? null : parseNumberText(match[1]);
  if (number === null) return null;
  const tail = (match?.[2] ?? '').trim();
  if (tail === '') return { number, unit: '' };
  return unit !== undefined && tail.toLowerCase() === unit.trim().toLowerCase() ? { number, unit: tail } : null;
}

/** One part of the line as a pick, or null where it is none. */
function readPart(field: ChoiceShape, part: string): ChoicePick | null {
  const option = optionAtStart(field.options ?? [], part);
  if (option !== undefined) {
    const rest = part.slice(option.trim().length).trim();
    if (!field.numbered) return rest === '' ? { option, number: null, unit: '' } : null;
    const number = numberAfter(rest, field.unit);
    if (number) return { option, ...number };
  }
  if (!field.open) return null;
  if (!field.numbered) return { option: part, number: null, unit: '' };
  // An option of the reader's own: the words before the number.
  const words = /^(.*?\S)\s+([+-]?\d.*)$/.exec(part);
  const number = words?.[2] === undefined ? null : numberAfter(words[2], field.unit);
  return words?.[1] !== undefined && number ? { option: words[1], ...number } : { option: part, number: null, unit: '' };
}

/** The parts a stored value is made of: the items of a list, else its line, split at commas only where several are taken. */
function partsOf(field: ChoiceShape, value: FieldValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((item) => valueText(item).trim()).filter((item) => item !== '');
  const text = valueText(value).trim();
  if (text === '') return [];
  return field.several ? splitListText(text) : [text];
}

/** The picks a stored value holds, with the parts that are none. */
export function readChoice(field: ChoiceShape, value: FieldValue | undefined): ChoiceRead {
  const picks: ChoicePick[] = [];
  const unread: string[] = [];
  for (const part of partsOf(field, value)) {
    const pick = readPart(field, part);
    if (pick) picks.push(pick);
    else unread.push(part);
  }
  return { picks, unread };
}

/** One pick as the line writes it: "darkvision 60 ft.", "fly", "Elvish". */
export function pickText(pick: ChoicePick): string {
  if (pick.number === null) return pick.option;
  return [pick.option, formatNumber(pick.number), pick.unit].filter((part) => part !== '').join(' ');
}

/** The picks in the order of the field's options; picks of no option, and unread parts, after them as they came. */
function inOptionOrder(field: ChoiceShape, picks: readonly ChoicePick[]): ChoicePick[] {
  const order = new Map((field.options ?? []).map((option, index) => [option, index]));
  return picks
    .map((pick, index) => ({ pick, index, rank: order.get(pick.option) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ pick }) => pick);
}

/** The line a note stores for the picks; unread parts stay as they were written. Empty when nothing is picked. */
export function choiceText(field: ChoiceShape, read: ChoiceRead): string {
  return [...inOptionOrder(field, read.picks).map(pickText), ...read.unread].join(', ');
}

/** A new pick of `option`, with the field's unit where it takes a number. */
export function newPick(field: ChoiceShape, option: string): ChoicePick {
  return { option, number: null, unit: field.numbered ? field.unit?.trim() ?? '' : '' };
}

/** The options not picked yet: what the list offers to add. A field taking one offers every option. */
export function optionsLeft(field: ChoiceShape, picks: readonly ChoicePick[]): string[] {
  if (!field.several) return [...(field.options ?? [])];
  const taken = new Set(picks.map((pick) => pick.option.toLowerCase()));
  return (field.options ?? []).filter((option) => !taken.has(option.toLowerCase()));
}

/** Why parts of the line are no picks ("“truesight 5 miles” isn't one of darkvision, blindsight with a number."), or null. */
export function unreadProblem(field: ChoiceShape, unread: readonly string[]): string | null {
  const first = unread[0];
  if (first === undefined) return null;
  const options = (field.options ?? []).join(', ');
  const number = field.numbered ? `, with a number${field.unit?.trim() ? ` in ${field.unit.trim()}` : ''}` : '';
  const sentence = `${quoted(first)} isn't one of ${options}${number}`;
  // A unit written with its own full stop ("ft.") ends the sentence.
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}
