// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AtlasAccount } from '../../../src/app/account/AtlasAccount';
import { ArmariumShareLayer } from '../../../src/app/armarium/share/ArmariumShareLayer';
import { MusicShareSession, type PreparedTrack } from '../../../src/app/armarium/upload/MusicShareSession';
import type { OwnListing } from '../../../src/app/armarium/upload/uploadContract';
import { MusicReviewDialog } from '../../../src/app/packages/components/asset-manager/collection-transfer/MusicReviewDialog';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import type { MusicReview } from '../../../src/app/services/musicBundle/musicImport';
import type { LibraryFile } from '../../../src/app/soundLibrary/SoundLibrary';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep, settle } from './shareFakes';

vi.mock('../../../src/app/ui/confirmDialog', () => ({ confirmAction: vi.fn() }));

const app = {} as App;
let token: string | null;

class MusicArmarium extends FakeArmarium {
  listings: OwnListing[] | null = [];
  ownListings(): Promise<OwnListing[] | null> {
    return Promise.resolve(this.listings);
  }
}

beforeEach(() => {
  token = 'tok';
  AtlasAccount.open(app, {
    http: () => Promise.resolve({ status: 200, json: { user: { id: 'acct-1', name: 'Mara', handle: 'mara' } } }),
    timers: { now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
    tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
    available: true,
    openUrl: () => undefined,
    notify: () => undefined,
  });
});
afterEach(() => {
  cleanup();
  AtlasAccount.release(app);
});

const fileOf = (path: string): LibraryFile => ({ kind: 'music', path, name: path, size: 10, mtime: 1 });

async function share(api: MusicArmarium, paths: string[], pack = (): Promise<{ fileName: string; blob: Blob }> => Promise.resolve({ fileName: 'Old Roads v1.atlas-album.zip', blob: new Blob(['zip']) })): Promise<{ session: MusicShareSession; tell: (path: string, state: PreparedTrack) => void }> {
  const listeners = new Map<string, (state: PreparedTrack) => void>();
  const session = new MusicShareSession({
    account: AtlasAccount.forApp(app)!, api, kind: 'music-album', files: paths.map(fileOf), name: 'Old Roads',
    prepare: (file, listener) => {
      listeners.set(file.path, listener);
      return () => undefined;
    },
    newUid: () => 'f'.repeat(32),
    pack,
    fetchCover: () => Promise.resolve(null),
    sha256: (bytes) => sha256(bytes), sleep: noSleep,
  });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ArmariumShareLayer session={session} onClose={vi.fn()} />
    </AtlasUIContext.Provider>,
  );
  await act(async () => {
    session.start();
    await settle();
  });
  return { session, tell: (path, state) => act(() => listeners.get(path)?.(state)) };
}

const ready: PreparedTrack = { state: 'ready', copy: new Blob(['opus']), frames: 48_000 * 185 };

