// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import { showDungeonGenerator } from '../../src/app/packages/components/dungeon-generator/openDungeonGenerator';
import { AssetService } from '../../src/app/services/AssetService';

const app = vi.hoisted(() => ({ workspace: { on: () => ({}), offref: () => {} } }));

vi.mock('../../src/app/packages/components/dungeon-generator/openDungeonGenerator', () => ({ showDungeonGenerator: vi.fn(async () => {}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [], collections: [], availableTags: [], assets: [], assetsLoading: false, assetCounts: null, app,
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
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({ Content: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({
  Header: ({ onGenerateDungeon }: { onGenerateDungeon: () => void }) => <button onClick={onGenerateDungeon}>Generate Dungeon</button>,
}));

afterEach(() => cleanup());

it('opens the dungeon generator for the collection shown and gets out of its way', () => {
  const onClose = vi.fn();
  render(<AssetManager isOpen onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate Dungeon' }));
  expect(showDungeonGenerator).toHaveBeenCalledWith(app, AssetService.defaultCollectionId());
  expect(onClose).toHaveBeenCalled();
});
