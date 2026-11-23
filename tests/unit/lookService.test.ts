// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { App, Plugin } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LookService } from '../../src/app/appearance/lookService';
import { CUSTOM_ACCENT_CLASS, LOOK_CLASS, SCIFI_LOOK_CLASS, registerLookSync } from '../../src/app/appearance/atlasLook';

const ATLAS_ID = 'atlas-vtt';

interface Stub {
  app: App;
  settings: SettingsService;
  setTheme: ReturnType<typeof vi.fn>;
  css: { theme: string; themes: Record<string, unknown> };
}

/** An app whose local storage drops falsy values, as Obsidian's does. */
function stub(theme = '', storage = new Map<string, unknown>()): Stub {
  const css = { theme, themes: { Minimal: {}, Things: {}, 'Atlas VTT': {} } as Record<string, unknown> };
  const setTheme = vi.fn((name: string) => { css.theme = name; });
  const config = new Map<string, unknown>();
  const configListeners = new Set<(key: string) => void>();
  const app = {
    vault: {
      adapter: { exists: async () => true, write: async () => {} },
      getConfig: (key: string) => config.get(key) ?? null,
      setConfig: (key: string, value: unknown) => { config.set(key, value); configListeners.forEach((listener) => listener(key)); },
      on: (_name: string, callback: (key: string) => void) => { configListeners.add(callback); return callback; },
      offref: (ref: (key: string) => void) => { configListeners.delete(ref); },
    },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
    customCss: Object.assign(css, { setTheme }),
    plugins: { enabledPlugins: new Set([ATLAS_ID]) },
  } as unknown as App;
  return { app, settings: new SettingsService(app), setTheme, css };
}

const looks = ({ app, settings }: Stub): LookService => LookService.forApp(app, settings);

afterEach(() => { document.body.className = ''; });

it('starts on the GM\'s own theme', () => {
  expect(looks(stub('Minimal')).get()).toBe('own');
});

it('switches Obsidian to its default theme for an Atlas look and remembers the GM\'s', () => {
  const s = stub('Minimal');
  const service = looks(s);
  service.set('scifi');
  expect(s.setTheme).toHaveBeenCalledWith('');
  expect(service.previousThemeName()).toBe('Minimal');
  expect(service.get()).toBe('scifi');
  expect(s.settings.getFogEdge().style).toBe('soft');
});

it('gives the dice the numerals of the look picked', () => {
  const s = stub('Minimal');
  const service = looks(s);
  service.set('scifi');
  expect(s.settings.getDiceLook().font).toBe('scifi');
  service.set('mediaeval');
  expect(s.settings.getDiceLook().font).toBe('medieval');
});

it('puts the GM\'s theme back for their own look', () => {
  const s = stub('Minimal');
  const service = looks(s);
  service.set('scifi');
  service.set('own');
  expect(s.setTheme).toHaveBeenLastCalledWith('Minimal');
  expect(s.css.theme).toBe('Minimal');
});

it('falls back to the default theme when the remembered one is gone', () => {
  const s = stub('Minimal');
  const service = looks(s);
  service.set('mediaeval');
  delete s.css.themes.Minimal;
  service.set('own');
  expect(s.setTheme).not.toHaveBeenCalledWith('Minimal');
  expect(s.css.theme).toBe('');
});

it('keeps the Atlas look across a reload', () => {
  const storage = new Map<string, unknown>();
  const first = stub('Minimal', storage);
  looks(first).set('scifi');
  const second = stub('', storage);
  const service = looks(second);
  service.reconcileAtStart();
  expect(service.get()).toBe('scifi');
  expect(service.previousThemeName()).toBe('Minimal');
  expect(second.setTheme).not.toHaveBeenCalled();
});

it('remembers the default theme as the GM\'s own, though Obsidian drops an empty value', () => {
  const storage = new Map<string, unknown>();
  looks(stub('', storage)).set('mediaeval');
  const service = looks(stub('', storage));
  expect(service.previousThemeName()).toBe('');
});

