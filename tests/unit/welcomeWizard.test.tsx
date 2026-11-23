// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { DashboardTour } from '../../src/app/onboarding/DashboardTour';

vi.mock('../../src/app/onboarding/useWatched', () => ({ isOnScreen: () => true, useWatched: () => true }));
afterEach(cleanup);

function appWith(plugins: string[], theme = ''): { app: App; settings: SettingsService } {
  const app = {
    vault: { adapter: { exists: async () => true, write: async () => {} } },
    plugins: { plugins: {}, enabledPlugins: new Set(plugins) },
    customCss: { theme },
  } as unknown as App;
  return { app, settings: new SettingsService(app) };
}

const tour = (app: App): React.JSX.Element => <DashboardTour app={app} root={document.body} hasScene onCreateScene={() => {}} />;

it('welcomes a new GM first, offers the add-ons it lacks, then hands over to the start page tour', () => {
  const { app, settings } = appWith([], 'Atlas VTT');
  render(tour(app));
  expect(screen.getByText('Welcome to Atlas')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Join the Discord' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getAllByRole('button', { name: 'View in Obsidian' })).toHaveLength(1);
  expect(screen.getByText('In use')).toBeTruthy();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Got it' })); });
  expect(settings.shouldShowTutorial('welcome')).toBe(false);
  expect(screen.getByText('Scenes')).toBeTruthy();
});

it('does not welcome a GM who took the start page tour before the wizard existed', () => {
  const { app, settings } = appWith(['atlas-sidebar']);
  settings.completeTutorial('dashboard');
  render(tour(app));
  expect(screen.queryByText('Welcome to Atlas')).toBeNull();
});
