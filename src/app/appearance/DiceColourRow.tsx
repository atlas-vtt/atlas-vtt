import React from 'react';
import type { App } from 'obsidian';
import { DiceColourStrip } from '../react/components/command-palette/DiceColourStrip';
import { useDiceLook } from '../react/hooks/useDiceLook';
import { useDicePreviews } from '../react/hooks/useDicePreviews';
import { SettingsService } from '../services/SettingsService';
import { t } from '../i18n';

/** The dice colour of the appearance choices, as a centred row of the d20s each colour gives; the same setting as the Dice settings'. */
export function DiceColourRow({ app }: { app: App }): React.JSX.Element {
  const look = useDiceLook(app);
  const previews = useDicePreviews(app, look.font);
  return (
    <div className="atlas-setting-group atlas-appearance-dice">
      <div className="atlas-setting-row-info">
        <span className="atlas-setting-label">{t('diceSettings.colour')}</span>
        <span className="atlas-setting-hint">{t('appearance.diceHint')}</span>
      </div>
      <DiceColourStrip value={look.colour} previews={previews} onChange={(colour) => SettingsService.forApp(app)?.setDiceLook({ colour })} />
    </div>
  );
}
