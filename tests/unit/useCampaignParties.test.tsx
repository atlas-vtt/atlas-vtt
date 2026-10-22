// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import type { Campaign } from '../../src/app/campaigns/campaignTypes';
import { PARTY_RELOAD_MS, useCampaignParties } from '../../src/app/react/components/dashboard/useCampaignParties';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SCENE_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const sceneWith = (...art: string[]): string => JSON.stringify({
  version: 4,
  state: { mapPath: SCENE_PATH, objects: { tokens: Object.fromEntries(art.map((path, index) => [`t${index}`, { imagePath: path }])) } },
});

interface Setup {
  app: App;
  root: HTMLDivElement;
  rootRef: { current: HTMLDivElement };
  campaigns: Campaign[];
  workspace: (name: string) => void;
  modify: (content: string) => Promise<void>;
  reads: () => number;
}

async function setup(): Promise<Setup> {
  const { app } = createInMemoryApp({
    files: { [SCENE_PATH]: sceneWith('art/aria.webp'), 'art/aria.webp': 'WEBP', 'art/brom.webp': 'WEBP' },
  });
  const listeners: { name: string; callback: () => void }[] = [];
  vi.mocked(app.workspace.on).mockImplementation(((name: string, callback: () => void) => {
    const ref = { name, callback };
    listeners.push(ref);
    return ref;
  }) as never);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.addAssets([
    { type: 'token', name: 'Aria', imagePath: 'art/aria.webp', tags: [], collection: 'c', playerCharacter: true },
    { type: 'token', name: 'Brom', imagePath: 'art/brom.webp', tags: [], collection: 'c', playerCharacter: true },
  ]);
  const [scene] = await assets.getAssets(undefined, 'scene');
  // Only the hook hears the scene's saves; the library's own vault check is not under test.
  const modifyListeners: ((file: TFile) => void)[] = [];
  vi.mocked(app.vault.on).mockImplementation(((name: string, callback: (file: TFile) => void) => {
    if (name === 'modify') modifyListeners.push(callback);
    return {};
  }) as never);
  const root = document.createElement('div');
  document.body.append(root);
  // The library is read with real timers; the reloads are timed by the test.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return {
    app,
    root,
    rootRef: { current: root },
    campaigns: [{ id: 'a', name: 'Cairn', createdAt: 1, lastScene: scene!.id }],
    workspace: (name) => { for (const listener of listeners) if (listener.name === name) listener.callback(); },
    modify: async (content) => {
      await app.vault.process(app.vault.getFileByPath(SCENE_PATH)!, () => content);
      for (const listener of modifyListeners) listener(new TFile(SCENE_PATH));
    },
    reads: () => vi.mocked(app.vault.cachedRead).mock.calls.length,
  };
}

const names = (parties: ReturnType<typeof useCampaignParties>): string[] => (parties.get('a') ?? []).map((face) => face.name);
const flush = (ms = 0): Promise<void> => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  AssetService.resetInstance();
  document.body.replaceChildren();
});

describe('the parties on the dashboard', () => {
  it('applies only the newest read, however the reads finish', async () => {
    const { app, rootRef, campaigns, workspace } = await setup();
    const answers: ((text: string) => void)[] = [];
    vi.mocked(app.vault.cachedRead).mockImplementation(() => new Promise<string>((resolve) => { answers.push(resolve); }));
    const { result } = renderHook(() => useCampaignParties(app, campaigns, rootRef));
    await flush();
    workspace('atlas-vtt:refresh-assets');
    await flush(PARTY_RELOAD_MS);
    expect(answers).toHaveLength(2);

    answers[1]!(sceneWith('art/brom.webp'));
    await flush();
    expect(names(result.current)).toEqual(['Brom']);
    answers[0]!(sceneWith('art/aria.webp'));
    await flush();
    expect(names(result.current)).toEqual(['Brom']);
  });

  it('reads a scene that is being saved again only once it is quiet, and not while the dashboard is hidden', async () => {
    const { app, root, rootRef, campaigns, workspace, modify, reads } = await setup();
    const { result } = renderHook(() => useCampaignParties(app, campaigns, rootRef));
    await flush();
    expect(names(result.current)).toEqual(['Aria']);
    expect(reads()).toBe(1);

    await modify(sceneWith('art/aria.webp', 'art/brom.webp'));
    await flush(PARTY_RELOAD_MS / 2);
    await modify(sceneWith('art/brom.webp'));
    await flush(PARTY_RELOAD_MS - 1);
    expect(reads()).toBe(1);
    await flush(1);
    expect(reads()).toBe(2);
    expect(names(result.current)).toEqual(['Brom']);

    let shown = false;
    root.checkVisibility = (): boolean => shown;
    await modify(sceneWith('art/aria.webp'));
    await flush(PARTY_RELOAD_MS * 2);
    workspace('active-leaf-change');
    await flush();
    expect(reads()).toBe(2);
    expect(names(result.current)).toEqual(['Brom']);

    shown = true;
    workspace('active-leaf-change');
    await flush();
    expect(reads()).toBe(3);
    expect(names(result.current)).toEqual(['Aria']);
    workspace('layout-change');
    await flush();
    expect(reads()).toBe(3);
  });
});
