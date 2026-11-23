import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAtlasCopy } from '../../../src/app/sound/codec/atlasOpus';
import { installedMusic } from '../../../src/app/services/musicBundle/installedMusic';
import { readMusicBundle } from '../../../src/app/services/musicBundle/musicBundleReader';
import { openMusicImport } from '../../../src/app/services/musicBundle/musicImport';
import { readSidecar } from '../../../src/app/services/musicBundle/musicProvenance';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { deliveredMusic } from '../../helpers/musicBundles';

const UID = '0123456789abcdef0123456789abcdef';

let location: FakeSoundLocation;
let library: SoundLibrary;

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  location = new FakeSoundLocation();
  const roots = new SoundRoots({
    shared: () => ({ music: { type: 'external' } }),
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: (kind) => (kind === 'music' ? '/Music' : null),
    setLocal: () => undefined,
    localOriginals: () => 'keep',
    setLocalOriginals: () => undefined,
    vaultBase: () => null,
    realPath: async (path) => path,
  });
  library = new SoundLibrary({ roots, open: () => location, probeSeconds: async () => null });
});

afterEach(() => {
  library.destroy();
  vi.unstubAllGlobals();
});

const album = async (version: number, titles: string[], artist: string | undefined = 'Mara'): Promise<Blob> =>
  deliveredMusic({ kind: 'music-album', uid: UID, version, name: 'Old Roads', artist, notes: version > 1 ? 'New songs' : undefined, titles });

/** `listingUid` null: a file from anywhere but the Armarium's download for this listing. */
async function install(data: Blob, listingUid: string | null = UID): Promise<Awaited<ReturnType<typeof openMusicImport>>> {
  return openMusicImport(library, await readMusicBundle(data), { listingUid: listingUid ?? undefined, creator: 'Mara' });
}

const sidecarOf = async (path: string): Promise<ReturnType<typeof readSidecar>> => readSidecar(await location.contents.get(path)!.text());

