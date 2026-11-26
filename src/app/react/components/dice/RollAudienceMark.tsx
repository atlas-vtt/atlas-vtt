import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { RollAudience } from './diceSourcePresentation';
import { t } from '../../../i18n';

/**
 * An eye on the GM's roll where the players saw it too, a crossed-out eye where only
 * the GM did. Nothing without an audience: the player window and the statblock pane
 * never mark their rolls.
 */
export function RollAudienceMark({ audience, className }: { audience: RollAudience | undefined; className?: string }): React.ReactElement | null {
  if (!audience) return null;
  const shown = audience === 'players';
  const Icon = shown ? Eye : EyeOff;
  return (
    <LabelTooltip label={shown ? t('diceRoll.shownToPlayers') : t('diceRoll.hiddenFromPlayers')}>
      <span role="img" className={cn('atlas-roll-audience', !shown && 'atlas-roll-audience--gm', className)}>
        <Icon aria-hidden="true" />
      </span>
    </LabelTooltip>
  );
}
