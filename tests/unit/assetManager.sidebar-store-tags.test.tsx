// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar, type SidebarProps, type StoreTagsSidebar } from '../../src/app/packages/components/asset-manager/components/Sidebar';
import type { StoreTagsState } from '../../src/app/armarium/storeTagFilter';

const READY: StoreTagsState = {
  status: 'ready',
  tags: {
    groups: [
      { id: 'genre', label: 'Genre', tags: [{ id: 'dark-fantasy', label: 'Dark fantasy', count: 3 }] },
      { id: 'place', label: 'Place', tags: [{ id: 'forest', label: 'Forest', count: 1 }, { id: 'dungeon', label: 'Dungeon', count: 0 }] },
    ],
    picked: ['forest'],
  },
};

function renderSidebar(storeTags?: StoreTagsSidebar): SidebarProps {
  const props: SidebarProps = {
    selectedTagIds: ['library-tag'],
    onSelectTag: vi.fn(),
    onClearTags: vi.fn(),
    tags: [{ id: 'library-tag', name: 'Library tag' }],
    countedAssets: [],
    collections: [],
    selectedCollection: 'default',
    onSelectCollection: vi.fn(),
    onManageTags: vi.fn(),
    storeTags,
  };
  render(<Sidebar {...props} />);
  return props;
}

const store = (state: StoreTagsState): StoreTagsSidebar => ({ state, onToggle: vi.fn(), onClear: vi.fn() });

afterEach(cleanup);

describe('the sidebar while the Armarium is shown', () => {
  it('lists the store\'s tags under their groups, with counts and the picked tag pressed, and no Manage', () => {
    renderSidebar(store(READY));
    expect(screen.queryByText('Library tag')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull();
    const labels = [...document.querySelectorAll('.atlas-tags-group-label, .atlas-tag-text')].map((node) => node.textContent);
    expect(labels).toEqual(['Genre', 'Dark fantasy', 'Place', 'Forest', 'Dungeon']);
    expect(screen.getByRole('button', { name: /Forest/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Dark fantasy/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Dark fantasy/ }).textContent).toContain('3');
  });

  it('hands presses and Clear to the store, not to the library', () => {
    const storeTags = store(READY);
    const props = renderSidebar(storeTags);
    fireEvent.click(screen.getByRole('button', { name: /Dungeon/ }));
    expect(storeTags.onToggle).toHaveBeenCalledWith('dungeon');
    fireEvent.click(document.querySelector('.atlas-tags-clear')!);
    expect(storeTags.onClear).toHaveBeenCalledTimes(1);
    expect(props.onSelectTag).not.toHaveBeenCalled();
    expect(props.onClearTags).not.toHaveBeenCalled();
  });

  it('shows placeholders while the page has not named its tags, and says so once it did not', () => {
    renderSidebar(store({ status: 'waiting' }));
    expect(document.querySelector('.atlas-tags-list .atlas-skeleton, .atlas-tags-list [aria-busy]')).not.toBeNull();
    cleanup();
    renderSidebar(store({ status: 'none' }));
    expect(screen.getByText('The Armarium shows no tags here')).toBeTruthy();
  });

  it('lists the collection\'s tags and Manage without the store', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /Library tag/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Manage' })).toBeTruthy();
  });
});
