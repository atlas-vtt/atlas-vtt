// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal, type App } from 'obsidian';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import type { FolderChoice } from '../../src/app/soundLibrary/SoundFolderPicker';
import { recentSounds, rememberSound } from '../../src/app/audio/recentSounds';
import { TokenSoundPlayer } from '../../src/app/audio/TokenSoundPlayer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { TokenSound } from '../../src/app/types/audioTypes';
import { FakeTokenSoundContext } from '../helpers/fakeTokenSoundContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { withSound } from '../mocks/experimentalFeatures';

const showNotice = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/ui/notice', () => ({ showNotice }));
/** How long the files say they play: jsdom loads no audio metadata, so the length is the test's to say. */
const seconds = vi.hoisted(() => ({ value: 5 as number | null }));
vi.mock('../../src/app/soundLibrary/audioDuration', () => ({ readAudioSecondsAt: vi.fn(() => Promise.resolve(seconds.value)) }));

const MB = 1024 * 1024;
let current: App | null = null;

function open(sounds?: unknown, { sound = true, files = {} }: { sound?: boolean; files?: Record<string, string> } = {}): { app: App; store: ViewAtlasStore; saved: () => TokenEntity; section: () => HTMLElement } {
  const { app: made } = createInMemoryApp({
    files: {
      'Sounds/dragon-roar.mp3': 'audio:48000',
      'Sounds/wings.ogg': 'audio:24000',
      'Sounds/album.mp3': 'audio:100'.padEnd(20 * MB + 1, ' '),
      'Lore/Dragon.md': '# Dragon',
      ...files,
    },
  });
  // Token sounds belong to Sound, so Edit Token offers them only while the GM switched it on.
  const app = sound ? withSound(made) : made;
  current = app;
  const store = createViewAtlasStore(app, `edit-token-sounds-${Math.random()}`);
  const token: TokenEntity = { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, ...(sounds !== undefined && { sounds: sounds as TokenSound[] }) };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, app, []));
  return {
    app,
    store,
    saved: () => store.getState().objects.tokens.t!,
    section: () => screen.getByRole('region', { name: 'Sounds' }),
  };
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());

/** The picker Add sound opens, as Obsidian would show it: the choices it offers and their layer. */
interface SoundPicker {
  containerEl: HTMLElement;
  getItems(): FolderChoice[];
  onChooseItem(choice: FolderChoice): void;
}

function openPicker(): SoundPicker {
  const opened = vi.spyOn(Modal.prototype, 'open');
  act(() => screen.getByRole('button', { name: 'Add sound' }).click());
  const picker = opened.mock.contexts.at(-1) as SoundPicker | undefined;
  opened.mockRestore();
  if (!picker) throw new Error('Add sound opened no picker');
  return picker;
}

/** The paths the picker offers, in its order. */
const offered = (picker: SoundPicker): string[] => picker.getItems().map((choice) => choice.path);

