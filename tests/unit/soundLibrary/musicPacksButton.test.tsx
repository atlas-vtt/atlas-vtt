// @vitest-environment jsdom
import { act, screen, waitFor } from '@testing-library/react';
import { requestUrl } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_FOLDER, MUSIC_PACKS } from '../../../src/app/soundLibrary/musicPacks';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let rig: LibraryRig;
let host: HTMLElement;
const offer = (): HTMLButtonElement | null => [...host.querySelectorAll<HTMLButtonElement>('.atlas-sound-lib__starter')].find((button) => button.textContent?.includes('Vindsvept')) ?? null;

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.music.addFile('Theme.ogg');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
});

afterEach(() => {
  rig.unmount();
  host.remove();
  vi.mocked(requestUrl).mockReset();
});

describe('the music pack offer', () => {
  it('stands under the music root and lists every pack with its size, all of them first', async () => {
    await act(async () => rig.mount(host));
    await waitFor(() => expect(offer()).not.toBeNull());
    expect(offer()?.closest('[aria-label="Music"]')).not.toBeNull();
    await act(async () => offer()?.click());
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
    expect(items[0]).toMatch(/^All packs[\d,]+ tracks · [\d,]+ MB$/);
    // A pack not yet there is a plain row, not a checkbox: choosing it downloads it.
    expect(items.slice(1).map((item) => item.replace(/[\d,]+ tracks? · [\d,]+ MB$/, ''))).toEqual(MUSIC_PACKS.map((pack) => pack.name));
    expect(screen.queryAllByRole('menuitemcheckbox')).toEqual([]);
  });

  it('marks a pack that lies in the music folder already, and leaves once all do', async () => {
    const [first] = MUSIC_PACKS;
    if (!first) throw new Error('no packs');
    const firstPaths = Array.from({ length: first.tracks }, (_, i) => `${MUSIC_FOLDER}/${first.name}/Instrumental/Track ${i}.opus`);
    for (const file of firstPaths) rig.locations.music.addFile(file);
    await act(async () => rig.mount(host));
    await act(async () => { await rig.library.settle('music', firstPaths); });
    await waitFor(() => expect(offer()).not.toBeNull());
    await act(async () => offer()?.click());
    expect(screen.getByRole('menuitemcheckbox', { name: new RegExp(first.name) }).getAttribute('aria-checked')).toBe('true');
    const paths = MUSIC_PACKS.flatMap((pack) => Array.from({ length: pack.tracks }, (_, i) => `${MUSIC_FOLDER}/${pack.name}/Instrumental/Track ${i}.opus`));
    for (const path of paths) rig.locations.music.addFile(path);
    await act(async () => { await rig.library.settle('music', paths); });
    await waitFor(() => expect(offer()).toBeNull());
  });
});
