/**
 * What a drop does to the template (§7.6): one session gesture, so one undo
 * step, worked out on the template the session holds at that moment. A move
 * keeps the block's id; a kind from the dock inserts as a click on it does.
 */

import { blockIdSource } from '../../model/templateIds';
import { placeBeside, putSideBySide } from '../../model/treeGrouping';
import { moveBlock } from '../../model/treeOps';
import type { TreeTarget } from '../../model/treeEdit';
import { collectBlockIds, findBlock } from '../../model/treeQueries';
import type { TemplateLayout } from '../../model/templateTypes';
import { insertCatalogueBlock, type InsertOutcome } from '../template-editor/blockActions';
import { movedMessage } from '../template-editor/blockMoves';
import { applyTree, outcomeOf } from '../template-editor/sessionEdit';
import type { EditorSession } from '../template-editor/sessionTypes';
import type { DragSource } from './dragSources';
import { besideMessage } from './announcements';
import type { DropTarget } from './dropTargets';

/** What a drop leaves: the editor's outcome, and the block that landed (washed in the accent); a new one may ask for its name. */
export type DropOutcome = InsertOutcome & { landed?: string };

type Placed = Exclude<DropTarget, { kind: 'refused' | 'beside' }>;
type Beside = Extract<DropTarget, { kind: 'beside' }>;

/** The gap a target names, counted in the list as it stands: where the block's leading edge lands. */
function gapOf(target: Placed): { parentId: string | null; index: number } {
  return target.kind === 'between' ? { parentId: target.parentId, index: target.index } : { parentId: target.parentId, index: 0 };
}

/** The tree target of a gap once the moved block (if any) has left its place. */
export function treeTargetOf(layout: TemplateLayout, target: Placed, movingId: string | null): TreeTarget | null {
  const gap = gapOf(target);
  const moving = movingId === null ? null : findBlock(layout.blocks, movingId);
  const leaves = moving !== null && moving.parentId === gap.parentId && moving.index < gap.index;
  return { parentId: gap.parentId, index: leaves ? gap.index - 1 : gap.index };
}

function moveOnto(session: EditorSession, id: string, target: Placed): DropOutcome {
  const edit = applyTree(session, (layout) => {
    const to = treeTargetOf(layout, target, id);
    if (!to) return { ok: false, layout, reason: 'target-not-found' };
    return moveBlock(layout, id, to);
  });
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, (done) => ({ select: [id], landed: id, announce: movedMessage(done.layout, id, snapshot.template.fields) }));
}

function insertOnto(session: EditorSession, source: Extract<DragSource, { kind: 'item' }>, target: Placed): DropOutcome {
  const to = treeTargetOf(session.getSnapshot().template.layout, target, null);
  return to ? insertCatalogueBlock(session, source.item.type, { at: to }) : {};
}

/** Moves the block beside the target and sets the two side by side. */
function moveBeside(session: EditorSession, id: string, target: Beside): DropOutcome {
  const edit = applyTree(session, (layout) => placeBeside(layout, id, target.targetId, target.side, blockIdSource(collectBlockIds(layout.blocks))));
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, (done) => ({ select: [id], landed: id, announce: besideMessage(done.layout, id, target, snapshot.template.fields) }));
}

/** Puts a new block in right beside the target, then sets the two side by side; both in the drop's one gesture. */
function insertBeside(session: EditorSession, source: Extract<DragSource, { kind: 'item' }>, target: Beside): DropOutcome {
  const found = findBlock(session.getSnapshot().template.layout.blocks, target.targetId);
  if (!found) return {};
  const index = found.index + (target.side === 'end' ? 1 : 0);
  const inserted = insertOnto(session, source, { kind: 'between', parentId: found.parentId, index, line: target.line });
  const id = inserted.inserted ?? inserted.landed;
  if (!id) return inserted;
  const edit = applyTree(session, (layout) => putSideBySide(layout, [target.targetId, id], blockIdSource(collectBlockIds(layout.blocks))));
  const snapshot = session.getSnapshot();
  return outcomeOf(edit, snapshot, () => ({ ...inserted, select: [id], landed: id }));
}

/**
 * Drops `source` at `target` as one undo step and says what happened; a
 * refused target or a read-only template changes nothing.
 */
export function applyDrop(session: EditorSession, source: DragSource, target: DropTarget): DropOutcome {
  if (target.kind === 'refused') return {};
  session.beginGesture();
  try {
    if (target.kind === 'beside') return source.kind === 'block' ? moveBeside(session, source.id, target) : insertBeside(session, source, target);
    return source.kind === 'block' ? moveOnto(session, source.id, target) : insertOnto(session, source, target);
  } finally {
    session.endGesture();
  }
}
