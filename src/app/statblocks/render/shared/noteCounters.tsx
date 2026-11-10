import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { useExperimentalFeature } from '../../../react/hooks/useExperimentalFeature';
import { SettingsService } from '../../../services/SettingsService';
import { fieldPatches } from '../../editor/statblock-pane/valuePatches';
import { fieldByKey } from '../../model/fieldKeys';
import type { ResolvedStatblock } from '../../model/resolvedTypes';
import type { FieldKey, StatblockTemplate, TemplateField } from '../../model/templateTypes';
import { NoteFieldWriter } from '../../notes/NoteFieldWriter';
import { NoteSource } from '../../notes/noteSource';
import { readAfterOwnWrite, sendOwnWrite, type OwnWrite } from '../../notes/ownFieldWrites';
import { withCounterUsed } from '../../values/counterValues';
import { readField } from '../../values/fieldValues';
import { ValueEditingContext, type ValueEditing } from '../valueSlot';
import { CountersGrid } from './CountersGrid';

/**
 * Sets row `index` of the Counters field to `used` uses in the note, as the statblock pane does:
 * one patch of the whole value with the value it changes as its base, built on the last press
 * where the note does not hold it yet.
 */
async function writeCounterUse(app: App, path: string, field: TemplateField, index: number, used: number, own: Map<FieldKey, OwnWrite>): Promise<void> {
  const record = NoteSource.forApp(app).read(path).frontmatter ?? {};
  const read = readAfterOwnWrite(readField(record, field), field.key, own);
  const next = withCounterUsed(field, read.value, index, used);
  if (next === null) return;
  await sendOwnWrite(own, field.key, { base: read.value, mine: next }, () => NoteFieldWriter.forApp(app).write(path, fieldPatches(field.key, read, next)));
}

/** A card's `ValueEditing` that presses Counters pips into the note at `path` and leaves every other value as drawn. */
function useNoteCounters(app: App, path: string, template: StatblockTemplate, on: boolean): ValueEditing | null {
  return useMemo((): ValueEditing | null => {
    if (!on) return null;
    const own = new Map<FieldKey, OwnWrite>();
    return {
      slot: (_block, values) => values,
      counters: (block, shown) => {
        const field = fieldByKey(template.fields, block.field);
        const use = field ? (index: number, used: number): void => void writeCounterUse(app, path, field, index, used, own) : undefined;
        return <CountersGrid {...shown} controls={use ? { use } : undefined} />;
      },
    };
  }, [app, path, template, on]);
}

interface PressableCountersProps {
  app: App;
  statblock: Pick<ResolvedStatblock, 'path' | 'source'> & { template: StatblockTemplate };
  children: React.ReactNode;
}

/**
 * Makes the Counters pips of a card that is otherwise only read (a hover preview, the DM screen)
 * pressable: a press writes the note. Only a native statblock's, and only while the statblock
 * editor is switched on, which decides every write of a statblock as it does for the pane.
 */
export function PressableCounters({ app, statblock, children }: PressableCountersProps): React.JSX.Element {
  const editorOn = useExperimentalFeature('statblockEditor', SettingsService.forApp(app));
  const counters = useNoteCounters(app, statblock.path, statblock.template, editorOn && statblock.source.kind === 'atlas');
  return <ValueEditingContext.Provider value={counters}>{children}</ValueEditingContext.Provider>;
}
