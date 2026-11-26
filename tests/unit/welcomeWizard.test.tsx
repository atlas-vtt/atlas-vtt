// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
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
    vault: { adapter: { exists: async () => true, write: async () => {} }, getConfig: () => null, setConfig: () => {}, on: () => ({}), offref: () => {} },
    plugins: { plugins: {}, enabledPlugins: new Set(plugins) },
    workspace: { on: () => ({}), offref: () => {} },
    customCss: { theme: 'Minimal', themes: { Minimal: {} }, setTheme: () => {} },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
  } as unknown as App;
  return { app, settings: new SettingsService(app) };
}

it('holds the map tour back until the GM is welcomed, then the map tour follows', () => {
  const { app, settings } = appWith([]);
  const store = createViewAtlasStore(createInMemoryApp().app, 'welcome-view');
  store.getState().setPersistenceEnabled(false);
  store.setState({ isMapLoading: false, mapLoaded: true });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><MapTours root={document.body} settings={settings} /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  expect(screen.queryByText('Your first scene')).toBeNull();
  act(() => { settings.completeTutorial('welcome'); });
  expect(screen.getByText('Your first scene')).toBeTruthy();
  expect(settings.shouldShowTutorial('dashboard')).toBe(true);
});

it('offers the look, and the choice is this device\'s', () => {
  const { app, settings } = appWith([]);
  render(<WelcomeWizard app={app} settings={settings} onOpenAtlas={() => {}} />);
  for (let page = 0; page < 2; page += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeTruthy();
  expect(screen.getByRole('radiogroup', { name: 'Accent colour' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Your theme' }).getAttribute('aria-checked')).toBe('true');
  act(() => { fireEvent.click(screen.getByRole('radio', { name: 'Sci-fi' })); });
  expect(LookService.forApp(app, settings).get()).toBe('scifi');
  expect(screen.getByRole('radio', { name: 'Sci-fi' }).getAttribute('aria-checked')).toBe('true');
});
