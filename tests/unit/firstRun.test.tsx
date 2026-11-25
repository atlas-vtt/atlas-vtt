// @vitest-environment jsdom
import type { App, Plugin } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { act, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { startFirstRun } from '../../src/app/plugin/firstRun';
import { releasePortalHosts } from '../../src/app/host/portalHost';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

const cleanups: Array<() => void> = [];
afterEach(() => {
  act(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
  releasePortalHosts();
});

function pluginWith(): { plugin: Plugin; settings: SettingsService; setViewState: ReturnType<typeof vi.fn> } {
  const storage = new Map<string, unknown>();
  const setViewState = vi.fn(async () => {});
  const app = {
    vault: { adapter: { exists: async () => true, write: async () => {} }, getConfig: () => null, setConfig: () => {}, on: () => ({}), offref: () => {} },
    plugins: { plugins: {}, enabledPlugins: new Set<string>() },
    workspace: { on: () => ({}), offref: () => {}, rootSplit: {}, getMostRecentLeaf: () => null, getLeaf: () => ({ setViewState }), setActiveLeaf: () => {} },
    customCss: { theme: 'Minimal', themes: { Minimal: {} }, setTheme: () => {} },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
  } as unknown as App;
  const plugin = { app, register: (cleanup: () => void) => { cleanups.push(cleanup); } } as unknown as Plugin;
  return { plugin, settings: new SettingsService(app), setViewState };
}

it('welcomes a new GM at once, over Obsidian, with no start page opened behind the wizard', () => {
  const { plugin, settings, setViewState } = pluginWith();
  act(() => { startFirstRun(plugin, settings, false); });
  expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeTruthy();
  expect(setViewState).not.toHaveBeenCalled();
});

it('opens the start page once the GM skips the welcome', async () => {
  const { plugin, settings, setViewState } = pluginWith();
  act(() => { startFirstRun(plugin, settings, false); });
  await act(async () => { screen.getByRole('button', { name: 'Skip' }).click(); });
  expect(settings.shouldShowTutorial('welcome')).toBe(false);
  expect(setViewState).toHaveBeenCalledWith({ type: 'atlas-vtt-dashboard', state: {} });
});

it('opens the start page of a vault Atlas never ran in when its GM was welcomed before', () => {
  const { plugin, settings, setViewState } = pluginWith();
  settings.completeTutorial('welcome');
  act(() => { startFirstRun(plugin, settings, false); });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(setViewState).toHaveBeenCalledTimes(1);
});

it('opens nothing in a vault Atlas ran in before when its GM was welcomed', () => {
  const { plugin, settings, setViewState } = pluginWith();
  settings.completeTutorial('welcome');
  act(() => { startFirstRun(plugin, settings, true); });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(setViewState).not.toHaveBeenCalled();
});

it('takes the wizard away when Atlas unloads', () => {
  const { plugin, settings } = pluginWith();
  act(() => { startFirstRun(plugin, settings, true); });
  expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeTruthy();
  act(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
  expect(screen.queryByRole('dialog')).toBeNull();
});
