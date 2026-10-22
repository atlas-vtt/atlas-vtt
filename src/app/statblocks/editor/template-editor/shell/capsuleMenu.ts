/** The entries of the template editor capsule's ⋯ menu (§2.3). */

import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import { alignedEntries } from '../../interaction/surfaceActions';
import { START_FROM_NOTE } from './bodyTexts';

/** A kind offered in the menu while the view is stacked and the dock has no room. */
export interface MenuAddEntry {
  label: string;
  icon: string;
  onClick: () => void;
}

export interface CapsuleMenuInput {
  /** The dock's kinds, in a stacked view. */
  add?: readonly MenuAddEntry[] | undefined;
  /** The template as JSON in the note's column, and back to the note. */
  json?: { open: boolean; toggle: () => void } | undefined;
  /** The template's recovery buttons where the card stands, and back to the card; unset while read-only. */
  rests?: { open: boolean; toggle: () => void } | undefined;
  /** Which dice its statblocks roll a bare bonus with (`TemplateDiceDialog`). */
  diceRolls?: (() => void) | undefined;
  /** Copies a note's text in as the text new statblocks start with ("Start from a note…"); unset while read-only. */
  startFromNote?: (() => void) | undefined;
  /** Unset where the template has no file to delete (a built-in, a template never saved). */
  deleteTemplate?: (() => void) | undefined;
}

export function capsuleMenuEntries(input: CapsuleMenuInput): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = (input.add ?? []).map((entry) => ({ type: 'item', label: entry.label, icon: entry.icon, onClick: entry.onClick }));
  if (input.startFromNote) entries.push({ type: 'item', label: START_FROM_NOTE, icon: 'file-text', onClick: input.startFromNote });
  if (input.diceRolls) entries.push({ type: 'item', label: 'Dice rolls…', icon: 'dices', onClick: input.diceRolls });
  if (input.rests) entries.push({ type: 'item', label: input.rests.open ? 'Back to the card' : 'Recovery actions', icon: 'bed', onClick: input.rests.toggle });
  if (input.json) entries.push({ type: 'item', label: input.json.open ? 'Close JSON' : 'Edit as JSON', icon: 'braces', onClick: input.json.toggle });
  entries.push({
    type: 'item',
    label: 'Delete template…',
    icon: 'trash-2',
    destructive: true,
    disabled: !input.deleteTemplate,
    onClick: () => input.deleteTemplate?.(),
  });
  return alignedEntries(entries);
}
