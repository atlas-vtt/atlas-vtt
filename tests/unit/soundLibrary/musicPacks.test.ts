import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundKind } from '../../../src/app/sound/soundTypes';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import { installedMusicPacks, installMusicPacks, mayInstallMusicPacks, MUSIC_FOLDER, MUSIC_PACK_BYTES, MUSIC_PACKS, INSTRUMENTAL_FOLDER, musicPackTrackCounts, VOCALS_FOLDER } from '../../../src/app/soundLibrary/musicPacks';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import type { PackedFile } from '../../../src/app/services/stockPacks/verifiedFetch';
import { StockPackError } from '../../../src/app/services/stockPacks/verifiedFetch';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { sha256 } from '../../../src/app/utils/hashing';
import { recordingProgress } from '../../helpers/recordingProgress';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

let base: string;
let vault: InMemoryApp;
let library: SoundLibrary;

const music = (): string => path.join(base, 'Music');
const inFolder = (...parts: string[]): string => path.join(music(), MUSIC_FOLDER, ...parts);

function open(local: Partial<Record<SoundKind, string>>, shared: SharedSoundRoots): void {
  library?.destroy();
  const roots = new SoundRoots({
    shared: () => shared,
    setShared: (next) => { shared = next; },
    onSharedChange: () => () => undefined,
    local: (kind) => local[kind] ?? null,
    setLocal: (kind, value) => { if (value) local[kind] = value; else delete local[kind]; },
    localOriginals: () => null,
    setLocalOriginals: () => undefined,
    vaultBase: () => '/vault',
    realPath: async (value) => value,
  });
  library = new SoundLibrary({
    roots,
    open: (root) => (root.status === 'vault' ? new VaultLocation(vault.app, root.path) : new ExternalLocation(root.path, {
      files: { fs: fs as unknown as NodeFsModule, sep: path.sep, home: base },
      trashItem: null,
      resourceUrl: null,
      vaultFolder: null,
    })),
    probeSeconds: async () => null,
  });
}

const bytesOf = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer;

async function packed(key: string, text: string): Promise<PackedFile> {
  return { key, bytes: text.length, sha256: await sha256(bytesOf(text)) };
}

interface Served { manifest: PackedFile; served: Map<string, ArrayBuffer> }

/** A host serving a manifest of its own, since the real one's hashes name the hosted files. */
async function host(packs: { id: string; name: string; tracks: { key: string; name: string; text: string; vocals?: boolean }[] }[], edit: (data: Record<string, unknown>) => void = () => undefined): Promise<Served> {
  const served = new Map<string, ArrayBuffer>();
  served.set('credits.md', bytesOf('CREDITS'));
  const data: Record<string, unknown> = {
    format: 1,
    credits: await packed('credits.md', 'CREDITS'),
    packs: await Promise.all(packs.map(async (pack) => ({
      id: pack.id,
      name: pack.name,
      tracks: await Promise.all(pack.tracks.map(async (track) => {
        served.set(track.key, bytesOf(track.text));
        return { ...(await packed(track.key, track.text)), name: track.name, vocals: track.vocals === true };
      })),
    }))),
  };
  edit(data);
  const json = JSON.stringify(data);
  served.set('manifest.json', bytesOf(json));
  return { manifest: await packed('manifest.json', json), served };
}

const serving = (served: Map<string, ArrayBuffer>) => vi.fn(async (url: string): Promise<ArrayBuffer> => {
  const key = url.replace('https://assets.atlas-vtt.dev/starter/vindsvept-1/', '');
  const bytes = served.get(key);
  if (!bytes) throw new Error(`404 ${url}`);
  return bytes;
});

const TAVERN = { id: 'tavern', name: 'Tavern', tracks: [{ key: 'tavern/the-old-mill.opus', name: 'The Old Mill.opus', text: 'MILL' }, { key: 'tavern/sung.opus', name: 'Sung.opus', text: 'SUNG', vocals: true }] };
const DREAD = { id: 'dread', name: 'Dread', tracks: [{ key: 'dread/horde.opus', name: 'The Undead Horde.opus', text: 'HORDE' }] };

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-music-'));
  fs.mkdirSync(music());
  vault = createInMemoryApp({ folders: [] });
  open({ music: music() }, {});
});

