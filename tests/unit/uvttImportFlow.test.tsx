// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { TFile } from 'obsidian';
import { optimizeImage } from '../../src/app/imageProcessing/imageProcessing';
import { useUvttImport } from '../../src/app/packages/components/asset-manager/hooks/useUvttImport';
import { AssetService } from '../../src/app/services/AssetService';
import { cryptFile, cryptSetting } from '../fixtures/uvttFiles';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * A drop on the asset manager through the real import, down to the vault: only the image
 * workers are stood in for. jsdom's `Blob` cannot be read, so Node's takes its place.
 */

interface Shown { message: string; timeout: number | undefined; hidden: boolean }
const notices = vi.hoisted(() => ({ shown: [] as Shown[] }));
vi.mock('obsidian', async (importOriginal) => {
  class Notice {
    private readonly entry: Shown;
    constructor(message: string, timeout?: number) {
      this.entry = { message, timeout, hidden: false };
      notices.shown.push(this.entry);
    }
    hide(): void { this.entry.hidden = true; }
  }
  return { ...await importOriginal<typeof import('obsidian')>(), Notice };
});
vi.mock('../../src/app/imageProcessing/imageProcessing', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/imageProcessing/imageProcessing')>(),
  optimizeImage: vi.fn(),
}));

const COLLECTION = 'Dungeons';
const SCENE = `atlas-vtt/collections/${COLLECTION}/scenes/Crypt.atlasmap`;

let vault: InMemoryApp;
let assets: AssetService;
let container: HTMLElement;
const openFile = vi.fn(async (_file: TFile): Promise<void> => {});
const onSceneOpened = vi.fn();

const mapFile = (content: unknown, name: string): File => new NodeFile([JSON.stringify(content)], name) as unknown as File;

function drop(files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, items: files.map((file) => ({ kind: 'file', type: file.type })) } });
  container.dispatchEvent(event);
}

let trigger: MockInstance<(name: string, ...data: unknown[]) => void>;
const refreshes = (): number => trigger.mock.calls.filter(([name]) => name === 'atlas-vtt:refresh-assets').length;

beforeEach(async () => {
  vi.clearAllMocks();
  notices.shown.length = 0;
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('File', NodeFile);
  vi.mocked(optimizeImage).mockImplementation(async (image) => ({ image, thumbnail: new NodeBlob(['THUMB']) as unknown as Blob, preview: null, sourcePreview: null }));
  vault = createInMemoryApp();
  Object.assign(vault.app.workspace, { getLeaf: () => ({ openFile }) });
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  trigger = vi.spyOn(vault.app.workspace, 'trigger');
  trigger.mockClear();
  container = document.body.createDiv({ cls: 'atlas-asset-manager-container' });
  renderHook(() => useUvttImport({ app: vault.app, assetService: assets, isOpen: true, isMapCreatorOpen: false, isBusy: false, collectionId: COLLECTION, onSceneOpened }));
});
afterEach(() => { cleanup(); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('a map file dropped on the asset manager', () => {
  it('becomes a map and a scene in the vault, is announced while it runs and when it is done, and opens', async () => {
    drop([mapFile(cryptFile(), 'Crypt.dd2vtt')]);

    expect(notices.shown).toEqual([{ message: 'Importing Crypt.dd2vtt…', timeout: 0, hidden: false }]);
    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));

    expect(optimizeImage).toHaveBeenCalledTimes(1);
    expect(vault.files.has(SCENE)).toBe(true);
    expect((await assets.getAssets(COLLECTION)).map((asset) => `${asset.type}:${asset.name}`).sort()).toEqual(['map:Crypt', 'scene:Crypt']);
    expect(notices.shown).toEqual([
      { message: 'Importing Crypt.dd2vtt…', timeout: 0, hidden: true },
      { message: 'Imported "Crypt": 10 walls, 1 door, 1 light.', timeout: undefined, hidden: false },
    ]);
    expect(refreshes()).toBe(1);
    expect(openFile.mock.calls.map(([file]) => file.path)).toEqual([SCENE]);
  });

  it('is refused with its reason when it is damaged, and nothing is refreshed or opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    drop([mapFile(cryptSetting('lights.0.range', 'far'), 'Broken.uvtt')]);

    await waitFor(() => expect(notices.shown).toHaveLength(2));
    expect(notices.shown[0]).toEqual({ message: 'Importing Broken.uvtt…', timeout: 0, hidden: true });
    expect(notices.shown[1]!.message).toBe('Could not import Broken.uvtt. The range of light 1 is missing or not a number.');
    expect(notices.shown[1]!.timeout).toBeGreaterThanOrEqual(10_000);
    expect(refreshes()).toBe(0);
    expect(openFile).not.toHaveBeenCalled();
    expect(onSceneOpened).not.toHaveBeenCalled();
    expect(await assets.getAssets(COLLECTION)).toEqual([]);
  });

  it('comes with others one after the other: each announced, the list refreshed once, the last scene opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    drop([mapFile(cryptFile(), 'Crypt.dd2vtt'), mapFile('not a map', 'Broken.uvtt'), mapFile(cryptSetting('environment.baked_lighting', true), 'Keep.df2vtt')]);

    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    expect(notices.shown.map((notice) => notice.message)).toEqual([
      'Importing Crypt.dd2vtt…',
      'Imported "Crypt": 10 walls, 1 door, 1 light.',
      'Importing Broken.uvtt…',
      'Could not import Broken.uvtt. The file\'s content is missing or not an object.',
      'Importing Keep.df2vtt…',
      'Imported "Keep": 10 walls, 1 door, 1 light. The lights are switched off, because the image already shows their glow.',
    ]);
    expect(notices.shown.filter((notice) => notice.timeout === 0).every((notice) => notice.hidden)).toBe(true);
    expect(refreshes()).toBe(1);
    expect(openFile.mock.calls.map(([file]) => file.path)).toEqual([`atlas-vtt/collections/${COLLECTION}/scenes/Keep.atlasmap`]);
  });
});
