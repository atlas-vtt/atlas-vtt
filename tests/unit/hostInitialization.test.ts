import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import ts from 'typescript';

const language = vi.hoisted(() => ({ value: 'ru' }));
vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<typeof import('obsidian')>(), getLanguage: () => language.value }));
afterEach(() => { language.value = 'en'; vi.resetModules(); });

describe('plugin host initialization', () => {
  it('runs before the entry point imports modules with translated constants', () => {
    const source = ts.createSourceFile('main.ts', readFileSync(resolve('main.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
    const first = source.statements.find(ts.isImportDeclaration)!;
    expect(ts.isStringLiteral(first.moduleSpecifier) && first.moduleSpecifier.text).toBe('./src/app/plugin/host/initializeHost');
  });

  it.each(['ru', 'en', 'fr'])('initializes translated constants from %s', async value => {
    vi.resetModules();
    language.value = value;
    await import('../../src/app/plugin/host/initializeHost');
    const { getLocale, t } = await import('../../src/app/i18n');
    const { MAP_HOTKEYS } = await import('../../src/app/keyboard/mapHotkeys');
    expect(getLocale()).toBe(value === 'ru' ? 'ru' : 'en');
    expect(MAP_HOTKEYS.find(action => action.id === 'help')?.label).toBe(t('hotkey.help'));
    expect(MAP_HOTKEYS.find(action => action.id === 'help')?.label).toBe(value === 'ru' ? 'Сочетания клавиш' : 'Keyboard shortcuts');
  });
});
