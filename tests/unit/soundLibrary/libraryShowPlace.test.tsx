// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundPane } from '../../../src/app/react/components/dm-screen/sound/SoundPane';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let rig: LibraryRig;
let host: HTMLElement;

const search = (): HTMLInputElement => host.querySelector<HTMLInputElement>('.atlas-sound-lib input[type="search"]')!;
const titles = (): string[] => [...host.querySelectorAll('.atlas-sound-lib__row .atlas-sound-lib__title')].map((title) => title.textContent ?? '');

beforeEach(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m' } });
  rig.locations.music.addFile('Night of the Wilds/Dawn.mp3');
  rig.locations.music.addFile('Windswept/Breeze.mp3');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  await act(async () => rig.mount(host, <SoundPane active />));
  await waitFor(() => expect(titles()).toEqual(['Breeze', 'Dawn']));
});

afterEach(() => {
  rig.unmount();
  cleanup();
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  vi.restoreAllMocks();
});

describe('a place the library is asked to show', () => {
  it('is shown whole: a search typed earlier is cleared (Show in Sound after an install)', async () => {
    fireEvent.change(search(), { target: { value: 'Wind' } });
    await waitFor(() => expect(titles()).toEqual(['Breeze']));
    act(() => rig.library.place.show('music', ['Night of the Wilds']));
    await waitFor(() => expect(titles()).toEqual(['Dawn']));
    expect(search().value).toBe('');
  });

  it('is shown whole where it was the place shown already', async () => {
    act(() => rig.library.place.show('music', ['Night of the Wilds']));
    await waitFor(() => expect(titles()).toEqual(['Dawn']));
    fireEvent.change(search(), { target: { value: 'Wind' } });
    await waitFor(() => expect(titles()).toEqual(['Breeze']));
    act(() => rig.library.place.show('music', ['Night of the Wilds']));
    await waitFor(() => expect(titles()).toEqual(['Dawn']));
    expect(search().value).toBe('');
  });
});
