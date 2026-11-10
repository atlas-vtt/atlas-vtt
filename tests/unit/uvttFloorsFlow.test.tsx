// @vitest-environment jsdom
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';
import { optimizeImage } from '../../src/app/imageProcessing/imageProcessing';
import type { ChooseFloors, FloorsChoice, FloorsRequest } from '../../src/app/import/uvtt/runUvttGroupImport';
import { useUvttImport } from '../../src/app/packages/components/asset-manager/hooks/useUvttImport';
import { AssetService } from '../../src/app/services/AssetService';
import { parseSceneFile } from '../../src/app/services/MapPersistence';
import { daTowerFloor, keepFloor } from '../fixtures/uvttFloorFiles';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * Map files dropped together on the asset manager, through the real import down to the vault:
 * only the image workers and the GM's answer in the dialog are stood in for. jsdom's `Blob`
 * cannot be read, so Node's takes its place.
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
const SCENES = `atlas-vtt/collections/${COLLECTION}/scenes`;

let vault: InMemoryApp;
let assets: AssetService;
let container: HTMLElement;
const openFile = vi.fn(async (_file: TFile): Promise<void> => {});
const onSceneOpened = vi.fn();
let answer: (request: FloorsRequest) => FloorsChoice | null;
const chooseFloors = vi.fn<ChooseFloors>(async (request) => answer(request));

const mapFile = (content: unknown, name: string): File => new NodeFile([JSON.stringify(content)], name) as unknown as File;
const tower = (): File[] => [1, 0].map((floor) => mapFile(daTowerFloor(floor), `tower_floor_${floor}.dd2vtt`));

function drop(files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, items: files.map((file) => ({ kind: 'file', type: file.type })) } });
  container.dispatchEvent(event);
}

const scenesInVault = (): string[] => [...vault.files.keys()].filter((path) => path.endsWith('.atlasmap')).sort();

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
  container = document.body.createDiv({ cls: 'atlas-asset-manager-container' });
  answer = (request) => ({ kind: 'levels', sceneName: request.sceneName, floors: request.floors });
  renderHook(() => useUvttImport({ app: vault.app, assetService: assets, isOpen: true, isMapCreatorOpen: false, isBusy: false, collectionId: COLLECTION, onSceneOpened, chooseFloors }));
});
afterEach(() => { cleanup(); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('map files dropped together that share a grid', () => {
  it('are offered as floors, bottom first and named, and become one scene with a level each, which opens', async () => {
    drop(tower());

    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    const [request] = chooseFloors.mock.calls[0]!;
    expect(request.sceneName).toBe('tower');
    expect(request.floors.map((floor) => [floor.source.fileName, floor.name])).toEqual([['tower_floor_0.dd2vtt', 'Level 1'], ['tower_floor_1.dd2vtt', 'Level 2']]);
    expect(scenesInVault()).toEqual([`${SCENES}/tower.atlasmap`]);
    expect(openFile.mock.calls.map(([file]) => file.path)).toEqual([`${SCENES}/tower.atlasmap`]);
    expect(notices.shown.map((notice) => notice.message)).toEqual([
      'Reading tower_floor_1.dd2vtt and tower_floor_0.dd2vtt…',
      'Importing "tower" with 2 levels…',
      'Imported "tower" with 2 levels: 8 walls, 1 door, and 0 lights.',
    ]);
    expect(notices.shown.filter((notice) => notice.timeout === 0).every((notice) => notice.hidden)).toBe(true);
  });

  it('take the names and the order the GM gives them', async () => {
    answer = (request) => ({ kind: 'levels', sceneName: 'Watchtower', floors: [...request.floors].reverse().map((floor, index) => ({ ...floor, name: ['Top', 'Base'][index]! })) });

    drop(tower());

    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    const { state } = parseSceneFile(vault.files.get(`${SCENES}/Watchtower.atlasmap`)!);
    expect(state.levels?.map((level) => level.name)).toEqual(['Top', 'Base']);
    const walls = Object.values(state.objects.walls);
    // tower_floor_1 holds the door, and is now the bottom level
    expect(walls.find((wall) => wall.type === 'door')?.levels).toEqual([state.levels![0]!.id]);
  });

  it('become a scene each where the GM chooses so, of which the last opens', async () => {
    answer = () => ({ kind: 'scenes' });

    drop(tower());

    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    expect(scenesInVault()).toEqual([`${SCENES}/tower_floor_0.atlasmap`, `${SCENES}/tower_floor_1.atlasmap`]);
    expect(openFile.mock.calls.map(([file]) => file.path)).toEqual([`${SCENES}/tower_floor_0.atlasmap`]);
  });

  it('import nothing when the GM closes the dialog', async () => {
    answer = () => null;

    drop(tower());

    await waitFor(() => expect(chooseFloors).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scenesInVault()).toEqual([]);
    expect(optimizeImage).not.toHaveBeenCalled();
    expect(openFile).not.toHaveBeenCalled();
  });
});

describe('map files dropped together that cannot be floors', () => {
  it('become a scene each without a question, and the GM is told why', async () => {
    drop([mapFile(daTowerFloor(0), 'tower_floor_0.dd2vtt'), mapFile(keepFloor({ x: 2, y: 2 }), 'Keep.uvtt')]);

    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    expect(chooseFloors).not.toHaveBeenCalled();
    expect(notices.shown.map((notice) => notice.message)).toContain(
      'Each file became a scene of its own. The cells of Keep.uvtt are 100 pixels wide, those of tower_floor_0.dd2vtt 72 pixels, so they do not share a grid.',
    );
    expect(scenesInVault()).toEqual([`${SCENES}/Keep.atlasmap`, `${SCENES}/tower_floor_0.atlasmap`]);
  });

  it('leave out a file that is refused, and import the one left as a scene', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    drop([mapFile(daTowerFloor(0), 'tower_floor_0.dd2vtt'), mapFile('not a map', 'tower_floor_1.dd2vtt')]);

    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    expect(chooseFloors).not.toHaveBeenCalled();
    expect(notices.shown.map((notice) => notice.message)).toEqual([
      'Reading tower_floor_0.dd2vtt and tower_floor_1.dd2vtt…',
      'Could not import tower_floor_1.dd2vtt. The file\'s content is missing or not an object.',
      'Importing tower_floor_0.dd2vtt…',
      'Imported "tower_floor_0": 4 walls, 0 doors, 0 lights.',
    ]);
    expect(scenesInVault()).toEqual([`${SCENES}/tower_floor_0.atlasmap`]);
  });
});
