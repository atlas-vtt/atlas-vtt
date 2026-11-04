import type { FieldKey, FieldValue } from '../model/templateTypes';

/** A path into the frontmatter: a top-level key, then list indexes or map keys. */
export type FieldPath = readonly (string | number)[];

/**
 * One change to a statblock note's frontmatter. Every patch carries what the
 * edit started from (`base`, or the item itself for list operations), so it
 * applies only where the note still holds that value.
 */
export type NotePatch =
  | { op: 'set'; path: FieldPath; base: FieldValue | undefined; next: FieldValue }
  | { op: 'delete'; path: FieldPath; base: FieldValue }
  | { op: 'insert'; list: FieldKey; after: FieldValue | null; item: FieldValue }
  | { op: 'remove'; list: FieldKey; item: FieldValue }
  | { op: 'move'; list: FieldKey; item: FieldValue; after: FieldValue | null }
  | { op: 'renameKey'; from: FieldKey; to: FieldKey };

export interface PatchResult {
  text: string;
  applied: NotePatch[];
  conflicts: NotePatch[];
}
