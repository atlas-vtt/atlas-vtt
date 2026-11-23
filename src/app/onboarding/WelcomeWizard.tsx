import React, { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { Check } from 'lucide-react';
import { Tutorial, type TutorialStep } from './Tutorial';
import { Button } from '../packages/components/primitives/button';
import type { SettingsService } from '../services/SettingsService';
import { useHotkeyLabels } from '../keyboard/useMapHotkeys';
import { ATLAS_DISCORD_URL, ATLAS_DOCS_URL } from '../support/communityLinks';
import { COMPANION_URLS, companionInUse, type CompanionId } from './companions';
import { SegmentedControl } from '../packages/components/primitives/SegmentedControl';
import { lookOptions, useLookChoice } from '../react/components/command-palette/AppearancePanel';
import { LookService } from '../appearance/lookService';
import { t } from '../i18n';

interface WelcomeWizardProps {
  app: App;
  settings: SettingsService;
  root: HTMLElement | null;
}

/**
 * A new GM is welcomed wherever Atlas first shows, the start page or a map. GMs who took the start page's or the
 * map's tour before the wizard existed are not welcomed again.
 */
export function shouldWelcome(settings: SettingsService): boolean {
  return settings.shouldShowTutorial('welcome') && settings.shouldShowTutorial('dashboard') && settings.shouldShowTutorial('map');
}

/** The first thing a new GM sees: what Atlas is, where help is, and the add-ons made to go with it. The tours follow. */
export function WelcomeWizard({ app, settings, root }: WelcomeWizardProps): React.JSX.Element {
  const key = useHotkeyLabels();
  const steps = [...welcomeSteps(app, key('palette')), lookStep(LookService.forApp(app, settings))];
  return (
    <Tutorial
      settings={settings}
      id="welcome"
      root={root}
      label={t('tour.welcome.label')}
      steps={steps}
    />
  );
}

function welcomeSteps(app: App, paletteKey: string): TutorialStep[] {
  return [
    { title: t('tour.dashboard.welcomeTitle'), body: t('tour.dashboard.welcomeBody') },
    {
      title: t('tour.welcome.helpTitle'),
      body: t('tour.welcome.helpBody'),
      keys: [paletteKey],
      extra: (
        <div className="atlas-welcome-links">
          <Button variant="secondary" onClick={() => window.open(ATLAS_DISCORD_URL)}>{t('tour.welcome.discord')}</Button>
          <Button variant="ghost" onClick={() => window.open(ATLAS_DOCS_URL)}>{t('tour.welcome.guides')}</Button>
        </div>
      ),
    },
    {
      title: t('tour.welcome.companionsTitle'),
      body: t('tour.welcome.companionsBody'),
      extra: (
        <div className="atlas-welcome-companions">
          <CompanionRow app={app} id="sidebar" />
        </div>
      ),
    },
  ];
}

function lookStep(looks: LookService): TutorialStep {
  return {
    title: t('tour.welcome.lookTitle'),
    body: t('tour.welcome.lookBody'),
    extra: (
      <div className="atlas-welcome-links">
        <LookPicker looks={looks} />
      </div>
    ),
  };
}

function LookPicker({ looks }: { looks: LookService }): React.JSX.Element {
  const look = useLookChoice(looks);
  return <SegmentedControl options={lookOptions()} value={look} ariaLabel={t('appearance.look')} onChange={(choice) => looks.set(choice)} />;
}

function CompanionRow({ app, id }: { app: App; id: CompanionId }): React.JSX.Element {
  const inUse = useCompanionInUse(app, id);
  return (
    <div className="atlas-welcome-companion">
      <div className="atlas-welcome-companion__text">
        <strong>{t(`tour.welcome.${id}Name`)}</strong>
        <span>{t(`tour.welcome.${id}Body`)}</span>
      </div>
      {inUse
        ? <span className="atlas-welcome-companion__status"><Check size={14} aria-hidden="true" />{t('tour.welcome.inUse')}</span>
        : <Button variant="secondary" onClick={() => window.open(COMPANION_URLS[id])}>{t('tour.welcome.view')}</Button>}
    </div>
  );
}

/** Follows the add-on while the wizard shows, so a GM back from installing it sees it ticked. */
function useCompanionInUse(app: App, id: CompanionId): boolean {
  const [inUse, setInUse] = useState(() => companionInUse(app, id));
  useEffect(() => {
    // ponytail: polls once a second while the step shows; Obsidian announces no plugin being enabled.
    const timer = window.setInterval(() => setInUse(companionInUse(app, id)), 1000);
    return () => window.clearInterval(timer);
  }, [app, id]);
  return inUse;
}
