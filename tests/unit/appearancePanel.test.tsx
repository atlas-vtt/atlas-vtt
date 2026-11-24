// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { appearanceSettings } from '../../src/app/api/extensionPoints';
import { SettingsService } from '../../src/app/services/SettingsService';
import { AppearancePanel } from '../../src/app/react/components/command-palette/AppearancePanel';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';

afterEach(() => {
  cleanup();
  appearanceSettings.clear();
});

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

it('offers the ivy colour only while the Medieval look is on, in the same place', () => {
  const host = app();
  render(
    <AtlasUIContext.Provider value={{ app: host, view: null, pixiApp: null, renderer: null }}>
      <AppearancePanel />
    </AtlasUIContext.Provider>,
  );
  const ivy = screen.getByRole('radiogroup', { name: 'Ivy colour' });
  expect(ivy.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByRole('radio', { name: 'Natural' }).getAttribute('aria-checked')).toBe('true');
  act(() => { fireEvent.click(screen.getByRole('radio', { name: 'Medieval' })); });
  expect(ivy.getAttribute('aria-disabled')).toBeNull();
  const violet = ivy.querySelector<HTMLElement>('[aria-label="Violet"]')!;
  act(() => { fireEvent.click(violet); });
  expect(violet.getAttribute('aria-checked')).toBe('true');
});

it('shows the settings other plugins add, and lets go of them when they take them back', () => {
  const unmounted = vi.fn();
  const remove = appearanceSettings.add((el) => {
    el.createEl('p', { text: 'A companion row' });
    return unmounted;
  });
  render(
    <AtlasUIContext.Provider value={{ app: app(), view: null, pixiApp: null, renderer: null }}>
      <AppearancePanel />
    </AtlasUIContext.Provider>,
  );
  expect(screen.getByText('A companion row')).toBeTruthy();
  act(() => remove());
  expect(screen.queryByText('A companion row')).toBeNull();
  expect(unmounted).toHaveBeenCalledTimes(1);
});
