import React from 'react';
import { t } from '../../../../i18n';
import { stricter, playerAccess } from '../../../../online/gm/book/playerAccess';
import { abilityFieldKeys } from '../../../model/abilityParts';
import { fieldByKey } from '../../../model/fieldKeys';
import { playerAccessChoices, withPlayerAccess } from '../../../model/playerSettings';
import type { FieldKey, PlayerAccess, StatblockTemplate, TemplateBlock, TemplateField } from '../../../model/templateTypes';
import { useTemplateEditor } from '../editorContext';
import { boundFieldOf } from '../inspector/blockEdits';
import { SelectSetting } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';

const LABELS: Readonly<Record<PlayerAccess, () => string>> = {
  edit: () => t('statblock.playersEdit'),
  read: () => t('statblock.playersRead'),
  hidden: () => t('statblock.playersHidden'),
};

/** The fields a tile's Players row sets together: every list of an Abilities tile, every named number of a Metric, else the one it shows. */
export function playerKeysOf(template: StatblockTemplate, block: TemplateBlock): FieldKey[] {
  const lists = abilityFieldKeys(block);
  if (lists.length > 0) return lists;
  if (block.type === 'metric') return block.fields.filter((key) => key !== '');
  const field = boundFieldOf(template, block);
  return field ? [field.key] : [];
}

interface PlayersSettingProps {
  block: TemplateBlock;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * What players may do with a tile's values: change them, only see them, or not see them at all.
 * The default comes first; a spell list is never changed by a player, so it offers only the other
 * two. Where the tile's fields differ (set by hand in the file), the strictest shows, and a choice
 * sets them all in one step.
 */
export function PlayersSetting({ block, session, readOnly }: PlayersSettingProps): React.JSX.Element | null {
  const { template } = useTemplateEditor().snapshot;
  const keys = playerKeysOf(template, block);
  const fields = keys.map((key) => fieldByKey(template.fields, key)).filter((field): field is TemplateField => field !== undefined);
  if (fields.length === 0) return null;
  const choices = playerAccessChoices(fields);
  const value = fields.map((field) => playerAccess(template, field.key)).reduce(stricter);
  return (
    <SelectSetting<PlayerAccess>
      label={t('statblock.players')}
      value={value}
      options={choices.map((access) => ({ value: access, label: LABELS[access]() }))}
      onChange={(access) => session.apply((current) => withPlayerAccess(current, keys, access))}
      disabled={readOnly}
    />
  );
}
