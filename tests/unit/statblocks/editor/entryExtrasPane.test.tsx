// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { FieldValue, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
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

const ACTIONS_BLOCK = 'e7y2b6gh';
const ACTIONS: TemplateField = {
  key: 'actions', label: 'Actions', type: 'entries',
  entry: {
    extras: [
      { key: 'type', label: 'Type', type: 'choice', options: ['Main action', 'Bonus action', 'Reaction'] },
      { key: 'kind', label: 'Kind', type: 'choice', options: ['Melee', 'Ranged', 'Magic'], several: true },
      { key: 'cost', label: 'Cost', type: 'number' },
    ],
  },
};
const fields = MARSH_CREATURE.fields.map((field) => (field.key === 'actions' ? ACTIONS : field));

function values(actions: FieldValue[]): Record<string, unknown> {
  return { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', actions };
}

async function pane(actions: FieldValue[]): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: values(actions), files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText({ fields }) } });
  apps.push(harness.app);
  // The template file is read in the library's own tasks.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return harness;
}

/** Opens the first action; returns its focused name input. */
function openFirstAction(harness: PaneHarness): HTMLInputElement {
  fireEvent.click(blockOf(harness.result.container, ACTIONS_BLOCK).querySelectorAll('.atlas-sb-trait')[0]!);
  return document.activeElement as HTMLInputElement;
}

const text = (): HTMLElement => screen.getByRole('textbox', { name: 'Action description' });

describe('an ability\'s parts in the inline editor', () => {
  it('shows a control per part between the name and the text, in the shape\'s order, Enter stepping through them', async () => {
    const harness = await pane([{ name: 'Bite', type: 'Main action', desc: 'It bites.' }]);
    const name = openFirstAction(harness);
    const editor = name.closest('.atlas-sb-pane-entry-editor')!;
    const order = [...editor.querySelectorAll('[data-entry-part]')].map((part) => part.getAttribute('data-entry-extra') ?? part.getAttribute('data-entry-part'));
    expect(order).toEqual(['name', 'type', 'kind', 'cost', 'text']);

    const type = screen.getByRole('combobox', { name: 'Type' });
    expect(type).toHaveProperty('value', 'Main action');
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(document.activeElement).toBe(type);
    fireEvent.keyDown(type, { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Kind' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Cost' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(document.activeElement).toBe(text());
    expect(harness.writer.patches()).toEqual([]);
  });

  it('writes a picked option with the rest when the ability is committed', async () => {
    const harness = await pane([{ name: 'Bite', type: 'Main action', desc: 'It bites.' }]);
    openFirstAction(harness);
    const type = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.focus(type);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['—', 'Main action', 'Bonus action', 'Reaction']);
    fireEvent.click(screen.getByRole('option', { name: 'Reaction' }));
    expect(type).toHaveProperty('value', 'Reaction');
    // Picking keeps the ability open; nothing is written before it is committed.
    expect(harness.writer.patches()).toEqual([]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cost' }), { target: { value: '2' } });

    await act(async () => { fireEvent.keyDown(text(), { key: 'Enter' }); });
    expect(harness.writer.writes).toHaveLength(1);
    expect(harness.writer.patches()).toEqual([
      { op: 'set', path: ['actions', 0, 'type'], base: 'Main action', next: 'Reaction' },
      { op: 'set', path: ['actions', 0, 'cost'], base: undefined, next: 2 },
    ]);
  });

  it('removes the part when the empty choice is picked, and Escape closes the list before the ability', async () => {
    const harness = await pane([{ name: 'Bite', type: 'Main action', desc: 'It bites.' }]);
    openFirstAction(harness);
    const type = screen.getByRole('combobox', { name: 'Type' });
    fireEvent.focus(type);
    fireEvent.keyDown(type, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBe(type);

    fireEvent.keyDown(type, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: '—' }));
    await act(async () => { fireEvent.blur(type); });
    expect(harness.writer.patches()).toEqual([{ op: 'delete', path: ['actions', 0, 'type'], base: 'Main action' }]);
  });

  it('keeps a value of the note that is no option unless another is picked', async () => {
    const harness = await pane([{ name: 'Bite', type: 'Legendary', desc: 'It bites.' }]);
    const name = openFirstAction(harness);
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveProperty('value', 'Legendary');
    fireEvent.focus(name);
    fireEvent.change(name, { target: { value: 'Big bite' } });
    await act(async () => { fireEvent.blur(name); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['actions', 0, 'name'], base: 'Bite', next: 'Big bite' }]);
  });

  it('picks several options as one line in the order of the options, keeping a part that names none', async () => {
    const harness = await pane([{ name: 'Bite', kind: 'Magic, Psionic', desc: 'It bites.' }]);
    openFirstAction(harness);
    expect(screen.getByText('Psionic')).toBeTruthy();
    const kind = screen.getByRole('combobox', { name: 'Kind' });
    fireEvent.focus(kind);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual(['Melee', 'Ranged']);
    fireEvent.click(screen.getByRole('option', { name: 'Melee' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Magic' }));
    await act(async () => { fireEvent.keyDown(text(), { key: 'Enter' }); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['actions', 0, 'kind'], base: 'Magic, Psionic', next: 'Melee, Psionic' }]);
  });

  it('writes a new ability with the parts that were set', async () => {
    const harness = await pane([{ name: 'Bite', desc: 'It bites.' }]);
    openFirstAction(harness);
    await act(async () => { fireEvent.keyDown(text(), { key: 'Enter' }); });
    const name = document.activeElement as HTMLInputElement;
    expect(name.closest('.atlas-sb-pane-entry-editor--new')).not.toBeNull();
    fireEvent.change(name, { target: { value: 'Shove' } });
    const type = within(name.closest<HTMLElement>('.atlas-sb-pane-entry-editor')!).getByRole('combobox', { name: 'Type' });
    fireEvent.focus(type);
    fireEvent.click(screen.getByRole('option', { name: 'Bonus action' }));
    await act(async () => { fireEvent.keyDown(type, { key: 'Enter', ctrlKey: true, metaKey: true }); });
    expect(harness.writer.patches()).toEqual([
      { op: 'insert', list: 'actions', after: { name: 'Bite', desc: 'It bites.' }, item: { name: 'Shove', type: 'Bonus action' } },
    ]);
  });
});

describe('an ability that names another number', () => {
  it('shows the number on the card, and its editor the reference as the note holds it, so an edit keeps it', async () => {
    const harness = await renderPane({
      frontmatter: { ...values([{ name: 'Slam', desc: 'Hit: 1d6 + @ac bludgeoning.' }]), ac: 3 },
      files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText({ fields }) },
    });
    apps.push(harness.app);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const actions = blockOf(harness.result.container, ACTIONS_BLOCK);
    expect(actions.textContent).toContain('Hit: 1d6 + 3 bludgeoning.');
    openFirstAction(harness);
    expect(text().textContent).toBe('Hit: 1d6 + @ac bludgeoning.');
  });
});

