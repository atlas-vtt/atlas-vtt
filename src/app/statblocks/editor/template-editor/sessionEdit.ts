/**
 * Running pure template edits through a session: each is one `apply`, so one
 * undo step, worked out on the template the session holds at that moment and
 * never on one read earlier.
 */

import { tidyRows } from '../../model/templateGrid';
import type { TreeEdit, TreeRefusal } from '../../model/treeEdit';
import type { StatblockTemplate, TemplateLayout } from '../../model/templateTypes';
import type { BlockSelection } from './selection';
import type { EditorSession, SessionSnapshot } from './sessionTypes';
import { t } from '../../../i18n';

/** What an editor action leaves behind: the selection, and what to say about it. */
export interface EditOutcome {
  /** The selection afterwards; unset leaves it as it is. */
  select?: BlockSelection | undefined;
  /** Said in the view's live region. */
  announce?: string | undefined;
  /** Names of what a delete took away, for the "Speed deleted" toast. */
  deleted?: string | undefined;
}

export const NOTHING: EditOutcome = {};

/** Why a template cannot be changed (one from a newer Atlas), in the words the editor says it; null for an editable one. */
export function readOnlyMessage(snapshot: Pick<SessionSnapshot, 'readOnly'>): string | null {
  if (!snapshot.readOnly) return null;
  return t('templateEditor.updateToEdit');
}

/** Why a part of the header stays where it is. */
export const HEADER_MESSAGE = t('templateEditor.headerStays');

/** A refused edit in plain words, where the refusal is one the user can act on. */
export function refusalMessage(reason: TreeRefusal): string | null {
  switch (reason) {
    case 'not-allowed-here': return t('templateEditor.edit.notHere');
    case 'header': return HEADER_MESSAGE;
    case 'not-siblings': return t('templateEditor.edit.notSiblings');
    case 'not-adjacent': return t('templateEditor.edit.notAdjacent');
    case 'cannot-turn-into': return t('templateEditor.edit.cannotTurn');
    case 'not-a-container': return t('templateEditor.edit.notContainer');
    default: return null;
  }
}

/**
 * Applies `edit` to the session's template and returns what it computed, or
 * null where the session took no edit (a read-only template). `edit` returns
 * the next template and its own result; the same template makes no step.
 */
export function applyEdit<T>(
  session: EditorSession, edit: (template: StatblockTemplate) => { template: StatblockTemplate; result: T },
): T | null {
  const out: { result: T | null } = { result: null };
  session.apply((template) => {
    const next = edit(template);
    out.result = next.result;
    return next.template;
  });
  return out.result;
}

/**
 * Applies a pure edit of one tile that keeps it selected (a number or column
 * added, moved or taken out): `said` where it changed the template, nothing
 * where it changed nothing, and why where the session took no edit.
 */
export function editTile(
  session: EditorSession, blockId: string, edit: (template: StatblockTemplate) => StatblockTemplate, said: EditOutcome,
): EditOutcome {
  const changed = applyEdit(session, (template) => {
    const next = edit(template);
    return { template: next, result: next !== template };
  });
  if (changed === null) return { announce: readOnlyMessage(session.getSnapshot()) ?? undefined };
  return changed ? { select: [blockId], ...said } : NOTHING;
}

/**
 * Applies a tree operation to the layout; a refused one changes nothing. The
 * grid's rows are tidied in the same step (`tidyRows`): a row the edit left
 * with one tile becomes that tile.
 */
export function applyTree(
  session: EditorSession, op: (layout: TemplateLayout, template: StatblockTemplate) => TreeEdit,
): TreeEdit | null {
  return applyEdit(session, (template) => {
    const edit = op(template.layout, template);
    if (!edit.ok || edit.layout === template.layout) return { template, result: edit };
    const layout = tidyRows(edit.layout);
    return { template: { ...template, layout }, result: { ...edit, layout } };
  });
}

/**
 * Runs several tree operations as one step, each on the layout the one before
 * left; all or nothing, so a refusal anywhere keeps the template as it was.
 */
export function chainTree(
  layout: TemplateLayout, ops: ReadonlyArray<(layout: TemplateLayout) => TreeEdit>,
): TreeEdit {
  let current = layout;
  let focus: string | null = null;
  for (const op of ops) {
    const edit = op(current);
    if (!edit.ok) return { ok: false, layout, reason: edit.reason };
    current = edit.layout;
    focus ??= edit.focus;
  }
  return { ok: true, layout: current, focus };
}

/** The outcome of a tree edit the session refused or took: read-only, refusal, or success. */
export function outcomeOf(
  edit: TreeEdit | null, snapshot: SessionSnapshot, success: (edit: Extract<TreeEdit, { ok: true }>) => EditOutcome,
): EditOutcome {
  if (edit === null) return { announce: readOnlyMessage(snapshot) ?? undefined };
  if (!edit.ok) return { announce: refusalMessage(edit.reason) ?? undefined };
  return success(edit);
}
