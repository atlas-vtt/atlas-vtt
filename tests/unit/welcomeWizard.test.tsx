// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DashboardTour } from '../../src/app/onboarding/DashboardTour';
import { MapTours } from '../../src/app/onboarding/MapTours';
import { WelcomeWizard } from '../../src/app/onboarding/WelcomeWizard';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { LookService } from '../../src/app/appearance/lookService';

vi.mock('../../src/app/onboarding/useWatched', () => ({ isOnScreen: () => true, useWatched: () => true }));
afterEach(cleanup);
beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

function appWith(plugins: string[]): { app: App; settings: SettingsService } {
  const storage = new Map<string, unknown>();
  const app = {
    vault: { adapter: { exists: async () => true, write: async () => {} } },
    plugins: { plugins: {}, enabledPlugins: new Set(plugins) },
    workspace: { on: () => ({}), offref: () => {} },
    customCss: { theme: 'Minimal', themes: { Minimal: {} }, setTheme: () => {} },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
  } as unknown as App;
  return { app, settings: new SettingsService(app) };
}

const tour = (app: App): React.JSX.Element => <DashboardTour app={app} root={document.body} hasScene onCreateScene={() => {}} />;

it('welcomes a GM whose first sight of Atlas is a map, and the map tour follows', () => {
  const { app, settings } = appWith([]);
  const store = createViewAtlasStore(createInMemoryApp().app, 'welcome-view');
  store.getState().setPersistenceEnabled(false);
  store.setState({ isMapLoading: false, mapLoaded: true });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><MapTours root={document.body} settings={settings} /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  expect(screen.getByText('Welcome to Atlas')).toBeTruthy();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Skip' })); });
  expect(screen.getByText('Your first scene')).toBeTruthy();
  expect(settings.shouldShowTutorial('dashboard')).toBe(true);
});

it('offers the look, and the choice is this device\'s', () => {
  const { app, settings } = appWith(['atlas-sidebar']);
  render(tour(app));
  for (let page = 0; page < 3; page += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Pick a look')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Your theme' }).getAttribute('aria-checked')).toBe('true');
  act(() => { fireEvent.click(screen.getByRole('radio', { name: 'Sci-fi' })); });
  expect(LookService.forApp(app, settings).get()).toBe('scifi');
  expect(screen.getByRole('radio', { name: 'Sci-fi' }).getAttribute('aria-checked')).toBe('true');
});

it('shows one welcome for an app however many views mount it, and another view takes over when the first goes', () => {
  const { app, settings } = appWith([]);
  const first = render(<WelcomeWizard app={app} settings={settings} />);
  render(<WelcomeWizard app={app} settings={settings} />);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  act(() => { first.unmount(); });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});
