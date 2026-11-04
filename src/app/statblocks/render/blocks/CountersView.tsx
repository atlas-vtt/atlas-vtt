import React, { useContext } from 'react';
import type { CountersBlock } from '../../model/templateTypes';
import { isDrawnCounter, shownCounterRows } from '../../values/counterValues';
import { valueText } from '../../values/valueText';
import { CountersGrid, type ShownCounter } from '../shared/CountersGrid';
import { useSheet } from '../sheetContext';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueEditingContext, ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

/** What a Counters block draws: its rows with uses (one with none, a spell level not reached, is left out). */
export interface ShownCounters {
  counters: ShownCounter[];
}

/**
 * Rows of limited uses under the block's label, each a small cell of pips.
 * The statblock pane makes them pressable (`ValueEditing.counters`); a value
 * that is no list of counters shows as it is written, with its chip.
 */
export function CountersView({ block, display }: BlockViewProps<CountersBlock>): React.JSX.Element {
  const { state } = useSheet();
  const editing = useContext(ValueEditingContext);
  const field = state.fields.get(block.field);
  const label = block.label ?? field?.label ?? block.field;
  const value = state.reader(block.field);
  const rows = field && display.state === 'value' ? shownCounterRows(field, value) : null;
  const counters = (rows ?? []).flatMap((row, index) => (isDrawnCounter(row) ? [{ row, index }] : []));
  const shown: ShownCounters = { counters };

  return (
    <LabelledLine label={label} look="stacked" className="atlas-sb-counters">
      <ValueSlot block={block}>
        {rows && (editing?.counters ? editing.counters(block, shown) : <CountersGrid {...shown} />)}
        {display.state === 'value' && !rows && <ValueText shown={{ text: valueText(value), problems: [] }} />}
        {display.state !== 'value' && <StandIn display={display} />}
      </ValueSlot>
    </LabelledLine>
  );
}
