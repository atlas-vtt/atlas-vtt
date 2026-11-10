// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import type { AnyAsset, Tab } from '../../src/app/packages/components/asset-manager/types';
import { SKELETON_DELAY_MS, SKELETON_MIN_VISIBLE_MS } from '../../src/app/packages/components/primitives/useLoadingReveal';

const GOBLIN: AnyAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: '', folderId: null, modifiedAt: 0 };
const KEEP: AnyAsset = { id: 'keep', name: 'Keep', type: 'maps', imageUrl: '', mapFilePath: 'keep.jpg', folderId: null, modifiedAt: 0 };

// The loaded assets and the tab they belong to, as useAssetData reports them; null before the first load.
const loaded: { tab: Tab | null; assets: AnyAsset[] } = { tab: 'tokens', assets: [GOBLIN] };

// The asset manager listens to workspace events (collection settings changes).
const workspaceApp = { workspace: { on: () => ({}), offref: () => {} } };

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: (activeTab: Tab) => ({
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [], collections: [], availableTags: [], assets: loaded.assets, assetsLoading: loaded.tab !== activeTab,
    assetCounts: null, app: workspaceApp,
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
vi.mock('../../src/app/packages/components/asset-manager/components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({
  Header: ({ onTabChange }: { onTabChange: (tab: Tab) => void }) => <button onClick={() => onTabChange('maps')}>Maps</button>,
}));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ activeTab, assets, loading, showSkeleton }: { activeTab: Tab; assets: AnyAsset[]; loading: boolean; showSkeleton: boolean }) => (
    <ul aria-label={activeTab} data-state={loading ? (showSkeleton ? 'skeleton' : 'waiting') : 'content'}>
      {assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}
    </ul>
  ),
}));

const pane = (tab: Tab): HTMLElement => screen.getByRole('list', { name: tab });

function finishLoading(tab: Tab, assets: AnyAsset[], rerender: (ui: React.ReactElement) => void): void {
  act(() => {
    loaded.tab = tab;
    loaded.assets = assets;
  });
  rerender(<AssetManager isOpen onClose={() => {}} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  loaded.tab = 'tokens';
  loaded.assets = [GOBLIN];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('keeps the previous tab on screen while the new tab loads quickly', () => {
  const { rerender } = render(<AssetManager isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Maps' }));

  // Loading: the characters stay instead of an empty maps page.
  expect(pane('tokens').textContent).toBe('Goblin');
  expect(pane('tokens').dataset.state).toBe('content');

  finishLoading('maps', [KEEP], rerender);
  expect(pane('maps').textContent).toBe('Keep');
  expect(pane('maps').dataset.state).toBe('content');
});

it('shows the skeleton of the new tab when its load takes longer, and keeps it long enough to be seen', () => {
  const { rerender } = render(<AssetManager isOpen onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Maps' }));

  act(() => { vi.advanceTimersByTime(SKELETON_DELAY_MS); });
  expect(pane('maps').dataset.state).toBe('skeleton');
  expect(pane('maps').textContent).toBe('');

  // The assets arrive right after the skeleton showed: it stays for its minimum time.
  finishLoading('maps', [KEEP], rerender);
  expect(pane('maps').dataset.state).toBe('skeleton');
  expect(pane('maps').textContent).toBe('');

  act(() => { vi.advanceTimersByTime(SKELETON_MIN_VISIBLE_MS); });
  expect(pane('maps').dataset.state).toBe('content');
  expect(pane('maps').textContent).toBe('Keep');
});

it('opens on the skeleton, never on the empty library, and shows the content as soon as it is loaded', () => {
  loaded.tab = null;
  loaded.assets = [];
  const { rerender } = render(<AssetManager isOpen onClose={() => {}} />);
  expect(pane('tokens').dataset.state).toBe('skeleton');
  expect(pane('tokens').textContent).toBe('');

  // No minimum time: nothing was on screen before this skeleton.
  finishLoading('tokens', [GOBLIN], rerender);
  act(() => { vi.advanceTimersByTime(0); });
  expect(pane('tokens').dataset.state).toBe('content');
  expect(pane('tokens').textContent).toBe('Goblin');
});
