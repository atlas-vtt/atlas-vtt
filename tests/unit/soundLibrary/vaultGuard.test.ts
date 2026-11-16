import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { SoundVaultPathError } from '../../../src/app/soundLibrary/soundLocation';
import { SoundRoots } from '../../../src/app/soundLibrary/SoundRoots';

let base: string;
let vaultFolder: string;
const trashed: string[] = [];

const located = (root: string): ExternalLocation => new ExternalLocation(root, {
  files: { fs: fs as unknown as NodeFsModule, sep: path.sep, home: base },
  trashItem: async (absolute) => {
    trashed.push(absolute);
    fs.rmSync(absolute, { recursive: true });
  },
  resourceUrl: null,
  vaultFolder,
});

const vaultWhole = (): void => {
  expect(trashed).toEqual([]);
  expect(fs.readFileSync(path.join(vaultFolder, 'Note.md'), 'utf8')).toBe('MINE');
  expect(fs.readFileSync(path.join(vaultFolder, 'Audio/a.mp3'), 'utf8')).toBe('AUDIO');
};

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sound-vault-'));
  vaultFolder = path.join(base, 'Docs', 'Vault');
  fs.mkdirSync(path.join(vaultFolder, 'Audio'), { recursive: true });
  fs.writeFileSync(path.join(vaultFolder, 'Note.md'), 'MINE');
  fs.writeFileSync(path.join(vaultFolder, 'Audio/a.mp3'), 'AUDIO');
  fs.writeFileSync(path.join(base, 'Docs', 'song.mp3'), 'AUDIO');
  trashed.length = 0;
});

afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('a linked folder above the vault', () => {
  it('shows no row of the vault, and the rest of what lies beside it', async () => {
    const docs = await located(path.join(base, 'Docs')).list('');
    expect(docs?.folders).toEqual([]);
    expect(docs?.files.map((file) => file.name)).toEqual(['song.mp3']);
    const above = await located(base).list('');
    expect(above?.folders.map((folder) => folder.name)).toEqual(['Docs']);
    await expect(located(base).list('Docs/Vault')).resolves.toBeNull();
    await expect(located(base).list('Docs/Vault/Audio')).resolves.toBeNull();
  });

  it('refuses every change of the vault and of what lies in it', async () => {
    const root = located(path.join(base, 'Docs'));
    for (const target of ['Vault', 'Vault/Note.md', 'Vault/Audio/a.mp3']) {
      await expect(root.trash(target)).rejects.toBeInstanceOf(SoundVaultPathError);
      await expect(root.move(target, 'Elsewhere')).rejects.toBeInstanceOf(SoundVaultPathError);
      await expect(root.read(target)).rejects.toBeInstanceOf(SoundVaultPathError);
    }
    await expect(root.move('song.mp3', 'Vault/song.mp3')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.write('Vault/new.mp3', new Blob(['X']))).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.makeFolder('Vault/New')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.exists('Vault/Note.md')).resolves.toBe(false);
    vaultWhole();
    expect(fs.existsSync(path.join(vaultFolder, 'New'))).toBe(false);
    expect(fs.existsSync(path.join(base, 'Docs', 'song.mp3'))).toBe(true);
  });

  it('refuses to trash or move a folder that holds the vault, and the root itself', async () => {
    const root = located(base);
    await expect(root.trash('Docs')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.move('Docs', 'Papers')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.trash('')).rejects.toBeInstanceOf(SoundVaultPathError);
    vaultWhole();
  });

  it('leaves everything beside it to the GM', async () => {
    const root = located(path.join(base, 'Docs'));
    await root.makeFolder('Set');
    await root.move('song.mp3', 'Set/song.mp3');
    await root.trash('Set');
    expect(trashed).toHaveLength(1);
  });
});

describe('a link to the vault in a linked folder', () => {
  it('shows nothing and is refused, wherever it points in the vault', async () => {
    const root = path.join(base, 'Music');
    fs.mkdirSync(root);
    fs.symlinkSync(vaultFolder, path.join(base, 'Link'));
    const outer = located(base);
    const listing = await outer.list('');
    expect(listing?.folders.map((folder) => folder.name)).toEqual(['Docs', 'Music']);
    await expect(outer.trash('Link')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(outer.read('Link/Note.md')).rejects.toBeInstanceOf(SoundVaultPathError);
    vaultWhole();
  });
});

describe('a root that is the vault, or lies in it', () => {
  it.each([['the vault', (): string => vaultFolder], ['a folder of it', (): string => path.join(vaultFolder, 'Audio')]])('as %s, shows nothing and changes nothing', async (_what, rootOf) => {
    const root = located(rootOf());
    await expect(root.list('')).resolves.toBeNull();
    await expect(root.trash('')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.read('a.mp3')).rejects.toBeInstanceOf(SoundVaultPathError);
    await expect(root.write('b.mp3', new Blob(['X']))).rejects.toBeInstanceOf(SoundVaultPathError);
    vaultWhole();
  });

  it('through a link is refused all the same', async () => {
    const link = path.join(base, 'Alias');
    fs.symlinkSync(vaultFolder, link);
    const root = located(link);
    await expect(root.list('')).resolves.toBeNull();
    await expect(root.trash('Note.md')).rejects.toBeInstanceOf(SoundVaultPathError);
    vaultWhole();
  });
});

describe('linking Atlas\' own folders', () => {
  const roots = (): SoundRoots => new SoundRoots({
    shared: () => ({}),
    setShared: () => undefined,
    onSharedChange: () => () => undefined,
    local: () => null,
    setLocal: () => undefined,
    localOriginals: () => null,
    setLocalOriginals: () => undefined,
    vaultBase: () => '/home/gm/vault',
    realPath: async (value) => value,
  });

  it.each(['atlas-vtt', 'atlas-vtt/sounds', 'atlas-vtt/sounds/moods', 'atlas-vtt/collections', 'atlas-vtt/collections/Tavern'])('is refused for %s', async (folder) => {
    expect(roots().linkVault('music', folder)).toBe('reserved');
    await expect(roots().linkChosen('music', `/home/gm/vault/${folder}`)).resolves.toBe('reserved');
  });

  it.each(['', 'Audio', 'atlas-vtt/sounds/music', 'atlas-vtt/sounds/ambience/Rain'])('leaves %j linkable', (folder) => {
    expect(roots().linkVault('music', folder)).toBe('linked');
  });
});
