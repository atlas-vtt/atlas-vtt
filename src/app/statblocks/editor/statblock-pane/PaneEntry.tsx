import React from 'react';
import type { EntriesBlock, TemplateBlock } from '../../model/templateTypes';
import { deepEqual } from '../../notes/listIdentity';
import { AddEntryRow } from '../../render/shared/AddEntryRow';
import type { EntrySlotInfo } from '../../render/valueSlot';
import { keyedEntryItems } from '../../values/entryKeys';
import { EntryInlineEditor } from './EntryInlineEditor';
import { usePaneEdit, type EditTarget } from './paneEditContext';

/** Where the editor stands in a list being edited: the ability drawn at this place, by its value once one is named, else by its place. */
function standsHere(target: EditTarget, info: EntrySlotInfo, items: ReturnType<typeof keyedEntryItems>): boolean {
  if (target.anchor !== undefined) {
    const anchor = target.anchor;
    const found = items.findIndex((entry) => deepEqual(entry.item, anchor));
    // Changed in the note meanwhile: the editor keeps its place, and its commit reports the change.
    if (found >= 0 || target.entry === undefined) return found === info.shown;
  }
  const at = target.entry ?? (target.add ? items.length - 1 : 0);
  return at === info.shown;
}

/**
 * One ability of a list as the pane draws it (§6.3): as the card writes it,
 * or, for the one being typed, its editor in the same place; a new ability's
 * editor follows the one it is added after.
 */
function PaneEntry({ block, info, line }: { block: TemplateBlock; info: EntrySlotInfo; line: React.ReactNode }): React.ReactNode {
  const pane = usePaneEdit();
  const target = pane.editing;
  if (block.type !== 'entries' || target?.blockId !== block.id) return line;
  const field = pane.spots.byBlock.get(block.id)?.find((each) => each.type === 'entries');
  if (!field) return line;
  const items = keyedEntryItems(pane.read(field).value);
  if (!standsHere(target, info, items)) return line;
  if (target.add) {
    return (
      <>
        {line}
        <EntryInlineEditor block={block} field={field} editing={{ kind: 'new', afterIndex: info.index, shown: info.shown + 1 }} />
      </>
    );
  }
  return <EntryInlineEditor block={block} field={field} editing={{ kind: 'edit', item: info.item, index: info.index, shown: info.shown, itemKey: info.key }} />;
}

/** The pane's `ValueEditing.entry`. */
export function renderPaneEntry(block: TemplateBlock, info: EntrySlotInfo, line: React.ReactNode): React.ReactNode {
  return <PaneEntry block={block} info={info} line={line} />;
}

/** "Add ability" on a list: a new ability at its end, typed where it will stand. Nothing while the note can't be written. */
function PaneAddEntry({ block, label, iconOnly }: { block: EntriesBlock; label: string; iconOnly: boolean }): React.JSX.Element {
  const pane = usePaneEdit();
  const field = pane.spots.byBlock.get(block.id)?.find((each) => each.type === 'entries');
  const adding = pane.editing?.blockId === block.id && pane.editing.add === true;
  const onAdd = field && pane.writable && !adding ? (): void => pane.start({ blockId: block.id, field: field.key, add: true }) : undefined;
  return <AddEntryRow label={label} onAdd={onAdd} iconOnly={iconOnly} />;
}

/** The pane's `ValueEditing.addEntry`. */
export function renderPaneAddEntry(block: EntriesBlock, label: string, iconOnly: boolean): React.ReactNode {
  return <PaneAddEntry block={block} label={label} iconOnly={iconOnly} />;
}
