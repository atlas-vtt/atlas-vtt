// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectionAfter, type LibraryRow } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import { moodIndexOfCode } from '../../../src/app/react/components/dm-screen/sound/useSoundKeys';
import { screenTakesKey } from '../../../src/app/react/components/dm-screen/screenKeys';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/confirmDialog', () => ({ confirmAction: vi.fn(async () => true) }));

const rowsOf = (host: HTMLElement): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.atlas-sound-lib__row')];
const titles = (host: HTMLElement): (string | null)[] => rowsOf(host).map((row) => row.querySelector('.atlas-sound-lib__title')?.textContent ?? null);
const list = (host: HTMLElement): HTMLElement => host.querySelector<HTMLElement>('.atlas-sound-lib__rows')!;
const activeTitle = (host: HTMLElement): string | null | undefined => host.querySelector('[data-active="true"] .atlas-sound-lib__title')?.textContent;

let rig: LibraryRig;
let host: HTMLElement;
const reachedMap = vi.fn();

beforeEach(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  for (const name of ['Battle/Bosses/x.mp3', 'Battle/a.mp3', 'Battle/b.mp3', 'Battle/c.mp3']) rig.locations.music.addFile(name);
  rig.locations.ambience.addFile('Rain.ogg');
  host = document.body.createDiv();
  window.addEventListener('keydown', reachedMap);
  rig.mount(host);
  await waitFor(() => expect(titles(host)).toContain('Battle'));
  act(() => fireEvent.doubleClick(rowsOf(host)[0]!));
  await waitFor(() => expect(titles(host)).toEqual(['Bosses', 'a', 'b', 'c']));
  list(host).focus();
  reachedMap.mockClear();
});

afterEach(() => {
  window.removeEventListener('keydown', reachedMap);
  rig.unmount();
  cleanup();
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  vi.restoreAllMocks();
});

const press = (key: string, init: KeyboardEventInit = {}): void => {
  act(() => { fireEvent.keyDown(list(host), { key, ...init }); });
};

describe('the keys of the rows', () => {
  it('move through the rows, and Shift selects from the anchor', () => {
    press('ArrowDown');
    expect(activeTitle(host)).toBe('a');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    expect(host.querySelectorAll('[aria-selected="true"]')).toHaveLength(3);
    press('Home');
    expect(activeTitle(host)).toBe('Bosses');
    press('End');
    expect(activeTitle(host)).toBe('c');
    expect(host.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });

  it('Enter opens a folder; ArrowLeft goes back', async () => {
    press('Enter');
    await waitFor(() => expect(titles(host)).toEqual(['x']));
    press('ArrowLeft');
    await waitFor(() => expect(titles(host)).toEqual(['Bosses', 'a', 'b', 'c']));
  });

  it('Enter sends music to the mix as next, with a record only then', async () => {
    const next = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    vi.spyOn(rig.director, 'tap').mockImplementation(() => undefined);
    expect(await rig.assets.getAssets(undefined, 'sound')).toEqual([]);
    press('ArrowDown');
    expect(await rig.assets.getAssets(undefined, 'sound')).toEqual([]);
    press('Enter');
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(next.mock.calls[0]?.[0]).toMatchObject({ kind: 'music', filePath: 'atlas-sound:music/Battle/a.mp3' });
    expect(await rig.assets.getAssets(undefined, 'sound')).toHaveLength(1);
  });

  it('Space previews to the GM alone, and writes nothing', async () => {
    const preview = vi.spyOn(rig.director, 'preview').mockImplementation(() => undefined);
    press('ArrowDown');
    press(' ');
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    expect(preview.mock.calls[0]?.[0]).toMatchObject({ name: 'a' });
    expect(await rig.assets.getAssets(undefined, 'sound')).toEqual([]);
    expect(rig.director.snapshot().mix.table.music).toBeNull();
  });

  it('Delete asks, then moves the selection to the trash', async () => {
    press('ArrowDown');
    press('Delete');
    await waitFor(() => expect(rig.locations.music.files.has('Battle/a.mp3')).toBe(false));
    await waitFor(() => expect(titles(host)).toEqual(['Bosses', 'b', 'c']));
  });

  it('F2 renames in place, keeping the extension, and Escape leaves it', async () => {
    press('ArrowDown');
    press('F2');
    const field = host.querySelector<HTMLInputElement>('.atlas-sound-lib__rename')!;
    expect(field.value).toBe('a');
    act(() => {
      fireEvent.change(field, { target: { value: 'Horns' } });
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    await waitFor(() => expect(rig.locations.music.files.has('Battle/Horns.mp3')).toBe(true));
    await waitFor(() => expect(titles(host)).toContain('Horns'));
    press('End');
    press('F2');
    const again = host.querySelector<HTMLInputElement>('.atlas-sound-lib__rename')!;
    act(() => { fireEvent.keyDown(again, { key: 'Escape' }); });
    expect(host.querySelector('.atlas-sound-lib__rename')).toBeNull();
    expect(rig.locations.music.files.has('Battle/c.mp3')).toBe(true);
  });

  it('never reach the map, whatever they are, and Tab and Escape still do', () => {
    for (const key of ['a', 'Delete', ' ', '1', 'ArrowDown', 'F2', 'Backspace', 'n']) {
      act(() => { fireEvent.keyDown(list(host), { key }); });
      const field = host.querySelector<HTMLInputElement>('.atlas-sound-lib__rename');
      if (field) act(() => { fireEvent.keyDown(field, { key: 'Escape' }); });
    }
    expect(reachedMap).not.toHaveBeenCalled();
    act(() => { fireEvent.keyDown(list(host), { key: 'Tab' }); });
    expect(reachedMap).toHaveBeenCalledTimes(1);
  });

  it('never press a mood: the Sound page leaves them to the library', () => {
    expect(moodIndexOfCode('Digit1')).toBe(0);
    const event = new KeyboardEvent('keydown', { key: '1', code: 'Digit1' });
    Object.defineProperty(event, 'target', { value: list(host) });
    expect(screenTakesKey(event, host, undefined)).toBe(false);
  });
});

it('a press selects, Cmd adds, Shift reaches', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id): LibraryRow => ({ type: 'folder', id, kind: 'music', path: id, name: id }));
  const once = selectionAfter(rows, new Set(), null, 'b', { toggle: false, range: false });
  expect([...once.selected]).toEqual(['b']);
  const added = selectionAfter(rows, once.selected, once.anchor, 'd', { toggle: true, range: false });
  expect([...added.selected].sort()).toEqual(['b', 'd']);
  const reached = selectionAfter(rows, added.selected, 'a', 'c', { toggle: false, range: true });
  expect([...reached.selected]).toEqual(['a', 'b', 'c']);
  expect([...selectionAfter(rows, added.selected, 'b', 'b', { toggle: true, range: false }).selected]).toEqual(['d']);
});
