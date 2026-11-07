// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf, type App, type View } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { loadAtlasView } from '../../src/app/plugin/atlasLeaves';

vi.mock('../../src/app/services/ServiceManager', () => ({ ServiceManager: class {} }));
vi.mock('../../src/app/storeFactory', () => ({ createViewAtlasStore: vi.fn() }));
vi.mock('../../src/app/stores/history', () => ({ getHistoryStore: () => undefined }));

function appWith(leaves: WorkspaceLeaf[]): App {
  return { workspace: { getLeavesOfType: () => leaves } } as unknown as App;
}

describe('loadAtlasView', () => {
  it('loads a deferred Atlas leaf, so a scene tab restored in the background is found', async () => {
    const leaf = new WorkspaceLeaf();
    const view = new AtlasView(leaf);
    leaf.view = { getViewType: () => 'atlas-vtt' } as unknown as View;
    leaf.loadIfDeferred = vi.fn(async () => { leaf.view = view; });

    expect(await loadAtlasView(appWith([leaf]))).toBe(view);
    expect(leaf.loadIfDeferred).toHaveBeenCalledOnce();
  });

  it('is null without an Atlas leaf', async () => {
    expect(await loadAtlasView(appWith([]))).toBeNull();
  });
});
