// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import { MapPickContext, type MapPick } from '../../src/app/packages/components/asset-manager/mapPick';
import type { MapAsset, Tab } from '../../src/app/packages/components/asset-manager/types';

const workspaceApp = { workspace: { on: () => ({}), offref: () => {} }, keymap: { pushScope: () => {}, popScope: () => {} } };
const CELLAR: MapAsset = { id: 'cellar', name: 'Cellar', type: 'maps', imageUrl: '', mapFilePath: 'maps/cellar.webp', folderId: null, modifiedAt: 0 };

vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [], collections: [], availableTags: [], assets: [], assetsLoading: false, assetCounts: null, app: workspaceApp,
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
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => <div data-testid="dialogs" /> }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({
  Header: ({ onTabChange, pick }: { onTabChange: (tab: Tab) => void; pick?: MapPick }) => (
    <header>
      {pick && <h2>{pick.title}</h2>}
      <button onClick={() => onTabChange('tokens')}>Characters</button>
    </header>
  ),
}));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ activeTab }: { activeTab: Tab }) => <ul aria-label={activeTab} />,
}));

afterEach(cleanup);

function renderPickingCard(onPick: MapPick['onPick']): AssetCardHandlers {
  const handlers: AssetCardHandlers = {
    onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(),
    onSpawnCountChange: vi.fn(), onOpenStatblock: vi.fn(), onArtNeeded: vi.fn(),
  };
  render(
    <MapPickContext.Provider value={{ title: 'Choose a map for the new level', onPick }}>
      <TooltipProvider>
        <AssetCard asset={CELLAR} isSelected={false} isDragging={false} spawnCount={1} tabbable {...handlers} />
      </TooltipProvider>
    </MapPickContext.Provider>,
  );
  return handlers;
}

describe('the asset manager opened to choose a level\'s map', () => {
  it('shows the Maps tab with what the map is for, keeps to it, and opens none of the library\'s dialogs', () => {
    render(<AssetManager isOpen onClose={() => {}} pick={{ title: 'Choose a map for the new level', onPick: () => {} }} />);
    expect(screen.getByRole('heading', { name: 'Choose a map for the new level' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'maps' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Characters' }));
    expect(screen.getByRole('list', { name: 'maps' })).toBeTruthy();
    expect(screen.queryByTestId('dialogs')).toBeNull();
  });

  it('chooses a map with a click or Enter, and offers no selection, menu or drag on its card', () => {
    const onPick = vi.fn();
    const handlers = renderPickingCard(onPick);
    const card = screen.getByRole('option', { name: 'Cellar' });

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onPick.mock.calls).toEqual([['maps/cellar.webp'], ['maps/cellar.webp']]);

    fireEvent.contextMenu(card);
    fireEvent.keyDown(card, { key: 'Delete' });
    expect(handlers.onContextMenu).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(handlers.onSelect).not.toHaveBeenCalled();
    expect(card.getAttribute('draggable')).toBe('false');
    expect(document.querySelector('.atlas-asset-card-checkbox, .atlas-asset-card-more')).toBeNull();
  });
});
