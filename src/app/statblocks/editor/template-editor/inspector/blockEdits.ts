/**
 * The inspector's edits (§7.4): pure changes of one block or one field of the
 * template, and running them through the session, each one `apply` and so one
 * undo step unless a gesture holds them together.
 */

import { updateField, type FieldChanges } from '../../../model/fieldOps';
import { fieldByKey } from '../../../model/fieldKeys';
import { updateBlock, type BlockChanges } from '../../../model/treeOps';
import { boundField } from '../../../model/treeQueries';
import type {
  BlockType, FieldKey, StatblockTemplate, TemplateBlock, TemplateField,
} from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';

/** The template with `changes` made to block `id` of `type`; the very template where nothing changes. */
export function withBlockChanges<T extends BlockType>(
  template: StatblockTemplate, id: string, type: T, changes: BlockChanges<T>,
): StatblockTemplate {
  const edit = updateBlock(template.layout, id, type, changes);
  return edit.ok && edit.layout !== template.layout ? { ...template, layout: edit.layout } : template;
}

/** One step: `changes` to block `id`, worked out on the template the session holds now. */
export function editBlock<T extends BlockType>(session: EditorSession, id: string, type: T, changes: BlockChanges<T>): void {
  session.apply((template) => withBlockChanges(template, id, type, changes));
}

/** One step: `changes` to the field `key`. */
export function editField(session: EditorSession, key: FieldKey, changes: FieldChanges): void {
  session.apply((template) => updateField(template, key, changes));
}

/** The field a block shows and edits, as the template holds it now. */
export function boundFieldOf(template: StatblockTemplate, block: TemplateBlock): TemplateField | undefined {
  const key = boundField(block);
  return key ? fieldByKey(template.fields, key) : undefined;
}

/** "STR, DEX, CON" → the labels, trimmed, empty ones dropped. */
export function listFromText(text: string): string[] {
  return text.split(',').map((item) => item.trim()).filter(Boolean);
}

/** A list as the inspector shows it in one input. */
export function textFromList(list: readonly string[] | undefined): string {
  return (list ?? []).join(', ');
}

/** Two lists hold the same items in the same order. */
export function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  return (a ?? []).join('\u0000') === (b ?? []).join('\u0000');
}
