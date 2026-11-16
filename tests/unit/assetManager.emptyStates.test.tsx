// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import { Content, type ContentProps } from '../../src/app/packages/components/asset-manager/components/Content';
import { EmptyTabAction } from '../../src/app/packages/components/asset-manager/components/EmptyTabAction';
import type { AnyAsset, Tab } from '../../src/app/packages/components/asset-manager/types';
import { t } from '../../src/app/i18n';

const workspaceApp = { workspace: { on: () => ({}), offref: () => {} }, keymap: { pushScope: () => {}, popScope: () => {} } };

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    app: workspaceApp,
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [], collections: [{ id: 'default', uid: 'u-default', name: 'Default' }],
    availableTags: [{ id: 'beast', name: 'Beast' }, { id: 'dragon', name: 'Dragon' }],
    assets: [
      { id: 'wolf', name: 'Wolf', type: 'tokens', folderId: null, tags: ['beast'] },
      { id: 'wyrm', name: 'Wyrm', type: 'tokens', folderId: null, tags: ['dragon'] },
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
// The real Content stands in the tests below; here it says what the pane would show for an empty list.
vi.mock('../../src/app/packages/components/asset-manager/components/Content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/packages/components/asset-manager/components/Content')>();
  return {
    ...actual,
    Content: (props: ContentProps) => (props.assets.length > 0 ? <ul aria-label="Assets">{props.assets.map((asset: AnyAsset) => <li key={asset.id}>{asset.name}</li>)}</ul>
      : <p>{props.onClearFilters ? 'no match' : 'empty tab'}</p>),
    RealContent: actual.Content,
  };
});

afterEach(cleanup);

describe('an empty list', () => {
  it('is a missing match, not an empty library, when two tags have no token in common', () => {
    render(<AssetManager isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Beast/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Dragon/ }));
    expect(screen.getByText('no match')).toBeTruthy();
    expect(screen.queryByText('empty tab')).toBeNull();
  });
});

describe('EmptyTabAction', () => {
  const app = workspaceApp as unknown as App;
  const actions = { tokens: vi.fn(), maps: vi.fn(), encounters: vi.fn() };
  const onShowMaps = vi.fn();

  it.each<[Tab, string]>([
    ['maps', t('am.header.addMap')],
    ['encounters', t('am.header.createEncounter')],
    ['tokens', t('am.header.createToken')],
  ])('offers one button that makes the first asset of %s', (tab, label) => {
    render(<EmptyTabAction tab={tab} app={app} assetService={null} collection="default" onCreate={actions} onShowMaps={onShowMaps} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(actions[tab as keyof typeof actions]).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('sends an empty Scenes tab to the maps, since a scene is made from a map', () => {
    render(<EmptyTabAction tab="scenes" app={app} assetService={null} collection="default" onCreate={actions} onShowMaps={onShowMaps} />);
    expect(screen.getByText(t('am.empty.scenesHint'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('am.empty.goToMaps') }));
    expect(onShowMaps).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('tells how a token joins the players instead of offering to make one', () => {
    render(<EmptyTabAction tab="party" app={app} assetService={null} collection="default" onCreate={actions} onShowMaps={onShowMaps} />);
    expect(screen.getByText(t('am.empty.partyHint'))).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('a collection that failed to load', () => {
  it('names the collection and offers to try again, with no cards', async () => {
    const mocked = await import('../../src/app/packages/components/asset-manager/components/Content') as unknown as { RealContent: typeof Content };
    const onRetry = vi.fn();
    const props = {
      collection: 'edge', collectionName: 'Audit Edge', failed: true, onRetry,
      activeTab: 'tokens', assets: [], folders: [], selectedAssetIds: [], selectedFolderIds: [], selectedFolderId: null, folderDepth: 0, refinement: '',
      loading: false, showSkeleton: false, assetCount: null,
    } as unknown as ContentProps;
    render(<mocked.RealContent {...props} />);

    expect(screen.getByRole('alert').textContent).toContain(t('am.loadFailed.title', { collection: 'Audit Edge' }));
    fireEvent.click(screen.getByRole('button', { name: t('am.loadFailed.retry') }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.atlas-asset-card')).toBeNull();
  });
});
