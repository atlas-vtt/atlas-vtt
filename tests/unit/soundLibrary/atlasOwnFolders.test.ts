import { beforeEach, describe, expect, it } from 'vitest';
import { SoundPathReservedError } from '../../../src/app/soundLibrary/soundLocation';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const OWN_FILES = ['atlas-vtt/collections/Tavern/scene.atlasmap', 'atlas-vtt/sounds/moods/m.json', 'atlas-vtt/sounds/records/r.json', 'atlas-vtt/sounds/music/song.mp3'];

let vault: InMemoryApp;
const here = (root: string): VaultLocation => new VaultLocation(vault.app, root);

/** Everything Atlas keeps is still there. */
const expectAllThere = (): void => {
  for (const file of OWN_FILES) expect(vault.files.has(file), file).toBe(true);
  expect(vault.app.fileManager.trashFile).not.toHaveBeenCalled();
  expect(vault.app.fileManager.renameFile).not.toHaveBeenCalled();
};

const refused = async (attempt: Promise<void>): Promise<void> => {
  await expect(attempt).rejects.toBeInstanceOf(SoundPathReservedError);
  expectAllThere();
};

beforeEach(() => {
  vault = createInMemoryApp({ folders: ['Audio'], files: { ...Object.fromEntries(OWN_FILES.map((file) => [file, 'X'])), 'Audio/a.mp3': 'A', 'top.mp3': 'T' } });
});

describe('with the vault root linked', () => {
  it('lists what is the GM\'s and no folder of Atlas', async () => {
    const listing = await here('').list('');
    expect(listing?.folders.map((folder) => folder.name)).toContain('Audio');
    expect(listing?.folders.map((folder) => folder.name)).not.toContain('atlas-vtt');
    expect(listing?.files.map((file) => file.name)).toEqual(['top.mp3']);
  });

  it.each(['atlas-vtt', 'atlas-vtt/sounds', 'atlas-vtt/sounds/moods', 'atlas-vtt/sounds/records/r.json', 'atlas-vtt/collections', 'atlas-vtt/collections/Tavern/scene.atlasmap'])('refuses every change of %s', async (path) => {
    const root = here('');
    await refused(root.trash(path));
    await refused(root.move(path, 'Elsewhere'));
    await refused(root.moveToVault(path, 'Elsewhere'));
  });

  it('puts nothing into them, nor moves anything there', async () => {
    const root = here('');
    await refused(root.write('atlas-vtt/a.mp3', new Blob(['A'])));
    await refused(root.write('atlas-vtt/sounds/moods/a.mp3', new Blob(['A'])));
    await refused(root.makeFolder('atlas-vtt/New'));
    await refused(root.move('Audio/a.mp3', 'atlas-vtt/sounds/records/a.mp3'));
    await refused(root.moveToVault('Audio/a.mp3', 'atlas-vtt/sounds/records/a.mp3'));
    expect(vault.files.has('Audio/a.mp3')).toBe(true);
  });

  it('still changes what is the GM\'s', async () => {
    const root = here('');
    await root.move('Audio/a.mp3', 'Audio/b.mp3');
    await root.trash('top.mp3');
    expect(vault.files.has('Audio/b.mp3')).toBe(true);
    expect(vault.files.has('top.mp3')).toBe(false);
  });
});

describe('with Atlas\' own folder linked', () => {
  it('shows no row that holds its moods and records, and refuses that row', async () => {
    const root = here('atlas-vtt');
    expect((await root.list(''))?.folders).toEqual([]);
    await refused(root.trash('sounds'));
    await refused(root.move('sounds', 'Other'));
    await refused(root.write('a.mp3', new Blob(['A'])));
    await expect(root.makeFolder('')).resolves.toBeUndefined();
  });

  it('a root at its sounds folder shows what the default folders hold, never the data beside them', async () => {
    const root = here('atlas-vtt/sounds');
    expect((await root.list(''))?.folders.map((folder) => folder.name)).toEqual(['music']);
    await refused(root.trash('moods'));
    await refused(root.trash('records'));
    await root.write('loose.mp3', new Blob(['A']));
    expect(vault.files.has('atlas-vtt/sounds/loose.mp3')).toBe(true);
  });
});

it.each(['atlas-vtt/sounds/music', 'atlas-vtt/sounds/ambience'])('the default folder %s works as a root', async (folder) => {
  const root = here(folder);
  await root.makeFolder('');
  await root.makeFolder('Battle');
  await root.write('Battle/a.mp3', new Blob(['A']));
  expect((await root.list(''))?.folders.map((sub) => sub.name)).toEqual(['Battle']);
  expect((await root.list('Battle'))?.files.map((file) => file.name)).toEqual(['a.mp3']);
  await root.move('Battle/a.mp3', 'Battle/b.mp3');
  expect(vault.files.has(`${folder}/Battle/b.mp3`)).toBe(true);
  await root.trash('Battle');
  expect(vault.files.has(`${folder}/Battle/b.mp3`)).toBe(false);
});
