// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

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

const SENSES_BLOCK = 'p2n5r9xy';
const SENSES: TemplateField = {
  key: 'senses', label: 'Senses', type: 'choice', meaning: 'senses',
  options: ['darkvision', 'blindsight', 'tremorsense'], several: true, numbered: true, unit: 'ft.',
};
const fields = MARSH_CREATURE.fields.map((field) => (field.key === 'senses' ? SENSES : field));

async function pane(senses: string | undefined): Promise<PaneHarness> {
  const frontmatter = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', size: 'Medium', ...(senses && { senses }) };
  const harness = await renderPane({ frontmatter, files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText({ fields }) } });
  apps.push(harness.app);
  // The template file is read in the library's own tasks.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return harness;
}

describe('a choice with several picks, each with a number', () => {
  it('shows the note\'s picks as chips with their numbers, and offers the options not picked', async () => {
    const { result } = await pane('darkvision 60 ft.');
    fireEvent.click(blockOf(result.container, SENSES_BLOCK));
    expect(screen.getByRole('textbox', { name: 'Senses: darkvision' })).toHaveProperty('value', '60');
    const add = screen.getByRole('combobox', { name: 'Add to Senses' });
    fireEvent.focus(add);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['blindsight', 'tremorsense']);
  });

  it('writes a picked option, then its number, as the one line the note keeps', async () => {
    const { result, writer, source } = await pane('darkvision 60 ft.');
    fireEvent.click(blockOf(result.container, SENSES_BLOCK));
    fireEvent.focus(screen.getByRole('combobox', { name: 'Add to Senses' }));
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'blindsight' })); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['senses'], base: 'darkvision 60 ft.', next: 'darkvision 60 ft., blindsight' }]);

    await act(async () => { source.set(NOTE_PATH, { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', senses: 'darkvision 60 ft., blindsight' }); });
    const number = screen.getByRole('textbox', { name: 'Senses: blindsight' });
    expect(document.activeElement).toBe(number);
    fireEvent.change(number, { target: { value: '10' } });
    await act(async () => { fireEvent.keyDown(number, { key: 'Enter' }); });
    expect(writer.patches().at(-1)).toEqual({ op: 'set', path: ['senses'], base: 'darkvision 60 ft., blindsight', next: 'darkvision 60 ft., blindsight 10 ft.' });
  });

  it('finishes on Enter without adding an option nobody stepped to or typed', async () => {
    const { result, writer } = await pane('darkvision 60 ft.');
    fireEvent.click(blockOf(result.container, SENSES_BLOCK));
    const add = screen.getByRole('combobox', { name: 'Add to Senses' });
    fireEvent.focus(add);
    expect(screen.getByRole('listbox')).toBeTruthy();
    await act(async () => { fireEvent.keyDown(add, { key: 'Enter' }); });
    expect(writer.patches()).toEqual([]);
    expect(screen.queryByRole('combobox', { name: 'Add to Senses' })).toBeNull();
  });

  it('adds the first option that matches what was typed on Enter', async () => {
    const { result, writer } = await pane('darkvision 60 ft.');
    fireEvent.click(blockOf(result.container, SENSES_BLOCK));
    const add = screen.getByRole('combobox', { name: 'Add to Senses' });
    fireEvent.change(add, { target: { value: 'trem' } });
    await act(async () => { fireEvent.keyDown(add, { key: 'Enter' }); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['senses'], base: 'darkvision 60 ft.', next: 'darkvision 60 ft., tremorsense' }]);
  });

  it('removes a pick, and keeps a part that names no option until it is removed', async () => {
    const { result, writer } = await pane('darkvision 60 ft., truesight 5 miles');
    fireEvent.click(blockOf(result.container, SENSES_BLOCK));
    expect(screen.getByText('truesight 5 miles')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remove darkvision' })); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['senses'], base: 'darkvision 60 ft., truesight 5 miles', next: 'truesight 5 miles' }]);
  });
});

describe('a choice of one option', () => {
  it('opens as a dropdown with every option, not only the one picked', async () => {
    const { result, writer } = await pane(undefined);
    fireEvent.click(blockOf(result.container, 'l4q2v8ka'));
    const size = screen.getByRole('combobox', { name: 'Size' });
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Tiny', 'Small', 'Medium', 'Large', 'Huge']);
    expect(size).toHaveProperty('value', 'Medium');
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Large' })); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['size'], base: 'Medium', next: 'Large' }]);
  });
});
