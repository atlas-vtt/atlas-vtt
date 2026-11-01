// @vitest-environment jsdom
import React, { act } from 'react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicFolderOffer } from '../../../src/app/packages/components/asset-manager/components/MusicFolderOffer';
import { SoundCardArt } from '../../../src/app/packages/components/asset-manager/components/SoundCardArt';
import { TabSwitcher } from '../../../src/app/packages/components/asset-manager/components/TabSwitcher';
import { soundMenuEntries } from '../../../src/app/packages/components/asset-manager/contextMenus/soundMenuEntries';
import { useSoundImport } from '../../../src/app/packages/components/asset-manager/hooks/useSoundImport';
import { useUvttImport } from '../../../src/app/packages/components/asset-manager/hooks/useUvttImport';
import type { AssetContextMenuDeps } from '../../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { AnyAsset, SoundAsset } from '../../../src/app/packages/components/asset-manager/types';
import { sortAssets } from '../../../src/app/packages/components/asset-manager/utils/assetSort';
import { tagGroupOfTab } from '../../../src/app/packages/components/asset-manager/utils/assetTags';
import { formatServiceAsset, partitionByTab } from '../../../src/app/packages/components/asset-manager/utils/assetFormatters';
import { shownTabs, tabHasFolders } from '../../../src/app/packages/components/asset-manager/utils/tabKinds';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { AssetService, type SoundAsset as StoredSound } from '../../../src/app/services/AssetService';
import { provideSoundConversion, type SoundConversion } from '../../../src/app/soundLibrary/soundConversion';
import { runSoundImport } from '../../../src/app/soundLibrary/runSoundImport';
import { mayCarryAudio } from '../../../src/app/soundLibrary/soundFiles';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/soundLibrary/runSoundImport', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/app/soundLibrary/runSoundImport')>(),
  runSoundImport: vi.fn(async () => undefined),
}));

vi.mock('../../../src/app/soundLibrary/audioDuration', () => ({ readAudioSeconds: async () => 60 }));

const STORED: StoredSound = {
  id: 's1', type: 'sound', name: 'Rain', tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1,
  audioPath: 'Library/Rain.mp3', kind: 'music', licence: 'unknown', streaming: 'unknown',
};

let vault: InMemoryApp;
let assets: AssetService;

const viewOf = (stored: StoredSound = STORED): SoundAsset => formatServiceAsset(stored, null, vault.app) as SoundAsset;

function withUI(children: React.ReactNode): React.JSX.Element {
  const value = { app: vault.app, view: null, pixiApp: null, renderer: null } as AtlasUIContextValue;
  return <AtlasUIContext.Provider value={value}>{children}</AtlasUIContext.Provider>;
}

beforeEach(async () => {
  vault = createInMemoryApp({ folders: ['atlas-vtt/collections'] });
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('Fen');
  vi.mocked(runSoundImport).mockClear();
});
afterEach(() => { cleanup(); });

describe('the Sounds tab', () => {
  it('is offered only while the experimental switch is on', () => {
    const counts = { scenes: 0, maps: 0, encounters: 0, tokens: 0, party: 0, sounds: 3 };
    const { rerender } = render(<TabSwitcher activeTab="tokens" onTabChange={vi.fn()} assetCounts={counts} tabs={shownTabs(false)} />);
    expect(screen.queryByRole('button', { name: /Sounds/ })).toBeNull();
    rerender(<TabSwitcher activeTab="tokens" onTabChange={vi.fn()} assetCounts={counts} tabs={shownTabs(true)} />);
    expect(screen.getByRole('button', { name: /Sounds/ })).toBeTruthy();
  });

  it('lists sounds flat, with tags of their own', () => {
    expect(tabHasFolders('sounds')).toBe(false);
    expect(tagGroupOfTab('sounds')).toBe('sounds');
    expect(partitionByTab([STORED]).sounds).toEqual([STORED]);
  });

  it('sorts by kind', () => {
    const sounds = [viewOf({ ...STORED, id: 'b', kind: 'music' }), viewOf({ ...STORED, id: 'a', kind: 'ambience' })] as AnyAsset[];
    expect(sortAssets(sounds, 'type', 'asc').map((sound) => sound.id)).toEqual(['a', 'b']);
  });
});