describe('the share dialog of music', () => {
  it('offers the way back to the music step where the music could not be packed, as well as packing again', async () => {
    const pack = vi.fn().mockRejectedValueOnce(new Error('The source image cannot be decoded.')).mockResolvedValue({ fileName: 'Old Roads v1.atlas-album.zip', blob: new Blob(['zip']) });
    const { tell } = await share(new MusicArmarium(), ['01 Dawn.mp3', '02 Dusk.mp3'], pack);
    tell('01 Dawn.mp3', ready);
    tell('02 Dusk.mp3', ready);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await settle();
    });
    expect(screen.getByText(/It could not be packed: The source image cannot be decoded/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Back' })));
    expect(screen.getByRole('heading', { name: 'What you share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says where the account\'s listings could not be read, and tries again on the GM\'s word', async () => {
    const api = new MusicArmarium();
    api.listings = null;
    await share(api, ['01 Dawn.mp3', '02 Dusk.mp3']);
    expect(screen.getByText(/Your music listings could not be read/)).toBeTruthy();
    api.listings = [{ uid: 'a'.repeat(32), slug: 'old-roads', name: 'Old Roads', format: 'music-album', fields: null, newestVersion: 2, coverUrl: null }];
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await settle();
    });
    expect(screen.queryByText(/Your music listings could not be read/)).toBeNull();
    expect(screen.getAllByText('Listing')).toHaveLength(2);
  });

  it('numbers only the tracks that go up, as the upload will', async () => {
    const { tell } = await share(new MusicArmarium(), ['01 Dawn.mp3', '02 Dusk.mp3', '03 Night.mp3']);
    tell('01 Dawn.mp3', ready);
    tell('02 Dusk.mp3', { state: 'refused', reason: 'gone' });
    tell('03 Night.mp3', ready);
    const numbers = [...document.querySelectorAll('.atlas-music-track__number')].map((number) => number.textContent);
    expect(numbers).toEqual(['1', '', '2']);
    expect(screen.getByRole('textbox', { name: 'Title of track 2' })).toHaveProperty('value', 'Night');
  });

  it('shows the album with its tracks in order, their lengths once prepared, and waits for them before it goes on', async () => {
    const { session, tell } = await share(new MusicArmarium(), ['01 Dawn.mp3', '02 Dusk.mp3', '03 Night.mp3']);
    expect(screen.getByRole('heading', { name: 'What you share' })).toBeTruthy();
    expect((screen.getByLabelText('Album') as HTMLInputElement).value).toBe('Old Roads');
    // The rail's step only: no choice of listing for an account without albums.
    expect(screen.getAllByText('Listing')).toHaveLength(1);
    expect(screen.getAllByRole('textbox', { name: /^Title of track/ }).map((input) => (input as HTMLInputElement).value)).toEqual(['Dawn', 'Dusk', 'Night']);
    expect((screen.getByRole('button', { name: 'Preparing…' }) as HTMLButtonElement).disabled).toBe(true);

    tell('01 Dawn.mp3', ready);
    tell('02 Dusk.mp3', ready);
    tell('03 Night.mp3', { state: 'refused', reason: 'consent' });
    expect(screen.getAllByText('3:05')).toHaveLength(2);
    expect(screen.getByText('This track cannot go and is left out:')).toBeTruthy();
    expect(screen.getByText(/Night: Its folder is not converted yet/)).toBeTruthy();
    expect(screen.getByText(/^2 tracks · 6:10 · /)).toBeTruthy();

    const dusk = screen.getByRole('textbox', { name: 'Title of track 2' });
    fireEvent.keyDown(dusk, { key: 'ArrowUp', altKey: true });
    expect(session.snapshot().tracks.map((track) => track.title)).toEqual(['Dusk', 'Dawn', 'Night']);
    fireEvent.click(screen.getByRole('button', { name: 'Leave out Night' }));
    expect(session.snapshot().tracks).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Leave out/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('asks a music listing for no game system and offers only the tags that fit music', async () => {
    const { session, tell } = await share(new MusicArmarium(), ['01 Dawn.mp3', '02 Dusk.mp3']);
    tell('01 Dawn.mp3', ready);
    tell('02 Dusk.mp3', ready);
    await act(async () => {
      session.confirmMusic();
      await settle();
    });
    await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
    expect(screen.queryByText('Game system')).toBeNull();
    expect(screen.getByRole('button', { name: 'Fantasy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forest' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Monsters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Statblocks' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'One-shot' })).toBeNull();
  });

  it('offers the next version of the account\'s albums where it has some', async () => {
    const api = new MusicArmarium();
    api.listings = [{ uid: 'a'.repeat(32), slug: 'old-roads', name: 'Old Roads', format: 'music-album', fields: null, newestVersion: 2, coverUrl: null }];
    await share(api, ['a.mp3', 'b.mp3']);
    expect(screen.getAllByText('Listing')).toHaveLength(2);
    expect(screen.getByText('New listing')).toBeTruthy();
  });
});

const review = (overrides: Partial<MusicReview> = {}): MusicReview => ({
  kind: 'music-album', name: 'Old Roads', artist: 'Mara', version: 2, creator: 'Lio', cover: null,
  tracks: [{ title: 'Dawn', seconds: 185, bytes: 2_000_000 }, { title: 'Dusk', seconds: 61, bytes: 1_000_000 }],
  seconds: 246, bytes: 3_000_000, where: ['Music', 'Mara', 'Old Roads'], update: null, same: false, ...overrides,
});

describe('the music review', () => {
  it('names what comes in, by whom, where it goes and its tracks, and installs on confirm', () => {
    const onConfirm = vi.fn();
    render(<MusicReviewDialog review={review({ notes: 'Two new songs.' })} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Add Old Roads to your music' })).toBeTruthy();
    expect(screen.getByText('by Lio')).toBeTruthy();
    expect(screen.getByText('Music / Mara / Old Roads')).toBeTruthy();
    expect(screen.getByText('Two new songs.')).toBeTruthy();
    // Nothing plays on install: it is ready to play.
    expect(screen.getByText('It goes into your music folder, ready to play.')).toBeTruthy();
    expect(screen.getByText('3:05')).toBeTruthy();
    expect(screen.getByText(/^2 tracks · 4:06 · /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says what an update replaces, renames and keeps, how many tracks stay as they are, and that the same version is there already', () => {
    const { rerender } = render(<MusicReviewDialog review={review({ update: { from: 1, replaced: 1, renamed: 1, unchanged: 3, added: 1, removed: 2, kept: 1 } })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Your copy is updated from version 1 to version 2.')).toBeTruthy();
    expect(screen.getByText('1 track replaced, 1 track renamed, 1 track added, 2 tracks taken out, and 3 tracks stay as they are')).toBeTruthy();
    expect(screen.getByText('You changed 1 track, so it stays and the new one comes beside it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy();
    rerender(<MusicReviewDialog review={review({ update: { from: 2, replaced: 0, renamed: 0, unchanged: 2, added: 0, removed: 0, kept: 0 }, same: true })} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('This version is in your music folder already.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });
});
