/**
 * The `@` reference being typed in a field, and the text a picked name puts in its place. Pure: no
 * DOM, no statblock.
 */

/** A reference being typed: where its `@` stands, and the path typed after it up to the caret. */
export interface ReferenceQuery {
  readonly start: number;
  readonly typed: string;
}

/** An `@` that starts a reference (not one inside a word, as in an address) and the path typed after it. */
const TYPING = /(?:^|[^\w@])@([\w.-]*)$/;
/** The rest of a path written right after the caret, which a picked name takes the place of. */
const PATH_AFTER = /^[\w.-]*/;

/** The reference the text before the caret ends in, if one is being typed. */
export function referenceQueryBefore(before: string): ReferenceQuery | null {
  const typed = TYPING.exec(before)?.[1];
  return typed === undefined ? null : { start: before.length - typed.length - 1, typed };
}

/** The replacement a picked name makes: from after the `@` over what is typed and the path that goes on after the caret. */
export function referenceReplacement(text: string, query: ReferenceQuery, caret: number, name: string): { from: number; to: number; caret: number } {
  const from = query.start + 1;
  const to = caret + (PATH_AFTER.exec(text.slice(caret))?.[0].length ?? 0);
  return { from, to, caret: from + name.length };
}
