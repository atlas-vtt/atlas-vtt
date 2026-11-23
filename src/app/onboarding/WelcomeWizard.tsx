import React from 'react';
import type { App } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { LookService } from '../appearance/lookService';
import { WelcomeDialog } from './welcome/WelcomeDialog';
import { WelcomeText } from './welcome/welcomePages';
import { t } from '../i18n';

interface WelcomeWizardProps {
  app: App;
  settings: SettingsService;
}

/**
 * A new GM is welcomed wherever Atlas first shows, the start page or a map. GMs who took the start page's or the
 * map's tour before the wizard existed are not welcomed again.
 */
export function shouldWelcome(settings: SettingsService): boolean {
  return settings.shouldShowTutorial('welcome') && settings.shouldShowTutorial('dashboard') && settings.shouldShowTutorial('map');
}

/** The first thing a new GM sees: what Atlas is, where help is, Atlas Sidebar and the look. The tours follow. */
export function WelcomeWizard({ app, settings }: WelcomeWizardProps): React.JSX.Element | null {
  return <WelcomeDialog app={app} settings={settings} looks={LookService.forApp(app, settings)} carousel={<WelcomeSlide />} />;
}

function WelcomeSlide(): React.JSX.Element {
  return (
    <div className="atlas-welcome-page atlas-welcome-page--text">
      <WelcomeText
        kicker={t('tour.welcome.slides.welcome.kicker')}
        title={t('tour.welcome.slides.welcome.title')}
        body={t('tour.welcome.slides.welcome.body')}
      />
    </div>
  );
}
