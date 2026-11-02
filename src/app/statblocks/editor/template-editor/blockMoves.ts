/**
 * Moving tiles without a drag (§7.7): Alt+↑/↓ (and ←/→) steps a tile past
 * its neighbour and, at the ends of its row, out of it into a row of its own.
 * The header's parts never move.
 */

import { canContain } from '../../model/blockCatalogue';
import { isHeaderBlockId } from '../../model/templateHeader';
import { moveBlock } from '../../model/treeOps';
import { childrenOf, parentTypeOf, type TreeEdit, type TreeTarget } from '../../model/treeEdit';
import { findBlock } from '../../model/treeQueries';
import { isContainerBlock, type BlockType, type TemplateField, type TemplateLayout } from '../../model/templateTypes';
import { blockName, placeName } from './blockNames';
import { inSiblingOrder, primaryOf, type BlockSelection } from './selection';
import { applyTree, chainTree, outcomeOf, refusalMessage, type EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';
import { t } from '../../../i18n';

/**
 * Where a block inserted after `anchorId` goes: into it where it is an empty
 * container that takes the type (an empty tab), else right after it, or,
 * where its parent does not take that type (a Row in a Row), after the
 * parent. Without an anchor, at the end of the top level.
 */
export function insertTarget(layout: TemplateLayout, anchorId: string | null, type: BlockType): TreeTarget {
  let found = anchorId === null ? null : findBlock(layout.blocks, anchorId);
  // An empty Section or Side by side fills first: nothing in it to add below.
  const anchor = found?.block;
  if (anchor && isContainerBlock(anchor) && anchor.blocks.length === 0 && canContain(anchor.type, type)) return { parentId: anchor.id, index: 0 };
  while (found) {
    const parentType = parentTypeOf(layout, found.parentId);
    if (parentType !== null && canContain(parentType, type)) return { parentId: found.parentId, index: found.index + 1 };
    found = found.parentId === null ? null : findBlock(layout.blocks, found.parentId);
  }
  return { parentId: null, index: layout.blocks.length };
}

/** "Moved Armor class to a row of its own, row 2 of 5.", "Moved Speed into a row, place 1 of 2." */
export function movedMessage(layout: TemplateLayout, id: string, fields: readonly TemplateField[]): string {
  const found = findBlock(layout.blocks, id);
  if (!found) return '';
  const parent = found.parentId === null ? null : findBlock(layout.blocks, found.parentId)?.block ?? null;
  const count = childrenOf(layout, found.parentId)?.length ?? 0;
  const name = blockName(found.block, fields);
  if (parent === null) return t('templateEditor.moved.ownRow', { name, n: found.index + 1, count });
  if (parent.type === 'row') return t('templateEditor.moved.intoRow', { name, n: found.index + 1, count });
  return t('templateEditor.moved.into', { name, place: placeName(parent, fields), n: found.index + 1, count });
}

/** The place just before (`step` -1) or after (1) a block's parent, in the grandparent. */
function besideParent(layout: TemplateLayout, parentId: string | null, step: 1 | -1): TreeTarget | null {
  const parent = parentId === null ? null : findBlock(layout.blocks, parentId);
  if (!parent) return null;
  return { parentId: parent.parentId, index: step === -1 ? parent.index : parent.index + 1 };
}

/** The moves of a step up or down: each selected block past its neighbour, or a lone block out of its container's end. */
function stepMoves(layout: TemplateLayout, ids: readonly string[], step: 1 | -1): Array<(layout: TemplateLayout) => TreeEdit> | null {
  const ordered = inSiblingOrder(layout, ids);
  const edge = findBlock(layout.blocks, (step === -1 ? ordered[0] : ordered.at(-1)) ?? '');
  if (!edge) return null;
  const length = childrenOf(layout, edge.parentId)?.length ?? 0;
  const atEnd = step === -1 ? edge.index === 0 : edge.index === length - 1;
  if (atEnd) {
    const target = ordered.length === 1 ? besideParent(layout, edge.parentId, step) : null;
    return target ? [(current) => moveBlock(current, edge.block.id, target)] : null;
  }
  const sequence = step === -1 ? ordered : [...ordered].reverse();
  return sequence.map((id) => (current: TemplateLayout) => {
    const found = findBlock(current.blocks, id);
    return moveBlock(current, id, { parentId: found?.parentId ?? null, index: (found?.index ?? 0) + step });
  });
}

function moveOutcome(session: EditorSession, edit: TreeEdit | null, primary: string): EditOutcome {
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, (done) => ({ announce: movedMessage(done.layout, primary, snapshot.template.fields) }));
}

/** Alt+↑ / Alt+↓. */
export function moveSelection(session: EditorSession, selection: BlockSelection, step: 1 | -1): EditOutcome {
  const primary = primaryOf(selection);
  if (primary === null) return {};
  if (selection.some(isHeaderBlockId)) return { announce: refusalMessage('header') ?? undefined };
  let moved = false;
  const edit = applyTree(session, (layout) => {
    const moves = stepMoves(layout, selection, step);
    const next = moves ? chainTree(layout, moves) : null;
    moved = next !== null && next.ok;
    return moved && next ? next : { ok: true, layout, focus: primary };
  });
  if (edit && !moved) return { announce: step === -1 ? t('templateEditor.atTop') : t('templateEditor.atEnd') };
  return moveOutcome(session, edit, primary);
}
