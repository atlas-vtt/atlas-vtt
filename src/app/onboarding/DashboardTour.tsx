import React from 'react';
import type { App } from 'obsidian';
import { Tutorial } from './Tutorial';
import { SettingsService } from '../services/SettingsService';
import { isOnScreen, useWatched } from './useWatched';
import { t } from '../i18n';
import { useAtlasSettings } from '../keyboard/useMapHotkeys';
import { WelcomeWizard, shouldWelcome } from './WelcomeWizard';

interface DashboardTourProps {
  app: App;
  /** The start page's element: the tour waits while its tab is behind another. */
  root: HTMLElement | null;
  /** The vault has a scene already; without one the tour ends by making the first. */
  hasScene: boolean;
  onCreateScene: () => void;
}

/** Atlas' welcome: the first time the start page shows, the welcome wizard, then where things begin. */
export function DashboardTour({ app, root, hasScene, onCreateScene }: DashboardTourProps): React.JSX.Element | null {
  // Subscribed, so the start page's tour follows as soon as the wizard is done.
  const settings = useAtlasSettings(SettingsService.forApp(app));
  const shown = useWatched(root, isOnScreen);
  if (!shown || !settings) return null;
  if (shouldWelcome(settings)) return <WelcomeWizard app={app} settings={settings} />;
  return (
    <Tutorial
      settings={settings}
      id="dashboard"
      root={root}
      steps={[
        { title: t('tour.dashboard.sceneTitle'), body: t('tour.dashboard.sceneBody'), selector: '.continue-hero' },
        { title: t('tour.dashboard.assetsTitle'), body: t('tour.dashboard.assetsBody'), selector: '.dashboard-topbar__action--assets' },
        { title: t('tour.dashboard.campaignsTitle'), body: t('tour.dashboard.campaignsBody'), selector: '.dashboard-campaigns' },
      ]}
      action={hasScene ? undefined : { label: t('dashboard.firstScene'), onClick: onCreateScene }}
    />
  );
}
