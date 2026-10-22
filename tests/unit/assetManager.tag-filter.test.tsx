// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';

// Keep the real sidebar, selection state, and AssetManager filtering together.
// Stub vault loading, unrelated modal actions, and asset card rendering.
// The asset manager listens to workspace events (collection settings changes).
const workspaceApp = { workspace: { on: () => ({}), offref: () => {} } };

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    app: workspaceApp,
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [], collections: [{ id: 'default', uid: 'u-default', name: 'Default' }],
    availableTags: [{ id: 'testing-tags', name: 'Testing Tags' }, { id: 'forest', name: 'Forest' }],
    assets: [
      { id: 'one', name: 'First token', type: 'tokens', folderId: null, tags: ['Testing Tags', 'Forest'] },
      { id: 'two', name: 'Second token', type: 'tokens', folderId: null, tags: ['Testing Tags'] },
      { id: 'three', name: 'Third token', type: 'tokens', folderId: null, tags: ['testing-tags', 'forest'] },
      { id: 'other', name: 'Other token', type: 'tokens', folderId: null, tags: ['Forest'] },
      { id: 'untagged', name: 'Untagged token', type: 'tokens', folderId: null },
    ],
  }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetCrud', () => ({ useAssetCrud: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useRememberedPlace', () => ({
  useRememberedPlace: () => ({ scrollTopOf: () => 0, setScrollTop: () => {} }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({ Header: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ assets }: { assets: AnyAsset[] }) => <ul aria-label="Assets">{assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}</ul>,
}));

afterEach(cleanup);

const shownTokens = () => within(screen.getByRole('list', { name: 'Assets' })).queryAllByRole('listitem').map((item) => item.textContent);

it('shows all three tagged tokens when clicking a sidebar tag stored as names or IDs', () => {
  render(<AssetManager isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /^Testing Tags/ }));
  expect(shownTokens()).toEqual(['First token', 'Second token', 'Third token']);
  expect(screen.getByRole('button', { name: /^Testing Tags/ }).getAttribute('aria-pressed')).toBe('true');
});

it('counts name and ID assignments consistently in the sidebar', () => {
  render(<AssetManager isOpen onClose={() => {}} />);
  expect(within(screen.getByRole('button', { name: /^Testing Tags/ })).getByText('3')).toBeTruthy();
});

it('requires every selected tag and restores assets as filters are cleared', () => {
  render(<AssetManager isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /^Testing Tags/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Forest/ }));
  expect(shownTokens()).toEqual(['First token', 'Third token']);
  fireEvent.click(screen.getByRole('button', { name: /^Testing Tags/ }));
  expect(shownTokens()).toEqual(['First token', 'Other token', 'Third token']);
  fireEvent.click(screen.getByRole('button', { name: /^Forest/ }));
  expect(shownTokens()).toHaveLength(5);
});

it('clears every selected tag from the chip beside the Tags heading', () => {
  render(<AssetManager isOpen onClose={() => {}} />);
  expect(screen.queryByRole('button', { name: /^Clear .*tag filter/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Testing Tags/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Forest/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear 2 tag filters' }));
  expect(shownTokens()).toHaveLength(5);
  expect(screen.getByRole('button', { name: /^Testing Tags/ }).getAttribute('aria-pressed')).toBe('false');
});
