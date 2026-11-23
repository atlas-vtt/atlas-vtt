import { describe, expect, it, vi } from 'vitest';
import type { AccountState, SignInResult } from '../../../src/app/account/AtlasAccount';
import { MusicShareSession, type MusicPackRequest, type PreparedTrack } from '../../../src/app/armarium/upload/MusicShareSession';
import { musicProblems, pickedKind, startingTitle } from '../../../src/app/armarium/upload/musicShareRules';
import type { OwnListing } from '../../../src/app/armarium/upload/uploadContract';
import type { MusicKind } from '../../../src/app/services/itemBundle/itemBundleFormat';
import type { LibraryFile } from '../../../src/app/soundLibrary/SoundLibrary';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep } from './shareFakes';

const NEW_UID = 'f'.repeat(32);
const STORED = { kind: 'music', system: null, description: 'Old roads at dusk, on a lute and a fiddle, for travel.', tags: ['fantasy'], licence: 'cc-by-4.0', credits: '' } as const;

const account = (): { state: () => AccountState; token: () => string | null; signIn: () => Promise<SignInResult>; onChange: () => () => void } => ({
  state: () => ({ kind: 'signed-in', who: { id: 'acct-1', name: 'Mara', handle: 'mara' } }),
  token: () => 'tok',
  signIn: () => Promise.resolve('signed-in'),
  onChange: () => () => undefined,
});

const fileOf = (path: string): LibraryFile => ({ kind: 'music', path, name: path.slice(path.lastIndexOf('/') + 1), size: 10, mtime: 1 });

class MusicArmarium extends FakeArmarium {
  listings: OwnListing[] = [];
  ownListings(): Promise<OwnListing[]> {
    return Promise.resolve(this.listings);
  }
}

/** A preparer the test answers by hand, track by track. */
function preparer(): { prepare: (file: LibraryFile, listener: (state: PreparedTrack) => void) => () => void; tell: (path: string, state: PreparedTrack) => void; stopped: string[] } {
  const listeners = new Map<string, (state: PreparedTrack) => void>();
  const stopped: string[] = [];
  return {
    prepare: (file, listener) => {
      listeners.set(file.path, listener);
      return () => stopped.push(file.path);
    },
    tell: (path, state) => listeners.get(path)?.(state),
    stopped,
  };
}

const ready = (seconds = 120): PreparedTrack => ({ state: 'ready', copy: new Blob(['opus']), frames: seconds * 48_000 });

function setup(kind: MusicKind, paths: string[], options: { listing?: string; name?: string } = {}): {
  session: MusicShareSession; api: MusicArmarium; pack: ReturnType<typeof vi.fn<(request: MusicPackRequest) => Promise<{ fileName: string; blob: Blob }>>>; tracks: ReturnType<typeof preparer>;
} {
  const api = new MusicArmarium();
  const tracks = preparer();
  const pack = vi.fn((request: MusicPackRequest) => Promise.resolve({ fileName: `${request.name} v${request.version}.zip`, blob: new Blob(['zip']) }));
  const session = new MusicShareSession({
    account: account(),
    api,
    kind,
    files: paths.map(fileOf),
    name: options.name ?? 'Old Roads',
    listing: options.listing,
    prepare: tracks.prepare,
    newUid: () => NEW_UID,
    pack,
    fetchCover: () => Promise.resolve(null),
    sha256: (bytes) => sha256(bytes),
    sleep: noSleep,
  });
  return { session, api, pack, tracks };
}

async function toMusicStep(session: MusicShareSession): Promise<void> {
  session.start();
  await vi.waitFor(() => expect(session.snapshot().step).toBe('bundle'));
}

