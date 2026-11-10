import React, { createContext, useContext } from 'react';
import type { ResourceValue } from '../../resources/resourceTypes';
import type { CountersBlock, EntriesBlock, FieldKey, FieldValue, ScoresBlock, TemplateBlock, TrackBlock } from '../model/templateTypes';
import type { ShownCounters } from './blocks/CountersView';
import type { TableLook } from './blocks/ScoresView';
import type { ShownTable } from './values/shownTable';
import { useSheet } from './sheetContext';
import { blockMisfits } from './values/blockMisfits';
import { MisfitChip } from './values/MisfitChip';

/**
 * How the statblock pane edits values in place (§7.6). Each block view puts
 * its values (not its label or heading) in a `ValueSlot`; while the pane edits
 * one of the block's fields, its input stands there instead, in the values'
 * own typographic spot, so the card around it does not move.
 */
export interface ValueEditing {
  /**
   * What shows where `block`'s values show: `values` themselves, or the pane's input in their place or beside
   * them. `field`: the slot holds that one of the block's values alone (a number of a Metric).
   */
  slot(block: TemplateBlock, values: React.ReactNode, field?: FieldKey): React.ReactNode;
  /**
   * What shows where one ability of a list shows: `line` itself, or the
   * pane's editor of that one ability in its place (§6.3), so the rest of the
   * list stays drawn while one is typed.
   */
  entry?(block: TemplateBlock, entry: EntrySlotInfo, line: React.ReactNode): React.ReactNode;
  /**
   * What stands where a Table is drawn (`look`): the surface's table, its cells typed in place, its rows and
   * columns changed as Obsidian changes a Markdown table's. Unset: the table as the card draws it.
   */
  table?(block: ScoresBlock, shown: ShownTable, look: TableLook): React.ReactNode;
  /**
   * What starts a new ability at the end of a list that holds some ("Add ability"): a plus at the end of
   * the list's heading (`iconOnly`), or for a list without heading a line under it.
   */
  addEntry?(block: EntriesBlock, label: string, iconOnly: boolean): React.ReactNode;
  /**
   * What stands where a Counters block's rows are drawn: the pane's pressable pips, the template editor's the
   * same drawn inert. Unset: the rows as a read-only card draws them, without buttons.
   */
  counters?(block: CountersBlock, shown: ShownCounters): React.ReactNode;
  /**
   * What stands under the header once for the whole sheet: the note panel's recovery buttons of a player
   * character. Unset: nothing, as a card that is only read (a hover preview, the DM screen) shows.
   */
  recovery?(): React.ReactNode;
  /**
   * What stands where a tracked number shows its current value over its maximum (`text`, "2 / 4"): the
   * note panel's − and + around it, stepping the character's current value. Unset: `text` alone.
   */
  tracked?(field: FieldKey, value: ResourceValue, text: React.ReactNode): React.ReactNode;
  /**
   * What stands where a track shows the value of the token's resource `key` (a tracked number's, or the resource
   * the track is bound to): the note panel's boxes to press, or its gauge between − and +, setting the character's
   * current value. Unset: the track as the card draws it, its maximum inside the block's values.
   */
  track?(key: string, label: string, value: ResourceValue, look: TrackBlock['look'], labelId: string): React.ReactNode;
  /**
   * A tile not named yet is drawn as it will be once named (`provisionalSheet`): the template editor's tiles while
   * their name is asked for. Unset (a statblock's pane): such a block shows only its prompt, and no value of it is edited.
   */
  drawsUnnamed?: boolean;
}

/** One ability as its list draws it: the stored item, its identity, its place in the stored list and among those drawn. */
export interface EntrySlotInfo {
  item: FieldValue;
  key: string;
  index: number;
  shown: number;
}

export const ValueEditingContext = createContext<ValueEditing | null>(null);

interface ValueSlotProps {
  block: TemplateBlock;
  /** The one value of the block the slot holds, where each of its values is edited on its own. */
  field?: FieldKey | undefined;
  children: React.ReactNode;
}

/**
 * A block's values, each one that does not fit its field's type followed by a
 * chip saying so (§8.8). The runtime card has no editing context: the values
 * render exactly as they are.
 */
export function ValueSlot({ block, field, children }: ValueSlotProps): React.ReactNode {
  const editing = useContext(ValueEditingContext);
  const { state } = useSheet();
  const misfits = blockMisfits(block, state).filter((misfit) => field === undefined || misfit.key === field);
  const values = misfits.length === 0 ? children : (
    <>
      {children}
      {misfits.map((misfit) => <MisfitChip key={misfit.key} misfit={misfit} />)}
    </>
  );
  return editing ? editing.slot(block, values, field) : values;
}
