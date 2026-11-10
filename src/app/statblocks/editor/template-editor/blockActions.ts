/**
 * The block toolbar's and the keys' edits (§7.6, §7.7) over a session, each
 * one undo step, each saying what it did in the live region.
 */

import { removedMessage } from '../statblock-pane/announcements';
import { createBlock, type AuthorableBlockType } from '../../model/blockCatalogue';
import { addField } from '../../model/fieldOps';
import { fieldKeysOf } from '../../model/fieldKeys';
import { blockIdSource, type BlockIdSource } from '../../model/templateIds';
import { headerPartOf, isHeaderBlockId, setHeaderPartHidden } from '../../model/templateHeader';
import { duplicateBlock, insertBlock, removeBlock } from '../../model/treeOps';
import type { TreeRefusal, TreeTarget } from '../../model/treeEdit';
import { collectBlockIds, findBlock } from '../../model/treeQueries';
import type { StatblockTemplate, TemplateBlock, TemplateField, TemplateLayout } from '../../model/templateTypes';
import { pastedBlocks, type BlockClip } from './blockClipboard';
import { gridInsertTarget } from '../../model/templateGrid';
import { blockName } from './blockNames';
import { labelTargetIn } from './labelTargets';
import { focusAfterDelete, inSiblingOrder, type BlockSelection } from './selection';
import { applyEdit, applyTree, chainTree, outcomeOf, readOnlyMessage, refusalMessage, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';
import { t } from '../../../i18n';

/** What an insert puts in: its blocks, top to bottom, and the fields they bring. */
export interface InsertParts {
  blocks: TemplateBlock[];
  fields: TemplateField[];
}

type InsertResult = { inserted: string } | { refused: TreeRefusal | null };

/**
 * A tile placed to be named. It stands in a gesture of its own until it is named (`keep`: placing and naming it are
 * one step) or let go (`drop`: the template is as it was before, and no step is left). Each answers once.
 */
export interface Placement {
  keep: () => void;
  drop: () => void;
}

/**
 * What an insert leaves: the block put in, and the new block that asks for its name (`toName`, which a paste never
 * does) with the placement whoever asks for the name settles.
 */
export type InsertOutcome = EditOutcome & { inserted?: string; toName?: string; placement?: Placement };

/** Where an insert goes: after a block (or at the end), or at a gap the `+` line named. */
export type InsertPlace = { after: string | null } | { at: TreeTarget };

function idSource(template: StatblockTemplate): BlockIdSource {
  return blockIdSource(collectBlockIds(template.layout.blocks));
}

function withFields(template: StatblockTemplate, fields: readonly TemplateField[]): StatblockTemplate {
  return fields.reduce((current, field) => addField(current, field), template);
}

/**
 * Inserts the parts `make` builds for the template as it is now, in one step;
 * the first inserted block is selected. Nothing is inserted where a block may
 * not stand at the place.
 */
export function insertParts(
  session: EditorSession, place: InsertPlace, make: (template: StatblockTemplate, nextId: BlockIdSource) => InsertParts, name?: string,
): InsertOutcome {
  const result = applyEdit(session, (template): { template: StatblockTemplate; result: InsertResult } => {
    const parts = make(template, idSource(template));
    const first = parts.blocks[0];
    if (!first) return { template, result: { refused: null } };
    const target = 'at' in place ? place.at : gridInsertTarget(template.layout, place.after);
    const edit = chainTree(template.layout, parts.blocks.map((block, offset) => (layout: TemplateLayout) =>
      insertBlock(layout, block, { parentId: target.parentId, index: target.index + offset })));
    if (!edit.ok) return { template, result: { refused: edit.reason } };
    return { template: { ...withFields(template, parts.fields), layout: edit.layout }, result: { inserted: first.id } };
  });
  const snapshot = session.getSnapshot();
  if (result === null) return { announce: readOnlyMessage(snapshot) ?? undefined };
  if ('refused' in result) return { announce: result.refused ? refusalMessage(result.refused) ?? undefined : undefined };
  const inserted = findBlock(snapshot.template.layout.blocks, result.inserted);
  const said = name ?? (inserted ? blockName(inserted.block, snapshot.template.fields) : t('templateEditor.aBlock'));
  return { select: [result.inserted], inserted: result.inserted, announce: t('templateEditor.added', { name: said }) };
}

/** Fields a new block shows from the start: a Title the name, an Image the art. */
const DEFAULT_FIELDS: Partial<Record<AuthorableBlockType, TemplateField>> = {
  title: { key: 'name', label: 'Name', type: 'text' },
  image: { key: 'image', label: 'Image', type: 'image' },
};

function placementIn(session: EditorSession): Placement {
  let open = true;
  const settle = (end: () => void) => (): void => {
    if (!open) return;
    open = false;
    end();
  };
  return { keep: settle(() => session.endGesture()), drop: settle(() => session.abandonGesture()) };
}

/**
 * A block from the catalogue, unbound until its label is committed (a Title and an Image come bound). One that takes
 * its first label as the name of its property asks for it at once (`toName`): it exists only once named, so it is
 * placed in a gesture its `placement` ends. Any other is one step.
 */
export function insertCatalogueBlock(session: EditorSession, type: AuthorableBlockType, place: InsertPlace): InsertOutcome {
  session.beginGesture();
  const outcome = insertParts(session, place, (template, nextId) => {
    const field = DEFAULT_FIELDS[type];
    return { blocks: [createBlock(type, nextId)], fields: field && !fieldKeysOf(template.fields).has(field.key) ? [field] : [] };
  });
  const id = outcome.inserted;
  if (id && labelTargetIn(session.getSnapshot().template, id)?.kind === 'new-field') return { ...outcome, toName: id, placement: placementIn(session) };
  session.endGesture();
  return outcome;
}

/** Pastes copied blocks after the selection, with new ids and the fields the template lacks. */
export function pasteClip(session: EditorSession, clip: BlockClip, after: string | null): InsertOutcome {
  return insertParts(session, { after }, (template, nextId) => pastedBlocks(clip, template, nextId));
}

/** Mod+D: a copy of each selected block right after it; the copies are selected. The header's parts are never copied. */
export function duplicateSelection(session: EditorSession, selection: BlockSelection): EditOutcome {
  if (selection.some(isHeaderBlockId)) return { announce: refusalMessage('header') ?? undefined };
  const copies: string[] = [];
  const edit = applyTree(session, (layout) => {
    const nextId = blockIdSource(collectBlockIds(layout.blocks));
    copies.length = 0;
    const ordered = inSiblingOrder(layout, selection).reverse();
    return chainTree(layout, ordered.map((id) => (current: TemplateLayout) => {
      const done = duplicateBlock(current, id, nextId);
      if (done.ok && done.focus) copies.unshift(done.focus);
      return done;
    }));
  });
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, () => ({ select: [...copies], announce: copies.length > 1 ? t('templateEditor.duplicatedBlocks', { count: copies.length }) : t('templateEditor.duplicated') }));
}

