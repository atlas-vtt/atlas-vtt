import React from 'react';
import { t } from '../../../../i18n';
import type { MetricBlock, PairsBlock, ScoresBlock, StatBlock, TemplateBlock } from '../../../model/templateTypes';
import { editBlock } from '../inspector/blockEdits';
import { SwitchSetting } from '../inspector/InspectorControls';
import type { EditorSession } from '../sessionTypes';

/** The blocks whose whole numbers may roll as a bonus. */
type RollableBlock = StatBlock | MetricBlock | ScoresBlock | PairsBlock;

function isRollableBlock(block: TemplateBlock): block is RollableBlock {
  return block.type === 'stat' || block.type === 'metric' || block.type === 'scores' || block.type === 'pairs';
}

interface RollSettingProps {
  block: TemplateBlock;
  session: EditorSession;
  readOnly: boolean;
}

/**
 * "Roll as a bonus": every whole number the tile shows becomes a roll link, `2` rolling `+2` with the
 * game's own dice. One step; off removes the key, so a template that never used it keeps its file.
 */
export function RollSetting({ block, session, readOnly }: RollSettingProps): React.JSX.Element | null {
  if (!isRollableBlock(block)) return null;
  return (
    <SwitchSetting label={t('statblock.rollAsBonus')} value={block.rollable === true} disabled={readOnly}
      onChange={(on) => editBlock(session, block.id, block.type, { rollable: on ? true : undefined })} />
  );
}
