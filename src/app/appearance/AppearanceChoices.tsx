import React from 'react';
import type { App } from 'obsidian';
import type { LookService } from './lookService';
import { LookCards } from './LookCards';
import { AccentColourRow } from './AccentColourRow';
import { IvyColourRow } from './IvyColourRow';
import { SettingChoiceRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';
import './appearance-choices.scss';

interface AppearanceChoicesProps {
  app: App;
  looks: LookService;
}

/** The look, the accent colour and the Medieval look's ivy colour: one view, shown by the welcome wizard's Make it yours page and the palette's Appearance settings. */
export function AppearanceChoices({ app, looks }: AppearanceChoicesProps): React.JSX.Element {
  return (
    <div className="atlas-appearance-choices">
      <SettingChoiceRow label={t('appearance.look')} hint={t('appearance.lookHint')}>
        <LookCards looks={looks} />
      </SettingChoiceRow>
      <div className="atlas-appearance-colours">
        <AccentColourRow app={app} />
        <IvyColourRow looks={looks} />
      </div>
    </div>
  );
}
