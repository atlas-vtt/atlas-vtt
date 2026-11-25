import React from 'react';
import type { App } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { LookService } from '../appearance/lookService';
import { WelcomeDialog } from './welcome/WelcomeDialog';
import { WelcomeCarousel } from './welcome/WelcomeCarousel';

interface WelcomeWizardProps {
  app: App;
  settings: SettingsService;
  /** Opens Atlas' start page: where Open Atlas and Skip lead. */
  onOpenAtlas: () => void;
}

/** A new GM is welcomed once. GMs who took the start page's or the map's tour before the wizard existed are not welcomed. */
export function shouldWelcome(settings: SettingsService): boolean {
  return settings.shouldShowTutorial('welcome') && settings.shouldShowTutorial('dashboard') && settings.shouldShowTutorial('map');
}

/**
 * The first thing a new GM sees: what Atlas is, where help is, the look, and the community around it. Render it whether
 * or not the GM is welcomed (it shows only for `shouldWelcome`), so it stays mounted to close with its motion.
 */
export function WelcomeWizard({ app, settings, onOpenAtlas }: WelcomeWizardProps): React.JSX.Element {
  return (
    <WelcomeDialog
      app={app}
      settings={settings}
      looks={LookService.forApp(app, settings)}
      carousel={<WelcomeCarousel />}
      open={shouldWelcome(settings)}
      onOpenAtlas={onOpenAtlas}
    />
  );
}
