/**
 * What the canvas shows for a drop target (§7.3): a line between blocks (in
 * the starting list, at the place its siblings slid open) or along the edge a
 * block goes beside, an outlined empty container, or nothing where the drop
 * is refused (the cursor says so). Pure.
 */

import { childrenOf, parentTypeOf } from '../../model/treeEdit';
import { findBlock } from '../../model/treeQueries';
import type { Box, DropLine } from './dropGeometry';
import type { DragSubject, DropScene, DropTarget } from './dropTargets';
import { siblingShifts, type ListEntry, type ShiftPlan } from './siblingShifts';

export type DropView =
  | { kind: 'line'; line: DropLine }
  | { kind: 'into'; outline: Box }
  | { kind: 'refused' };

/** The slides for a target in the list the moved block came from; null for every other target. */
export function shiftPlanFor(scene: DropScene, subject: DragSubject, target: DropTarget): ShiftPlan | null {
  if (target.kind !== 'between' || subject.movingId === null) return null;
  const moving = findBlock(scene.layout.blocks, subject.movingId);
  if (!moving || moving.parentId !== target.parentId) return null;
  const entries: ListEntry[] = [];
  let from = -1;
  let gap = 0;
  (childrenOf(scene.layout, moving.parentId) ?? []).forEach((child, index) => {
    const box = scene.boxes.get(child.id);
    if (!box) return;
    if (child.id === subject.movingId) from = entries.length;
    entries.push({ id: child.id, box });
    if (index < target.index) gap = entries.length;
  });
  const flow = parentTypeOf(scene.layout, target.parentId) === 'row' ? 'row' : 'stack';
  return from === -1 ? null : siblingShifts(entries, from, gap, flow);
}

/** The view of a target; `shifted` is the line of the slid-open place, where there is one. */
export function dropView(target: DropTarget, shifted: DropLine | null): DropView {
  switch (target.kind) {
    case 'between': return { kind: 'line', line: shifted ?? target.line };
    case 'beside': return { kind: 'line', line: target.line };
    case 'into': return { kind: 'into', outline: target.outline };
    case 'refused': return { kind: 'refused' };
  }
}
