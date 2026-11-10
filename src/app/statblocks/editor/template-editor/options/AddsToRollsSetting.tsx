import React from 'react';
import { t } from '../../../../i18n';
import { mayAddToRolls, type TemplateBlock } from '../../../model/templateTypes';
import { editBlock } from '../inspector/blockEdits';
import { SwitchSetting } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';

interface AddsToRollsSettingProps {
  block: TemplateBlock;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * "Add to next roll": each whole number the tile shows gets a switch on the card that adds it, named by its
 * label, to the statblock's next roll. One step; off removes the key, so a template that never used it
 * keeps its file as it was.
 */
export function AddsToRollsSetting({ block, session, readOnly }: AddsToRollsSettingProps): React.JSX.Element | null {
  if (!mayAddToRolls(block)) return null;
  return (
    <SwitchSetting label={t('statblock.addsToRolls')} value={block.addsToRolls === true} disabled={readOnly}
      onChange={(on) => editBlock(session, block.id, block.type, { addsToRolls: on ? true : undefined })} />
  );
}
