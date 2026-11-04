// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App, Scope, TFile } from 'obsidian';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import type { AnyAsset, Folder, TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { CreatureIndex } from '../../src/app/creatures/CreatureIndex';

// The real header, search, filter panel and chips over an in-memory vault of statblock notes.
const FRONTMATTER: Record<string, Record<string, unknown>> = {
  'Bestiary/Goblin.md': { statblock: true, name: 'Goblin', cr: '1/4', type: 'humanoid', source: 'Monster Manual' },
  'Bestiary/Wolf.md': { statblock: true, name: 'Wolf', cr: '1/4', type: 'beast' },
  'Bestiary/Bear.md': { statblock: true, name: 'Bear', cr: 1, type: 'Beast' },
  'Bestiary/Dragon.md': { statblock: true, name: 'Dragon', cr: 10, type: 'dragon' },
};
const token = (name: string, statblockPath?: string, tags?: string[]): TokenAsset => ({
  id: name, name, type: 'tokens', imageUrl: '', folderId: null, modifiedAt: 0,
  ...(statblockPath && { statblockPath }), ...(tags && { tags }),
});
const TOKENS = [
  token('Goblin', 'Bestiary/Goblin.md', ['forest']),
  token('Wolf', 'Bestiary/Wolf.md', ['forest']),
  token('Bear', 'Bestiary/Bear.md'),
  token('Dragon', 'Bestiary/Dragon.md'),
  token('Innkeeper'),
];

const events = { on: () => ({}), offref: () => {} };
// A new app for every test: the asset manager keeps state per app (the creature index, where it was left).
const makeApp = () => ({
  loadLocalStorage: () => null,
  saveLocalStorage: () => {},
  scope: new Scope(),
  keymap: new App().keymap,
  workspace: events,
  metadataCache: { ...events, getFileCache: (file: TFile) => ({ frontmatter: FRONTMATTER[file.path] }) },
  vault: { ...events, getAbstractFileByPath: (path: string) => (FRONTMATTER[path] ? new TFile(path) : null), cachedRead: async () => '' },
});
let app = makeApp();
// What the manager lists; a test may move the characters into folders.
let view: { assets: AnyAsset[]; folders: Folder[] } = { assets: TOKENS, folders: [] };
const assetService = { getCollectionSettings: () => ({ conditions: [] }) };

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  // The second collection holds two characters at its root.
  useAssetData: (_tab: string, collection: string | null) => ({
    app, assetService,
    shownFolderOf: (folderId: string | null) => folderId,
    folders: collection === 'other' ? [] : view.folders,
    assets: collection === 'other' ? [token('Acid Burrower'), token('Dryad')] : view.assets,
    availableTags: [{ id: 'forest', name: 'Forest' }],
    collections: [{ id: 'default', uid: 'u-default', name: 'Default' }, { id: 'other', uid: 'u-other', name: 'Other' }],
    assetCounts: { scenes: 0, maps: 0, encounters: 0, tokens: TOKENS.length },
  }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetCrud', () => ({ useAssetCrud: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ assets, folders, onFolderDoubleClick }: { assets: AnyAsset[]; folders: Folder[]; onFolderDoubleClick: (id: string) => void }) => (
    <>
      <ul aria-label="Assets">{assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}</ul>
      {folders.map((folder) => <button key={folder.id} onClick={() => onFolderDoubleClick(folder.id)}>{`Open ${folder.name}`}</button>)}
    </>
  ),
}));

beforeEach(() => {
  app = makeApp();
  view = { assets: TOKENS, folders: [] };
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});
afterEach(() => {
  cleanup();
  CreatureIndex.release(app as never);
  vi.unstubAllGlobals();
});

const shown = (): Array<string | null> => within(screen.getByRole('list', { name: 'Assets' })).queryAllByRole('listitem').map((item) => item.textContent);
const search = (): HTMLInputElement => screen.getByRole('combobox');
const suggestionLabels = (): string[] => screen.queryAllByRole('option').map((option) => option.textContent ?? '');
const chips = (): string[] => {
  const bar = screen.queryByRole('region', { name: 'Active filters' });
  return bar ? within(bar).getAllByRole('button').map((button) => button.textContent ?? '').filter((text) => text !== 'Reset') : [];
};

async function openManager(): Promise<void> {
  render(<AssetManager isOpen onClose={() => {}} />);
  // The statblocks are read in the background; the filters appear once they are.
  await vi.waitFor(() => {
    act(() => { fireEvent.focus(search()); });
    expect(suggestionLabels().some((label) => label.startsWith('cr:'))).toBe(true);
  });
}

function type(text: string): void {
  fireEvent.change(search(), { target: { value: text, selectionStart: text.length } });
}

it('suggests the keywords the characters in view have, and their values with counts', async () => {
  await openManager();
  expect(suggestionLabels().map((label) => label.split(':')[0])).toEqual(['name', 'tag', 'statblock', 'cr', 'type', 'source', 'text']);
  type('type:');
  expect(suggestionLabels()).toEqual(['beast2', 'dragon1', 'humanoid1']);
});

it('turns a picked value into a filter chip and clears it from the text', async () => {
  await openManager();
  type('t:b');
  fireEvent.click(screen.getByRole('option', { name: /beast/ }));
  expect(shown()).toEqual(['Bear', 'Wolf']);
  expect(chips()).toEqual(['Typebeast']);
  expect(search().value).toBe('');
});

it('completes keywords with Tab and commits typed filters with Enter', async () => {
  await openManager();
  type('ch');
  fireEvent.keyDown(search(), { key: 'Tab' });
  expect(search().value).toBe('cr:');
  type('red cr>=1');
  fireEvent.keyDown(search(), { key: 'Enter' });
  expect(chips()).toEqual(['Challenge rating≥ 1']);
  expect(search().value).toBe('red');
});

