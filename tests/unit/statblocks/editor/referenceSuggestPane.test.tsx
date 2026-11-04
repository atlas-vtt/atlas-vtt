// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { ReferenceSuggest } from '../../../../src/app/statblocks/editor/markdown-typing/ReferenceSuggest';
import { selectText } from '../../../../src/app/statblocks/editor/statblock-pane/plainEditable';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { blockOf, renderPane, type PaneHarness } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

const OGRE = {
  statblock: true,
  'atlas-template': 'builtin:5e-2014-monster',
  name: 'Ogre',
  ac: 11,
  hp: 59,
  stats: [19, 8, 16, 5, 7, 7],
  actions: [{ name: 'Greatclub', desc: 'Hit: 2d8 + 4 bludgeoning.' }],
};

type Keyed = { keys: Array<{ key: string; modifiers: string[]; func: (event: KeyboardEvent) => unknown }> };

async function pane(): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: OGRE });
  apps.push(harness.app);
  return harness;
}

const scopes = (harness: PaneHarness): Keyed[] => harness.app.keymap.scopes as Keyed[];

/** Presses a key in the list that is open, as Obsidian's keymap hands it to the topmost scope. */
function press(harness: PaneHarness, key: string): unknown {
  const handler = scopes(harness).at(-1)?.keys.find((each) => each.key === key && each.modifiers.length === 0);
  let result: unknown;
  act(() => { result = handler?.func(new KeyboardEvent('keydown', { key })); });
  return result;
}

/** Types into an input as the browser does: the text, the caret at its end, the `input` event. */
function typeInto(input: HTMLInputElement, typed: string): void {
  input.value = typed;
  input.setSelectionRange(typed.length, typed.length);
  act(() => { input.dispatchEvent(new InputEvent('input', { bubbles: true })); });
}

function armorClass(harness: PaneHarness): HTMLInputElement {
  fireEvent.click(blockOf(harness.result.container, 'e4ac0000'));
  const input = screen.getByRole('textbox', { name: 'Armor Class' }) as HTMLInputElement;
  input.focus();
  return input;
}

describe('@ typed in the pane', () => {
  it('offers the references while one is typed, and Enter writes the name picked', async () => {
    const harness = await pane();
    const input = armorClass(harness);
    typeInto(input, '10 + @dex.m');
    expect(scopes(harness)).toHaveLength(1);
    expect(press(harness, 'Enter')).toBe(false);
    expect(input.value).toBe('10 + @dex.mod');
    expect(scopes(harness)).toHaveLength(0);
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['ac'], base: 11, next: '10 + @dex.mod' }]);
  });

  it('takes the highlighted name with Tab too', async () => {
    const harness = await pane();
    const input = armorClass(harness);
    typeInto(input, '@st');
    expect(press(harness, 'Tab')).toBe(false);
    expect(input.value).toBe('@str');
  });

  it('closes only the list on Escape: the value is still being typed, nothing written', async () => {
    const harness = await pane();
    const input = armorClass(harness);
    typeInto(input, '10 + @');
    expect(press(harness, 'Escape')).toBe(false);
    expect(scopes(harness)).toHaveLength(0);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('10 + @');
    expect(harness.writer.patches()).toEqual([]);
  });

  it("offers them in an ability's text too, and nothing for an @ inside a word", async () => {
    const harness = await pane();
    fireEvent.click(harness.result.container.querySelector('.atlas-sb-trait')!);
    const text = screen.getByRole('textbox', { name: 'Action description' });
    text.focus();
    const typeIn = (typed: string): void => {
      text.textContent = typed;
      selectText(text, typed.length, typed.length);
      act(() => { text.dispatchEvent(new InputEvent('input', { bubbles: true })); });
    };
    typeIn('mail@str');
    expect(scopes(harness)).toHaveLength(0);
    typeIn('Hit: 2d8 + @str.');
    expect(press(harness, 'Enter')).toBe(false);
    expect(text.textContent).toBe('Hit: 2d8 + @str.mod');
  });
});

describe('the list of references', () => {
  function suggest(names: Array<{ name: string; value: string }>): { input: HTMLInputElement; list: HTMLElement } {
    const { app } = createInMemoryApp({ files: {} });
    const input = document.body.createEl('input', { type: 'text' });
    const reference = new ReferenceSuggest(app, input, () => names);
    input.focus();
    typeInto(input, '1d20 + @s');
    return { input, list: (reference as unknown as { suggestEl: HTMLElement }).suggestEl };
  }

  it('shows each name fitting what was typed with the number it reads', () => {
    const { list } = suggest([{ name: 'level', value: '5' }, { name: 'str', value: '19' }, { name: 'str.mod', value: '+4' }, { name: 'dex.save', value: '1' }]);
    const rows = [...list.querySelectorAll('.atlas-sb-reference-option')].map((row) => [row.querySelector('.suggestion-title')?.textContent, row.querySelector('.atlas-sb-reference-option__value')?.textContent]);
    expect(rows).toEqual([['str', '19'], ['str.mod', '+4'], ['dex.save', '1']]);
  });

  it('opens nothing where the statblock names no number', () => {
    const { list } = suggest([]);
    expect(list.querySelectorAll('.atlas-sb-reference-option')).toHaveLength(0);
  });
});
