// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rowHidden } from '@/app/react/components/dm-screen/sound/library/rowHidden';
import { shelfOf } from '@/app/react/components/dm-screen/sound/library/rowModel';
import type { SoundRecord } from '@/app/sound/soundTypes';
import { LibraryCopyFolder } from '@/app/soundLibrary/libraryCopyFolder';
import { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { externalAudioPath } from '@/app/soundLibrary/soundPaths';
import { SoundRoots } from '@/app/soundLibrary/SoundRoots';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { keyOf, plainCopy, taggedCopy } from '../../helpers/atlasCopies';

function row(name: string, tag: string | null, { cut = false, dropped = false } = {}): HTMLElement {
  const cell = document.createElement('span');
  const title = cell.appendChild(document.createElement('span'));
  title.className = 'atlas-sound-lib__title';
  title.textContent = name;
  Object.defineProperty(title, 'scrollWidth', { value: cut ? 400 : 100 });
  Object.defineProperty(title, 'clientWidth', { value: 100 });
  Object.defineProperty(title, 'offsetTop', { value: 10 });
  if (tag !== null) {
    const where = cell.appendChild(document.createElement('span'));
    where.className = 'atlas-sound-lib__where';
    where.textContent = tag;
    Object.defineProperty(where, 'offsetTop', { value: dropped ? 28 : 10 });
  }
  return title;
}

describe('what a library row hides', () => {
  it('is nothing while the name and its tag both show', () => {
    expect(rowHidden(row('Shieldwall', 'Battle'))).toBeNull();
  });

  it('is the name where its line cuts it', () => {
    expect(rowHidden(row('The Long Road Through the Whispering Pines', null, { cut: true }))).toBe('The Long Road Through the Whispering Pines');
  });

  it('names the tag that was dropped, even where the name fits', () => {
    expect(rowHidden(row('The Long Road', 'Exploration', { dropped: true }))).toBe('The Long Road · Exploration');
  });
});

describe('what the library leaves out', () => {
  let location: FakeSoundLocation;
  let library: SoundLibrary;
  let folder: LibraryCopyFolder;

  beforeEach(() => {
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
    folder = new LibraryCopyFolder(() => library, { whenLoaded: () => Promise.resolve(), rewrite: () => false }, () => 5);
  });

  afterEach(() => library.destroy());

  const sound = (path: string): SoundRecord => ({ id: `sound-${path}`, name: path, kind: 'music', filePath: externalAudioPath('music', path) });

  const listed = async (): Promise<string[]> => {
    await library.reread('music');
    await library.settle('music', ['Inn']);
    await library.settle('music', ['Inn']);
    return shelfOf(library, [], new Map(), 'music').rows.flatMap((row) => (row.type === 'file' ? [row.file.path] : []));
  };

  const found = (): string[] => library.search('tavern').map((file) => file.path);

  it('a source beside its own opus is not listed', async () => {
    location.put('Inn/Tavern.mp3', new Blob(['MP3']));
    expect(await listed()).toEqual(['Inn/Tavern.mp3']);
    await folder.store(sound('Inn/Tavern.mp3'), await taggedCopy({ key: keyOf('a'), from: 'Tavern.mp3' }), 'keep', { size: 3, mtime: 1 });
    expect(location.files.has('Inn/Tavern.mp3'), 'the original is kept').toBe(true);
    expect(await listed()).toEqual(['Inn/Tavern.opus']);
    expect(found()).toEqual(['Inn/Tavern.opus']);
  });

  it('a source whose copy was found when its folder was read is not listed either', async () => {
    location.put('Inn/Tavern.mp3', new Blob(['MP3']));
    location.put('Inn/Tavern.opus', await taggedCopy({ key: keyOf('a'), from: 'Tavern.mp3' }));
    expect(await listed(), 'nothing is read for the listing').toEqual(['Inn/Tavern.mp3', 'Inn/Tavern.opus']);
    expect(location.ranges).toEqual([]);
    await folder.factsOf(sound('Inn/Tavern.mp3'));
    expect(await listed()).toEqual(['Inn/Tavern.opus']);
  });

  it('an Opus file of the GM\'s own, or a copy of another source, hides nothing', async () => {
    location.put('Inn/Tavern.mp3', new Blob(['MP3']));
    location.put('Inn/Tavern.opus', plainCopy());
    location.put('Inn/Storm.mp3', new Blob(['MP3']));
    location.put('Inn/Storm.opus', await taggedCopy({ key: keyOf('b'), from: 'Rain.mp3' }));
    for (const path of ['Inn/Tavern.mp3', 'Inn/Tavern.opus', 'Inn/Storm.mp3', 'Inn/Storm.opus']) await folder.factsOf(sound(path));
    expect(await listed()).toEqual(['Inn/Storm.mp3', 'Inn/Storm.opus', 'Inn/Tavern.mp3', 'Inn/Tavern.opus']);
  });

  it('a source comes back once its copy is gone, or is another file', async () => {
    location.put('Inn/Tavern.mp3', new Blob(['MP3']));
    location.put('Inn/Tavern.opus', await taggedCopy({ key: keyOf('a'), from: 'Tavern.mp3' }));
    await folder.factsOf(sound('Inn/Tavern.mp3'));
    expect(await listed()).toEqual(['Inn/Tavern.opus']);
    location.put('Inn/Tavern.opus', new Blob(['an Opus file the GM put in its place']), 2);
    expect(await listed()).toEqual(['Inn/Tavern.mp3', 'Inn/Tavern.opus']);
    await location.trash('Inn/Tavern.opus');
    expect(await listed()).toEqual(['Inn/Tavern.mp3']);
  });
});
