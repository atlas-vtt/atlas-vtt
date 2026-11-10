/**
 * The text of a plain-text editable span (an ability's description typed in
 * the card's own line) and its caret. `contenteditable="plaintext-only"`
 * keeps line breaks as `\n`, and the span holds one text node.
 */

/** What the span holds, as the note will store it. */
export function textOf(element: HTMLElement): string {
  return element.textContent ?? '';
}

/** Puts the caret `offset` characters in, clamped to the text. */
export function placeCaret(element: HTMLElement, offset: number): void {
  selectText(element, offset, offset);
}

/** Selects the characters from `start` to `end`, clamped to the text. */
export function selectText(element: HTMLElement, start: number, end: number): void {
  const doc = element.ownerDocument;
  const selection = doc.getSelection();
  if (!selection) return;
  const node = element.firstChild ?? element;
  const length = node.textContent?.length ?? 0;
  const clamp = (offset: number): number => Math.max(0, Math.min(offset, length));
  const range = doc.createRange();
  range.setStart(node, clamp(start));
  range.setEnd(node, clamp(Math.max(start, end)));
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Where the caret stands in the span (start and end), when the selection is in it. */
export function caretIn(element: HTMLElement): readonly [number, number] | undefined {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer)) return undefined;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return [start, start + range.toString().length];
}

/** Puts `text` where the caret stands in the span (a line break typed with Shift+Enter), the caret after it. */
export function insertAtCaret(element: HTMLElement, text: string): void {
  const caret = caretIn(element) ?? [textOf(element).length, textOf(element).length];
  const current = textOf(element);
  element.textContent = current.slice(0, caret[0]) + text + current.slice(caret[1]);
  placeCaret(element, caret[0] + text.length);
}
