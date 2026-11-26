import React, { useId } from 'react';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TRAY_SURFACE, TRAY_TOOLTIP_GAP } from './diceTrayPool';
import { t } from '../../../i18n';

/** The GM's switch for whether players see their rolls (`useShareRolls`). */
export interface ShareRolls {
  shown: boolean;
  onToggle: () => void;
}

/** "Show to players" and its switch (S), beside the roll history's toggle. */
export function DiceTrayShare({ shareRolls }: { shareRolls: ShareRolls }): React.ReactElement {
  const shareId = useId();
  return (
    <div className="atlas-dice-tray__share">
      {/* Short on the row; the switch's name and tooltip say it whole. */}
      <span className="atlas-dice-tray__share-label" aria-hidden="true" onClick={shareRolls.onToggle}>{t('diceRoll.showToPlayers')}</span>
      <span id={shareId} hidden>{t('dice.showRollsToPlayers')}</span>
      <LabelTooltip label={t('dice.showRollsToPlayers')} shortcut="S" outside={TRAY_SURFACE} side="right" sideOffset={TRAY_TOOLTIP_GAP}>
        <ToggleSwitch value={shareRolls.shown} onChange={shareRolls.onToggle} labelledBy={shareId} />
      </LabelTooltip>
    </div>
  );
}
