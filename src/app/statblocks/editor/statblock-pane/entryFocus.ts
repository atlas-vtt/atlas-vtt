/** Where focus goes in a list being edited after a move, and where its caret stood. Pure but for reading the caret. */

/** Where the entry at `index` stands once the entry at `from` moved to `to`. */
export function movedFocusIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  if (from < index && to >= index) return index - 1;
  if (from > index && to <= index) return index + 1;
  return index;
}

/** The caret (selection start and end) of a text field; undefined for anything else. */
export function typingCaret(element: Element | null): readonly [number, number] | undefined {
  const field = element as Partial<HTMLInputElement> | null;
  const start = field?.selectionStart;
  const end = field?.selectionEnd;
  return typeof start === 'number' && typeof end === 'number' ? [start, end] : undefined;
}
