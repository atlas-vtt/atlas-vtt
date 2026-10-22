import React from 'react';
import type { CountersBlock, FieldValue, TemplateField } from '../../model/templateTypes';
import type { ShownCounters } from '../../render/blocks/CountersView';
import { CountersGrid, type CounterControls } from '../../render/shared/CountersGrid';
import { withCounterReset, withCounterUsed } from '../../values/counterValues';
import { CounterResetPicker } from './CounterResetPicker';
import { usePaneEdit, type PaneEditController } from './paneEditContext';
import { usePaneRecoveryContext } from './usePaneRecovery';
import { fieldPatches } from './valuePatches';

/** Writes a Counters field as `change` makes it of what it holds now (nothing where it gives null): one patch of the whole value, with the old value as its base. */
async function writeCounters(pane: PaneEditController, field: TemplateField, change: (value: FieldValue | undefined) => FieldValue | null): Promise<void> {
  const read = pane.readFresh(field);
  const next = change(read.value);
  if (next === null) return;
  await pane.write(field, fieldPatches(field.key, read, next), { base: read.value, mine: next });
}

/**
 * A Counters block in the statblock pane: a press on a pip, − or + sets that
 * row's uses, one write of the field. A statblock that showed its template's
 * preset rows gets them as its own with the first change. Beside a player
 * character's note with recovery buttons, each row also names the rest that
 * gives its uses back.
 */
function PaneCounters({ block, shown }: { block: CountersBlock; shown: ShownCounters }): React.JSX.Element {
  const pane = usePaneEdit();
  const recovery = usePaneRecoveryContext();
  const field = pane.sheet.fields.get(block.field);
  if (!field || !pane.writable) return <CountersGrid {...shown} />;
  const controls: CounterControls = {
    use: (index, used) => void writeCounters(pane, field, (value) => withCounterUsed(field, value, index, used)),
    after: recovery ? ({ row, index }) => (
      <CounterResetPicker row={row} buttons={recovery.buttons} disabled={!pane.writable}
        onPick={(reset) => void writeCounters(pane, field, (value) => withCounterReset(field, value, index, reset))} />
    ) : undefined,
  };
  return <CountersGrid {...shown} controls={controls} />;
}

/** The pane's `ValueEditing.counters`. */
export function renderPaneCounters(block: CountersBlock, shown: ShownCounters): React.ReactNode {
  return <PaneCounters block={block} shown={shown} />;
}