/** Delete: the selected tiles go (never a part of the header), focus moves to the next one, else the one before. */
export function deleteSelection(session: EditorSession, selection: BlockSelection): EditOutcome {
  const before = session.getSnapshot().template;
  const doomed = selection.filter((id) => !isHeaderBlockId(id));
  if (doomed.length === 0) return { announce: refusalMessage('header') ?? undefined };
  const names = inSiblingOrder(before.layout, doomed)
    .map((id) => findBlock(before.layout.blocks, id)?.block)
    .filter((block): block is TemplateBlock => block !== undefined)
    .map((block) => blockName(block, before.fields));
  const after: { focus: string | null } = { focus: null };
  const edit = applyTree(session, (layout, template) => {
    after.focus = focusAfterDelete(template, doomed);
    return chainTree(layout, doomed.map((id) => (current: TemplateLayout) => removeBlock(current, id)));
  });
  return outcomeOf(edit, session.getSnapshot(), () => {
    const what = names.length === 1 ? names[0] ?? t('templateEditor.theBlock') : t('templateEditor.blocks', { count: names.length });
    return { select: after.focus ? [after.focus] : [], announce: removedMessage(what), deleted: what };
  });
}

/** Hide or show a part of the header: off the card and kept in the template, or back on the card and selected. */
export function toggleHeaderPartHidden(session: EditorSession, blockId: string): EditOutcome {
  const part = headerPartOf(session.getSnapshot().template, blockId);
  if (!part) return {};
  if (!part.hideable) return { announce: t('templateEditor.partAlwaysShown', { name: part.label.toLowerCase() }) };
  const hide = !part.hidden;
  const changed = applyEdit(session, (template) => {
    const next = setHeaderPartHidden(template, part.id, hide);
    return { template: next, result: next !== template };
  });
  if (changed === null) return { announce: readOnlyMessage(session.getSnapshot()) ?? undefined };
  return {
    select: hide ? [] : [blockId],
    announce: hide ? t('templateEditor.partHidden', { name: part.label }) : t('templateEditor.partShown', { name: part.label }),
  };
}