describe('sharing music in the Armarium', () => {
  it('prepares every track, waits for them, and packs a new album in the order the GM set, with a random uid', async () => {
    const { session, pack, tracks } = setup('music-album', ['Old Roads/01 Dawn.mp3', 'Old Roads/02 - Dusk.flac', 'Old Roads/Night.opus']);
    await toMusicStep(session);
    expect(session.snapshot()).toMatchObject({ subject: 'music', kind: 'music-album', version: 1, target: null, listings: [] });
    expect(session.snapshot().tracks.map((track) => track.title)).toEqual(['Dawn', 'Dusk', 'Night']);

    session.confirmMusic();
    expect(session.snapshot().problems).toEqual({ tracks: 'preparing' });
    tracks.tell('Old Roads/01 Dawn.mp3', { state: 'converting', progress: 0.5 });
    expect(session.snapshot().tracks[0]?.copy).toEqual({ state: 'converting', progress: 0.5 });
    for (const path of ['Old Roads/01 Dawn.mp3', 'Old Roads/02 - Dusk.flac', 'Old Roads/Night.opus']) tracks.tell(path, ready());
    expect(session.snapshot().tracks[0]?.copy).toEqual({ state: 'ready', seconds: 120, bytes: 4 });

    session.moveTrack('music:Old Roads/Night.opus', 0);
    session.setTitle('music:Old Roads/Night.opus', 'Nightfall');
    session.setArtist('Mara');
    session.confirmMusic();
    await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
    expect(pack).toHaveBeenCalledWith(expect.objectContaining({ kind: 'music-album', uid: NEW_UID, version: 1, name: 'Old Roads', artist: 'Mara', notes: undefined, cover: null }));
    expect(pack.mock.calls[0]?.[0].tracks.map((track) => track.title)).toEqual(['Nightfall', 'Dawn', 'Dusk']);
    expect(session.snapshot().bundle).toMatchObject({ name: 'Old Roads', version: 1 });
  });

  it('leaves out a track that cannot be prepared, and names why', async () => {
    const { session, pack, tracks } = setup('music-album', ['a.mp3', 'b.mp3', 'c.mp3']);
    await toMusicStep(session);
    tracks.tell('a.mp3', ready());
    tracks.tell('b.mp3', { state: 'refused', reason: 'consent' });
    tracks.tell('c.mp3', ready());
    session.confirmMusic();
    await vi.waitFor(() => expect(pack).toHaveBeenCalled());
    expect(pack.mock.calls[0]?.[0].tracks.map((track) => track.title)).toEqual(['a', 'c']);
  });

  it('holds an album to two tracks that can go, a track to its own, and the Armarium\'s lengths', async () => {
    const { session, tracks } = setup('music-album', ['a.mp3', 'b.mp3', 'c.mp3']);
    await toMusicStep(session);
    expect(session.mayRemove()).toBe(true);
    session.removeTrack('music:c.mp3');
    expect(tracks.stopped).toEqual(['c.mp3']);
    expect(session.mayRemove()).toBe(false);
    session.removeTrack('music:b.mp3');
    expect(session.snapshot().tracks).toHaveLength(2);
    tracks.tell('a.mp3', ready());
    tracks.tell('b.mp3', { state: 'refused', reason: 'unreadable' });
    session.confirmMusic();
    expect(session.snapshot().problems).toEqual({ tracks: 'too-few' });

    const album = { kind: 'music-album', name: 'X', artist: '', tracks: [] } as const;
    const track = (seconds: number, id = 'a'): (typeof album)['tracks'][number] => ({ id, file: fileOf(id), title: id, copy: { state: 'ready', seconds, bytes: 1 } });
    expect(musicProblems({ ...album, tracks: [track(0.5), track(10, 'b')] })).toEqual({ tracks: 'too-short' });
    expect(musicProblems({ ...album, tracks: [track(7201), track(10, 'b')] })).toEqual({ tracks: 'track-too-long' });
    expect(musicProblems({ ...album, tracks: Array.from({ length: 6 }, (_, index) => track(7000, String(index))) })).toEqual({ tracks: 'album-too-long' });
    expect(musicProblems({ ...album, name: ' ', artist: 'x'.repeat(121), tracks: [track(10), { ...track(10, 'b'), title: '' }] })).toEqual({ name: 'missing', artist: 'too-long', 'title:b': 'missing' });
    // An emoji is two of the 120 units the Armarium's rules count, and a line separator breaks the line.
    expect(musicProblems({ ...album, name: '🎵'.repeat(61), artist: 'Mara\u2028Quill', tracks: [track(10), track(10, 'b')] })).toEqual({ name: 'too-long', artist: 'one-line' });
  });

  it('continues the account\'s listing the page named, one version above its newest, with what changed and its fields', async () => {
    const listing: OwnListing = { uid: 'a'.repeat(32), slug: 'old-roads', name: 'Old Roads', format: 'music-album', fields: STORED, newestVersion: 3, coverUrl: null };
    const other: OwnListing = { ...listing, uid: 'b'.repeat(32), format: 'music-track', name: 'Dawn' };
    const { session, api, pack, tracks } = setup('music-album', ['a.mp3', 'b.mp3'], { listing: listing.uid });
    api.listings = [listing, other, { ...listing, uid: 'c'.repeat(32), format: 'collection' }];
    await toMusicStep(session);
    expect(session.snapshot()).toMatchObject({ target: listing.uid, version: 4, ownListing: listing, listings: [listing] });
    expect(session.snapshot().draft).toMatchObject({ kind: 'music', description: STORED.description, licence: 'cc-by-4.0' });
    tracks.tell('a.mp3', ready());
    tracks.tell('b.mp3', ready());
    session.setNotes(' A third song ');
    session.confirmMusic();
    await vi.waitFor(() => expect(pack).toHaveBeenCalled());
    expect(pack.mock.calls[0]?.[0]).toMatchObject({ uid: listing.uid, version: 4, notes: 'A third song' });
  });

  it('starts a new listing when asked to continue one that is not the account\'s music of this kind, and may switch', async () => {
    const listing: OwnListing = { uid: 'a'.repeat(32), slug: 'old-roads', format: 'music-album', fields: STORED, newestVersion: 1, coverUrl: null };
    const { session, api } = setup('music-album', ['a.mp3', 'b.mp3'], { listing: 'd'.repeat(32) });
    api.listings = [listing];
    await toMusicStep(session);
    expect(session.snapshot()).toMatchObject({ target: null, version: 1 });
    session.chooseListing(listing.uid);
    expect(session.snapshot()).toMatchObject({ target: listing.uid, version: 2, ownListing: listing });
    session.chooseListing(null);
    expect(session.snapshot()).toMatchObject({ target: null, version: 1, ownListing: null });
  });

  it('packs a single under its name as its title, and stops every preparation when it closes', async () => {
    const { session, pack, tracks } = setup('music-track', ['Dawn.mp3', 'ignored.mp3'], { name: 'Dawn' });
    await toMusicStep(session);
    expect(session.snapshot().tracks).toHaveLength(1);
    tracks.tell('Dawn.mp3', ready());
    session.setName('Dawn at the Gate');
    session.confirmMusic();
    await vi.waitFor(() => expect(pack).toHaveBeenCalled());
    expect(pack.mock.calls[0]?.[0]).toMatchObject({ kind: 'music-track', name: 'Dawn at the Gate', tracks: [{ title: 'Dawn at the Gate' }] });
    await session.abandon();
    expect(tracks.stopped).toEqual(['Dawn.mp3']);
  });

  it('cuts an album at a hundred tracks and says how many were left out', async () => {
    const { session } = setup('music-album', Array.from({ length: 103 }, (_, index) => `t${index}.mp3`));
    expect(session.snapshot().tracks).toHaveLength(100);
    expect(session.snapshot().cut).toBe(3);
  });
});

describe('what picked music becomes', () => {
  it('is a track for one file and an album for more, so the Armarium\'s one Music entry shares either', () => {
    // The site's menu in Atlas asks for an album (`what: 'music-album'`) and promises an album or a single track.
    expect(pickedKind('music-album', 1)).toBe('music-track');
    expect(pickedKind('music-album', 2)).toBe('music-album');
    expect(pickedKind('music-track', 1)).toBe('music-track');
  });
});

describe('a track\'s title to begin with', () => {
  it('is its file name without extension and without the number it starts with', () => {
    expect(startingTitle('01 Dawn.mp3')).toBe('Dawn');
    expect(startingTitle('02 - Dusk.flac')).toBe('Dusk');
    expect(startingTitle('3. Night falls.opus')).toBe('Night falls');
    expect(startingTitle('07_Gate.ogg')).toBe('Gate');
    expect(startingTitle('1999.mp3')).toBe('1999');
    expect(startingTitle('Track.mp3')).toBe('Track');
  });
});