describe('a sound\'s card', () => {
  const state = (): string | null | undefined => document.querySelector('.atlas-sound-state')?.textContent;

  it('says it waits for a file that is not here', () => {
    render(withUI(<SoundCardArt asset={viewOf()} />));
    expect(state()).toBe('Waiting for the file');
  });

  it('says not converted until someone reports otherwise, and shows no progress of its own', async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    render(withUI(<SoundCardArt asset={viewOf()} />));
    expect(state()).toBe('Not converted');
    expect(document.querySelector('.atlas-sound-state__bar')).toBeNull();
  });

  it('follows what the owner of conversions reports', async () => {
    await vault.app.vault.create('Library/Rain.mp3', 'AUDIO');
    let conversion: SoundConversion = { state: 'converting', progress: 0.25 };
    const listeners = new Set<() => void>();
    const release = provideSoundConversion(vault.app, {
      stateOf: () => conversion,
      onChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    });
    render(withUI(<SoundCardArt asset={viewOf()} />));
    expect(state()).toBe('Converting 25%');

    act(() => {
      conversion = { state: 'converting', progress: null };
      for (const listener of listeners) listener();
    });
    expect(state()).toBe('Converting');

    act(() => {
      conversion = { state: 'ready' };
      for (const listener of listeners) listener();
    });
    expect(state()).toBe('Ready');
    cleanup();
    expect(listeners.size).toBe(0);
    release();
  });

  it('shows a missing file before any conversion', () => {
    const ready: SoundConversion = { state: 'ready' };
    const release = provideSoundConversion(vault.app, { stateOf: () => ready, onChanged: () => () => undefined });
    render(withUI(<SoundCardArt asset={viewOf()} />));
    expect(state()).toBe('Waiting for the file');
    release();
  });
});

describe('a sound\'s menu', () => {
  async function menu(): Promise<{ entries: ReturnType<typeof soundMenuEntries>; ids: string[]; deps: AssetContextMenuDeps; shown: [SoundAsset, SoundAsset] }> {
    const one = await assets.addAsset({ ...STORED, audioPath: 'a.mp3', name: 'A' });
    const two = await assets.addAsset({ ...STORED, audioPath: 'b.mp3', name: 'B' });
    const shown = [viewOf(one as StoredSound), viewOf(two as StoredSound)] as [SoundAsset, SoundAsset];
    const deps = { assetService: assets, loadAssetsForActiveTab: vi.fn(async () => undefined), setInputModalState: vi.fn() } as unknown as AssetContextMenuDeps;
    return { entries: soundMenuEntries(shown[0], shown, deps), ids: [one.id, two.id], deps, shown };
  }

  it('offers nothing on other assets', () => {
    const scene = { id: 'x', name: 'X', type: 'scenes', modifiedAt: 1 } as AnyAsset;
    expect(soundMenuEntries(scene, [scene], { assetService: assets } as unknown as AssetContextMenuDeps)).toEqual([]);
  });

  it('changes the kind of every sound selected', async () => {
    const { entries, ids, deps } = await menu();
    const kind = entries.find((entry) => entry.type === 'submenu' && entry.label === 'Kind');
    if (kind?.type !== 'submenu' || !Array.isArray(kind.children)) throw new Error('No kind menu');
    const ambience = kind.children.find((entry) => entry.type === 'item' && entry.label === 'Ambience');
    if (ambience?.type !== 'item') throw new Error('No ambience row');
    expect(ambience.checked).toBe(false);
    ambience.onClick();
    await waitFor(() => expect(deps.loadAssetsForActiveTab).toHaveBeenCalled());
    for (const id of ids) expect(await assets.getAssetById(id)).toMatchObject({ kind: 'ambience' });
  });

  it('trims in steps, and zero takes the field away', async () => {
    const { entries, ids, deps, shown } = await menu();
    const trim = entries.find((entry) => entry.type === 'item' && entry.label === 'Trim');
    if (trim?.type !== 'item' || !trim.stepper) throw new Error('No trim stepper');
    expect(trim.stepper.value).toBe('0 dB');
    void trim.stepper.onIncrement();
    await waitFor(() => expect(deps.loadAssetsForActiveTab).toHaveBeenCalledTimes(1));
    expect(await assets.getAssetById(ids[0]!)).toMatchObject({ trimDb: 1 });

    const again = soundMenuEntries({ ...shown[0], record: { ...shown[0].record, trimDb: 1 } }, shown, deps);
    const stepped = again.find((entry) => entry.type === 'item' && entry.label === 'Trim');
    if (stepped?.type !== 'item' || !stepped.stepper) throw new Error('No trim stepper');
    expect(stepped.stepper.value).toBe('+1 dB');
    void stepped.stepper.onDecrement();
    await waitFor(() => expect(deps.loadAssetsForActiveTab).toHaveBeenCalledTimes(2));
    expect('trimDb' in (await assets.getAssetById(ids[0]!))!).toBe(false);
  });

  it('writes a credit through the input dialog, and an empty one takes it away', async () => {
    const { entries, ids, deps } = await menu();
    const credit = entries.find((entry) => entry.type === 'item' && entry.label === 'Credit');
    if (credit?.type !== 'item') throw new Error('No credit row');
    credit.onClick();
    const { onConfirm } = vi.mocked(deps.setInputModalState).mock.calls[0]![0];
    onConfirm('  A. Person ');
    await waitFor(() => expect(deps.loadAssetsForActiveTab).toHaveBeenCalledTimes(1));
    expect(await assets.getAssetById(ids[0]!)).toMatchObject({ credit: 'A. Person' });
    onConfirm('   ');
    await waitFor(() => expect(deps.loadAssetsForActiveTab).toHaveBeenCalledTimes(2));
    expect('credit' in (await assets.getAssetById(ids[0]!))!).toBe(false);
  });
});

