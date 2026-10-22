// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import type { UvttImported } from '../../src/app/import/uvtt/importUvttFile';
import { runUvttImport } from '../../src/app/import/uvtt/runUvttImport';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import { FolderGridItem } from '../../src/app/packages/components/asset-manager/components/FolderGridItem';
import { mayCarryMapFile, useUvttImport, uvttFilesAmong, type ImportMaps } from '../../src/app/packages/components/asset-manager/hooks/useUvttImport';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { AssetService } from '../../src/app/services/AssetService';

const notices = vi.hoisted(() => ({ shown: [] as Array<{ message: string; timeout: number | undefined; hidden: boolean }> }));
vi.mock('obsidian', async (importOriginal) => {
  class Notice {
    private readonly entry: { message: string; timeout: number | undefined; hidden: boolean };
    constructor(message: string, timeout?: number) {
      this.entry = { message, timeout, hidden: false };
      notices.shown.push(this.entry);
    }
    hide(): void { this.entry.hidden = true; }
  }
  return { ...await importOriginal<typeof import('obsidian')>(), Notice };
});
vi.mock('../../src/app/import/uvtt/runUvttImport', () => ({ runUvttImport: vi.fn() }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard', () => ({ TokenPreviewCard: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => {
  const converted = { image: new Blob(), thumbnail: null, preview: null, sourcePreview: null };
  return { convertForPreview: async () => converted, cropTokenImage: async () => converted, optimizeUpload: async () => converted };
});

const crypt = new File(['{}'], 'Crypt.dd2vtt');
const keep = new File(['{}'], 'Keep.UVTT');
const cave = new File(['art'], 'Cave.png', { type: 'image/png' });

const imported = (name: string): UvttImported => ({
  ok: true, name, scenePath: `atlas-vtt/collections/Dungeons/scenes/${name}.atlasmap`, counts: { walls: 1, doors: 0, lights: 0 }, lightsOff: false,
});

const openFile = vi.fn(async (_file: TFile): Promise<void> => {});
const app = {
  vault: { getFileByPath: vi.fn((path: string): TFile | null => Object.assign(new TFile(), { path })), getAbstractFileByPath: vi.fn(() => null) },
  workspace: { getLeaf: () => ({ openFile }), trigger: vi.fn() },
} as unknown as App;
const assets = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getCollections: vi.fn().mockResolvedValue([{ id: 'Dungeons', name: 'Dungeons' }]),
  getCollectionTags: vi.fn().mockResolvedValue([]),
} as unknown as AssetService;

