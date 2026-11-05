// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, createEvent, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { SoundPane } from '../../../src/app/react/components/dm-screen/sound/SoundPane';
import type { Mood } from '../../../src/app/sound/soundTypes';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import { SOUND_DRAG_TYPE, type SoundDrag } from '../../../src/app/soundLibrary/soundDrag';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

const rowsDrag = (drag: SoundDrag): Partial<DataTransfer> => ({
  types: [SOUND_DRAG_TYPE],
  items: [] as unknown as DataTransferItemList,
  files: [] as unknown as FileList,
  getData: () => JSON.stringify(drag),
});
const filesDrag = (...names: string[]): Partial<DataTransfer> => ({
  types: ['Files'],
  items: names.map(() => ({ kind: 'file', type: '' })) as unknown as DataTransferItemList,
  files: names.map((name) => new File(['AUDIO'], name)) as unknown as FileList,
  getData: () => '',
});

let rig: LibraryRig;
let host: HTMLElement;
const desk = (): HTMLElement => host.querySelector<HTMLElement>('.atlas-sound-desk')!;
const strips = (): HTMLElement => host.querySelector<HTMLElement>('.atlas-sound-strips')!;
const pane = (): HTMLElement => host.querySelector<HTMLElement>('.atlas-sound-pane')!;

beforeEach(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.music.addFile('Battle/a.mp3');
  rig.locations.ambience.addFile('Rain.ogg');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  await act(async () => rig.mount(host, <SoundPane active />));
});

afterEach(() => {
  rig.unmount();
  cleanup();
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  vi.restoreAllMocks();
});

const moodIn = (of: LibraryRig): Mood => MoodStore.forApp(of.app).createMood({ name: 'Tavern', fadeSeconds: 2, music: 'none', layers: [] });

const aFile = (kind: 'music' | 'ambience', path: string): SoundDrag['files'][number] => ({ kind, path, name: path.split('/').pop()!, size: 5, mtime: 1 });

describe('rows of the library dropped on the desk', () => {
  it('shows where they land while they are held, and takes them into the mix', async () => {
    vi.spyOn(rig.director, 'tap').mockImplementation(() => undefined);
    const next = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    const add = vi.spyOn(rig.director.desk, 'addSound').mockReturnValue(true);
    const dataTransfer = rowsDrag({ files: [aFile('music', 'Battle/a.mp3'), aFile('ambience', 'Rain.ogg')] });
    await waitFor(() => { fireEvent.dragOver(desk(), { dataTransfer }); expect(strips().dataset.dropTarget).toBe('true'); });

    fireEvent.drop(desk(), { dataTransfer });
    expect(strips().dataset.dropTarget).toBeUndefined();
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(next).toHaveBeenCalledTimes(1);
    expect(rig.records.all().map((sound) => sound.name).sort()).toEqual(['Rain', 'a']);
  });

  it('stops showing when they leave the desk, not when they cross a strip', async () => {
    const dataTransfer = rowsDrag({ files: [] });
    await waitFor(() => { fireEvent.dragOver(desk(), { dataTransfer }); expect(strips().dataset.dropTarget).toBe('true'); });
    const leaveFor = (relatedTarget: Element): void => {
      const leave = createEvent.dragLeave(desk(), { dataTransfer });
      Object.defineProperty(leave, 'relatedTarget', { value: relatedTarget });
      fireEvent(desk(), leave);
    };
    leaveFor(strips());
    expect(strips().dataset.dropTarget).toBe('true');
    leaveFor(document.body);
    expect(strips().dataset.dropTarget).toBeUndefined();
  });

  it('says, while nothing plays, what to press and where a track lands', async () => {
    await waitFor(() => expect(strips().querySelector('.atlas-sound-desk__idle')?.textContent).toContain('Play a track or drop one here'));
    moodIn(rig);
    await waitFor(() => expect(strips().querySelector('.atlas-sound-desk__idle')?.textContent).toContain('Press a mood or drop a track here'));
    expect([...strips().querySelectorAll('.atlas-sound-desk__key')].map((key) => key.textContent)).toEqual(['1Moods', '/Search']);
  });

  it('files from outside do not light the desk', () => {
    fireEvent.dragOver(desk(), { dataTransfer: filesDrag('new.mp3') });
    expect(strips().dataset.dropTarget).toBeUndefined();
  });
});

