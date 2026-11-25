// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LookService } from '../../src/app/appearance/lookService';
import { WelcomeDialog } from '../../src/app/onboarding/welcome/WelcomeDialog';
import { DashboardTour } from '../../src/app/onboarding/DashboardTour';
import { WelcomeWizard } from '../../src/app/onboarding/WelcomeWizard';

vi.mock('../../src/app/onboarding/useWatched', () => ({ isOnScreen: () => true, useWatched: () => true }));
afterEach(cleanup);
// Exit animations finish at once, so a closed dialog leaves the DOM within the test.
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

function dialog(app: App, settings: SettingsService, onOpenAtlas: () => void = () => {}): React.JSX.Element {
  return <WelcomeDialog app={app} settings={settings} looks={LookService.forApp(app, settings)} carousel={<div>slides</div>} onOpenAtlas={onOpenAtlas} />;
}

const next = (): void => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); };

it('opens on the carousel and pages through help, the look and the community, which opens Atlas', () => {
  const { app, settings } = appWith([]);
  render(dialog(app, settings));
  expect(screen.getByText('slides')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  next();
  expect(screen.queryByText('slides')).toBeNull();
  expect(screen.getByRole('button', { name: 'Read the guides' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Join the Discord/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  next();
  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeTruthy();
  expect(screen.getByText('Change it any time under Appearance settings in the command palette.')).toBeTruthy();
  expect(screen.getByRole('radiogroup', { name: 'Look' }).querySelectorAll('[role="radio"]')).toHaveLength(3);
  expect(screen.getByRole('radiogroup', { name: 'Accent colour' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open Atlas' })).toBeNull();
  next();
  expect(screen.getByRole('heading', { name: 'Atlas grows with its players' })).toBeTruthy();
  for (const name of [/Join the Discord/, /Support on Patreon/, /Help on GitHub/]) expect(screen.getByRole('button', { name })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Open Atlas' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeTruthy();
});

it('opens the community\'s pages in the browser', () => {
  const { app, settings } = appWith([]);
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  render(dialog(app, settings));
  next(); next(); next();
  fireEvent.click(screen.getByRole('button', { name: /Join the Discord/ }));
  fireEvent.click(screen.getByRole('button', { name: /Support on Patreon/ }));
  fireEvent.click(screen.getByRole('button', { name: /Help on GitHub/ }));
  expect(open.mock.calls.map(([url]) => String(url))).toEqual([
    'https://discord.gg/p8unR7zQVr', 'https://www.patreon.com/cw/atlas_vtt', 'https://github.com/atlas-vtt/atlas-vtt',
  ]);
  open.mockRestore();
});

it('completes on Open Atlas, opens Atlas, closes and hands over to the start page tour', async () => {
  const { app, settings } = appWith([]);
  const openAtlas = vi.fn();
  render(<>{dialog(app, settings, openAtlas)}{startPage(app)}</>);
  expect(screen.queryByText('Scenes')).toBeNull();
  for (let page = 0; page < 3; page += 1) next();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Open Atlas' })); });
  expect(settings.shouldShowTutorial('welcome')).toBe(false);
  expect(openAtlas).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Scenes')).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome' })).toBeNull());
});

it('completes on Skip, opens Atlas and closes', async () => {
  const { app, settings } = appWith([]);
  const openAtlas = vi.fn();
  render(dialog(app, settings, openAtlas));
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Skip' })); });
  expect(settings.shouldShowTutorial('welcome')).toBe(false);
  expect(openAtlas).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Welcome' })).toBeNull());
});

it('opens in the document of the view it welcomes in', () => {
  const { app, settings } = appWith([]);
  const popout = document.implementation.createHTMLDocument('popout');
  render(<WelcomeDialog app={app} settings={settings} looks={LookService.forApp(app, settings)} carousel={<div>slides</div>} onOpenAtlas={() => {}} doc={popout} />);
  expect(popout.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('.atlas-welcome')).toBeNull();
});

it('completes on Close and on Escape without opening Atlas', () => {
  const openAtlas = vi.fn();
  const closed = appWith([]);
  render(dialog(closed.app, closed.settings, openAtlas));
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close' })); });
  expect(closed.settings.shouldShowTutorial('welcome')).toBe(false);
  cleanup();
  const escaped = appWith([]);
  render(dialog(escaped.app, escaped.settings, openAtlas));
  act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
  expect(escaped.settings.shouldShowTutorial('welcome')).toBe(false);
  expect(openAtlas).not.toHaveBeenCalled();
});

it('does not welcome a GM who took a tour', () => {
  const { app, settings } = appWith([]);
  settings.completeTutorial('dashboard');
  render(<WelcomeWizard app={app} settings={settings} onOpenAtlas={() => {}} />);
  expect(screen.queryByText('Welcome to Atlas')).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Welcome' })).toBeNull();
});

function startPage(app: App): React.JSX.Element {
  return <DashboardTour app={app} root={document.body} hasScene onCreateScene={() => {}} />;
}

/** Runs `test` with the dialogs' real motion, which jsdom never finishes: a closed dialog stays in its fade. */
async function withMotion(test: () => Promise<void> | void): Promise<void> {
  MotionGlobalConfig.skipAnimations = false;
  try { await test(); } finally { MotionGlobalConfig.skipAnimations = true; }
}

it('fades out over the start page tour, which already shows and takes the keys', async () => {
  await withMotion(() => {
    const { app, settings } = appWith([]);
    render(<>{dialog(app, settings)}{startPage(app)}</>);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Skip' })); });
    expect(document.querySelector('.atlas-welcome-overlay')).not.toBeNull();
    expect(screen.getByText('Scenes')).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(settings.shouldShowTutorial('dashboard')).toBe(false);
  });
});

it('leaves the focus on the start page tour once it is gone', async () => {
  const { app, settings } = appWith([]);
  // What had the focus before Atlas welcomed the GM: closing the welcome must not hand it back over the tour.
  const before = document.body.appendChild(document.createElement('button'));
  before.focus();
  render(<>{dialog(app, settings)}{startPage(app)}</>);
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Skip' })); });
  await waitFor(() => expect(document.querySelector('.atlas-welcome-overlay')).toBeNull());
  await act(async () => { await new Promise((done) => setTimeout(done, 50)); });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next' }));
  before.remove();
});

it('moves as a window that holds the dialog, so a look\'s ornament can hang from it and the dialog clips inside', () => {
  const { app, settings } = appWith([]);
  render(dialog(app, settings));
  const shown = screen.getByRole('dialog', { name: 'Welcome' });
  expect(shown.className).toBe('atlas-welcome');
  expect(shown.parentElement!.className).toBe('atlas-welcome-window');
  expect(shown.parentElement!.parentElement!.classList.contains('atlas-welcome-overlay')).toBe(true);
});
