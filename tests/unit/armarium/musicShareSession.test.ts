import { describe, expect, it, vi } from 'vitest';
import type { AccountState, SignInResult } from '../../../src/app/account/AtlasAccount';
import { MusicShareSession, type MusicPackRequest, type PreparedTrack } from '../../../src/app/armarium/upload/MusicShareSession';
import { musicProblems, pickedKind } from '../../../src/app/armarium/upload/musicShareRules';
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

function setup(kind: MusicKind, paths: string[], options: { listing?: string; name?: string; installed?: string | null; publishedArtist?: (listing: OwnListing) => Promise<string | null> } = {}): {
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
    installedListing: () => Promise.resolve(options.installed ?? null),
    prepare: tracks.prepare,
    newUid: () => NEW_UID,
    pack,
    fetchCover: () => Promise.resolve(null),
    publishedArtist: options.publishedArtist,
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

    // Continue is disabled meanwhile; called anyway, it neither goes on nor raises a problem no one could see.
    session.confirmMusic();
    expect(session.snapshot().step).toBe('bundle');
    expect(session.snapshot().problems).toEqual({});
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

  it('shares a next version under the listing\'s name unless the GM typed one, and New listing brings back what was there', async () => {
    const listing: OwnListing = { uid: 'a'.repeat(32), slug: 'night-of-the-wilds', name: 'Night of the Wilds', format: 'music-album', fields: STORED, newestVersion: 1, coverUrl: null };
    const { session, api } = setup('music-album', ['Night of the Wilds 2/a.opus', 'Night of the Wilds 2/b.opus'], { name: 'Night of the Wilds 2' });
    api.listings = [listing];
    await toMusicStep(session);
    session.chooseListing(listing.uid);
    expect(session.snapshot().name).toBe('Night of the Wilds');
    session.chooseListing(null);
    expect(session.snapshot().name).toBe('Night of the Wilds 2');

    session.setName('Wilder Nights');
    session.chooseListing(listing.uid);
    expect(session.snapshot().name).toBe('Wilder Nights');

    const asked = setup('music-album', ['a.mp3', 'b.mp3'], { name: 'Night of the Wilds 2', listing: listing.uid });
    asked.api.listings = [listing];
    await toMusicStep(asked.session);
    expect(asked.session.snapshot()).toMatchObject({ target: listing.uid, name: 'Night of the Wilds' });
  });

  it('continues the account\'s listing the shared folder was installed from, and none another account\'s sidecar names', async () => {
    const listing: OwnListing = { uid: 'a'.repeat(32), slug: 'night-of-the-wilds', name: 'Night of the Wilds', format: 'music-album', fields: STORED, newestVersion: 2, coverUrl: null };
    const { session, api } = setup('music-album', ['a.opus', 'b.opus'], { installed: listing.uid });
    api.listings = [listing];
    await toMusicStep(session);
    expect(session.snapshot()).toMatchObject({ target: listing.uid, version: 3 });
    session.chooseListing(null);
    expect(session.snapshot()).toMatchObject({ target: null, version: 1 });

    const theirs = setup('music-album', ['a.opus', 'b.opus'], { installed: 'e'.repeat(32) });
    theirs.api.listings = [listing];
    await toMusicStep(theirs.session);
    expect(theirs.session.snapshot()).toMatchObject({ target: null, version: 1 });
  });

  it('carries the published version\'s artist into the next version, unless the GM typed one, and never clears it', async () => {
    const listing: OwnListing = { uid: 'a'.repeat(32), slug: 'old-roads', name: 'Old Roads', format: 'music-album', fields: STORED, newestVersion: 1, coverUrl: null };
    const asked: string[] = [];
    const { session, api } = setup('music-album', ['a.mp3', 'b.mp3'], { publishedArtist: (each) => { asked.push(each.uid); return Promise.resolve('Vindsvept'); } });
    api.listings = [listing];
    await toMusicStep(session);
    session.chooseListing(listing.uid);
    await vi.waitFor(() => expect(session.snapshot().artist).toBe('Vindsvept'));
    expect(asked).toEqual([listing.uid]);
    session.chooseListing(null);
    expect(session.snapshot().artist).toBe('Vindsvept');

    const typed = setup('music-album', ['a.mp3', 'b.mp3'], { publishedArtist: () => Promise.resolve('Vindsvept') });
    typed.api.listings = [listing];
    await toMusicStep(typed.session);
    typed.session.setArtist('Mara');
    typed.session.chooseListing(listing.uid);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(typed.session.snapshot().artist).toBe('Mara');

    const unread = setup('music-album', ['a.mp3', 'b.mp3'], { listing: listing.uid, publishedArtist: () => Promise.resolve(null) });
    unread.api.listings = [listing];
    await toMusicStep(unread.session);
    unread.session.setArtist('Quill');
    unread.session.chooseListing(listing.uid);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unread.session.snapshot()).toMatchObject({ target: listing.uid, artist: 'Quill' });
  });

  it('fills in the artist of the listing the page named as the share opens', async () => {
    const listing: OwnListing = { uid: 'a'.repeat(32), slug: 'old-roads', name: 'Old Roads', format: 'music-album', fields: STORED, newestVersion: 2, coverUrl: null };
    const { session, api } = setup('music-album', ['a.mp3', 'b.mp3'], { listing: listing.uid, publishedArtist: () => Promise.resolve('Vindsvept') });
    api.listings = [listing];
    await toMusicStep(session);
    await vi.waitFor(() => expect(session.snapshot().artist).toBe('Vindsvept'));
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

describe('a share\'s default titles', () => {
  it('drop what an album\'s file names share and their numbers, offer the artist, and leave edited titles alone', async () => {
    const paths = ['Vindsvept - Night of the Wilds - 01 Dancing with the Wisps.mp3', 'Vindsvept - Night of the Wilds - 02 Tales of the Moonfolk.mp3', 'Vindsvept - Night of the Wilds - 03 Faerie Fire.mp3'];
    const { session } = setup('music-album', paths, { name: 'Night of the Wilds' });
    expect(session.snapshot().tracks.map((track) => track.title)).toEqual(['Dancing with the Wisps', 'Tales of the Moonfolk', 'Faerie Fire']);
    expect(session.snapshot().artist).toBe('Vindsvept');
    await toMusicStep(session);
    session.setTitle(`music:${paths[0]}`, 'Wisps');
    session.removeTrack(`music:${paths[2]}`);
    expect(session.snapshot().tracks.map((track) => track.title)).toEqual(['Wisps', 'Tales of the Moonfolk']);
  });

  it('work an untouched title out again when a track goes and the rest share more', async () => {
    const { session } = setup('music-album', ['Old Roads - Dawn.mp3', 'Old Roads - Dusk.mp3', 'Rain.mp3']);
    expect(session.snapshot().tracks.map((track) => track.title)).toEqual(['Old Roads - Dawn', 'Old Roads - Dusk', 'Rain']);
    await toMusicStep(session);
    session.removeTrack('music:Rain.mp3');
    expect(session.snapshot().tracks.map((track) => track.title)).toEqual(['Dawn', 'Dusk']);
  });

  it('drop a file\'s folder tags from its title and offer the first as the artist', () => {
    const path = 'Vindsvept/Night of the Wilds/Vindsvept - Night of the Wilds - 05 Tending the Flames.mp3';
    const { session } = setup('music-track', [path], { name: 'Tending the Flames' });
    expect(session.snapshot()).toMatchObject({ name: 'Tending the Flames', artist: 'Vindsvept' });
    session.setArtist('');
    expect(session.snapshot().name).toBe('Tending the Flames');
  });

  it('give a single\'s name the artist the GM types taken off, until the GM edits the name', async () => {
    const { session } = setup('music-track', ['Vindsvept - 04 Tricksy Sprites.mp3'], { name: 'Vindsvept - 04 Tricksy Sprites' });
    expect(session.snapshot().artist).toBe('');
    session.setArtist('vindsvept');
    expect(session.snapshot().name).toBe('Tricksy Sprites');
    session.setName('Sprites');
    session.setArtist('Vindsvept');
    expect(session.snapshot().name).toBe('Sprites');
  });
});
