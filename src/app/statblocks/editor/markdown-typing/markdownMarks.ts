/**
 * Obsidian's formatting hotkeys on a plain text field (Mod+B, Mod+I): the
 * selection is wrapped in the mark, or loses it where it already has it, and
 * an empty selection gets an empty pair with the caret inside. Pure.
 */

export type InlineMark = '**' | '*';

/** A field's text and its selection. */
export interface TextSelection {
  text: string;
  start: number;
  end: number;
}

/** One replacement that does it: `insert` in place of `from`–`to`, then the selection `start`–`end` in the new text. */
export interface MarkEdit {
  from: number;
  to: number;
  insert: string;
  start: number;
  end: number;
}

/** How many `char` stand in a row from `at`, going forwards (`step` 1) or backwards (-1, counting from `at - 1`). */
function runAt(text: string, at: number, step: 1 | -1, char: string): number {
  let count = 0;
  let index = step === 1 ? at : at - 1;
  while (index >= 0 && index < text.length && text[index] === char) {
    count += 1;
    index += step;
  }
  return count;
}

/** Whether a run of stars says the mark: bold is two of them (three with italic), italic an odd number. */
function runHas(run: number, mark: InlineMark): boolean {
  return mark === '**' ? run >= 2 : run % 2 === 1;
}

/** The text with the mark toggled on its selection. */
export function toggleMark({ text, start, end }: TextSelection, mark: InlineMark): MarkEdit {
  const size = mark.length;
  const char = mark[0] ?? '*';
  const selected = text.slice(start, end);

  // The mark stands right around the selection (`**|word|**`, an empty `**|**`): it goes.
  if (runHas(runAt(text, start, -1, char), mark) && runHas(runAt(text, end, 1, char), mark)) {
    return { from: start - size, to: end + size, insert: selected, start: start - size, end: end - size };
  }
  // The selection holds the mark at both ends (`|**word**|`): the mark goes, the word stays selected.
  if (selected.length >= 2 * size && runHas(runAt(selected, 0, 1, char), mark) && runHas(runAt(selected, selected.length, -1, char), mark)) {
    const inner = selected.slice(size, selected.length - size);
    return { from: start, to: end, insert: inner, start, end: start + inner.length };
  }
  // Spaces at the selection's ends stay outside the mark, as Obsidian keeps them (`**word** `).
  const lead = selected.length - selected.trimStart().length;
  const word = selected.trim();
  const from = word ? start + lead : start;
  const to = word ? from + word.length : end;
  const inner = word || selected;
  return { from, to, insert: `${mark}${inner}${mark}`, start: from + size, end: from + size + inner.length };
}

/** The text after `edit`. */
export function applyMarkEdit(text: string, edit: MarkEdit): string {
  return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}
