import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundKind } from '../../../src/app/sound/soundTypes';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import { moveEntries, renameEntry, type LibraryContext } from '../../../src/app/soundLibrary/libraryOperations';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { SoundMoveRefusedError } from '../../../src/app/soundLibrary/soundLocation';
import { SoundRecordStore } from '../../../src/app/soundLibrary/SoundRecordStore';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../../src/app/soundLibrary/soundRootsStore';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

let base: string;
let disk: string;
let vault: InMemoryApp;
let context: LibraryContext;
let library: SoundLibrary;

function open(local: Partial<Record<SoundKind, string>>, shared: SharedSoundRoots): void {
  const roots = new SoundRoots({
    shared: () => shared,
    setShared: (next) => { shared = next; },
    onSharedChange: () => () => undefined,
    local: (kind) => local[kind] ?? null,
    setLocal: () => undefined,
    vaultBase: () => '/vault',
    realPath: async (value) => value,
  });
  library = new SoundLibrary({
    roots,
    open: (root) => (root.status === 'vault' ? new VaultLocation(vault.app, root.path) : new ExternalLocation(root.path, {
      files: { fs: fs as unknown as NodeFsModule, sep: path.sep, home: base },
      trashItem: async (absolute) => fs.rmSync(absolute, { recursive: true }),
      resourceUrl: null,
    })),
    home: () => base,
    probeSeconds: async () => null,
  });
  context = { library, records: SoundRecordStore.forApp(vault.app) };
}

function onDisk(relative: string): void {
  fs.mkdirSync(path.dirname(path.join(disk, relative)), { recursive: true });
  fs.writeFileSync(path.join(disk, relative), 'AUDIO');
}

const inVault = (relative: string): Promise<void> => vault.app.vault.adapter.write(relative, 'AUDIO');

const TAVERN = [{ kind: 'music' as const, path: 'Tavern', isFolder: true }];

beforeEach(async () => {
  vi.stubGlobal('window', globalThis);
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sound-move-'));
  disk = path.join(base, 'Music');
  fs.mkdirSync(disk);
  vault = createInMemoryApp({ folders: ['Audio', 'Sets'] });
});

