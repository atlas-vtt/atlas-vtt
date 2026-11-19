// @vitest-environment jsdom
import React from 'react';
import type { App, Command, Plugin } from 'obsidian';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {} }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'dashboard' }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: {} }));
vi.mock('../../src/app/plugin/cleanupMissingAssets', () => ({ cleanupMissingAssets: vi.fn() }));

import { formatList, getLocale, resolveLocale, setLocale, t } from '../../src/app/i18n';
import { en } from '../../src/app/i18n/locales/en';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { it as italian } from '../../src/app/i18n/locales/it';
import { Tutorial } from '../../src/app/onboarding/Tutorial';
import { registerCommands, type CommandDependencies } from '../../src/app/plugin/registerCommands';
import { CreatureFieldSuggestions } from '../../src/app/react/components/collection-settings/CreatureFieldSuggestions';
import { SettingsService } from '../../src/app/services/SettingsService';

afterEach(() => {
  cleanup();
  setLocale('en', TRANSLATIONS);
});

describe('Atlas in Italian', () => {
  beforeEach(() => setLocale('it', TRANSLATIONS));

  it('recognises Obsidian language codes and regional variants', () => {
    expect(resolveLocale('it', TRANSLATIONS)).toBe('it');
    expect(resolveLocale('IT', TRANSLATIONS)).toBe('it');
    expect(resolveLocale('it-IT', TRANSLATIONS)).toBe('it');
    expect(resolveLocale('it-CH', TRANSLATIONS)).toBe('it');
    expect(getLocale()).toBe('it');
  });

  it('keeps current translations nonempty and falls back for new upstream texts', () => {
    expect(Object.keys(italian).every((key) => key in en)).toBe(true);
    expect(t('dungeon.title')).toBe(en['dungeon.title']);
    for (const [key, message] of Object.entries(italian)) {
      const forms = typeof message === 'string' ? [message] : Object.values(message);
      for (const form of forms) expect(form.trim(), key).not.toBe('');
    }
  });

  it('uses Italian plural forms and number formatting', () => {
    expect(t('count.items', { count: 0 })).toBe('0 elementi');
    expect(t('count.items', { count: 1 })).toBe('1 elemento');
    expect(t('count.items', { count: 2 })).toBe('2 elementi');
    expect(t('count.items', { count: 12000 })).toBe('12.000 elementi');
    expect(t('bundle.filesWritten', { count: 1 })).toBe('1 file scritto');
    expect(t('bundle.filesWritten', { count: 2 })).toBe('2 file scritti');
    expect(formatList(['goblin', 'orco', 'troll'])).toBe('goblin, orco e troll');
  });

  it('covers the translated settings, command palette, senses and initiative sections', () => {
    const groups = ['palette.', 'graphics.', 'levels.', 'experimental.', 'diceSettings.', 'am.bestiary.', 'senses.', 'initiative.', 'settings.', 'audio.settings.', 'audio.output'];
    const missing = Object.keys(en).filter((key) => groups.some((group) => key.startsWith(group)) && !(key in italian));
    expect(missing).toEqual([]);
  });

  it('preserves user paths and names when interpolating messages', () => {
    expect(t('view.sceneNotFound', { path: 'Maps/Crypt.atlasmap' })).toBe('File della scena non trovato: Maps/Crypt.atlasmap');
    expect(t('am.tagPicker.create', { name: 'Goblin Scout' })).toBe('Crea “Goblin Scout”');
  });

  it('registers commands and ribbon labels in Italian', () => {
    const commands: Command[] = [];
    const ribbon: string[] = [];
    const plugin = {
      app: { workspace: {} },
      addCommand: (command: Command) => commands.push(command),
      addRibbonIcon: (_icon: string, label: string) => ribbon.push(label),
    } as unknown as Plugin;
    registerCommands(plugin, {} as CommandDependencies);
    expect(commands.find((command) => command.id === 'open-dashboard')?.name).toBe('Apri bacheca');
    expect(commands.find((command) => command.id === 'open-scene-browser')?.name).toBe('Apri elenco delle scene');
    expect(commands.find((command) => command.id === 'new-statblock-template')?.name).toBe('Nuovo modello di blocco statistiche…');
    expect(ribbon).toContain('Mostra immagine nella vista giocatori');
  });

  it('renders collection controls in Italian', () => {
    render(<CreatureFieldSuggestions fields={[]} statblockCount={0} pending={false} onAdd={() => undefined} />);
    expect(screen.getByText('Collega i blocchi statistiche ai personaggi di questa collezione per visualizzarne qui i campi.')).toBeTruthy();
  });

  it('walks through an in-app guide with Italian controls and remembers completion', () => {
    const settings = new SettingsService({
      vault: { adapter: { exists: async () => true, write: async () => undefined } },
    } as unknown as App);
    render(<Tutorial settings={settings} id="assets" steps={[
      { title: t('am.tour.libraryTitle'), body: t('am.tour.libraryBody') },
      { title: t('am.tour.collectionTitle'), body: t('am.tour.collectionBody') },
    ]} />);
    expect(screen.getByText('La libreria della tua campagna')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    expect(screen.getByText('Inizia con una collezione')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    expect(screen.getByText('La libreria della tua campagna')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ho capito' }));
    expect(settings.shouldShowTutorial('assets')).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

it('selects Italian before importing module-level toolbar labels and tutorial steps', async () => {
  vi.resetModules();
  vi.doMock('obsidian', async (importOriginal) => ({
    ...(await importOriginal<typeof import('obsidian')>()),
    getLanguage: () => 'it',
  }));
  let runtime: typeof import('../../src/app/i18n') | undefined;
  try {
    await import('../../src/app/plugin/host/initializeHost');
    runtime = await import('../../src/app/i18n');
    const { TOOLBAR_CONTROLS } = await import('../../src/app/toolbar/toolbarCatalog');
    const { ONLINE_COMMANDS } = await import('../../src/app/online/gm/onlineCommands');
    const { LOOT_SETTINGS_STEPS } = await import('../../src/app/onboarding/lootTutorials');
    const { EXPERIMENTAL_FEATURES } = await import('../../src/app/experimental/experimentalFeatures');
    expect(runtime.getLocale()).toBe('it');
    expect(TOOLBAR_CONTROLS.find((control) => control.id === 'move')?.label).toBe('Sposta e seleziona');
    expect(ONLINE_COMMANDS.find((command) => command.id === 'start-online-table')?.name).toBe('Avvia tavolo online');
    expect(LOOT_SETTINGS_STEPS[0]?.title).toBe('Il bottino è nelle tue note');
    expect(LOOT_SETTINGS_STEPS[0]?.image?.alt).toBe('Una base di note di oggetti con una vista per ogni tipo di oggetto');
    expect(EXPERIMENTAL_FEATURES.find((feature) => feature.id === 'statblockEditor')?.label).toBe('Editor dei blocchi statistiche');
    expect(EXPERIMENTAL_FEATURES.find((feature) => feature.id === 'onlinePlay')?.label).toBe('Gioco online');
  } finally {
    runtime?.setLocale('en', TRANSLATIONS);
    vi.doUnmock('obsidian');
    vi.resetModules();
  }
});
