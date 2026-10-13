import React from 'react';
import type { Command, Plugin } from 'obsidian';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ AtlasView: class AtlasView {} }));
vi.mock('../../src/app/dashboard-view', () => ({ DASHBOARD_VIEW_TYPE: 'dashboard' }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: {} }));
vi.mock('../../src/app/plugin/cleanupMissingAssets', () => ({ cleanupMissingAssets: vi.fn() }));

import { formatList, getLocale, setLocale, t, TRANSLATIONS } from '../../src/app/i18n';
import { registerCommands, type CommandDependencies } from '../../src/app/plugin/registerCommands';
import { CreatureFieldSuggestions } from '../../src/app/react/components/collection-settings/CreatureFieldSuggestions';

/** The commands and ribbon labels Atlas registers, in the language active at the time. */
function registeredNames(): { commands: Command[]; ribbon: string[] } {
  const commands: Command[] = [];
  const ribbon: string[] = [];
  const plugin = {
    app: { workspace: {} },
    addCommand: (command: Command) => commands.push(command),
    addRibbonIcon: (_icon: string, title: string) => ribbon.push(title),
  } as unknown as Plugin;
  registerCommands(plugin, {} as CommandDependencies);
  return { commands, ribbon };
}

describe('Atlas in Russian', () => {
  beforeEach(() => setLocale('ru'));
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  it('picks the Russian plural form for one, few and many', () => {
    expect(getLocale()).toBe('ru');
    expect(t('count.files', { count: 1 })).toBe('1 файл');
    expect(t('count.files', { count: 3 })).toBe('3 файла');
    expect(t('count.files', { count: 5 })).toBe('5 файлов');
    expect(t('count.files', { count: 21 })).toBe('21 файл');
  });

  it('fills placeholders into the Russian text', () => {
    expect(t('view.sceneNotFound', { path: 'Maps/Crypt.atlasmap' })).toBe('Файл сцены не найден: Maps/Crypt.atlasmap');
  });

  it('joins lists the Russian way', () => {
    expect(formatList(['гоблин', 'орк', 'тролль'])).toBe('гоблин, орк и тролль');
  });

  it('names commands and ribbon icons in Russian', () => {
    const { commands, ribbon } = registeredNames();
    expect(commands.find((command) => command.id === 'open-dashboard')?.name).toBe('Открыть панель');
    expect(commands.find((command) => command.id === 'open-scene-browser')?.name).toBe('Открыть список сцен');
    expect(ribbon).toContain('Показать изображение игрокам');
  });

  it('renders a component in Russian', () => {
    render(<CreatureFieldSuggestions fields={[]} statblockCount={0} pending={false} onAdd={() => undefined} />);
    expect(screen.getByText('Привяжите статблоки к персонажам коллекции, чтобы увидеть здесь их поля.')).toBeTruthy();
    cleanup();
    render(
      <CreatureFieldSuggestions
        fields={[{ field: 'hd', count: 3, kind: 'range', samples: ['1', '5'] }]}
        statblockCount={5}
        pending={false}
        onAdd={() => undefined}
      />,
    );
    expect(screen.getByText('3 из 5')).toBeTruthy();
    expect(screen.getByText('Диапазон · 1 – 5')).toBeTruthy();
  });
});

describe('falling back to English', () => {
  afterEach(() => setLocale('en'));

  it('speaks English for a language Atlas has no translation for', () => {
    setLocale('de');
    expect(getLocale()).toBe('en');
    expect(t('count.files', { count: 3 })).toBe('3 files');
    expect(registeredNames().commands.find((command) => command.id === 'open-dashboard')?.name).toBe('Open dashboard');
  });

  it('shows the English text of a key the Russian translation lacks', () => {
    const russian = TRANSLATIONS.ru!;
    const kept = russian['view.sceneNotFound']!;
    delete russian['view.sceneNotFound'];
    try {
      setLocale('ru');
      expect(t('view.sceneNotFound', { path: 'Maps/Crypt.atlasmap' })).toBe('Scene file not found: Maps/Crypt.atlasmap');
      expect(t('count.files', { count: 5 })).toBe('5 файлов');
    } finally {
      russian['view.sceneNotFound'] = kept;
    }
  });
});
