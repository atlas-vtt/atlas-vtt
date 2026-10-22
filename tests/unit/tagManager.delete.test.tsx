// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';

const menu = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { menu.entries = entries; },
}));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: vi.fn(async () => true) }));

import TagManager from '../../src/app/packages/components/asset-manager/TagManager';

const handlers = {
  onCreateTag: vi.fn(),
  onCreateCollection: vi.fn(),
  onUpdateTag: vi.fn(),
  onUpdateCollection: vi.fn(),
  onDeleteTag: vi.fn(async () => {}),
  onDeleteCollection: vi.fn(async () => {}),
};

beforeEach(() => {
  vi.clearAllMocks();
  render(
    <TagManager
      isOpen
      onClose={vi.fn()}
      tags={{
        tokens: [{ id: 'dragon', name: 'Dragon' }, { id: 'testtag', name: 'testTag' }, { id: 'beast', name: 'Beast' }],
        maps: [{ id: 'forest', name: 'Forest' }],
      }}
      initialTab="tokens"
      collections={[{ id: 'default', name: 'Default' }, { id: 'default-2', name: 'Default 2' }]}
      {...handlers}
    />,
  );
});

const checkbox = (name: string): HTMLElement => screen.getByText(name).closest('.atlas-item-row')!.querySelector('input')!;
const deleteMenuEntry = (): Extract<ContextMenuEntry, { type: 'item' }> =>
  menu.entries.find((entry): entry is Extract<ContextMenuEntry, { type: 'item' }> => entry.type === 'item' && entry.icon === 'trash')!;

it('deletes the selected tags by id', async () => {
  fireEvent.click(checkbox('Dragon'));
  fireEvent.click(checkbox('testTag'));
  fireEvent.click(screen.getByText('Delete selected'));

  await waitFor(() => expect(handlers.onDeleteTag.mock.calls).toEqual([['tokens', 'dragon'], ['tokens', 'testtag']]));
  expect(screen.queryByText('Delete selected')).toBeNull();
});

it('deletes a selected collection by id, never the one sharing its name', async () => {
  fireEvent.click(screen.getByText('Collections'));
  fireEvent.click(checkbox('Default 2'));
  fireEvent.click(screen.getByText('Delete selected'));

  await waitFor(() => expect(handlers.onDeleteCollection.mock.calls).toEqual([['default-2']]));
});

it('clears the selection when switching tabs', () => {
  fireEvent.click(checkbox('Dragon'));
  fireEvent.click(screen.getByText('Collections'));

  expect(screen.queryByText('Delete selected')).toBeNull();
});

it('deletes the right-clicked row, not an earlier selection', async () => {
  fireEvent.click(checkbox('Dragon'));
  fireEvent.click(checkbox('testTag'));
  fireEvent.contextMenu(screen.getByText('Beast'));

  expect(deleteMenuEntry().label).toBe('Delete');
  act(() => deleteMenuEntry().onClick());
  await waitFor(() => expect(handlers.onDeleteTag.mock.calls).toEqual([['tokens', 'beast']]));
});

it('renames by id', () => {
  fireEvent.contextMenu(screen.getByText('Dragon'));
  act(() => (menu.entries[0] as Extract<ContextMenuEntry, { type: 'item' }>).onClick());
  const input = screen.getByDisplayValue('Dragon');
  fireEvent.change(input, { target: { value: 'Wyrm' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(handlers.onUpdateTag).toHaveBeenCalledWith('tokens', 'dragon', 'Wyrm');
});

it('keeps map tags and character tags on their own tabs, without shortcut hints', () => {
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Map Tags', 'Character Tags', 'Collections']);
  expect(screen.getByRole('tab', { name: 'Character Tags' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('Forest')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Map Tags' }));
  expect(screen.queryByText('Dragon')).toBeNull();
  const search = screen.getByPlaceholderText('Search or create tags…');
  fireEvent.change(search, { target: { value: 'Swamp' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(handlers.onCreateTag).toHaveBeenCalledWith('maps', 'Swamp');
});

it('ignores the old tab and select-all shortcuts', () => {
  fireEvent.keyDown(document, { key: '2', metaKey: true });
  fireEvent.keyDown(document, { key: 'a', metaKey: true });
  expect(screen.getByRole('tab', { name: 'Character Tags' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('Delete selected')).toBeNull();
});
