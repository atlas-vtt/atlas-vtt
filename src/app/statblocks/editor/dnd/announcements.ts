/**
 * What a drag says in the view's live region (§7.6, §7.7): what was picked
 * up, where it would go, and how it ended. The drop itself says what the edit
 * did ("Moved Armor class to section Defenses, position 2 of 3.").
 */

import { childrenOf } from '../../model/treeEdit';
import { findBlock } from '../../model/treeQueries';
import type { TemplateField, TemplateLayout } from '../../model/templateTypes';
import { blockName, placeName } from '../template-editor/blockNames';
import type { DropTarget } from './dropTargets';
import { t } from '../../../i18n';

/** dnd-kit's hidden instructions, read with a block that can be picked up. */
export const DRAG_INSTRUCTIONS = t('statblockEditor.drag.instructions');

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "Picked up Armor class." and, for the keyboard, how to go on. */
export function pickedUpText(name: string, keyboard: boolean): string {
  return keyboard ? t('statblockEditor.drag.pickedKeyboard', { name }) : t('statblockEditor.drag.picked', { name });
}

/**
 * Where the drop would land: "A row of its own, row 3 of 5.", "In a row,
 * place 2 of 3.", "Beside Speed, on its right.", "Can't go here."
 */
export function targetText(layout: TemplateLayout, fields: readonly TemplateField[], target: DropTarget, movingId: string | null): string {
  if (target.kind === 'refused') return t('statblockEditor.drag.refused');
  if (target.kind === 'beside') return besideText(layout, fields, target);
  const parent = target.parentId === null ? null : findBlock(layout.blocks, target.parentId)?.block ?? null;
  if (target.kind === 'into') return target.parentId === null ? t('statblockEditor.drag.intoEmpty') : t('statblockEditor.drag.into', { place: placeName(parent, fields) });
  const moving = movingId === null ? null : findBlock(layout.blocks, movingId);
  const length = childrenOf(layout, target.parentId)?.length ?? 0;
  const staying = moving !== null && moving.parentId === target.parentId;
  const position = staying && target.index > (moving?.index ?? 0) ? target.index : target.index + 1;
  const count = staying ? length : length + 1;
  if (parent === null) return t('statblockEditor.drag.ownRow', { position, count });
  if (parent.type === 'row') return t('statblockEditor.drag.inRow', { position, count });
  return `${capitalised(placeName(parent, fields))}, position ${position} of ${count}.`;
}

type Beside = Extract<DropTarget, { kind: 'beside' }>;

/** "Beside Name, on its right." */
function besideText(layout: TemplateLayout, fields: readonly TemplateField[], target: Beside): string {
  const found = findBlock(layout.blocks, target.targetId);
  const name = found ? blockName(found.block, fields) : 'the block';
  return target.side === 'start' ? t('statblockEditor.drag.besideLeft', { name }) : t('statblockEditor.drag.besideRight', { name });
}

/** "Put Picture beside Name, side by side." */
export function besideMessage(layout: TemplateLayout, id: string, target: Beside, fields: readonly TemplateField[]): string {
  const moved = findBlock(layout.blocks, id);
  const other = findBlock(layout.blocks, target.targetId);
  return t('statblockEditor.drag.sideBySide', { moved: moved ? blockName(moved.block, fields) : t('statblockEditor.theBlock'), other: other ? blockName(other.block, fields) : t('statblockEditor.theBlock') });
}

/** "Cancelled. Armor class stays where it was." */
export function cancelledText(name: string | null): string {
  return name ? t('statblockEditor.drag.cancelledNamed', { name }) : t('statblockEditor.drag.cancelled');
}