it('does not search names for a filter that is still being typed', async () => {
  await openManager();
  type('cr:');
  expect(shown()).toHaveLength(5);
});

it('closes the suggestions with Escape before anything else', async () => {
  await openManager();
  const onEscape = vi.fn();
  document.addEventListener('keydown', onEscape);
  fireEvent.keyDown(search(), { key: 'Escape' });
  document.removeEventListener('keydown', onEscape);
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  expect(onEscape).not.toHaveBeenCalled();
});

it('sets the same filters in the filter panel, and removes them from the chips', async () => {
  await openManager();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const panel = screen.getByRole('dialog', { name: 'Filters' });
  fireEvent.click(within(panel).getByRole('radio', { name: 'Without' }));
  expect(shown()).toEqual(['Innkeeper']);
  fireEvent.click(within(panel).getByRole('radio', { name: 'All' }));
  fireEvent.click(within(within(panel).getByRole('group', { name: 'Type' })).getByRole('button', { name: /^dragon/ }));
  expect(shown()).toEqual(['Dragon']);
  expect(screen.getByRole('button', { name: 'Filters' }).textContent).toBe('1');

  fireEvent.click(screen.getByRole('button', { name: 'Remove Type: dragon' }));
  expect(shown()).toHaveLength(5);
});

it('groups several values of a filter in one chip, and Reset clears everything', async () => {
  await openManager();
  type('type:beast type:dragon tag:forest goblin');
  fireEvent.keyDown(search(), { key: 'Enter' });
  expect(chips()).toEqual(['Type2', 'TagForest']);
  expect(search().value).toBe('goblin');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(chips()).toEqual([]);
  expect(search().value).toBe('');
  expect(shown()).toHaveLength(5);
});

it('excludes an option with a double-click, Alt-click or a typed minus', async () => {
  await openManager();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const panel = screen.getByRole('dialog', { name: 'Filters' });
  const beast = (): HTMLElement => within(within(panel).getByRole('group', { name: 'Type' })).getByRole('button', { name: /^beast/ });
  const doubleClick = (): void => {
    fireEvent.click(beast(), { detail: 1 });
    fireEvent.click(beast(), { detail: 2 });
    fireEvent.doubleClick(beast());
  };

  doubleClick();
  expect(shown()).toEqual(['Dragon', 'Goblin', 'Innkeeper']);
  expect(chips()).toEqual(['Typenot beast']);
  expect(beast().getAttribute('aria-label')).toBe('beast, 2, excluded');
  doubleClick();
  expect(chips()).toEqual([]);

  fireEvent.click(beast(), { altKey: true });
  expect(chips()).toEqual(['Typenot beast']);
  type('-t:dragon');
  fireEvent.keyDown(search(), { key: 'Enter' });
  expect(shown()).toEqual(['Goblin', 'Innkeeper']);
  expect(chips()).toEqual(['Type2']);
});

it('offers the statblocks of the subfolders where the open folder only holds folders', async () => {
  view = {
    assets: TOKENS.map((asset) => ({ ...asset, folderId: 'monsters' })),
    folders: [{ id: 'monsters', name: 'Monsters', type: 'tokens', parentId: null, path: 'monsters' }],
  };
  await openManager();
  expect(shown()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const types = within(screen.getByRole('dialog', { name: 'Filters' })).getByRole('group', { name: 'Type' });
  expect(within(types).getAllByRole('button').map((button) => button.textContent)).toEqual(['beast2', 'dragon1', 'humanoid1']);
  fireEvent.click(within(types).getByRole('button', { name: /^beast/ }), { detail: 1 });
  expect(shown()).toEqual(['Bear', 'Wolf']);
});

it('starts at the root of a collection it switches to, also with filters active', async () => {
  view = {
    assets: TOKENS.map((asset) => ({ ...asset, folderId: 'monsters' })),
    folders: [{ id: 'monsters', name: 'Monsters', type: 'tokens', parentId: null, path: 'monsters' }],
  };
  await openManager();
  fireEvent.click(screen.getByRole('button', { name: 'Open Monsters' }));
  expect(shown()).toHaveLength(5);
  type('cr:1');
  fireEvent.keyDown(search(), { key: 'Enter' });
  expect(shown()).toEqual(['Bear']);

  fireEvent.click(document.querySelector('.atlas-collection-dropdown-trigger')!);
  fireEvent.click(screen.getByRole('button', { name: 'Other' }));
  expect(chips()).toEqual(['Challenge rating1']);
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(shown()).toEqual(['Acid Burrower', 'Dryad']);
});

it('focuses the search with Cmd+F through an Obsidian key scope, and gives the key back when closed', async () => {
  render(<AssetManager isOpen onClose={() => {}} />);
  const [scope] = app.keymap.scopes;
  const shortcut = scope?.keys.find((handler) => handler.key === 'f');
  expect(shortcut?.modifiers).toEqual(['Mod']);
  let handled: unknown;
  act(() => { handled = shortcut!.func(new KeyboardEvent('keydown')); });
  expect(handled).toBe(false);
  expect(document.activeElement).toBe(search());
  cleanup();
  expect(app.keymap.scopes).toEqual([]);
});

it('keeps the filter button on every tab, disabled where a tab has no filters yet', async () => {
  await openManager();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /^Maps/ })[0]!);
  const filters = screen.getByRole('button', { name: 'Filters' }) as HTMLButtonElement;
  expect(filters.disabled).toBe(true);
  expect(filters.getAttribute('aria-expanded')).toBe('false');
  await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull());
  fireEvent.click(screen.getAllByRole('button', { name: /^Tokens/ })[0]!);
  expect((screen.getByRole('button', { name: 'Filters' }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
});
