// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, createEvent, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundPane } from '../../../src/app/react/components/dm-screen/sound/SoundPane';
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
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.music.addFile('Battle/a.mp3');
  rig.locations.ambience.addFile('Rain.ogg');
  host = document.body.createDiv();
  await act(async () => rig.mount(host, <SoundPane active headerSlot={null} />));
});

afterEach(() => {
  rig.unmount();
  cleanup();
  host.remove();
  vi.restoreAllMocks();
});

const aFile = (kind: 'music' | 'ambience', path: string): SoundDrag['files'][number] => ({ kind, path, name: path.split('/').pop()!, size: 5, mtime: 1 });

describe('rows of the library dropped on the desk', () => {
  it('shows where they land while they are held, and takes them into the mix', async () => {
    vi.spyOn(rig.director, 'tap').mockImplementation(() => undefined);
    const next = vi.spyOn(rig.director.desk, 'playNext').mockImplementation(() => undefined);
    const add = vi.spyOn(rig.director.desk, 'addSound').mockReturnValue(true);
    const dataTransfer = rowsDrag({ files: [aFile('music', 'Battle/a.mp3'), aFile('ambience', 'Rain.ogg')], folders: [] });
    await waitFor(() => { fireEvent.dragOver(desk(), { dataTransfer }); expect(strips().dataset.dropTarget).toBe('true'); });

    fireEvent.drop(desk(), { dataTransfer });
    expect(strips().dataset.dropTarget).toBeUndefined();
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(next).toHaveBeenCalledTimes(1);
    expect((await rig.assets.getAssets(undefined, 'sound')).map((sound) => sound.name).sort()).toEqual(['Rain', 'a']);
  });

  it('stops showing when they leave the desk, not when they cross a strip', async () => {
    const dataTransfer = rowsDrag({ files: [], folders: [] });
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

  it('files from outside do not light the desk', () => {
    fireEvent.dragOver(desk(), { dataTransfer: filesDrag('new.mp3') });
    expect(strips().dataset.dropTarget).toBeUndefined();
  });
});

describe('audio from outside dropped on the page', () => {
  const written = (kind: 'music' | 'ambience'): string[] => [...rig.locations[kind].files.keys()];

  it('goes to the root the store names while the moods show', async () => {
    act(() => rig.store.setState({ soundView: 'moods', soundLibraryRoot: 'ambience', soundLibraryFolder: 'Weather' }));
    fireEvent.drop(pane(), { dataTransfer: filesDrag('new.ogg') });
    await waitFor(() => expect(written('ambience')).toContain('new.ogg'));
    expect(written('music')).not.toContain('new.ogg');
  });

  it('goes to the open folder while the library shows, and only once', async () => {
    act(() => rig.store.getState().showSoundLibrary('music', 'Battle'));
    await waitFor(() => expect(host.querySelector('.atlas-sound-lib__rows')).not.toBeNull());
    const write = vi.spyOn(rig.locations.music, 'write');
    fireEvent.drop(desk(), { dataTransfer: filesDrag('over-desk.mp3') });
    await waitFor(() => expect(written('music')).toContain('Battle/over-desk.mp3'));
    fireEvent.drop(host.querySelector('.atlas-sound-lib__rows')!, { dataTransfer: filesDrag('over-rows.mp3') });
    await waitFor(() => expect(written('music')).toContain('Battle/over-rows.mp3'));
    expect(write).toHaveBeenCalledTimes(2);
  });
});
