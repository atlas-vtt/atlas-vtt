// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordsForFiles } from '../../../src/app/soundLibrary/libraryRecords';
import { rowsWithTags, type LibraryRow } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import { tagRowMenu, tagsSubmenu } from '../../../src/app/react/components/dm-screen/sound/library/tagMenus';
import type { LibraryActions } from '../../../src/app/react/components/dm-screen/sound/library/useLibraryActions';
import { wireState } from '../../../src/app/online/gm/sound/soundWire';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import type { LibraryFile } from '../../../src/app/soundLibrary/SoundLibrary';
import { SOUND_DRAG_TYPE } from '../../../src/app/soundLibrary/soundDrag';
import type { SoundKind, TableSound } from '../../../src/app/sound/soundTypes';
import { addTag, cleanTag, holdsTag, namesOfTrack, removeTag, renameTag, rootTags, tagsOfFiles, tagsOfTrack, takeTagOff, toggledTag, toggleTag, tracksHolding } from '../../../src/app/soundLibrary/soundTags';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';
import { confirmAction } from '../../../src/app/ui/confirmDialog';
import { promptForText } from '../../../src/app/ui/textInputDialog';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/confirmDialog', () => ({ confirmAction: vi.fn(async () => true) }));
vi.mock('../../../src/app/ui/textInputDialog', () => ({ promptForText: vi.fn(async () => null) }));

const stored = (tags: unknown, audioPath = 'a.mp3'): StoredSound => ({ id: audioPath, name: 'a', tags, createdAt: 1, modifiedAt: 1, audioPath, kind: 'music' }) as StoredSound;
const fileOf = (kind: SoundKind, path: string): LibraryFile => ({ kind, path, name: path.split('/').pop()!, size: 5_000_000, mtime: 1 });

describe('a track\'s tags', () => {
  it('are its record\'s and the names of the folders it lies in', () => {
    const track = tagsOfTrack('Battle/Bosses/x.ogg', [stored(['Loud'])]);
    expect(track).toEqual({ own: ['Loud'], folders: ['Battle', 'Bosses'] });
    expect(namesOfTrack(track)).toEqual(['Loud', 'Battle', 'Bosses']);
    expect(tagsOfTrack('x.ogg', [])).toEqual({ own: [], folders: [] });
  });

  it('are compared whatever their case, and shown as first written', () => {
    expect(namesOfTrack(tagsOfTrack('battle/x.ogg', [stored(['BATTLE'])]))).toEqual(['BATTLE']);
    expect(holdsTag(tagsOfTrack('Battle/x.ogg', []), 'battle')).toBe(true);
    expect(rootTags([tagsOfTrack('x', [stored(['Night'])]), tagsOfTrack('y', [stored(['NIGHT'])]), tagsOfTrack('z', [stored(['anvil'])])]))
      .toEqual([{ key: 'anvil', name: 'anvil', count: 1 }, { key: 'night', name: 'Night', count: 2 }]);
  });

  it('count a track once however often it has one', () => {
    expect(rootTags([tagsOfTrack('Night/Night/x', [stored(['night'])])])).toEqual([{ key: 'night', name: 'night', count: 1 }]);
  });

  it('read what a record file holds as it can: what is no tag is none', () => {
    expect(tagsOfTrack('x', [stored(['ok', 7, '   ', null, ' spaced '])]).own).toEqual(['ok', 'spaced']);
    expect(tagsOfTrack('x', [stored('Battle')]).own).toEqual([]);
  });

  it('are refused empty and cut to a length a rail can show', () => {
    expect(cleanTag('  Night ')).toBe('Night');
    expect(cleanTag('   ')).toBeNull();
    expect(cleanTag('x'.repeat(500))?.length).toBe(48);
  });
});

describe('the selection of tags', () => {
  const row = (id: string, tagKeys: string[]): LibraryRow => ({ type: 'file', id, name: id, where: '', tagKeys, file: fileOf('music', id) });
  const rows = [row('a', ['battle', 'night']), row('b', ['battle']), row('c', ['night'])];

  it('narrows: a track must have every tag selected', () => {
    expect(rowsWithTags(rows, ['battle']).map((one) => one.id)).toEqual(['a', 'b']);
    expect(rowsWithTags(rows, ['battle', 'night']).map((one) => one.id)).toEqual(['a']);
    expect(rowsWithTags(rows, ['battle', 'nothing'])).toEqual([]);
  });

  it('with none shows the same list, so nothing renders for it', () => {
    expect(rowsWithTags(rows, [])).toBe(rows);
  });

  it('toggles with a press, whatever the case', () => {
    expect(toggledTag(['Battle'], 'Night')).toEqual(['Battle', 'Night']);
    expect(toggledTag(['Battle', 'Night'], 'BATTLE')).toEqual(['Night']);
  });
});