/** Opens the picker from Add sound and chooses `path` in it, as Obsidian's prompt would, then lets its checks finish. */
async function addSound(path: string): Promise<void> {
  const picker = openPicker();
  const choice = picker.getItems().find((item) => item.path === path);
  if (!choice) throw new Error(`the picker offers no ${path}`);
  await act(async () => {
    picker.onChooseItem(choice);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const volumeOf = (name: string): string | null => screen.getByRole('slider', { name: `Volume of ${name}` }).getAttribute('aria-valuenow');

beforeEach(() => {
  FakeTokenSoundContext.reset();
  vi.stubGlobal('AudioContext', FakeTokenSoundContext);
  showNotice.mockClear();
  seconds.value = 5;
});

afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
  if (current) TokenSoundPlayer.release(current);
  current = null;
  vi.unstubAllGlobals();
});

describe('the Sounds of Edit Token', () => {
  it('has no Sounds section while Sound is switched off, and saving keeps the token\'s sounds', () => {
    const { saved } = open([{ path: 'Sounds/wings.ogg', volume: 0.5 }], { sound: false });
    expect(screen.queryByRole('region', { name: 'Sounds' })).toBeNull();
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/wings.ogg', volume: 0.5 }]);
  });

  it('leaves sounds it cannot read as they are while Sound is switched off', () => {
    const { saved } = open('junk', { sound: false });
    save();
    expect(saved().sounds).toBe('junk');
  });

  it('lists the token\'s sounds by file name, each with its volume', () => {
    open([{ path: 'Sounds/dragon-roar.mp3', volume: 0.8 }, { path: 'Sounds/wings.ogg' }]);
    const rows = within(screen.getByRole('list', { name: 'Sounds' })).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/^(dragon-roar|wings)$/).textContent)).toEqual(['dragon-roar', 'wings']);
    expect(volumeOf('dragon-roar')).toBe('80');
    expect(volumeOf('wings')).toBe('100');
  });

  it('adds a sound chosen in the vault at full volume and saves it', async () => {
    const { saved } = open();
    await addSound('Sounds/wings.ogg');
    expect(volumeOf('wings')).toBe('100');
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/wings.ogg', volume: 1 }]);
  });

  it('offers the vault\'s audio files, but none of Atlas\'s own', () => {
    open(undefined, { files: { 'Sounds/horn.aac': 'audio:100', 'atlas-vtt/maps/cave.webm': 'video', 'atlas-vtt/sounds/ambience/rain.ogg': 'audio:100' } });
    expect(offered(openPicker()).sort()).toEqual(['Sounds/album.mp3', 'Sounds/dragon-roar.mp3', 'Sounds/horn.aac', 'Sounds/wings.ogg', 'atlas-vtt/sounds/ambience/rain.ogg']);
  });

  it('names each sound by its file, with its folder below, and matches its whole path', () => {
    open();
    expect(openPicker().getItems().find((choice) => choice.path === 'Sounds/wings.ogg'))
      .toEqual({ label: 'wings', note: 'Sounds', search: 'Sounds/wings.ogg', path: 'Sounds/wings.ogg' });
  });

  it('opens above the Edit Token dialog', () => {
    open();
    expect(openPicker().containerEl.classList.contains('atlas-above-dialogs')).toBe(true);
  });

  it('refuses a sound longer than three minutes when picked, and neither adds nor remembers it', async () => {
    const { app, saved } = open();
    seconds.value = 200;

    await addSound('Sounds/wings.ogg');

    expect(showNotice).toHaveBeenCalledWith('The sound "wings" is longer than 3 minutes, too long for a token.');
    expect(screen.queryByRole('list', { name: 'Sounds' })).toBeNull();
    expect(recentSounds(app)).toEqual([]);
    save();
    expect(saved().sounds).toBeUndefined();
  });

  it('lists no recent pick that is gone or lies in Atlas\'s own folder', () => {
    const { app } = open(undefined, { files: { 'atlas-vtt/maps/cave.webm': 'video' } });
    for (const path of ['Sounds/gone.mp3', 'atlas-vtt/maps/cave.webm', 'Sounds/wings.ogg']) rememberSound(app, path);

    const paths = offered(openPicker());

    expect(paths[0]).toBe('Sounds/wings.ogg');
    expect(paths).not.toContain('Sounds/gone.mp3');
    expect(paths).not.toContain('atlas-vtt/maps/cave.webm');
  });

  it('saves sounds after the token moves to another level while Edit Token stays open', async () => {
    const { store, saved } = open();
    store.setState({
      levels: [
        { id: 'ground', elevation: { bottom: 0, top: 10 }, background: null },
        { id: 'upper', elevation: { bottom: 10, top: 20 }, background: null },
      ],
      viewedLevel: 'ground',
    });
    await addSound('Sounds/wings.ogg');
    act(() => store.getState().moveTokensToLevel(['t'], 'upper'));
    expect(store.getState().viewedLevel).toBe('ground');
    save();
    expect(saved()).toMatchObject({ level: 'upper', sounds: [{ path: 'Sounds/wings.ogg', volume: 1 }] });
  });

  it('offers the sound picked last at the top of the picker the next time, and not a refused one', async () => {
    open();
    await addSound('Sounds/wings.ogg');
    // Larger than 20 MB, and of a length that cannot be read: refused.
    seconds.value = null;
    await addSound('Sounds/album.mp3');
    expect(offered(openPicker())).toEqual(['Sounds/wings.ogg', 'Sounds/album.mp3', 'Sounds/dragon-roar.mp3']);
  });

  it('takes a short sound larger than 20 MB whose length is known', async () => {
    const { saved } = open();
    seconds.value = 36;
    await addSound('Sounds/album.mp3');
    expect(showNotice).not.toHaveBeenCalled();
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/album.mp3', volume: 1 }]);
  });

  it('refuses a file larger than 20 MB whose length cannot be read, saying so, and adds nothing', async () => {
    const { saved } = open();
    seconds.value = null;
    await addSound('Sounds/album.mp3');
    expect(showNotice).toHaveBeenCalledOnce();
    expect(showNotice.mock.calls[0]![0]).toContain('album');
    expect(screen.queryByRole('slider', { name: 'Volume of album' })).toBeNull();
    save();
    expect(saved().sounds).toBeUndefined();
  });

  it('takes no sixth sound', () => {
    open(['a', 'b', 'c', 'd', 'e'].map((name) => ({ path: `Sounds/${name}.mp3` })));
    expect(screen.getByRole('button', { name: 'Add sound' }).hasAttribute('disabled')).toBe(true);
  });

  it('changes a sound\'s volume with its slider and saves it', () => {
    const { saved } = open([{ path: 'Sounds/dragon-roar.mp3', volume: 0.8 }]);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume of dragon-roar' }), { key: 'ArrowLeft' });
    expect(volumeOf('dragon-roar')).toBe('75');
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/dragon-roar.mp3', volume: 0.75 }]);
  });

  it('removes a sound and saves the others', () => {
    const { saved } = open([{ path: 'Sounds/dragon-roar.mp3', volume: 0.8 }, { path: 'Sounds/wings.ogg', volume: 1 }]);
    act(() => screen.getByRole('button', { name: 'Remove dragon-roar' }).click());
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/wings.ogg', volume: 1 }]);
  });

  it('saves no list once the last sound is removed', () => {
    const { saved } = open([{ path: 'Sounds/wings.ogg', volume: 1 }]);
    act(() => screen.getByRole('button', { name: 'Remove wings' }).click());
    save();
    expect(saved().sounds).toBeUndefined();
  });

  it('plays a sound at the volume its row has, before anything is saved', async () => {
    const { saved } = open([{ path: 'Sounds/wings.ogg', volume: 1 }]);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume of wings' }), { key: 'Home' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume of wings' }), { key: 'ArrowRight' });

    await act(async () => screen.getByRole('button', { name: 'Play wings' }).click());
    await vi.waitFor(() => expect(FakeTokenSoundContext.instances.at(-1)?.playing()).toHaveLength(1));

    const context = FakeTokenSoundContext.instances.at(-1)!;
    expect(context.route(context.playing()[0]!).gain).toBe(0.05);
    expect(saved().sounds).toEqual([{ path: 'Sounds/wings.ogg', volume: 1 }]);
  });

  it('leaves the token\'s sounds as its file holds them when the dialog does not change them', () => {
    const stored = [{ path: 'Sounds/dragon-roar.mp3', volume: 0.8 }, { path: 42 }];
    const { saved } = open(stored);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Smaug' } });
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/dragon-roar.mp3', volume: 0.8 }, { path: 42 }]);
  });
});
