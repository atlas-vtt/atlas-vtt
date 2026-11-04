import { inlineMarks, type InlineMark, type SharedRoll } from '../protocol/index.ts';

/** A piece of a message's text: words, a roll it rolled when it was said, or a roll button. */
export type TextSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'rolled'; readonly mark: InlineMark; readonly roll: SharedRoll }
  | { readonly kind: 'button'; readonly mark: InlineMark & { readonly mode: NonNullable<InlineMark['mode']> }; readonly index: number };

/**
 * A message's text in pieces: the rolls written into it (`inlineMarks`) apart from its words. A
 * rolled mark takes the next of `inline`, in order; a button keeps its index among all the marks,
 * which is how a roll answering it names it. A mark without its roll stays text as it was written.
 */
export function textSegments(text: string, inline: readonly SharedRoll[] | undefined): readonly TextSegment[] {
  const marks = inlineMarks(text);
  if (marks === null || marks.length === 0) return [{ kind: 'text', text }];
  const segments: TextSegment[] = [];
  let at = 0;
  let rolled = 0;
  const words = (end: number): void => {
    if (end > at) segments.push({ kind: 'text', text: text.slice(at, end) });
  };
  marks.forEach((mark, index) => {
    words(mark.start);
    if (mark.mode !== null) segments.push({ kind: 'button', mark: { ...mark, mode: mark.mode }, index });
    else {
      const roll = inline?.[rolled];
      rolled += 1;
      segments.push(roll === undefined ? { kind: 'text', text: text.slice(mark.start, mark.end) } : { kind: 'rolled', mark, roll });
    }
    at = mark.end;
  });
  words(text.length);
  return segments;
}
