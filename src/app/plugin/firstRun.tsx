import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Plugin } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { WelcomeWizard, shouldWelcome } from '../onboarding/WelcomeWizard';
import { portalHost } from '../host/portalHost';
import { openDashboard } from './registerCommands';

/**
 * What a GM meets first. A GM still to be welcomed gets the welcome wizard over Obsidian as soon as Atlas runs, right
 * after installing it, before any view of Atlas; its Open Atlas and Skip lead on to the start page, whose tour follows.
 * A vault Atlas never ran in opens on the start page when its GM is not to be welcomed.
 */
export function startFirstRun(plugin: Plugin, settings: SettingsService, existingInstallation: boolean): void {
  if (!shouldWelcome(settings)) {
    if (!existingInstallation) void openDashboard(plugin);
    return;
  }
  const container = portalHost().createDiv();
  const root = createRoot(container);
  root.render(<WelcomeWizard app={plugin.app} settings={settings} onOpenAtlas={() => void openDashboard(plugin)} />);
  plugin.register(() => {
    root.unmount();
    container.remove();
  });
}