describe('audio from outside dropped on the page', () => {
  const written = (kind: 'music' | 'ambience'): string[] => [...rig.locations[kind].files.keys()];

  it('goes to the top of the open root from anywhere on the page, and only once', async () => {
    await waitFor(() => expect(host.querySelector('.atlas-sound-lib__rows')).not.toBeNull());
    const write = vi.spyOn(rig.locations.music, 'write');
    fireEvent.drop(desk(), { dataTransfer: filesDrag('over-desk.mp3') });
    await waitFor(() => expect(written('music')).toContain('over-desk.mp3'));
    fireEvent.drop(host.querySelector('.atlas-sound-lib__rows')!, { dataTransfer: filesDrag('over-rows.mp3') });
    await waitFor(() => expect(written('music')).toContain('over-rows.mp3'));
    expect(write).toHaveBeenCalledTimes(2);
    fireEvent.drop(pane(), { dataTransfer: filesDrag('over-page.mp3') });
    await waitFor(() => expect(written('music')).toContain('over-page.mp3'));
  });
});

describe('the keys of the page', () => {
  const rows = (): HTMLElement => host.querySelector<HTMLElement>('.atlas-sound-lib__rows')!;
  const reachedMap = vi.fn();

  beforeEach(async () => {
    await waitFor(() => expect(host.querySelector('.atlas-sound-lib__rows')).not.toBeNull());
    window.addEventListener('keydown', reachedMap);
    reachedMap.mockClear();
  });

  afterEach(() => window.removeEventListener('keydown', reachedMap));

  it('press moods by digit from a row of the library, and a field keeps its digits', async () => {
    const press = vi.spyOn(rig.director, 'press').mockImplementation(() => undefined);
    const mood = moodIn(rig);
    await waitFor(() => expect(host.querySelector('[data-sound-mood]')).not.toBeNull());
    fireEvent.keyDown(rows(), { key: '1', code: 'Digit1' });
    expect(press).toHaveBeenCalledTimes(1);
    expect(press.mock.calls[0]).toContainEqual(mood);
    fireEvent.keyDown(host.querySelector<HTMLElement>('.atlas-sound-lib__search input')!, { key: '1', code: 'Digit1' });
    expect(press).toHaveBeenCalledTimes(1);
    expect(reachedMap).not.toHaveBeenCalled();
  });

  it('leave Enter to a row of the library, and make it the next mood elsewhere', async () => {
    const next = vi.spyOn(rig.director, 'pressNext').mockImplementation(() => undefined);
    const opened = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    vi.spyOn(rig.director, 'tap').mockImplementation(() => undefined);
    await waitFor(() => expect(host.querySelector('.atlas-sound-lib__row')).not.toBeNull());
    rows().focus();
    fireEvent.keyDown(rows(), { key: 'Enter', code: 'Enter' });
    expect(next).not.toHaveBeenCalled();
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(reachedMap).not.toHaveBeenCalled();
  });

  it('make Mod+→ the next track, Space the music\'s pause and / the search, leaving Space to the library', async () => {
    const skip = vi.spyOn(rig.director.desk, 'skip').mockImplementation(() => undefined);
    const next = vi.spyOn(rig.director, 'pressNext').mockImplementation(() => undefined);
    const pause = vi.spyOn(rig.director.desk, 'togglePause').mockImplementation(() => undefined);
    await waitFor(() => expect(host.querySelector('.atlas-sound-lib__row')).not.toBeNull());
    fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter', shiftKey: true });
    expect(skip).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    // No longer the page's: it goes on to whoever wants it.
    reachedMap.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowRight', code: 'ArrowRight', metaKey: Platform.isMacOS, ctrlKey: !Platform.isMacOS });
    expect(skip).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(host.querySelector<HTMLElement>('.atlas-sound-lib__search input')!, { key: 'ArrowRight', code: 'ArrowRight', metaKey: Platform.isMacOS, ctrlKey: !Platform.isMacOS });
    expect(skip).toHaveBeenCalledTimes(1);
    rows().focus();
    fireEvent.keyDown(rows(), { key: ' ', code: 'Space' });
    expect(pause).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(pause).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: '/', code: 'Slash' });
    expect(document.activeElement).toBe(host.querySelector('.atlas-sound-lib__search input'));
    expect(reachedMap).not.toHaveBeenCalled();
  });

  it('make Backspace Stop all, also from a row, unless a field has focus; the arrows stay the library\'s', () => {
    const silence = vi.spyOn(rig.director.desk, 'toggleSilence').mockImplementation(() => undefined);
    fireEvent.keyDown(rows(), { key: 'Backspace', code: 'Backspace' });
    expect(silence).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(host.querySelector<HTMLElement>('.atlas-sound-lib__search input')!, { key: 'Backspace', code: 'Backspace' });
    expect(silence).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(rows(), { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.keyDown(rows(), { key: 'Delete', code: 'Delete' });
    expect(silence).toHaveBeenCalledTimes(1);
    expect(reachedMap).not.toHaveBeenCalled();
  });
});