beforeEach(() => {
  vi.clearAllMocks();
  notices.shown.length = 0;
  vi.mocked(runUvttImport).mockResolvedValue([]);
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  URL.createObjectURL = vi.fn(() => 'blob:art');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(AssetService, 'getInstance').mockReturnValue(assets);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('telling map files from other files', () => {
  it('picks the Universal VTT files by their names', () => {
    expect(uvttFilesAmong([cave, crypt, keep])).toEqual([crypt, keep]);
    expect(uvttFilesAmong([cave])).toEqual([]);
  });

  it.each([
    ['a file of a type the browser does not know, as a map file is', [{ kind: 'file', type: '' }], true],
    ['a map file among images', [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: '' }], true],
    ['only images', [{ kind: 'file', type: 'image/png' }, { kind: 'file', type: 'image/webp' }], false],
    ['a PDF', [{ kind: 'file', type: 'application/pdf' }], false],
    ['a note', [{ kind: 'file', type: 'text/markdown' }], false],
    ['a JSON file', [{ kind: 'file', type: 'application/json' }], false],
    ['an archive', [{ kind: 'file', type: 'application/zip' }], false],
    ['a text file', [{ kind: 'file', type: 'text/plain' }], false],
    ['an asset dragged inside the manager', [{ kind: 'string', type: 'text/plain' }, { kind: 'string', type: '' }], false],
    ['nothing', [], false],
  ])('a drag with %s may carry a map file: %s', (_label, items, expected) => {
    expect(mayCarryMapFile({ items: items as unknown as DataTransferItemList })).toBe(expected);
  });
});

describe('importing maps in the asset manager', () => {
  const notes = new File(['x'], 'Session notes.pdf', { type: 'application/pdf' });
  const stranger = new File(['x'], 'Crypt.dd2vtt.bak');
  let container: HTMLElement;
  let outside: HTMLElement;

  beforeEach(() => {
    container = document.body.createDiv({ cls: 'atlas-asset-manager-container' });
    outside = document.body.createDiv();
  });
  afterEach(() => { container.remove(); outside.remove(); });

  interface Props { isOpen: boolean; isMapCreatorOpen: boolean; isBusy: boolean }
  const OPEN: Props = { isOpen: true, isMapCreatorOpen: false, isBusy: false };

  function manager(initial: Props = OPEN): { importMaps: () => ImportMaps; set: (props: Partial<Props>) => void; onSceneOpened: ReturnType<typeof vi.fn> } {
    const onSceneOpened = vi.fn();
    let current = initial;
    const { result, rerender } = renderHook((props: Props) => useUvttImport({ app, assetService: assets, collectionId: 'Dungeons', onSceneOpened, ...props }), { initialProps: initial });
    return { importMaps: () => result.current, onSceneOpened, set: (props) => { current = { ...current, ...props }; rerender(current); } };
  }

  /** Fires a native drag event at `target` and tells whether it was taken (default prevented). */
  function drag(type: 'dragover' | 'drop', target: HTMLElement, files: File[]): { taken: boolean; dropEffect: string } {
    const dataTransfer = { files, items: files.map((file) => ({ kind: 'file', type: file.type })), dropEffect: 'none' };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    target.dispatchEvent(event);
    return { taken: event.defaultPrevented, dropEffect: dataTransfer.dropEffect };
  }

  /** An import that finishes when the test says so. */
  function pendingImport(): (result: UvttImported[]) => void {
    let finish: (result: UvttImported[]) => void = () => {};
    vi.mocked(runUvttImport).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    return (result) => finish(result);
  }

  it('takes a dragged map file as a copy and lets every other file pass', () => {
    manager();

    expect(drag('dragover', container, [crypt])).toEqual({ taken: true, dropEffect: 'copy' });
    expect(drag('dragover', container, [cave])).toEqual({ taken: false, dropEffect: 'none' });
    expect(drag('dragover', container, [notes])).toEqual({ taken: false, dropEffect: 'none' });
    expect(drag('dragover', outside, [crypt])).toEqual({ taken: false, dropEffect: 'none' });
  });

  it('imports the dropped map files into the collection and opens the last scene', async () => {
    const { onSceneOpened } = manager();
    vi.mocked(runUvttImport).mockResolvedValue([imported('Crypt'), imported('Keep')]);

    expect(drag('drop', container, [crypt, cave, keep]).taken).toBe(true);

    expect(runUvttImport).toHaveBeenCalledWith(app, assets, [crypt, keep], 'Dungeons');
    await waitFor(() => expect(onSceneOpened).toHaveBeenCalledTimes(1));
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(openFile.mock.calls[0]![0].path).toBe('atlas-vtt/collections/Dungeons/scenes/Keep.atlasmap');
    expect(notices.shown).toEqual([]);
  });

  it('leaves a drop without a map file alone and says nothing', () => {
    manager();

    expect(drag('drop', container, [cave]).taken).toBe(false);
    expect(drag('drop', container, [notes, cave]).taken).toBe(false);
    expect(drag('drop', container, []).taken).toBe(false);

    expect(runUvttImport).not.toHaveBeenCalled();
    expect(notices.shown).toEqual([]);
  });

  it('takes a dropped file that only looks like a map file and says what it takes', () => {
    manager();

    expect(drag('drop', container, [stranger]).taken).toBe(true);

    expect(runUvttImport).not.toHaveBeenCalled();
    expect(notices.shown.map((notice) => notice.message)).toEqual(['Crypt.dd2vtt.bak is not a map Atlas can import. Drop a .dd2vtt, .uvtt or .df2vtt file.']);
  });

  it('imports the map files of a drop and names the files it cannot take', () => {
    manager();

    drag('drop', container, [stranger, crypt, new File(['x'], 'README')]);

    expect(runUvttImport).toHaveBeenCalledWith(app, assets, [crypt], 'Dungeons');
    expect(notices.shown.map((notice) => notice.message)).toEqual(['Crypt.dd2vtt.bak and README are not maps Atlas can import. Drop a .dd2vtt, .uvtt or .df2vtt file.']);
  });

  it('leaves drops outside its window alone, and every drop once it is closed', () => {
    const { set } = manager();

    expect(drag('drop', outside, [crypt]).taken).toBe(false);
    set({ isOpen: false });
    expect(drag('drop', container, [crypt]).taken).toBe(false);
    expect(drag('dragover', container, [crypt]).taken).toBe(false);

    expect(runUvttImport).not.toHaveBeenCalled();
  });

  it('takes a map file dropped on a folder tile like one dropped beside it', async () => {
    manager();
    const onDrop = vi.fn();
    const noop = (): void => {};
    render(
      <FolderGridItem
        folder={{ id: 'crypts', name: 'Crypts', type: 'scenes', path: 'Crypts', parentId: null }}
        isSelected={false} isDropTarget={false} canReceiveDrop
        onSelection={noop} onOpen={noop} onContextMenu={noop} onDragStart={noop} onDragEnd={noop} onDragOverTarget={noop} onDrop={onDrop}
      />,
      { container },
    );

    expect(drag('drop', screen.getByText('Crypts'), [crypt]).taken).toBe(true);

    expect(runUvttImport).toHaveBeenCalledWith(app, assets, [crypt], 'Dungeons');
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('still lets a folder tile take what is dragged onto it inside the manager', () => {
    manager();
    const onDrop = vi.fn();
    const noop = (): void => {};
    render(
      <FolderGridItem
        folder={{ id: 'crypts', name: 'Crypts', type: 'scenes', path: 'Crypts', parentId: null }}
        isSelected={false} isDropTarget={false} canReceiveDrop
        onSelection={noop} onOpen={noop} onContextMenu={noop} onDragStart={noop} onDragEnd={noop} onDragOverTarget={noop} onDrop={onDrop}
      />,
      { container },
    );

    fireEvent.drop(screen.getByText('Crypts'), { dataTransfer: { files: [], items: [{ kind: 'string', type: 'text/plain' }] } });

    expect(onDrop).toHaveBeenCalledWith('crypts');
    expect(runUvttImport).not.toHaveBeenCalled();
  });

  it('opens nothing and stays open when no file arrived', async () => {
    const { importMaps, onSceneOpened } = manager();

    await importMaps()([crypt], 'Dungeons');

    expect(openFile).not.toHaveBeenCalled();
    expect(onSceneOpened).not.toHaveBeenCalled();
  });

  it('only adds the scenes where the one who asked wants to stay', async () => {
    const { importMaps, onSceneOpened } = manager({ ...OPEN, isMapCreatorOpen: true });
    vi.mocked(runUvttImport).mockResolvedValue([imported('Crypt')]);

    await importMaps()([crypt], 'Dungeons', () => true);
    expect(openFile).not.toHaveBeenCalled();

    await importMaps()([crypt], 'Dungeons', () => false);
    expect(openFile).toHaveBeenCalledTimes(1);
    expect(onSceneOpened).toHaveBeenCalledTimes(1);
  });

  it.each<[string, (set: (props: Partial<Props>) => void) => void]>([
    ['the asset manager was closed', (set) => set({ isOpen: false })],
    ['the asset manager was closed and opened again', (set) => { set({ isOpen: false }); set({ isOpen: true }); }],
    ['another dialog of the asset manager is open', (set) => set({ isBusy: true })],
    ['the map creator was opened, where images may wait', (set) => set({ isMapCreatorOpen: true })],
  ])('does not open the scene of an import that finishes after %s', async (_label, meanwhile) => {
    const { importMaps, set, onSceneOpened } = manager();
    const finish = pendingImport();

    const done = importMaps()([crypt], 'Dungeons');
    meanwhile(set);
    finish([imported('Crypt')]);
    await done;

    expect(openFile).not.toHaveBeenCalled();
    expect(onSceneOpened).not.toHaveBeenCalled();
  });

  it('does not open the scene for a map creator that was closed and opened again meanwhile', async () => {
    const { importMaps, set, onSceneOpened } = manager({ ...OPEN, isMapCreatorOpen: true });
    const finish = pendingImport();

    const done = importMaps()([crypt], 'Dungeons', () => false);
    set({ isMapCreatorOpen: false });
    set({ isMapCreatorOpen: true });
    finish([imported('Crypt')]);
    await done;

    expect(openFile).not.toHaveBeenCalled();
    expect(onSceneOpened).not.toHaveBeenCalled();
  });

  it('opens the scene when the map creator that asked was closed meanwhile', async () => {
    const { importMaps, set, onSceneOpened } = manager({ ...OPEN, isMapCreatorOpen: true });
    const finish = pendingImport();

    const done = importMaps()([crypt], 'Dungeons', () => false);
    set({ isMapCreatorOpen: false });
    finish([imported('Crypt')]);
    await done;

    expect(onSceneOpened).toHaveBeenCalledTimes(1);
  });

  it('stays open and says so when the scene cannot be opened', async () => {
    const { importMaps, onSceneOpened } = manager();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(runUvttImport).mockResolvedValue([imported('Crypt')]);
    openFile.mockRejectedValueOnce(new Error('No leaf'));

    await expect(importMaps()([crypt], 'Dungeons')).resolves.toBeUndefined();

    expect(onSceneOpened).not.toHaveBeenCalled();
    expect(notices.shown.map((notice) => notice.message)).toEqual(['"Crypt" could not be opened. It is in the Scenes tab.']);
  });
});

describe('adding maps with the map creator', () => {
  const ui = { app } as unknown as AtlasUIContextValue;
  const mount = (child: React.ReactNode): void => { render(<AtlasUIContext.Provider value={ui}>{child}</AtlasUIContext.Provider>); };
  const picker = (): HTMLInputElement => document.querySelector<HTMLInputElement>('input[type=file]')!;
  const pick = (files: File[]): void => { fireEvent.change(picker(), { target: { files } }); };

  it('offers Universal VTT files beside images', () => {
    mount(<TokenCreator isOpen onClose={() => {}} mode="map" selectedCollection="Dungeons" onImportMaps={vi.fn<ImportMaps>()} />);

    expect(picker().accept).toBe('image/*,.dd2vtt,.uvtt,.df2vtt');
    expect(screen.getByText('PNG · JPG · WebP · Universal VTT')).toBeTruthy();
  });

  it('offers only images for tokens', () => {
    mount(<TokenCreator isOpen onClose={() => {}} mode="token" selectedCollection="Dungeons" />);

    expect(picker().accept).toBe('image/*');
    expect(screen.getByText('PNG · JPG · WebP')).toBeTruthy();
  });

  it('imports a picked map file into the chosen collection and lets its scene open', async () => {
    const onImportMaps = vi.fn<ImportMaps>(async () => {});
    mount(<TokenCreator isOpen onClose={() => {}} mode="map" selectedCollection="Dungeons" onImportMaps={onImportMaps} />);

    pick([crypt]);

    expect(onImportMaps).toHaveBeenCalledWith([crypt], 'Dungeons', expect.any(Function));
    expect(onImportMaps.mock.calls[0]![2]!()).toBe(false);
    expect(screen.getByText('No maps yet')).toBeTruthy();
  });

  it('keeps images as previews and stays open for them', async () => {
    const onImportMaps = vi.fn<ImportMaps>(async () => {});
    mount(<TokenCreator isOpen onClose={() => {}} mode="map" selectedCollection="Dungeons" onImportMaps={onImportMaps} />);

    pick([cave, crypt]);

    expect(onImportMaps).toHaveBeenCalledWith([crypt], 'Dungeons', expect.any(Function));
    await waitFor(() => expect(screen.getByText('1 map')).toBeTruthy());
    expect(onImportMaps.mock.calls[0]![2]!()).toBe(true);
  });
});
