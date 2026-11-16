// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundPane } from '../../../src/app/react/components/dm-screen/sound/SoundPane';
import { MoodStore } from '../../../src/app/soundLibrary/MoodStore';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let rig: LibraryRig;
let host: HTMLElement;

const tiles = (): string[] => [...host.querySelectorAll<HTMLElement>('.atlas-sound-moods__grid .atlas-sound-mood__name')].map((name) => name.textContent ?? '');
const tileKeys = (): (string | null)[] => [...host.querySelectorAll<HTMLElement>('.atlas-sound-moods__grid .atlas-sound-mood__press')].map((press) => press.getAttribute('aria-keyshortcuts'));
const search = (): HTMLInputElement => host.querySelector<HTMLInputElement>('.atlas-sound-lib input[type="search"]')!;
const type = (text: string): void => {
  fireEvent.change(search(), { target: { value: text } });
};

beforeEach(async () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.music.addFile('Battle/a.mp3');
  const moods = MoodStore.forApp(rig.app);
  for (const name of ['Goblin Ambush', 'Tavern Night', 'Goblin Feast']) moods.createMood({ name, fadeSeconds: 2, music: 'none', layers: [] });
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  await act(async () => rig.mount(host, <SoundPane active />));
  await waitFor(() => expect(search()).toBeTruthy());
});

afterEach(() => {
  rig.unmount();
  cleanup();
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  vi.restoreAllMocks();
});

describe('the library search on the Sound page', () => {
  it('narrows the moods beside the library, each keeping the number of its key', async () => {
    await waitFor(() => expect(tiles()).toHaveLength(3));
    type('goblin');
    await waitFor(() => expect(tiles()).toEqual(['Goblin Ambush', 'Goblin Feast']));
    expect(tileKeys()).toEqual(['1', '3']);
  });

  it('shows no mood chips in the library', async () => {
    type('tavern');
    await waitFor(() => expect(tiles()).toEqual(['Tavern Night']));
    const libraryButtons = [...host.querySelectorAll<HTMLElement>('.atlas-sound-lib button')].map((button) => button.textContent);
    expect(libraryButtons).not.toContain('Tavern Night');
    expect(host.querySelector('.atlas-sound-lib [role="group"]')).toBeNull();
  });

  it('says so where no mood matches, and shows them all again once the search is cleared', async () => {
    type('dragon');
    await waitFor(() => expect(host.querySelector('.atlas-sound-moods__none')?.textContent).toBe('No moods found'));
    expect(tiles()).toHaveLength(0);
    type('');
    await waitFor(() => expect(tiles()).toHaveLength(3));
    expect(host.querySelector('.atlas-sound-moods__none')).toBeNull();
  });
});