describe('editing tags', () => {
  let rig: LibraryRig;

  beforeEach(async () => {
    rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
    for (const path of ['Battle/a.mp3', 'Battle/b.mp3', 'c.mp3']) rig.locations.music.addFile(path);
    rig.locations.ambience.addFile('Rain.ogg');
  });

  afterEach(() => {
    rig.unmount();
    cleanup();
  });

  const a = fileOf('music', 'Battle/a.mp3');
  const b = fileOf('music', 'Battle/b.mp3');
  const c = fileOf('music', 'c.mp3');
  const rain = fileOf('ambience', 'Rain.ogg');
  const tagsOf = (file: LibraryFile): readonly string[] => tagsOfFiles(rig.records.all(), rig.library, [file])[0]!.own;

  it('makes a record only for the file edited, and none for one a folder already gives it', async () => {
    await addTag(rig.records, rig.library, [a, c], 'Battle');
    expect(rig.records.all().map((sound) => sound.name)).toEqual(['c']);
    expect(tagsOf(c)).toEqual(['Battle']);
  });

  it('keeps what a record holds', async () => {
    await recordsForFiles(rig.records, rig.library, [c]);
    rig.records.update([rig.records.all()[0]!.id], { trimDb: -3, tags: ['Old'] });
    await addTag(rig.records, rig.library, [c], 'New');
    expect(rig.records.all()[0]).toMatchObject({ trimDb: -3, tags: ['Old', 'New'] });
  });

  it('a press on a menu\'s tag adds it to the files that lack it, only then takes it off them all, and writes each by what it holds', async () => {
    await addTag(rig.records, rig.library, [a], 'Dawn');
    await addTag(rig.records, rig.library, [c], 'Rest');
    await toggleTag(rig.records, rig.library, [a, c], 'Dawn');
    expect(tagsOf(a)).toEqual(['Dawn']);
    expect(tagsOf(c)).toEqual(['Rest', 'Dawn']);
    await toggleTag(rig.records, rig.library, [a, c], 'dawn');
    expect(tagsOf(a)).toEqual([]);
    expect(tagsOf(c)).toEqual(['Rest']);
  });

  it('taking one off makes no record, and leaves a folder\'s name', async () => {
    takeTagOff(rig.records, rig.library, [a, c], 'Battle');
    expect(rig.records.all()).toEqual([]);
    await toggleTag(rig.records, rig.library, [a, b], 'Battle');
    expect(rig.records.all()).toEqual([]);
    expect(holdsTag(tagsOfFiles(rig.records.all(), rig.library, [a])[0]!, 'battle')).toBe(true);
  });

  it('renames on every record holding it, in both roots, and leaves the rest', async () => {
    await addTag(rig.records, rig.library, [a, c, rain], 'Night');
    await addTag(rig.records, rig.library, [b], 'Other');
    expect(tracksHolding(rig.records.all(), rig.library, 'night')).toBe(3);
    renameTag(rig.records, 'night', 'Dusk');
    for (const file of [a, c, rain]) expect(tagsOf(file)).toEqual(['Dusk']);
    expect(tagsOf(b)).toEqual(['Other']);
  });

  it('a rename onto a tag a record holds makes them one, and may change only the case', async () => {
    await addTag(rig.records, rig.library, [c], 'Night');
    await addTag(rig.records, rig.library, [c], 'Dusk');
    renameTag(rig.records, 'Night', 'dusk');
    expect(tagsOf(c)).toEqual(['dusk']);
    renameTag(rig.records, 'dusk', 'DUSK');
    expect(tagsOf(c)).toEqual(['DUSK']);
  });

  it('removes from every record holding it, in both roots, and a record stays', async () => {
    await addTag(rig.records, rig.library, [c, rain], 'Night');
    removeTag(rig.records, 'NIGHT');
    expect(tagsOf(c)).toEqual([]);
    expect(tagsOf(rain)).toEqual([]);
    expect(rig.records.all()).toHaveLength(2);
    expect(tracksHolding(rig.records.all(), rig.library, 'Night')).toBe(0);
  });

  it('never rewrites a record a newer Atlas wrote', async () => {
    rig.records.add([{ ...stored(['Night'], 'atlas-sound:music/c.mp3'), id: 'newer', format: 99 } as StoredSound]);
    removeTag(rig.records, 'Night');
    renameTag(rig.records, 'Night', 'Dusk');
    expect(rig.records.all()[0]?.tags).toEqual(['Night']);
  });

  describe('its menus', () => {
    const itemsOf = (entries: readonly ContextMenuEntry[]): Extract<ContextMenuEntry, { type: 'item' }>[] => entries.flatMap((entry) => (entry.type === 'item' ? [entry] : []));
    const menuActions = (held: (files: readonly LibraryFile[]) => ReturnType<LibraryActions['tagsOf']>, tracks = 0): LibraryActions => ({
      tagsOf: held,
      onRecords: () => () => undefined,
      toggleTag: vi.fn(),
      askNewTag: vi.fn(),
      tracksWithTag: () => tracks,
      askRenameTag: vi.fn(),
      askRemoveTag: vi.fn(),
    } as unknown as LibraryActions);
    const rootTag = (name: string): { key: string; name: string; count: number } => ({ key: name.toLowerCase(), name, count: 1 });
    const childrenOf = (entry: ContextMenuEntry): ContextMenuEntry[] => {
      if (entry.type !== 'submenu' || typeof entry.children !== 'function') throw new Error('Not a live submenu');
      return entry.children();
    };

    it('a row\'s ticks a tag only where every file has it, and stays open on a press', () => {
      const actions = menuActions(() => [{ own: ['Night'], folders: [] }, { own: [], folders: [] }]);
      const [night] = itemsOf(childrenOf(tagsSubmenu(actions, [a, c], [rootTag('Night')])));
      expect(night).toMatchObject({ label: 'Night', checked: false, keepOpen: true, disabled: false });
      night!.onClick();
      expect(actions.toggleTag).toHaveBeenCalledWith([a, c], 'Night');
    });

    it('a tag a folder gives every file is ticked and fixed, and says why', () => {
      const [battle] = itemsOf(childrenOf(tagsSubmenu(menuActions(() => [{ own: [], folders: ['Battle'] }]), [a], [rootTag('Battle')])));
      expect(battle).toMatchObject({ checked: true, disabled: true, description: 'Comes from a folder' });
    });

    it('a tag a folder gives only some files can still be pressed for the others', () => {
      const [battle] = itemsOf(childrenOf(tagsSubmenu(menuActions(() => [{ own: [], folders: ['Battle'] }, { own: [], folders: [] }]), [a, c], [rootTag('Battle')])));
      expect(battle).toMatchObject({ checked: false, disabled: false });
    });

    it('ends in a new tag', () => {
      const actions = menuActions(() => [{ own: [], folders: [] }]);
      const items = itemsOf(childrenOf(tagsSubmenu(actions, [c], [])));
      expect(items.map((item) => item.label)).toEqual(['New tag']);
      items[0]!.onClick();
      expect(actions.askNewTag).toHaveBeenCalledWith([c]);
    });

    it('a tag only folder names give cannot be renamed or removed from the rail', () => {
      const items = itemsOf(tagRowMenu(menuActions(() => [], 0), 'Battle'));
      expect(items.map((item) => [item.label, item.disabled, item.description])).toEqual([['Rename', true, 'Comes from a folder'], ['Remove', true, 'Comes from a folder']]);
    });

    it('a tag a record holds can', () => {
      const actions = menuActions(() => [], 2);
      const [rename, remove] = itemsOf(tagRowMenu(actions, 'Night'));
      expect(rename?.disabled).toBe(false);
      expect(remove?.disabled).toBe(false);
      remove!.onClick();
      expect(actions.askRemoveTag).toHaveBeenCalledWith('Night');
    });
  });

  describe('on the page', () => {
    let host: HTMLElement;

    beforeEach(async () => {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
      rig.locations.music.addFile('Battle/Bosses/d.mp3');
      host = document.body.createDiv();
      rig.mount(host);
      await waitFor(() => expect(titles()).toEqual(['a', 'b', 'c', 'd']));
    });

    afterEach(() => {
      host.remove();
      Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
      vi.mocked(promptForText).mockReset();
    });

    const titles = (): (string | null)[] => [...host.querySelectorAll('.atlas-sound-lib__row .atlas-sound-lib__title')].map((title) => title.textContent);
    const tagRow = (name: string, root: string = 'Music'): HTMLButtonElement => {
      const row = [...host.querySelectorAll<HTMLButtonElement>(`section[aria-label="${root}"] .atlas-sound-lib__tag`)].find((one) => one.querySelector('span')?.textContent === name);
      if (!row) throw new Error(`No tag ${name}`);
      return row;
    };
    const tagNames = (root = 'Music'): (string | null)[] => [...host.querySelectorAll(`section[aria-label="${root}"] .atlas-sound-lib__tag`)].map((row) => row.querySelector('span')?.textContent ?? null);
    const pressButton = (label: string): void => {
      const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((one) => one.textContent === label);
      if (!button) throw new Error(`No button ${label}`);
      fireEvent.click(button);
    };

    it('lists everything below a root flat, its tags in the rail with their counts, and browsing writes nothing', () => {
      expect(tagNames()).toEqual(['Battle', 'Bosses']);
      expect(tagRow('Battle').querySelector('small')?.textContent).toBe('3');
      expect(tagRow('Bosses').querySelector('small')?.textContent).toBe('1');
      expect(host.querySelector('.atlas-sound-lib__row--folder')).toBeNull();
      fireEvent.click(tagRow('Battle'));
      fireEvent.click(tagRow('Bosses'));
      fireEvent.click(host.querySelector<HTMLElement>('.atlas-sound-lib__root-name')!);
      expect(rig.records.all()).toEqual([]);
    });

    it('a press narrows, a second tag narrows further, and a press on the root shows all again', () => {
      fireEvent.click(tagRow('Battle'));
      expect(titles()).toEqual(['a', 'b', 'd']);
      expect(tagRow('Battle').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(tagRow('Bosses'));
      expect(titles()).toEqual(['d']);
      expect(host.querySelector('.atlas-sound-lib__crumb')).toBeNull();
      expect(rig.library.place.current).toEqual({ kind: 'music', tags: ['Battle', 'Bosses'] });
      fireEvent.click(tagRow('Battle'));
      expect(titles()).toEqual(['d']);
      fireEvent.click(host.querySelector<HTMLElement>('.atlas-sound-lib__root-name')!);
      expect(titles()).toEqual(['a', 'b', 'c', 'd']);
      expect(rig.library.place.current.tags).toEqual([]);
    });

    it('shows a row\'s tags beside its name, and a search hit where it lies', async () => {
      const row = (title: string): Element => [...host.querySelectorAll('.atlas-sound-lib__row')].find((one) => one.querySelector('.atlas-sound-lib__title')?.textContent === title)!;
      expect(row('d').querySelector('.atlas-sound-lib__where')?.textContent).toBe('Battle · Bosses');
      expect(row('c').querySelector('.atlas-sound-lib__where')).toBeNull();
      fireEvent.change(host.querySelector('.atlas-sound-lib__search input')!, { target: { value: 'Bosses' } });
      await waitFor(() => expect(titles()).toEqual(['d']));
      expect(row('d').querySelector('.atlas-sound-lib__where')?.textContent).toBe('Music / Battle / Bosses');
    });

    it('rows dropped on a tag get it, with a record only for those it writes to, and the row shows the target while they are held', async () => {
      const files = [fileOf('music', 'c.mp3'), fileOf('music', 'Battle/a.mp3')];
      const dataTransfer = { types: [SOUND_DRAG_TYPE], items: [], files: [], getData: () => JSON.stringify({ files }) } as unknown as DataTransfer;
      fireEvent.dragOver(tagRow('Battle'), { dataTransfer });
      expect(tagRow('Battle').classList.contains('atlas-sound-lib__tag--target')).toBe(true);
      fireEvent.drop(tagRow('Battle'), { dataTransfer });
      expect(tagRow('Battle').classList.contains('atlas-sound-lib__tag--target')).toBe(false);
      await waitFor(() => expect(rig.records.all().map((sound) => sound.name)).toEqual(['c']));
      expect(rig.records.all()[0]?.tags).toEqual(['Battle']);
      await waitFor(() => expect(tagRow('Battle').querySelector('small')?.textContent).toBe('4'));
    });

    it('files from outside do not light a tag', () => {
      const dataTransfer = { types: ['Files'], items: [{ kind: 'file', type: 'audio/mpeg' }], files: [] } as unknown as DataTransfer;
      fireEvent.dragOver(tagRow('Battle'), { dataTransfer });
      expect(tagRow('Battle').classList.contains('atlas-sound-lib__tag--target')).toBe(false);
    });

    it('a tag in records appears in the rail, and goes with its last track', async () => {
      const file = fileOf('music', 'c.mp3');
      await act(async () => { await addTag(rig.records, rig.library, [file], 'Dawn'); });
      await waitFor(() => expect(tagNames()).toEqual(['Battle', 'Bosses', 'Dawn']));
      fireEvent.click(tagRow('Dawn'));
      expect(titles()).toEqual(['c']);
      await act(async () => { takeTagOff(rig.records, rig.library, [file], 'Dawn'); });
      await waitFor(() => expect(tagNames()).toEqual(['Battle', 'Bosses']));
      expect(titles()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('Play all plays what is listed; Play these only what the tags leave', async () => {
      const list = vi.spyOn(rig.director.desk, 'playList').mockImplementation(() => undefined);
      vi.spyOn(rig.director, 'tap').mockImplementation(() => undefined);
      pressButton('Play all');
      await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
      expect(list.mock.calls[0]?.[0].map((sound) => sound.name)).toEqual(['a', 'b', 'c', 'd']);
      fireEvent.click(tagRow('Bosses'));
      pressButton('Play these');
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      expect(list.mock.calls[1]?.[0].map((sound) => sound.name)).toEqual(['d']);
    });

    it('a record whose file is gone still lists when it matches, and carries its tags', async () => {
      rig.records.add([{ ...stored(['Night'], 'atlas-sound:music/Gone/x.mp3'), id: 'gone', name: 'x' }]);
      await waitFor(() => expect(titles()).toContain('x'));
      expect(tagNames()).toContain('Night');
      fireEvent.click(tagRow('Night'));
      expect(titles()).toEqual(['x']);
      expect(host.querySelector('.atlas-sound-lib__row--waiting')).not.toBeNull();
      fireEvent.click(tagRow('Night'));
      fireEvent.click(tagRow('Battle'));
      expect(titles()).not.toContain('x');
    });

    it('a removal asks with how many tracks it reaches, and a rename keeps the tag selected', async () => {
      const file = fileOf('music', 'c.mp3');
      await act(async () => { await addTag(rig.records, rig.library, [file, fileOf('music', 'Battle/a.mp3')], 'Night'); });
      await waitFor(() => expect(tagNames()).toContain('Night'));
      fireEvent.click(tagRow('Night'));
      vi.mocked(promptForText).mockResolvedValueOnce('Dusk');
      fireEvent.contextMenu(tagRow('Night').parentElement!);
      fireEvent.click(await waitFor(() => document.body.querySelector<HTMLElement>('[role="menuitem"]')!));
      await waitFor(() => expect(tagNames()).toContain('Dusk'));
      expect(rig.library.place.current.tags).toEqual(['Dusk']);
      expect(titles()).toEqual(['a', 'c']);
      await waitFor(() => expect(document.body.querySelector('[role="menu"]')).toBeNull());
      vi.mocked(confirmAction).mockClear();
      fireEvent.contextMenu(tagRow('Dusk').parentElement!);
      const remove = await waitFor(() => [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === 'Remove')!);
      fireEvent.click(remove);
      await waitFor(() => expect(vi.mocked(confirmAction)).toHaveBeenCalledTimes(1));
      expect(vi.mocked(confirmAction).mock.calls[0]?.[0].title).toBe('Remove Dusk from 2 tracks?');
      await waitFor(() => expect(tagNames()).not.toContain('Dusk'));
      expect(titles()).toEqual(['a', 'b', 'c', 'd']);
    });
  });
});

it('nothing of a tag or a folder\'s name reaches the wire', () => {
  const sound = { key: 'hash', frames: 480, gainDb: 0, name: 'Battle', tags: ['Battle'], filePath: 'Battle/a.ogg' };
  const state = { revision: 1, silenced: false, music: { tracks: [sound], startAt: 0, gainDb: 0, fade: { at: 0, ms: 0 }, seed: 1, shuffle: false }, outgoing: [], layers: [], outgoingLayers: [] } as unknown as TableSound;
  expect(JSON.stringify(wireState(state, (key) => ({ key: `wire-${key}`, credit: null })))).not.toMatch(/Battle|tags|filePath/);
});