afterEach(() => {
  library.destroy();
  fs.rmSync(base, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('the music packs', () => {
  it('offers packs with unique ids and names, and counts their bytes', () => {
    expect(new Set(MUSIC_PACKS.map((pack) => pack.id)).size).toBe(MUSIC_PACKS.length);
    expect(new Set(MUSIC_PACKS.map((pack) => pack.name)).size).toBe(MUSIC_PACKS.length);
    expect(MUSIC_PACK_BYTES).toBe(MUSIC_PACKS.reduce((sum, pack) => sum + pack.bytes, 0));
  });

  it('writes the chosen packs, sung and instrumental tracks in folders of their own, with the credits beside them', async () => {
    const { manifest, served } = await host([TAVERN, DREAD]);
    const fetch = serving(served);
    const { progress, files, total } = recordingProgress();
    const written = await installMusicPacks(library, ['tavern'], { manifest, fetch, progress });
    expect(fs.readFileSync(inFolder('Tavern', INSTRUMENTAL_FOLDER, 'The Old Mill.opus'), 'utf8')).toBe('MILL');
    expect(fs.readFileSync(inFolder('Tavern', VOCALS_FOLDER, 'Sung.opus'), 'utf8')).toBe('SUNG');
    expect(fs.readFileSync(inFolder('Credits.md'), 'utf8')).toBe('CREDITS');
    expect(fs.existsSync(inFolder('Dread'))).toBe(false);
    expect([...written].sort()).toEqual([`${MUSIC_FOLDER}/Tavern/${INSTRUMENTAL_FOLDER}/The Old Mill.opus`, `${MUSIC_FOLDER}/Tavern/${VOCALS_FOLDER}/Sung.opus`].sort());
    // Listed at once, so the library shows them without a reread by hand.
    expect(library.filesOf('music').map(({ entry }) => entry.path)).toContain(`${MUSIC_FOLDER}/Tavern/${INSTRUMENTAL_FOLDER}/The Old Mill.opus`);
    expect(total()).toEqual({ bytes: 8, files: 2 });
    expect(files).toEqual([{ bytes: 4, fetched: true }, { bytes: 4, fetched: true }]);
  });

  it('once cancelled starts no new track and writes none still on its way, and keeps the tracks written', async () => {
    const pack = { id: 'long', name: 'Long', tracks: Array.from({ length: 12 }, (_, i) => ({ key: `long/t${i}.opus`, name: `T${i}.opus`, text: `TRACK${i}` })) };
    const { manifest, served } = await host([pack]);
    const fetch = serving(served);
    const recording = recordingProgress((count) => { if (count === 2) recording.controller.abort(); });
    await expect(installMusicPacks(library, ['long'], { manifest, fetch, progress: recording.progress })).rejects.toThrow();
    const kept = pack.tracks.filter((track) => fs.existsSync(inFolder('Long', INSTRUMENTAL_FOLDER, track.name)));
    // Two landed before the cancel and the writes already under way finish (four run at a time); no track starts after.
    expect(kept.length).toBeGreaterThanOrEqual(2);
    expect(kept.length).toBeLessThanOrEqual(4);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('.opus')).length).toBeLessThanOrEqual(2 + 4);
    // What landed is listed, and a later run fetches only the rest.
    expect(library.filesOf('music').filter(({ entry }) => entry.path.startsWith(`${MUSIC_FOLDER}/Long/`))).toHaveLength(kept.length);
    const again = recordingProgress();
    await installMusicPacks(library, ['long'], { manifest, fetch: serving(served), progress: again.progress });
    expect(again.files.filter((file) => !file.fetched)).toHaveLength(kept.length);
    expect(again.files.filter((file) => file.fetched)).toHaveLength(12 - kept.length);
  });

  it('starts no further track once one fails', async () => {
    const pack = { id: 'long', name: 'Long', tracks: Array.from({ length: 12 }, (_, i) => ({ key: `long/t${i}.opus`, name: `T${i}.opus`, text: `TRACK${i}` })) };
    const { manifest, served } = await host([pack]);
    served.delete('long/t0.opus');
    const fetch = serving(served);
    await expect(installMusicPacks(library, ['long'], { manifest, fetch })).rejects.toThrow('404');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('.opus')).length).toBeLessThanOrEqual(4);
  });

  it('never writes a track that is not the one the manifest names', async () => {
    const { manifest, served } = await host([TAVERN]);
    served.set('tavern/sung.opus', bytesOf('SUNF'));
    await expect(installMusicPacks(library, ['tavern'], { manifest, fetch: serving(served) })).rejects.toBeInstanceOf(StockPackError);
    expect(fs.existsSync(inFolder('Tavern', VOCALS_FOLDER, 'Sung.opus'))).toBe(false);
  });

  it('trusts no manifest but the pinned one', async () => {
    const { manifest, served } = await host([TAVERN]);
    served.set('manifest.json', bytesOf('{"format":1,"packs":[]}'));
    await expect(installMusicPacks(library, ['tavern'], { manifest, fetch: serving(served) })).rejects.toBeInstanceOf(StockPackError);
    expect(fs.existsSync(inFolder())).toBe(false);
  });

  it('refuses a manifest naming a file outside its folder', async () => {
    const { manifest, served } = await host([{ ...TAVERN, tracks: [{ key: 'tavern/x.opus', name: '../x.opus', text: 'X' }] }]);
    await expect(installMusicPacks(library, ['tavern'], { manifest, fetch: serving(served) })).rejects.toBeInstanceOf(StockPackError);
    expect(fs.existsSync(path.join(music(), 'x.opus'))).toBe(false);
  });

  it('refuses when the manifest lacks a pack this version offers', async () => {
    const { manifest, served } = await host([TAVERN]);
    await expect(installMusicPacks(library, ['dread'], { manifest, fetch: serving(served) })).rejects.toBeInstanceOf(StockPackError);
  });

  it('leaves a track already there alone and does not fetch it, so an interrupted download goes on', async () => {
    fs.mkdirSync(inFolder('Tavern', INSTRUMENTAL_FOLDER), { recursive: true });
    fs.writeFileSync(inFolder('Tavern', INSTRUMENTAL_FOLDER, 'The Old Mill.opus'), 'MINE');
    const { manifest, served } = await host([TAVERN]);
    const fetch = serving(served);
    await installMusicPacks(library, ['tavern'], { manifest, fetch });
    expect(fs.readFileSync(inFolder('Tavern', INSTRUMENTAL_FOLDER, 'The Old Mill.opus'), 'utf8')).toBe('MINE');
    expect(fetch.mock.calls.map(([url]) => url)).not.toContain('https://assets.atlas-vtt.dev/starter/vindsvept-1/tavern/the-old-mill.opus');
  });

  it('with nothing linked goes to the default vault folder, which is then linked', async () => {
    open({}, {});
    const { manifest, served } = await host([DREAD]);
    await installMusicPacks(library, ['dread'], { manifest, fetch: serving(served) });
    expect(vault.files.get(`atlas-vtt/sounds/music/${MUSIC_FOLDER}/Dread/${INSTRUMENTAL_FOLDER}/The Undead Horde.opus`)).toBe('HORDE');
    expect(library.rootOf('music')).toMatchObject({ status: 'vault', path: 'atlas-vtt/sounds/music' });
  });

  it('counts a pack as there once all its tracks lie in its folder, and knows nothing before the folder is read', async () => {
    const [first] = MUSIC_PACKS;
    if (!first) throw new Error('no packs');
    expect(installedMusicPacks(library)).toBeNull();
    library.rescan();
    await vi.waitFor(() => expect(library.isWalked('music')).toBe(true));
    expect(installedMusicPacks(library)?.has(first.id)).toBe(false);
    const paths = Array.from({ length: first.tracks }, (_, i) => `${MUSIC_FOLDER}/${first.name}/${INSTRUMENTAL_FOLDER}/Track ${i}.opus`);
    fs.mkdirSync(inFolder(first.name, INSTRUMENTAL_FOLDER), { recursive: true });
    for (const file of paths.slice(1)) fs.writeFileSync(path.join(music(), file), 'X');
    await library.settle('music', paths.slice(1));
    // A pack stopped part way is offered again, for the tracks it lacks.
    expect(musicPackTrackCounts(library)?.get(first.id)).toBe(first.tracks - 1);
    expect(installedMusicPacks(library)?.has(first.id)).toBe(false);
    fs.writeFileSync(path.join(music(), paths[0] ?? ''), 'X');
    await library.settle('music', paths.slice(0, 1));
    expect(installedMusicPacks(library)?.has(first.id)).toBe(true);
  });

  it('is offered only where this device can take it', () => {
    expect(mayInstallMusicPacks(library)).toBe(true);
    open({}, {});
    expect(mayInstallMusicPacks(library)).toBe(true);
    open({}, { music: { type: 'external' } });
    expect(mayInstallMusicPacks(library)).toBe(false);
  });
});
