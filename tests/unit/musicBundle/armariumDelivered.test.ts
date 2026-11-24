import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import type { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetService } from '../../../src/app/services/AssetService';
import { openBundleImport } from '../../../src/app/services/itemBundle/bundleImport';
import { readSidecar } from '../../../src/app/services/musicBundle/musicProvenance';
import { readAtlasCopy } from '../../../src/app/sound/codec/atlasOpus';
import { packetsOfPage, readPage, type CarriedPacket } from '../../../src/app/sound/codec/oggPages';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';

/**
 * Music as the Armarium really delivers it, made by the other two halves: `atlas-upload` is an album Atlas packed for
 * the store (`packMusicBundle`, copies of real Opus packets stripped with `forPlayers`), `atlas-rebuilt` what the
 * store's checker 0.5.0 (atlas-services 1c431d9) rebuilt of it, and `site-rebuilt` its rebuild of a single the
 * website's composer (atlas-vtt-website 498e1e5) packed from an MP3. Made again by the scripts in
 * `~/.cache/armarium-music-integration/`, which run all three halves on audio ffmpeg makes.
 */
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(`tests/fixtures/armariumMusic/${name}`));
const UID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** The audio packets of an Ogg Opus file, its two header packets left out. */
function audioPackets(file: Uint8Array): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let carried: CarriedPacket | null = null;
  let seen = 0;
  for (let page = readPage(file, 0); page; page = readPage(file, page.end)) {
    const parts = packetsOfPage(page, carried);
    carried = parts.tail;
    for (const packet of parts.packets) if (seen++ >= 2) packets.push(packet);
  }
  return packets;
}

const packetHashes = (file: Uint8Array): Promise<string[]> => Promise.all(audioPackets(file).map((packet) => sha256(packet.slice().buffer)));

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
  vi.spyOn(SoundLibrary, 'forApp').mockReturnValue(library);
});

afterEach(() => {
  library.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const open = (name: string, listingUid?: string): ReturnType<typeof openBundleImport> =>
  openBundleImport({} as App, {} as AssetService, new Blob([fixture(name)]), undefined, { listingUid, creator: 'Mara' });

const bytesAt = async (path: string): Promise<Uint8Array> => new Uint8Array(await location.contents.get(path)!.arrayBuffer());

describe('music the Armarium delivers', () => {
  it('installs an album Atlas shared and the store rebuilt, every packet as Atlas uploaded it', async () => {
    const upload = await JSZip.loadAsync(fixture('atlas-upload.atlas-album.zip'));
    const uploaded = await Promise.all(['01 Dawn over the Fen', '02 Dusk'].map(async (stem) => upload.file(`files/music/${stem}.opus`)!.async('uint8array')));
    const opened = await open('atlas-rebuilt.atlas-album.zip', UID);
    if (opened.kind !== 'music') throw new Error(`opened as ${opened.kind}`);
    expect(opened.session.review).toMatchObject({ kind: 'music-album', name: 'Old Roads', artist: 'Mara Quill', version: 1, update: null, where: ['Music', 'Mara Quill', 'Old Roads'] });
    expect(opened.session.review.tracks.map((track) => track.title)).toEqual(['Dawn over the Fen', 'Dusk']);
    expect(opened.session.review.cover).not.toBeNull();

    await opened.session.apply();
    for (const [index, file] of ['01 Dawn over the Fen.opus', '02 Dusk.opus'].entries()) {
      const installed = await bytesAt(`Mara Quill/Old Roads/${file}`);
      const facts = await readAtlasCopy(new Blob([installed]));
      // The store named what it was made from: the hash and the name of the file Atlas uploaded.
      expect(facts).toMatchObject({ key: await sha256(uploaded[index]!.slice().buffer), from: file });
      expect(facts?.peaks).toHaveLength(400);
      // Remuxed, never encoded again.
      expect(await packetHashes(installed), file).toEqual(await packetHashes(uploaded[index]!));
    }
    const sidecar = readSidecar(await location.contents.get('Mara Quill/Old Roads/Armarium.json')!.text());
    expect(sidecar).toMatchObject({ uid: UID, version: 1, kind: 'music-album', artist: 'Mara Quill' });
  });

  it('installs a single the website packed from an MP3 and the store made a copy of', async () => {
    const zip = await JSZip.loadAsync(fixture('site-rebuilt.atlas-track.zip'));
    const { item } = JSON.parse(await zip.file('manifest.json')!.async('string')) as { item: { uid: string } };
    const opened = await open('site-rebuilt.atlas-track.zip', item.uid);
    if (opened.kind !== 'music') throw new Error(`opened as ${opened.kind}`);
    expect(opened.session.review).toMatchObject({ kind: 'music-track', name: 'Mist over the Fen', artist: 'The Fen Players', cover: null });
    expect(opened.session.review.tracks[0]?.seconds).toBeCloseTo(2.5, 1);
    await opened.session.apply();
    expect([...location.files.keys()].sort()).toEqual(['The Fen Players/Mist over the Fen.armarium.json', 'The Fen Players/Mist over the Fen.opus']);
    expect(await readAtlasCopy(new Blob([await bytesAt('The Fen Players/Mist over the Fen.opus')]))).toMatchObject({ channels: 2, codec: 1 });
  });

  it('refuses what Atlas uploads until the store made copies of its tracks', async () => {
    await expect(open('atlas-upload.atlas-album.zip')).rejects.toThrow(/Dawn over the Fen/);
    expect(location.changes).toEqual([]);
  });
});
