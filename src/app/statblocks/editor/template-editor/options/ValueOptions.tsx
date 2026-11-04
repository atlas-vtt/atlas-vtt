import React from 'react';
import { updateField, type FieldChanges } from '../../../model/fieldOps';
import { NUMBER_LOOKS, numberLookOf, withNumberLook, type NumberLook } from '../../../model/numberLooks';
import type { StatBlock, TagsBlock, TemplateBlock } from '../../../model/templateTypes';
import { ChoiceSettings } from '../inspector/ChoiceSettings';
import { boundFieldOf, editBlock, editField } from '../inspector/blockEdits';
import { ChoiceSetting, SelectSetting, SettingNote, TextSetting } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';
import { useTemplateEditor } from '../editorContext';
import { RollSetting } from './RollSetting';
import { AddsToRollsSetting } from './AddsToRollsSetting';
import { VALUE_KINDS, valueKindOf, withValueKind, type ValueKind } from './valueKinds';
import { TrackedSetting } from './TrackedSetting';
import { t } from '../../../../i18n';

type Display = 'plain' | 'signed';

/** How a Value of words lists them. */
const TAG_LOOK_OPTIONS: ReadonlyArray<{ value: TagsBlock['look']; label: string }> = [
  { value: 'comma', label: t('templateEditor.tags.comma') }, { value: 'chips', label: t('templateEditor.tags.chips') },
  { value: 'bullets', label: t('templateEditor.tags.bullets') }, { value: 'numbered', label: t('templateEditor.tags.numbered') },
];

const DISPLAYS = [{ value: 'plain' as const, label: '3' }, { value: 'signed' as const, label: '+3' }];

interface ValueOptionsProps {
  block: TemplateBlock;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * A Value tile's Options: the kind of value, then only what that kind has:
 * a choice's list and switches, a number's unit, sign, whether it shows as a number or a track of boxes or a
 * gauge, whether it is tracked,
 * whether it rolls as a bonus and whether it adds to rolls, where the label
 * stands, how words are listed.
 */
export function ValueOptions({ block, session, readOnly }: ValueOptionsProps): React.JSX.Element {
  const { snapshot } = useTemplateEditor();
  const field = boundFieldOf(snapshot.template, block);
  const kind = valueKindOf(block, field);
  if (!field || !kind) return <SettingNote>{t('templateEditor.nameValueFirst')}</SettingNote>;
  const edit = (changes: FieldChanges): void => session.apply((template) => updateField(template, field.key, changes));
  return (
    <>
      <SelectSetting<ValueKind>
        label={t('templateEditor.kindLabel')}
        value={kind}
        options={VALUE_KINDS.map((entry) => ({ value: entry.kind, label: entry.label }))}
        onChange={(next) => session.apply((template) => withValueKind(template, block.id, next))}
        disabled={readOnly}
      />
      {kind === 'choice' && <ChoiceSettings field={field} session={session} readOnly={readOnly} edit={edit} />}
      {kind === 'number' && (
        <TextSetting label={t('templateEditor.unit')} value={field.unit ?? ''} placeholder={t('templateEditor.unitExample')} session={session} disabled={readOnly}
          onText={(text) => editField(session, field.key, { unit: text.trim() ? text : undefined })} />
      )}
      {(kind === 'number' || kind === 'pairs') && (block.type === 'stat' || block.type === 'pairs') && (
        <ChoiceSetting<Display> label={t('templateEditor.numbers')} value={block.display ?? 'plain'} options={DISPLAYS} disabled={readOnly}
          onChange={(display) => editBlock(session, block.id, block.type, { display: display === 'plain' ? undefined : display })} />
      )}
      {kind === 'number' && field.type === 'number' && (
        <ChoiceSetting<NumberLook> label={t('templateEditor.showAs')} value={numberLookOf(block) ?? 'number'} options={[...NUMBER_LOOKS]} disabled={readOnly}
          onChange={(look) => session.apply((template) => withNumberLook(template, block.id, look))} />
      )}
      {kind === 'number' && field.type === 'number' && !(block.type === 'track' && block.resource) && (
        <TrackedSetting field={field} template={snapshot.template} session={session} readOnly={readOnly} track={block.type === 'track' ? block : undefined} />
      )}
      {(kind === 'number' || kind === 'pairs') && block.type !== 'track' && <RollSetting block={block} session={session} readOnly={readOnly} />}
      {(kind === 'number' || kind === 'pairs') && block.type !== 'track' && <AddsToRollsSetting block={block} session={session} readOnly={readOnly} />}
      {block.type === 'stat' && (
        <ChoiceSetting<StatBlock['look']> label={t('templateEditor.label')} value={block.look} disabled={readOnly}
          options={[{ value: 'run-in', label: t('templateEditor.labelBeside') }, { value: 'stacked', label: t('templateEditor.labelAbove') }]}
          onChange={(look) => editBlock(session, block.id, 'stat', { look })} />
      )}
      {block.type === 'tags' && (
        <SelectSetting label={t('templateEditor.style')} value={block.look} disabled={readOnly} options={[...TAG_LOOK_OPTIONS]}
          onChange={(look) => editBlock(session, block.id, 'tags', { look })} />
      )}
    </>
  );
}
