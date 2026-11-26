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

/** Every GM is welcomed once: a new one, and one updating from an Atlas that had no wizard yet. */
export function shouldWelcome(settings: SettingsService): boolean {
  return !settings.hasBeenWelcomed();
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
