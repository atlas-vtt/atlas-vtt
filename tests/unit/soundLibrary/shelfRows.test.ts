// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { keptValues, useKeptValues } from '@/app/react/components/dm-screen/sound/keptValues';
import { shelfOf } from '@/app/react/components/dm-screen/sound/library/rowModel';
import type { StoredSound } from '@/app/soundLibrary/soundRecords';
import { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { externalAudioPath } from '@/app/soundLibrary/soundPaths';
import { SoundRoots } from '@/app/soundLibrary/SoundRoots';
import { rootTags, tagsOfNames, tagsOfTrack, namesOfTrack } from '@/app/soundLibrary/soundTags';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';

describe('the rows of a shelf', () => {
  let location: FakeSoundLocation;
  let library: SoundLibrary;

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
  });

  afterEach(() => library.destroy());

  const walk = async (): Promise<void> => {
    await library.reread('music');
    await library.settle('music', ['Inn/Tavern.mp3', 'Road/Cart.mp3']);
  };

  const stored = (path: string, tags: string[]): StoredSound => ({ id: `sound-${path}`, name: path, tags, createdAt: 1, modifiedAt: 1, audioPath: externalAudioPath('music', path), audioSize: 5_000_000, kind: 'music' });

  it('keeps the object of every row a new listing left as it was, and makes anew only what changed', async () => {
    location.addFile('Inn/Tavern.mp3');
    location.addFile('Road/Cart.mp3');
    await walk();
    const first = shelfOf(library, [], new Map(), 'music');
    location.addFile('Road/Horse.mp3');
    await library.settle('music', ['Road/Horse.mp3']);
    const second = shelfOf(library, [], new Map(), 'music');
    expect(second.rows.map((row) => row.name)).toEqual(['Cart', 'Horse', 'Tavern']);
    expect(second.rows.find((row) => row.name === 'Tavern')).toBe(first.rows.find((row) => row.name === 'Tavern'));
    expect(second.rows.find((row) => row.name === 'Cart')).toBe(first.rows.find((row) => row.name === 'Cart'));
  });

  it('makes a row anew when its records give it another tag, or another spelling of a tag shows', async () => {
    location.addFile('Inn/Tavern.mp3');
    location.addFile('Road/Cart.mp3');
    await walk();
    const before = shelfOf(library, [], new Map(), 'music');
    const night = stored('Inn/Tavern.mp3', ['Night']);
    const tagged = shelfOf(library, [night], new Map([[night.audioPath, [night]]]), 'music');
    const tavern = tagged.rows.find((row) => row.name === 'Tavern');
    expect(tavern).not.toBe(before.rows.find((row) => row.name === 'Tavern'));
    expect(tavern?.where).toBe('Night · Inn');
    expect(tagged.rows.find((row) => row.name === 'Cart')).toBe(before.rows.find((row) => row.name === 'Cart'));
    // Another record spells the folder's tag first: the row's words follow the root's spelling.
    const inn = stored('Road/Cart.mp3', ['inn']);
    const spelt = shelfOf(library, [night, inn], new Map([[night.audioPath, [night]], [inn.audioPath, [inn]]]), 'music');
    expect(spelt.tags.map((tag) => tag.name)).toContain('inn');
    expect(spelt.rows.find((row) => row.name === 'Tavern')?.where).toBe('Night · inn');
  });
});

describe('tags worked out from names', () => {
  it('count as rootTags counts them', () => {
    const tracks = [tagsOfTrack('Inn/Night/a', []), tagsOfTrack('Inn/b', []), tagsOfTrack('c', [])];
    expect(tagsOfNames(tracks.map(namesOfTrack))).toEqual(rootTags(tracks));
  });
});

describe('values kept while equal', () => {
  const same = (a: { n: number }, b: { n: number }): boolean => a.n === b.n;

  it('keeps an equal value of before and takes a changed or new one', () => {
    const one = { n: 1 };
    const kept = keptValues(new Map([['a', one], ['b', { n: 2 }]]), new Map([['a', { n: 1 }], ['b', { n: 3 }], ['c', { n: 4 }]]), same);
    expect(kept.get('a')).toBe(one);
    expect(kept.get('b')).toEqual({ n: 3 });
    expect(kept.get('c')).toEqual({ n: 4 });
  });

  it('holds across renders, and the same map is returned while its input is the same', () => {
    const first = new Map([['a', { n: 1 }]]);
    const { result, rerender } = renderHook(({ next }) => useKeptValues(next, same), { initialProps: { next: first } });
    const shown = result.current;
    rerender({ next: first });
    expect(result.current).toBe(shown);
    rerender({ next: new Map([['a', { n: 1 }]]) });
    expect(result.current.get('a')).toBe(first.get('a'));
  });
});

describe('a long list mounted in stages', () => {
  it('mounts the first items at once and the rest in the render after, again when it grows a lot', async () => {
    const { useStagedList } = await import('@/app/react/components/dm-screen/sound/useStagedList');
    const seen: number[] = [];
    const items = (count: number): number[] => Array.from({ length: count }, (_, index) => index);
    const { rerender } = renderHook(({ list }) => {
      const shown = useStagedList(list, 10);
      seen.push(shown.length);
      return shown;
    }, { initialProps: { list: items(100) } });
    expect(seen[0]).toBe(10);
    expect(seen.at(-1)).toBe(100);
    seen.length = 0;
    rerender({ list: items(3) });
    expect(seen.at(-1)).toBe(3);
    seen.length = 0;
    rerender({ list: items(100) });
    expect(seen[0]).toBe(10);
    expect(seen.at(-1)).toBe(100);
  });
});

describe('the library going from nothing linked to a folder', () => {
  it('renders the rail without changing its hooks', async () => {
    const { libraryRig } = await import('../../helpers/libraryRig');
    const { act } = await import('@testing-library/react');
    const rig = await libraryRig();
    rig.locations.music.addFile('Battle/Theme.ogg');
    const host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
    rig.mount(host);
    expect(host.querySelector('.atlas-sound-lib__nolink')).not.toBeNull();
    await act(async () => {
      expect(await rig.roots.linkChosen('music', '/Music')).toBe('linked');
      rig.library.rescan(Date.now() + 100_000);
    });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 200)); });
    expect(host.querySelector('.atlas-sound-lib__nolink')).toBeNull();
    expect(host.querySelector('.atlas-sound-lib__rail')).not.toBeNull();
    rig.unmount();
    host.remove();
  });
});
