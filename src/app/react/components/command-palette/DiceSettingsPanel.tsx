import React from 'react';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useDiceDisplay } from '../../hooks/useDiceDisplay';
import { useDiceLook } from '../../hooks/useDiceLook';
import { useDicePreviews } from '../../hooks/useDicePreviews';
import { useShareRolls } from '../../hooks/useShareRolls';
import { DICE_DISPLAY_HINTS, DICE_DISPLAY_OPTIONS } from '../../../dice3d/diceDisplay';
import { DICE_FONT_OPTIONS } from '../../../dice3d/diceLook';
import { SettingsService } from '../../../services/SettingsService';
import { DiceColourStrip } from './DiceColourStrip';
import { SettingRow, SettingToggleRow } from './SettingRows';
import { t } from '../../../i18n';

/** How dice rolls look, for every map: how they are shown, and the dice themselves. */
export function DiceSettingsPanel(): React.ReactElement {
  const { app } = useAtlasUI();
  const display = useDiceDisplay(app ?? undefined);
  const look = useDiceLook(app ?? undefined);
  const previews = useDicePreviews(app ?? undefined, look.font);
  const settings = SettingsService.forApp(app ?? undefined);
  const shareRolls = useShareRolls();

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">Rolls</h3>
        <SettingRow label="Roll display" hint={DICE_DISPLAY_HINTS[display]}>
          <SegmentedControl
            ariaLabel="Roll display"
            value={display}
            options={DICE_DISPLAY_OPTIONS}
            onChange={(value) => settings?.setDiceDisplay(value)}
          />
        </SettingRow>
        {shareRolls && (
          <SettingToggleRow
            label={t('dice.showRollsToPlayers')}
            hint={t('dice.showRollsToPlayersHint')}
            value={shareRolls.shown}
            onToggle={shareRolls.onToggle}
          />
        )}
      </div>

      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">Dice</h3>
        <DiceColourStrip value={look.colour} previews={previews} onChange={(colour) => settings?.setDiceLook({ colour })} />
        <SettingRow label="Numbers" hint="Medieval for high fantasy, sci-fi for futuristic games.">
          <SegmentedControl
            ariaLabel="Dice numbers"
            value={look.font}
            options={DICE_FONT_OPTIONS}
            onChange={(font) => settings?.setDiceLook({ font })}
          />
        </SettingRow>
      </div>
    </div>
  );
}
