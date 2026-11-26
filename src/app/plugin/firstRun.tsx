import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Plugin } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { WelcomeWizard, shouldWelcome } from '../onboarding/WelcomeWizard';
import { portalHost } from '../host/portalHost';
import { openDashboard } from './registerCommands';

/**
 * What a GM meets first. A GM still to be welcomed gets the welcome wizard over Obsidian as soon as Atlas runs, right
 * after installing it or updating to an Atlas with the wizard, before any view of Atlas; its Open Atlas leads on to the
 * start page, whose tour follows.
 * A vault Atlas never ran in opens on the start page when its GM is not to be welcomed. `afterWelcome` (the release
 * notes of an update) waits until the wizard is done, so the two never stand over each other.
 */
export function startFirstRun(plugin: Plugin, settings: SettingsService, existingInstallation: boolean, afterWelcome: () => void): void {
  if (!shouldWelcome(settings)) {
    if (!existingInstallation) void openDashboard(plugin);
    afterWelcome();
    return;
  }
  const container = portalHost().createDiv();
  const root = createRoot(container);
  const openAtlas = (): void => {
    void openDashboard(plugin);
    afterWelcome();
  };
  root.render(<WelcomeWizard app={plugin.app} settings={settings} onOpenAtlas={openAtlas} />);
  plugin.register(() => {
    root.unmount();
    container.remove();
  });
}
