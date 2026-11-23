import React from 'react';
import type { App } from 'obsidian';
import type { LookService } from './lookService';
import { LookCards } from './LookCards';
import { AccentColourRow } from './AccentColourRow';
import { SettingChoiceRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';
import './appearance-choices.scss';

interface AppearanceChoicesProps {
  app: App;
  looks: LookService;
}

/** The look and the accent colour: one view, shown by the welcome wizard's last page and the palette's Appearance settings. */
export function AppearanceChoices({ app, looks }: AppearanceChoicesProps): React.JSX.Element {
  return (
    <div className="atlas-appearance-choices">
      <SettingChoiceRow label={t('appearance.look')} hint={t('appearance.lookHint')}>
        <LookCards looks={looks} />
      </SettingChoiceRow>
      <AccentColourRow app={app} />
    </div>
  );
}
