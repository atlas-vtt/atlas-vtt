import React from 'react';
import { t } from '../../../../i18n';
import {
  addedCounterRow, changedCounterRow, movedCounterRow, removedCounterRow,
} from '../../../model/counterPresets';
import type { CounterPreset, TemplateBlock } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { boundFieldOf, editField } from '../inspector/blockEdits';
import { Setting, SettingNote } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';
import { AddNameInput } from './AddNameInput';
import { CounterRowSetting } from './CounterRowSetting';

interface CountersOptionsProps {
  block: TemplateBlock;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * A Counters tile's Options: the rows every statblock of the template starts
 * with (spell levels, ki, a feature's uses), each with its uses and how many
 * come back when a recovery button restores them, added, changed, moved and
 * removed one step at a time. A statblock keeps its own rows once it holds some.
 */
export function CountersOptions({ block, session, readOnly }: CountersOptionsProps): React.JSX.Element | null {
  const { snapshot } = useTemplateEditor();
  const field = boundFieldOf(snapshot.template, block);
  if (block.type !== 'counters') return null;
  if (!field) return <SettingNote>{t('statblock.countersNameFirst')}</SettingNote>;
  const rows = field.counterRows ?? [];
  const edit = (change: (rows: readonly CounterPreset[]) => CounterPreset[]): void => {
    const now = boundFieldOf(session.getSnapshot().template, block)?.counterRows ?? [];
    const next = change(now);
    editField(session, field.key, { counterRows: next.length > 0 ? next : undefined });
  };
  return (
    <Setting label={t('statblock.counterRows')} wide>
      {(labelId) => (
        <div className="atlas-te-setting__list">
          {rows.map((row, index) => (
            <CounterRowSetting
              // A row is told apart by its place: names may repeat, and the inputs follow the place.
              key={index}
              row={row}
              index={index}
              count={rows.length}
              session={session}
              disabled={readOnly}
              onEdit={(change) => edit((current) => changedCounterRow(current, index, change))}
              onMove={(to) => edit((current) => movedCounterRow(current, index, to))}
              onRemove={() => edit((current) => removedCounterRow(current, index))}
            />
          ))}
          <AddNameInput labelledBy={labelId} placeholder={t('statblock.counterAdd')} disabled={readOnly}
            onAdd={(label) => edit((current) => addedCounterRow(current, label))} />
        </div>
      )}
    </Setting>
  );
}
