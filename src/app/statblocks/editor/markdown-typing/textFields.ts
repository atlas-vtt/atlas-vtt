/**
 * The pane's text fields as one kind of thing: inputs, text areas and the
 * plain-text editable span an ability's description is typed in: what they
 * hold, where the caret stands, and replacing a stretch of their text.
 */

import { caretIn, selectText, textOf } from '../statblock-pane/plainEditable';
import type { TextSelection } from './markdownMarks';

/** Marks a field whose text is no Markdown (a number, dice): formatting keys and link suggestions leave it alone. */
export const PLAIN_TEXT_ATTRIBUTE = 'data-atlas-plain-text';
export const PLAIN_TEXT = { [PLAIN_TEXT_ATTRIBUTE]: '' } as const;

const TEXT_INPUT_TYPES = new Set(['text', 'search']);
const NUMBER_MODES = new Set(['decimal', 'numeric']);
const EDITABLE = new Set(['', 'true', 'plaintext-only']);

function isTextControl(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  return element.instanceOf(HTMLTextAreaElement) || element.instanceOf(HTMLInputElement);
}

/** The field `target` is, where text is typed into it: a text input or area that takes typing, or an editable span. */
export function typedField(target: EventTarget | null): HTMLElement | null {
  const element = target as Partial<HTMLElement> | null;
  if (typeof element?.closest !== 'function' || typeof element.instanceOf !== 'function') return null;
  const field = element as HTMLElement;
  if (field.instanceOf(HTMLTextAreaElement)) return field.readOnly || field.disabled ? null : field;
  if (field.instanceOf(HTMLInputElement)) return TEXT_INPUT_TYPES.has(field.type) && !field.readOnly && !field.disabled ? field : null;
  return field.isContentEditable || EDITABLE.has(field.getAttribute('contenteditable') ?? 'false') ? field : null;
}

/** The field `target` is, where Markdown is typed into it: a typed field that is no number or dice. */
export function markdownField(target: EventTarget | null): HTMLElement | null {
  const field = typedField(target);
  if (!field || field.closest(`[${PLAIN_TEXT_ATTRIBUTE}]`)) return null;
  return field.instanceOf(HTMLInputElement) && NUMBER_MODES.has(field.inputMode) ? null : field;
}

/** The field's text and selection; null for an editable span the selection is not in. */
export function fieldSelection(field: HTMLElement): TextSelection | null {
  if (isTextControl(field)) {
    const end = field.value.length;
    return { text: field.value, start: field.selectionStart ?? end, end: field.selectionEnd ?? end };
  }
  const caret = caretIn(field);
  return caret ? { text: textOf(field), start: caret[0], end: caret[1] } : null;
}

/** Selects `start`–`end` in the field. */
export function selectInField(field: HTMLElement, start: number, end: number): void {
  if (isTextControl(field)) field.setSelectionRange(start, end);
  else selectText(field, start, end);
}

/**
 * Puts `insert` in place of `from`–`to` and selects `start`–`end` after it,
 * with the `input` event typing sends, so React and the pane's drafts follow.
 */
export function replaceInField(field: HTMLElement, from: number, to: number, insert: string, select: readonly [number, number]): void {
  if (isTextControl(field)) field.setRangeText(insert, from, to, 'end');
  else field.textContent = textOf(field).slice(0, from) + insert + textOf(field).slice(to);
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: insert }));
  selectInField(field, select[0], select[1]);
}
