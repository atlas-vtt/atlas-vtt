// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { DungeonGeneratorView, DUNGEON_GENERATOR_VIEW_TYPE } from '../../src/app/dungeon-generator-view';
import { openCreatedScene } from '../../src/app/import/openCreatedScene';
import type { DungeonGeneratorPageProps } from '../../src/app/packages/components/dungeon-generator/DungeonGeneratorPage';
import { showDungeonGenerator } from '../../src/app/packages/components/dungeon-generator/openDungeonGenerator';
import { getLoadedAtlasView } from '../../src/app/plugin/atlasLeaves';

const page = vi.hoisted(() => ({ props: null as DungeonGeneratorPageProps | null }));
vi.mock('../../src/app/packages/components/dungeon-generator/DungeonGeneratorPage', () => ({
  DungeonGeneratorPage: (props: DungeonGeneratorPageProps) => {
    page.props = props;
    return null;
  },
}));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: vi.fn(() => null) }));
vi.mock('../../src/app/import/openCreatedScene', () => ({ openCreatedScene: vi.fn(async () => true) }));
vi.mock('../../src/app/services/AssetService', () => ({
  AssetService: { getInstance: () => ({ initialize: async () => {}, getDefaultCollectionId: () => 'Default' }) },
}));

const SCENE = { name: 'Crypt', scenePath: 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap', entryLevel: 'floor-a' };

async function openView(): Promise<{ view: DungeonGeneratorView; leaf: WorkspaceLeaf }> {
  const app = { workspace: { requestSaveLayout: vi.fn() } };
  const leaf = { app, detach: vi.fn() } as unknown as WorkspaceLeaf;
  const view = new DungeonGeneratorView(leaf);
  await act(() => view.onOpen());
  return { view, leaf };
}

afterEach(() => {
  page.props = null;
  vi.clearAllMocks();
});

describe('the dungeon generator in its own tab', () => {
  it('opens without a scene, on the default collection, and keeps the collection chosen', async () => {
    const { view } = await openView();
    expect(page.props?.collectionId).toBe('Default');
    act(() => page.props!.onCollectionChange('Ruins'));
    expect(page.props?.collectionId).toBe('Ruins');
    expect(view.getState()).toEqual({ collection: 'Ruins' });
    await act(() => view.setState({ collection: 'Crypts' }, { history: false }));
    expect(page.props?.collectionId).toBe('Crypts');
  });

  it('closes its tab from the panel\'s close button', async () => {
    const { leaf } = await openView();
    page.props!.onClose();
    expect(leaf.detach).toHaveBeenCalled();
  });

  it('opens the scene it created in its own place where no Atlas view is open', async () => {
    const { leaf } = await openView();
    await act(async () => page.props!.onCreated(SCENE));
    expect(openCreatedScene).toHaveBeenCalledWith(expect.anything(), SCENE.scenePath, 'Crypt', { leaf, level: 'floor-a' });
    expect(leaf.detach).not.toHaveBeenCalled();
  });

  it('opens the scene it created in the Atlas view and closes its tab', async () => {
    const atlasLeaf = {};
    vi.mocked(getLoadedAtlasView).mockReturnValue({ leaf: atlasLeaf } as never);
    const { leaf } = await openView();
    await act(async () => page.props!.onCreated(SCENE));
    expect(openCreatedScene).toHaveBeenCalledWith(expect.anything(), SCENE.scenePath, 'Crypt', { leaf: atlasLeaf, level: 'floor-a' });
    await vi.waitFor(() => expect(leaf.detach).toHaveBeenCalled());
  });

  it('is opened in the tab already open, else a new one, for the collection asked for', async () => {
    const open = { setViewState: vi.fn(async () => {}) };
    const fresh = { setViewState: vi.fn(async () => {}) };
    const workspace = { getLeavesOfType: vi.fn(() => [open]), getLeaf: vi.fn(() => fresh), revealLeaf: vi.fn(async () => {}) };
    await showDungeonGenerator({ workspace } as never, 'Ruins');
    expect(workspace.getLeavesOfType).toHaveBeenCalledWith(DUNGEON_GENERATOR_VIEW_TYPE);
    expect(open.setViewState).toHaveBeenCalledWith({ type: DUNGEON_GENERATOR_VIEW_TYPE, active: true, state: { collection: 'Ruins' } });
    workspace.getLeavesOfType.mockReturnValue([]);
    await showDungeonGenerator({ workspace } as never);
    expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(fresh.setViewState).toHaveBeenCalledWith({ type: DUNGEON_GENERATOR_VIEW_TYPE, active: true, state: {} });
  });
});
