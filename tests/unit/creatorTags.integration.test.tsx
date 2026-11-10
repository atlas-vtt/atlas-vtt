// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TFolder, type TAbstractFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import CreateSceneModal from '../../src/app/packages/components/asset-manager/CreateSceneModal';

const { converted } = vi.hoisted(() => ({ converted: { image: { arrayBuffer: async () => new ArrayBuffer(1) } as Blob, thumbnail: null, preview: null, sourcePreview: null } }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard', () => ({ TokenPreviewCard: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ convertForPreview: async () => converted, cropTokenImage: async () => converted, optimizeUpload: async () => converted }));

const service = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getCollections: vi.fn().mockResolvedValue([{ id: 'default', name: 'Default' }]),
  getCollection: vi.fn(async (id: string) => (await service.getCollections()).find((c: { id: string }) => c.id === id) ?? null),
  // The selected collection registers Existing; another collection still registers a tag deleted here.
  getCollectionTags: vi.fn(async (collection: string, group: string) =>
    collection === 'default' ? [{ id: 'existing', name: 'Existing', group }] : [{ id: 'deleted', name: 'Deleted', group }]),
  createTag: vi.fn(async (_collection: string, _group: string, name: string) => ({ name })),
  addAssets: vi.fn(async (assets: unknown[]) => assets),
  addAsset: vi.fn().mockResolvedValue({}),
  getAssets: vi.fn().mockResolvedValue([]),
  getCollectionSettings: vi.fn().mockReturnValue({}),
  runExclusive: <T,>(task: () => Promise<T>): Promise<T> => task(),
};
const app = {
  vault: {
    getAbstractFileByPath: vi.fn((_path: string): TAbstractFile | null => null),
    getFolderByPath: vi.fn((path: string): TFolder | null => new TFolder(path)),
    createFolder: vi.fn().mockResolvedValue(undefined),
    createBinary: vi.fn().mockResolvedValue({}),
    create: vi.fn(async (_path: string, _content: string) => ({})),
  },
  workspace: { trigger: vi.fn(), getLeaf: () => ({ openFile: vi.fn().mockResolvedValue(undefined) }) },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => 'blob:art');
  URL.revokeObjectURL = vi.fn();
  service.getCollections.mockResolvedValue([{ id: 'default', name: 'Default' }]);
  app.vault.getAbstractFileByPath.mockReturnValue(null);
  app.vault.getFolderByPath.mockImplementation((path: string) => new TFolder(path));
  app.vault.createFolder.mockResolvedValue(undefined);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(service as unknown as AssetService);
});
afterEach(cleanup);

function mount(child: React.ReactNode) {
  render(<AtlasUIContext.Provider value={{ app } as any}>{child}</AtlasUIContext.Provider>);
}

async function selectAndCreateTags(group: 'tokens' | 'maps') {
  fireEvent.click(await screen.findByRole('button', { name: 'Existing' }));
  expect(service.getCollectionTags).toHaveBeenCalledWith('default', group);
  expect(screen.queryByRole('button', { name: 'Deleted' })).toBeNull();
  const input = screen.getByRole('textbox', { name: 'Search or create tags' });
  fireEvent.change(input, { target: { value: 'New tag' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'New tag' }).getAttribute('aria-pressed')).toBe('true'));
  expect(service.createTag).toHaveBeenCalledWith('default', group, 'New tag');
}

it.each(['token', 'map'] as const)('persists selected and newly created tags when importing a %s', async (mode) => {
  mount(<TokenCreator isOpen onClose={() => {}} mode={mode} />);
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['art'], 'Test.png', { type: 'image/png' })] } });
  await selectAndCreateTags(mode === 'token' ? 'tokens' : 'maps');
  fireEvent.click(screen.getByRole('button', { name: /^Create/ }));
  await waitFor(() => expect(service.addAssets).toHaveBeenCalledWith([expect.objectContaining({ type: mode, tags: ['Existing', 'New tag'] })]));
});

it('persists selected and newly created tags when creating a scene', async () => {
  mount(<CreateSceneModal isOpen onClose={() => {}} onSceneCreated={() => {}}
    selectedCollection="default" assetService={service as unknown as AssetService} />);
  fireEvent.change(screen.getByPlaceholderText('Enter scene name'), { target: { value: 'Forest scene' } });
  await selectAndCreateTags('maps');
  expect(service.addAsset).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Create scene' }));
  await waitFor(() => expect(service.addAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'scene', tags: ['Existing', 'New tag'] })));
});

it.each([
  { name: 'My Campaign', id: 'my-campaign' },
  { name: 'Renamed Campaign', id: 'original-id' },
])('creates a scene in the folder of the selected collection "$name"', async ({ name, id }) => {
  service.getCollections.mockResolvedValue([{ id, name }]);
  const folderPath = `atlas-vtt/collections/${id}/scenes`;
  const folder = new TFolder(folderPath);
  // The vault index uses the stored spelling, even on a case-insensitive disk.
  app.vault.getAbstractFileByPath.mockImplementation((path: string) => path === folderPath ? folder : null);
  app.vault.getFolderByPath.mockImplementation((path: string) => path === folderPath ? folder : null);
  app.vault.createFolder.mockImplementation(async () => { throw new Error('Folder already exists.'); });
  const onSceneCreated = vi.fn();
  mount(<CreateSceneModal isOpen onClose={() => {}} onSceneCreated={onSceneCreated}
    selectedCollection={id} assetService={service as unknown as AssetService}
    backgroundPath="atlas-vtt/assets/forest.webp" defaultName="Forest" />);

  fireEvent.click(screen.getByRole('button', { name: 'Create scene' }));

  await waitFor(() => expect(onSceneCreated).toHaveBeenCalledOnce());
  expect(app.vault.createFolder).not.toHaveBeenCalled();
  expect(app.vault.create).toHaveBeenCalledWith(`${folderPath}/Forest.atlasmap`, expect.any(String));
  const saved = JSON.parse(app.vault.create.mock.calls[0]![1]);
  expect(saved.state.background).toBe('atlas-vtt/assets/forest.webp');
  expect(service.getCollectionSettings).toHaveBeenCalledWith(id);
  expect(service.addAsset).toHaveBeenCalledWith(expect.objectContaining({
    collection: id,
    data: expect.objectContaining({ mapPath: `${folderPath}/Forest.atlasmap` }),
  }));
});