afterEach(() => {
  library.destroy();
  SoundRecordStore.release(vault.app);
  fs.rmSync(base, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('a folder on disk moved into the vault', () => {
  beforeEach(() => open({ music: disk }, { music: { type: 'external' }, ambience: { type: 'vault', path: 'Audio' } }));

  it.each([
    ['a note and a cover beside the audio', ['Tavern/a.mp3', 'Tavern/Tavern.md', 'Tavern/cover.png', 'Tavern/set.cue']],
    ['a hidden file', ['Tavern/a.mp3', 'Tavern/.env']],
    ['something named almost like a file manager\'s own', ['Tavern/a.mp3', 'Tavern/My.DS_Store', 'Tavern/.DS_Store.bak']],
    ['audio under a hidden name', ['Tavern/a.mp3', 'Tavern/.b.mp3']],
    ['something hidden in a hidden folder', ['Tavern/a.mp3', 'Tavern/.git/config']],
    ['a note three folders down', ['Tavern/a.mp3', 'Tavern/One/Two/notes.md']],
  ])('is refused where it holds %s, and everything stays', async (_what, files) => {
    for (const file of files) onDisk(file);
    await expect(moveEntries(context, TAVERN, 'ambience', '')).rejects.toBeInstanceOf(SoundMoveRefusedError);
    for (const file of files) expect(fs.existsSync(path.join(disk, file)), file).toBe(true);
    expect([...vault.files.keys()].filter((file) => file.startsWith('Audio/'))).toEqual([]);
  });

  it('is refused where it holds a link, which a copy would not keep', async () => {
    onDisk('Tavern/a.mp3');
    onDisk('Elsewhere/b.mp3');
    fs.symlinkSync(path.join(disk, 'Elsewhere'), path.join(disk, 'Tavern', 'Alias'));
    await expect(moveEntries(context, TAVERN, 'ambience', '')).rejects.toBeInstanceOf(SoundMoveRefusedError);
    expect(fs.existsSync(path.join(disk, 'Tavern/a.mp3'))).toBe(true);
  });

  it('refuses a selection whole, before the first of it moves', async () => {
    onDisk('Calm/a.mp3');
    onDisk('Tavern/b.mp3');
    onDisk('Tavern/Tavern.md');
    await expect(moveEntries(context, [{ kind: 'music', path: 'Calm', isFolder: true }, ...TAVERN], 'ambience', '')).rejects.toMatchObject({ folder: 'Tavern' });
    expect(fs.existsSync(path.join(disk, 'Calm/a.mp3'))).toBe(true);
    expect(vault.files.has('Audio/Calm/a.mp3')).toBe(false);
  });

  it('goes on where a file manager has been in it, at any depth', async () => {
    for (const file of ['Tavern/a.mp3', 'Tavern/.DS_Store', 'Tavern/._a.mp3', 'Tavern/Deep/b.ogg', 'Tavern/Deep/Thumbs.db', 'Tavern/Deep/Desktop.ini']) onDisk(file);
    await moveEntries(context, TAVERN, 'ambience', '');
    expect(vault.files.has('Audio/Tavern/a.mp3')).toBe(true);
    expect(vault.files.has('Audio/Tavern/Deep/b.ogg')).toBe(true);
    expect(fs.existsSync(path.join(disk, 'Tavern'))).toBe(false);
  });

  it('goes on where it holds audio and folders alone', async () => {
    onDisk('Tavern/a.mp3');
    onDisk('Tavern/Deep/b.ogg');
    fs.mkdirSync(path.join(disk, 'Tavern/Empty'));
    await moveEntries(context, TAVERN, 'ambience', '');
    expect(vault.files.has('Audio/Tavern/a.mp3')).toBe(true);
    expect(vault.files.has('Audio/Tavern/Deep/b.ogg')).toBe(true);
    expect(fs.existsSync(path.join(disk, 'Tavern'))).toBe(false);
  });

  it('a file alone is no folder and goes', async () => {
    onDisk('a.mp3');
    await moveEntries(context, [{ kind: 'music', path: 'a.mp3', isFolder: false }], 'ambience', '');
    expect(vault.files.has('Audio/a.mp3')).toBe(true);
  });

  it('a move within the root is a rename that takes everything along', async () => {
    onDisk('Tavern/a.mp3');
    onDisk('Tavern/Tavern.md');
    onDisk('Tavern/.hidden');
    await renameEntry(context, TAVERN[0]!, 'Inn');
    for (const file of ['Inn/a.mp3', 'Inn/Tavern.md', 'Inn/.hidden']) expect(fs.existsSync(path.join(disk, file)), file).toBe(true);
    onDisk('Sets/x.mp3');
    await moveEntries(context, [{ kind: 'music', path: 'Inn', isFolder: true }], 'music', 'Sets');
    expect(fs.existsSync(path.join(disk, 'Sets/Inn/Tavern.md'))).toBe(true);
  });
});

describe('a folder in the vault moved onto a disk', () => {
  beforeEach(() => open({ ambience: disk }, { music: { type: 'vault', path: 'Audio' }, ambience: { type: 'external' } }));

  it.each([
    ['a note and a cover beside the audio', ['Audio/Tavern/a.mp3', 'Audio/Tavern/Tavern.md', 'Audio/Tavern/cover.png']],
    ['a hidden file the vault does not index', ['Audio/Tavern/a.mp3', 'Audio/Tavern/.notes']],
    ['something in a hidden folder', ['Audio/Tavern/a.mp3', 'Audio/Tavern/.trash/old.mp3']],
    ['a note three folders down', ['Audio/Tavern/a.mp3', 'Audio/Tavern/One/Two/notes.md']],
  ])('is refused where it holds %s, and everything stays', async (_what, files) => {
    for (const file of files) await inVault(file);
    await expect(moveEntries(context, TAVERN, 'ambience', '')).rejects.toBeInstanceOf(SoundMoveRefusedError);
    for (const file of files) expect(vault.files.has(file), file).toBe(true);
    expect(fs.readdirSync(disk)).toEqual([]);
  });

  it('goes on where a file manager has been in it', async () => {
    for (const file of ['Audio/Tavern/a.mp3', 'Audio/Tavern/.DS_Store', 'Audio/Tavern/Deep/._b.ogg', 'Audio/Tavern/Deep/b.ogg']) await inVault(file);
    await moveEntries(context, TAVERN, 'ambience', '');
    expect(fs.existsSync(path.join(disk, 'Tavern/Deep/b.ogg'))).toBe(true);
    expect(vault.files.has('Audio/Tavern/a.mp3')).toBe(false);
  });

  it('goes on where it holds audio and folders alone', async () => {
    await inVault('Audio/Tavern/a.mp3');
    await inVault('Audio/Tavern/Deep/b.ogg');
    await moveEntries(context, TAVERN, 'ambience', '');
    expect(fs.existsSync(path.join(disk, 'Tavern/Deep/b.ogg'))).toBe(true);
    expect(vault.files.has('Audio/Tavern/a.mp3')).toBe(false);
  });
});

it('between two roots in the vault a folder is renamed whole, with what is no sound', async () => {
  open({}, { music: { type: 'vault', path: 'Audio' }, ambience: { type: 'vault', path: 'Sets' } });
  await inVault('Audio/Tavern/a.mp3');
  await inVault('Audio/Tavern/Tavern.md');
  await moveEntries(context, TAVERN, 'ambience', '');
  expect(vault.app.fileManager.renameFile).toHaveBeenCalledTimes(1);
  expect(vault.files.has('Sets/Tavern/Tavern.md')).toBe(true);
});