it('keeps a GM on the retired Atlas VTT theme on their own theme', () => {
  const s = stub('Atlas VTT');
  const service = looks(s);
  service.reconcileAtStart();
  expect(service.get()).toBe('own');
  expect(s.setTheme).not.toHaveBeenCalled();
  expect(s.css.theme).toBe('Atlas VTT');
});

it('takes the GM\'s own look when another theme was picked while Atlas was off', () => {
  const storage = new Map<string, unknown>();
  looks(stub('Minimal', storage)).set('scifi');
  const second = stub('Things', storage);
  const service = looks(second);
  service.reconcileAtStart();
  expect(service.get()).toBe('own');
  expect(second.setTheme).not.toHaveBeenCalled();
});

it('steps aside when another theme is picked', () => {
  const s = stub('Minimal');
  const service = looks(s);
  service.set('scifi');
  const heard = vi.fn();
  service.onChange(heard);
  s.css.theme = 'Things';
  service.followThemeChange();
  expect(service.get()).toBe('own');
  expect(heard).toHaveBeenCalled();
  expect(s.css.theme).toBe('Things');
});

it('restores the theme only when Atlas is disabled', () => {
  const s = stub('Minimal');
  const service = looks(s);
  service.set('scifi');
  s.setTheme.mockClear();
  service.restoreOnDisable(ATLAS_ID);
  expect(s.setTheme).not.toHaveBeenCalled();
  (s.app.plugins as unknown as { enabledPlugins: Set<string> }).enabledPlugins.delete(ATLAS_ID);
  service.restoreOnDisable(ATLAS_ID);
  expect(s.setTheme).toHaveBeenCalledWith('Minimal');
});

it('sets the look\'s classes on body', () => {
  const s = stub('Minimal');
  const service = looks(s);
  const disposers: (() => void)[] = [];
  const trigger = vi.fn();
  const plugin = {
    app: Object.assign(s.app, { workspace: { on: () => ({}), offref: () => {}, iterateAllLeaves: () => {}, trigger } }),
    register: (dispose: () => void) => { disposers.push(dispose); },
    registerEvent: () => {},
  } as unknown as Plugin;
  registerLookSync(plugin, service);
  expect(document.body.classList.contains(LOOK_CLASS)).toBe(false);
  service.set('scifi');
  expect(document.body.classList.contains(LOOK_CLASS)).toBe(true);
  expect(document.body.classList.contains(SCIFI_LOOK_CLASS)).toBe(true);
  expect(trigger).toHaveBeenCalledWith('css-change');
  service.set('mediaeval');
  expect(document.body.classList.contains(LOOK_CLASS)).toBe(true);
  expect(document.body.classList.contains(SCIFI_LOOK_CLASS)).toBe(false);
  service.set('own');
  expect(document.body.classList.contains(LOOK_CLASS)).toBe(false);
  for (const dispose of disposers) dispose();
});

it('marks body while an Atlas look is on and a custom accent is set', () => {
  const s = stub('');
  s.app.vault.setConfig('accentColor', '#6b8f3a');
  const disposers: (() => void)[] = [];
  const plugin = {
    app: Object.assign(s.app, { workspace: { on: () => ({}), offref: () => {}, iterateAllLeaves: () => {}, trigger: () => {} } }),
    register: (dispose: () => void) => { disposers.push(dispose); },
    registerEvent: () => {},
  } as unknown as Plugin;
  const service = looks(s);
  registerLookSync(plugin, service);
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(false);
  service.set('scifi');
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(true);
  s.app.vault.setConfig('accentColor', '');
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(false);
  s.app.vault.setConfig('accentColor', '#c9a227');
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(true);
  service.set('own');
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(false);
  service.set('mediaeval');
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(true);
  for (const dispose of disposers) dispose();
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(false);
  s.app.vault.setConfig('accentColor', '#2a9d8f');
  expect(document.body.classList.contains(CUSTOM_ACCENT_CLASS)).toBe(false);
});

it('names the GM\'s own theme: the one in use while they keep it, else the one remembered', () => {
  const s = stub('Minimal');
  const service = looks(s);
  expect(service.ownThemeName()).toBe('Minimal');
  service.set('mediaeval');
  expect(s.css.theme).toBe('');
  expect(service.ownThemeName()).toBe('Minimal');
});
