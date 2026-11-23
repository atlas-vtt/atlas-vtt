// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { AppearancePanel } from '../../src/app/react/components/command-palette/AppearancePanel';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';

afterEach(cleanup);

function app(): App {
  const storage = new Map<string, unknown>();
  const created = {
    vault: { adapter: { exists: async () => true, write: async () => {} }, getConfig: () => null, setConfig: () => {}, on: () => ({}), offref: () => {} },
    plugins: { plugins: {}, enabledPlugins: new Set(['atlas-vtt']) },
    workspace: { on: () => ({}), offref: () => {} },
    customCss: { theme: 'Minimal', themes: { Minimal: {} }, setTheme: () => {} },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
  } as unknown as App;
  new SettingsService(created);
  return created;
}

it('shows the look cards and the accent colour, as the welcome wizard\'s last page does', () => {
  render(
    <AtlasUIContext.Provider value={{ app: app(), view: null, pixiApp: null, renderer: null }}>
      <AppearancePanel />
    </AtlasUIContext.Provider>,
  );
  expect(screen.getByRole('radiogroup', { name: 'Look' }).querySelectorAll('[role="radio"]')).toHaveLength(3);
  expect(screen.getByRole('radio', { name: 'Your theme', description: 'Minimal' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radiogroup', { name: 'Accent colour' })).toBeTruthy();
});
