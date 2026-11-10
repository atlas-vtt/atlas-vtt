import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundKind } from '../../../src/app/sound/soundTypes';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { isAudioPath } from '../../../src/app/soundLibrary/soundFiles';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import {
  hasStarterPack, installStarterPack, mayInstallStarterPack, STARTER_BYTES, STARTER_FILES, STARTER_FOLDER, type StarterFile,
} from '../../../src/app/soundLibrary/starterPack';
import { StockPackError } from '../../../src/app/services/stockPacks/verifiedFetch';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { sha256 } from '../../../src/app/utils/hashing';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

let base: string;
let vault: InMemoryApp;
let library: SoundLibrary;

const ambience = (): string => path.join(base, 'Ambience');
const inPack = (name: string): string => path.join(ambience(), STARTER_FOLDER, name);

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

/** A small pack of its own, since the real one's hashes name the hosted files. */
async function packOf(contents: Record<string, string>): Promise<{ files: StarterFile[]; served: Map<string, ArrayBuffer> }> {
  const served = new Map<string, ArrayBuffer>();
  const files: StarterFile[] = [];
  for (const [name, text] of Object.entries(contents)) {
    const key = name.toLowerCase().replace(/ /g, '-');
    served.set(key, bytesOf(text));
    files.push({ key, name, bytes: text.length, sha256: await sha256(bytesOf(text)), type: name.endsWith('.ogg') ? 'audio/ogg' : 'text/markdown' });
  }
  return { files, served };
}

const serving = (served: Map<string, ArrayBuffer>) => vi.fn(async (url: string): Promise<ArrayBuffer> => {
  const bytes = served.get(url.slice(url.lastIndexOf('/') + 1));
  if (!bytes) throw new Error(`404 ${url}`);
  return bytes;
});

beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-starter-'));
  fs.mkdirSync(ambience());
  vault = createInMemoryApp({ folders: [] });
  open({ ambience: ambience() }, {});
});

afterEach(() => {
  library.destroy();
  fs.rmSync(base, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('the starter pack', () => {
  it('names unique files from the asset host, sounds the library can play, and counts its bytes', () => {
    expect(new Set(STARTER_FILES.map((file) => file.name)).size).toBe(STARTER_FILES.length);
    expect(STARTER_FILES.filter((file) => file.type === 'audio/ogg').every((file) => isAudioPath(file.name))).toBe(true);
    expect(STARTER_FILES.every((file) => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    expect(STARTER_BYTES).toBe(STARTER_FILES.reduce((sum, file) => sum + file.bytes, 0));
  });

  it('is fetched whole, checked, then written into its folder of the ambience root', async () => {
    const { files, served } = await packOf({ 'Cave.ogg': 'CAVE', 'Credits.md': 'CREDITS' });
    const fetch = serving(served);
    const steps: number[] = [];
    await installStarterPack(library, { files, fetch, onStep: (share) => steps.push(share) });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://assets.atlas-vtt.dev/starter/ambience-1/cave.ogg', 'https://assets.atlas-vtt.dev/starter/ambience-1/credits.md']);
    expect(fs.readFileSync(inPack('Cave.ogg'), 'utf8')).toBe('CAVE');
    expect(fs.readFileSync(inPack('Credits.md'), 'utf8')).toBe('CREDITS');
    // Listed at once, so its copies can be made before the first press.
    expect(library.filesOf('ambience').map(({ entry }) => entry.path)).toContain(`${STARTER_FOLDER}/Cave.ogg`);
    expect(steps[0]).toBe(0);
    expect(steps.at(-1)).toBe(1);
  });

  it('writes nothing when a file is not the one it names, or cannot be fetched', async () => {
    const { files, served } = await packOf({ 'Cave.ogg': 'CAVE', 'Campfire.ogg': 'FIRE' });
    served.set('campfire.ogg', bytesOf('FIRF'));
    await expect(installStarterPack(library, { files, fetch: serving(served) })).rejects.toBeInstanceOf(StockPackError);
    served.delete('campfire.ogg');
    await expect(installStarterPack(library, { files, fetch: serving(served) })).rejects.toThrow('404');
    expect(fs.existsSync(path.join(ambience(), STARTER_FOLDER))).toBe(false);
  });

  it('leaves a file already there alone', async () => {
    fs.mkdirSync(path.join(ambience(), STARTER_FOLDER));
    fs.writeFileSync(inPack('Cave.ogg'), 'MINE');
    const { files, served } = await packOf({ 'Cave.ogg': 'CAVE', 'Campfire.ogg': 'FIRE' });
    await installStarterPack(library, { files, fetch: serving(served) });
    expect(fs.readFileSync(inPack('Cave.ogg'), 'utf8')).toBe('MINE');
    expect(fs.readFileSync(inPack('Campfire.ogg'), 'utf8')).toBe('FIRE');
  });

  it('with nothing linked goes to the default vault folder, which is then linked', async () => {
    open({}, {});
    const { files, served } = await packOf({ 'Cave.ogg': 'CAVE' });
    await installStarterPack(library, { files, fetch: serving(served) });
    expect(vault.files.get(`atlas-vtt/sounds/ambience/${STARTER_FOLDER}/Cave.ogg`)).toBe('CAVE');
    expect(library.rootOf('ambience')).toMatchObject({ status: 'vault', path: 'atlas-vtt/sounds/ambience' });
  });

  it('counts as there once any of its sounds lies in its folder', async () => {
    expect(await hasStarterPack(library)).toBe(false);
    fs.mkdirSync(path.join(ambience(), STARTER_FOLDER));
    fs.writeFileSync(inPack('Credits.md'), 'CREDITS');
    expect(await hasStarterPack(library)).toBe(false);
    fs.writeFileSync(inPack(STARTER_FILES[0].name), 'SOUND');
    expect(await hasStarterPack(library)).toBe(true);
  });

  it('is offered only where this device can take it', () => {
    expect(mayInstallStarterPack(library)).toBe(true);
    open({}, {});
    expect(mayInstallStarterPack(library)).toBe(true);
    open({}, { ambience: { type: 'external' } });
    expect(mayInstallStarterPack(library)).toBe(false);
  });
});