describe('installing music from the Armarium', () => {
  it('reviews an album without writing, then installs it under its artist with a sidecar of what it wrote', async () => {
    const session = await install(await album(1, ['Dawn', 'Dusk']));
    expect(session.review).toMatchObject({ kind: 'music-album', name: 'Old Roads', artist: 'Mara', version: 1, creator: 'Mara', update: null, same: false, where: ['Music', 'Mara', 'Old Roads'] });
    expect(session.review.tracks.map((track) => track.title)).toEqual(['Dawn', 'Dusk']);
    expect(session.review.seconds).toBeGreaterThan(5);
    expect(location.changes).toEqual([]);

    const result = await session.apply();
    expect(result).toMatchObject({ outcome: 'new', tags: ['Old Roads'] });
    expect([...location.files.keys()].sort()).toEqual(['Mara/Old Roads/01 Dawn.opus', 'Mara/Old Roads/02 Dusk.opus', 'Mara/Old Roads/Armarium.json']);
    const sidecar = await sidecarOf('Mara/Old Roads/Armarium.json');
    const written = location.contents.get('Mara/Old Roads/01 Dawn.opus')!;
    expect(sidecar).toMatchObject({ format: 1, uid: UID, version: 1, kind: 'music-album', name: 'Old Roads', artist: 'Mara' });
    expect(sidecar?.tracks).toEqual([
      { file: '01 Dawn.opus', sha256: await sha256(await written.arrayBuffer()) },
      { file: '02 Dusk.opus', sha256: await sha256(await location.contents.get('Mara/Old Roads/02 Dusk.opus')!.arrayBuffer()) },
    ]);
    // Named for its own file, so the library never takes another file of the folder for its source.
    expect((await readAtlasCopy(written))?.from).toBe('01 Dawn.opus');
    expect(location.changes.some((change) => change.includes('.atlas-part') && change.startsWith('trash'))).toBe(false);
  });

  it('puts a single without an artist at the root\'s top, its sidecar beside it', async () => {
    const data = await deliveredMusic({ kind: 'music-track', uid: UID, version: 1, name: 'Dawn', titles: ['Dawn'] });
    const result = await (await install(data)).apply();
    expect(result).toMatchObject({ kind: 'music-track', outcome: 'new', tags: [] });
    expect([...location.files.keys()].sort()).toEqual(['Dawn.armarium.json', 'Dawn.opus']);
    expect((await sidecarOf('Dawn.armarium.json'))?.kind).toBe('music-track');
  });

  it('updates the listing\'s install in place: unchanged tracks replaced or taken out, a changed one kept with the new one beside it', async () => {
    await (await install(await album(1, ['Dawn', 'Dusk', 'Night']))).apply();
    await library.reread('music');
    location.put('Mara/Old Roads/02 Dusk.opus', new Blob(['the GM trimmed this']));
    const session = await install(await album(2, ['Dawn', 'Dusk']));
    expect(session.review.update).toEqual({ from: 1, replaced: 1, added: 1, removed: 1, kept: 1 });
    expect(session.review.notes).toBe('New songs');

    expect(await session.apply()).toMatchObject({ outcome: 'update', version: 2 });
    expect([...location.files.keys()].sort()).toEqual(['Mara/Old Roads/01 Dawn.opus', 'Mara/Old Roads/02 Dusk 2.opus', 'Mara/Old Roads/02 Dusk.opus', 'Mara/Old Roads/Armarium.json']);
    expect(await location.contents.get('Mara/Old Roads/02 Dusk.opus')!.text()).toBe('the GM trimmed this');
    expect((await sidecarOf('Mara/Old Roads/Armarium.json'))?.tracks.map((track) => track.file)).toEqual(['01 Dawn.opus', '02 Dusk 2.opus']);
    expect(location.changes).toContain('trash Mara/Old Roads/03 Night.opus');
  });

  it('says the same version is there already and writes nothing', async () => {
    await (await install(await album(1, ['Dawn', 'Dusk']))).apply();
    await library.reread('music');
    const before = location.changes.length;
    const session = await install(await album(1, ['Dawn', 'Dusk']));
    expect(session.review.same).toBe(true);
    expect(await session.apply()).toMatchObject({ outcome: 'same' });
    expect(location.changes.length).toBe(before);
  });

  it('brings a bundle that did not come from the Armarium for this listing in beside the install', async () => {
    await (await install(await album(1, ['Dawn', 'Dusk']))).apply();
    await library.reread('music');
    const session = await install(await album(2, ['Dawn', 'Dusk']), null);
    expect(session.review.update).toBeNull();
    await session.apply();
    expect([...location.files.keys()].filter((path) => path.startsWith('Mara/Old Roads 2/'))).toHaveLength(3);
    expect(location.files.has('Mara/Old Roads/01 Dawn.opus')).toBe(true);
  });

  it('leaves nothing of an album whose write failed, and says so', async () => {
    location.failing = (change) => (change.startsWith('write Mara/Old Roads/02') ? new Error('disk full') : null);
    const session = await install(await album(1, ['Dawn', 'Dusk']));
    await expect(session.apply()).rejects.toThrow(/could not be installed: disk full\. Nothing of it was kept/);
    expect([...location.files.keys()]).toEqual([]);
    expect(location.folders.has('Mara/Old Roads')).toBe(false);
  });

  it('takes back what it put in place when a later step fails', async () => {
    location.put('Mara/Old Roads/keep.mp3', new Blob(['mine']));
    await library.reread('music');
    location.failing = (change) => (change.startsWith('move Mara/Old Roads 2/02') ? new Error('busy') : null);
    const session = await install(await album(1, ['Dawn', 'Dusk']));
    await expect(session.apply()).rejects.toThrow(/busy/);
    expect([...location.files.keys()]).toEqual(['Mara/Old Roads/keep.mp3']);
  });

  it('refuses to install once the folder changed since the review', async () => {
    const session = await install(await album(1, ['Dawn', 'Dusk']));
    location.addFolder('Mara/Old Roads');
    await expect(session.apply()).rejects.toThrow(/changed since the review/);
    expect(location.changes).toEqual([]);
  });

  it('finds what it installed by its sidecars, and nothing in folders without one', async () => {
    await (await install(await album(1, ['Dawn', 'Dusk']))).apply();
    await (await install(await deliveredMusic({ kind: 'music-track', uid: 'fedcba9876543210fedcba9876543210', version: 3, name: 'Dawn', titles: ['Dawn'] }), 'fedcba9876543210fedcba9876543210')).apply();
    location.put('Elsewhere/song.opus', new Blob(['x']));
    location.put('Elsewhere/Armarium.json', new Blob(['{"format": 1}']));
    await library.reread('music');
    await library.settle('music', ['Elsewhere/song.opus']);
    const found = await installedMusic(library);
    expect(found.map(({ sidecar }) => [sidecar.uid, sidecar.version, sidecar.kind]).sort()).toEqual([[UID, 1, 'music-album'], ['fedcba9876543210fedcba9876543210', 3, 'music-track']].sort());
  });
});