describe('the one offer of a collection\'s music folder', () => {
  const COLLECTION = { id: 'Fen', uid: 'u1', name: 'Fen' };
  const MUSIC = 'atlas-vtt/collections/Fen/music';

  beforeEach(async () => {
    await vault.app.vault.create(`${MUSIC}/One.mp3`, 'AUDIO');
    await vault.app.vault.create(`${MUSIC}/Two.ogg`, 'AUDIO');
    await vault.app.vault.create(`${MUSIC}/cover.png`, 'IMAGE');
    await vault.app.vault.create('Library/Elsewhere.mp3', 'AUDIO');
  });

  it('counts the folder\'s audio, and records it where it lies', async () => {
    render(<MusicFolderOffer app={vault.app} assetService={assets} collection={COLLECTION} />);
    await screen.findByText('Add 2 files from this collection\'s music folder');
    const files = new Map(vault.files);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(async () => expect(await assets.getAssets('Fen', 'sound')).toHaveLength(2));
    for (const [path, content] of files) {
      if (!path.endsWith('.json')) expect(vault.files.get(path)).toBe(content);
    }
    expect(vault.app.vault.createBinary).not.toHaveBeenCalled();
    expect((await assets.getAssets('Fen', 'sound')).map((sound) => sound.audioPath).sort()).toEqual([`${MUSIC}/One.mp3`, `${MUSIC}/Two.ogg`]);
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('is asked once: not now stays not now', async () => {
    const { unmount } = render(<MusicFolderOffer app={vault.app} assetService={assets} collection={COLLECTION} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    unmount();
    render(<MusicFolderOffer app={vault.app} assetService={assets} collection={COLLECTION} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(await assets.getAssets('Fen', 'sound')).toEqual([]);
  });

  it('says nothing where there is nothing to add', async () => {
    const { container } = render(<MusicFolderOffer app={vault.app} assetService={assets} collection={{ ...COLLECTION, id: 'Empty', uid: 'u2' }} />);
    await act(async () => { await Promise.resolve(); });
    expect(container.firstChild).toBeNull();
  });
});

describe('dropping files on the manager', () => {
  function drop(files: File[]): DragEvent {
    const event = new Event('drop', { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { files, items: files.map((file) => ({ kind: 'file', type: file.type })) } });
    return event;
  }

  function managerElement(): HTMLElement {
    const element = document.createElement('div');
    element.className = 'atlas-asset-manager-container';
    document.body.appendChild(element);
    return element;
  }

  afterEach(() => { document.body.replaceChildren(); });

  const rain = new File(['a'], 'Rain.mp3', { type: 'audio/mpeg' });

  it('imports audio on the Sounds tab', () => {
    renderHook(() => useSoundImport({ app: vault.app, assetService: assets, collectionId: 'Fen', takesDrops: true, onAdding: vi.fn() }));
    const event = drop([rain]);
    managerElement().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(runSoundImport).toHaveBeenCalledWith(vault.app, assets, [rain], 'Fen');
  });

  it('leaves drops alone on the other tabs', () => {
    renderHook(() => useSoundImport({ app: vault.app, assetService: assets, collectionId: 'Fen', takesDrops: false, onAdding: vi.fn() }));
    const event = drop([rain]);
    managerElement().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(runSoundImport).not.toHaveBeenCalled();
  });

  it('a WebM on the Sounds tab is a sound, not an animated map', () => {
    const onVideos = vi.fn();
    const webm = new File(['a'], 'Wind.webm', { type: 'video/webm' });
    renderHook(() => useUvttImport({
      app: vault.app, assetService: assets, isOpen: true, dropsGoElsewhere: true, isMapCreatorOpen: false, isBusy: false, collectionId: 'Fen', onVideos, onSceneOpened: vi.fn(),
    }));
    renderHook(() => useSoundImport({ app: vault.app, assetService: assets, collectionId: 'Fen', takesDrops: true, onAdding: vi.fn() }));
    managerElement().dispatchEvent(drop([webm]));
    expect(onVideos).not.toHaveBeenCalled();
    expect(runSoundImport).toHaveBeenCalledWith(vault.app, assets, [webm], 'Fen');
  });

  it.each([
    ['audio', [{ kind: 'file', type: 'audio/mpeg' }], true],
    ['a file of no known type', [{ kind: 'file', type: '' }], true],
    ['a WebM', [{ kind: 'file', type: 'video/webm' }], true],
    ['only images', [{ kind: 'file', type: 'image/png' }], false],
    ['text', [{ kind: 'string', type: 'text/plain' }], false],
  ])('a drag of %s may carry audio: %s', (_label, items, expected) => {
    expect(mayCarryAudio({ items } as unknown as DataTransfer)).toBe(expected);
  });
});
