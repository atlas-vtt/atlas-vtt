import React from 'react';
import type { TemplateBlock } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { boundFieldOf, editBlock, editField } from '../inspector/blockEdits';
import { ChoiceSetting, SettingNote, SwitchSetting, TextSetting } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';
import { RollSetting } from './RollSetting';

type Display = 'plain' | 'signed';

/**
 * A Table tile's Options: its name, whether it draws its header row, what
 * statblocks may change of it (cells are always theirs to type), whether
 * its numbers show their sign and whether they roll as a bonus. Its rows, columns and starting cells are
 * edited on the card, as a Markdown table is.
 */
export function TableOptions({ block, session, readOnly }: { block: TemplateBlock; session: EditorSession; readOnly: boolean }): React.JSX.Element | null {
  const { snapshot } = useTemplateEditor();
  const field = boundFieldOf(snapshot.template, block);
  if (block.type !== 'scores') return null;
  if (!field) return <SettingNote>Name the table first: double-click it on the card.</SettingNote>;
  return (
    <>
      <TextSetting label="Name" value={field.label} session={session} disabled={readOnly} focusKey="table-name"
        onText={(label) => { if (label.trim()) editField(session, field.key, { label: label.trim() }); }} />
      <SwitchSetting label="Header row" value={field.header !== false} disabled={readOnly}
        onChange={(on) => editField(session, field.key, { header: on ? undefined : false })} />
      <SwitchSetting label="Statblocks can add and remove rows" value={field.addRows !== false} disabled={readOnly}
        onChange={(on) => editField(session, field.key, { addRows: on ? undefined : false })} />
      <SwitchSetting label="Statblocks can add and remove columns" value={field.addColumns !== false} disabled={readOnly}
        onChange={(on) => editField(session, field.key, { addColumns: on ? undefined : false })} />
      <ChoiceSetting<Display> label="Numbers" value={block.display ?? 'plain'} disabled={readOnly}
        options={[{ value: 'plain', label: '3' }, { value: 'signed', label: '+3' }]}
        onChange={(display) => editBlock(session, block.id, 'scores', { display: display === 'plain' ? undefined : display })} />
      <RollSetting block={block} session={session} readOnly={readOnly} />
    </>
  );
}
