import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { openEditTokenModal } from '../../src/app/pixi/token-renderer/EditTokenModal';
import { AudioFileModal } from '../../src/app/audio/AudioFileModal';
import { TokenSoundPlayer } from '../../src/app/audio/TokenSoundPlayer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { TokenSound } from '../../src/app/types/audioTypes';
import { FakeAudioContext } from '../mocks/fakeAudioContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const showNotice = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/ui/notice', () => ({ showNotice }));

const MB = 1024 * 1024;
let current: App | null = null;

function open(sounds?: unknown): { app: App; saved: () => TokenEntity; section: () => HTMLElement } {
  const { app } = createInMemoryApp({
    files: {
      'Sounds/dragon-roar.mp3': 'audio:48000',
      'Sounds/wings.ogg': 'audio:24000',
      'Sounds/album.mp3': 'audio:100'.padEnd(20 * MB + 1, ' '),
      'Lore/Dragon.md': '# Dragon',
    },
  });
  current = app;
  const store = createViewAtlasStore(app, `edit-token-sounds-${Math.random()}`);
  const token: TokenEntity = { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, ...(sounds !== undefined && { sounds: sounds as TokenSound[] }) };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } } });
  act(() => openEditTokenModal(token, store, app, []));
  return {
    app,
    saved: () => store.getState().objects.tokens.t!,
    section: () => screen.getByRole('region', { name: 'Sounds' }),
  };
}

const save = (): void => act(() => screen.getByRole('button', { name: 'Save' }).click());

/** The picker Add sound opens, as Obsidian would show it. */
function openPicker(): AudioFileModal {
  const opened = vi.spyOn(AudioFileModal.prototype, 'open');
  act(() => screen.getByRole('button', { name: 'Add sound' }).click());
  const picker = opened.mock.contexts.at(-1) as AudioFileModal | undefined;
  opened.mockRestore();
  if (!picker) throw new Error('Add sound opened no picker');
  return picker;
}

/** Opens the picker from Add sound and chooses `path` in it, as Obsidian's prompt would. */
function addSound(app: App, path: string): void {
  const picker = openPicker();
  act(() => picker.onChooseItem(app.vault.getFileByPath(path) as TFile));
}

const volumeOf = (name: string): string | null => screen.getByRole('slider', { name: `Volume of ${name}` }).getAttribute('aria-valuenow');

beforeEach(() => {
  FakeAudioContext.reset();
  vi.stubGlobal('AudioContext', FakeAudioContext);
  showNotice.mockClear();
});

afterEach(() => {
  const cancel = screen.queryByRole('button', { name: 'Cancel' });
  if (cancel) act(() => cancel.click());
  if (current) TokenSoundPlayer.release(current);
  current = null;
  vi.unstubAllGlobals();
});

describe('the Sounds of Edit Token', () => {
  it('lists the token\'s sounds by file name, each with its volume', () => {
    open([{ path: 'Sounds/dragon-roar.mp3', volume: 0.8 }, { path: 'Sounds/wings.ogg' }]);
    const rows = within(screen.getByRole('list', { name: 'Sounds' })).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByText(/^(dragon-roar|wings)$/).textContent)).toEqual(['dragon-roar', 'wings']);
    expect(volumeOf('dragon-roar')).toBe('80');
    expect(volumeOf('wings')).toBe('100');
  });

  it('adds a sound chosen in the vault at full volume and saves it', () => {
    const { app, saved } = open();
    addSound(app, 'Sounds/wings.ogg');
    expect(volumeOf('wings')).toBe('100');
    save();
    expect(saved().sounds).toEqual([{ path: 'Sounds/wings.ogg', volume: 1 }]);
  });

  it('offers only the vault\'s sound files to choose from', () => {
    const { app } = open();
    const paths = new AudioFileModal(app, () => undefined).getItems().map((file) => file.path).sort();
    expect(paths).toEqual(['Sounds/album.mp3', 'Sounds/dragon-roar.mp3', 'Sounds/wings.ogg']);
  });

  it('offers the sound picked last at the top of the picker the next time, and not a refused one', () => {
    const { app } = open();
    addSound(app, 'Sounds/wings.ogg');
    addSound(app, 'Sounds/album.mp3');
    expect(openPicker().getItems().map((file) => file.path)).toEqual(['Sounds/wings.ogg', 'Sounds/album.mp3', 'Sounds/dragon-roar.mp3']);
  });

  it('refuses a file larger than 20 MB, saying so, and adds nothing', () => {
    const { app, saved } = open();
    addSound(app, 'Sounds/album.mp3');
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
    await vi.waitFor(() => expect(FakeAudioContext.instances.at(-1)?.playing()).toHaveLength(1));

    const context = FakeAudioContext.instances.at(-1)!;
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
