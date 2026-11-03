// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { requestUrl } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_FILES, STARTER_FOLDER } from '../../../src/app/soundLibrary/starterPack';
import { showNotice } from '../../../src/app/ui/notice';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let rig: LibraryRig;
let host: HTMLElement;
const offer = (): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>('.atlas-sound-lib__starter');

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.ambience.addFile('Rain.ogg');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
});

afterEach(() => {
  rig.unmount();
  host.remove();
  vi.mocked(requestUrl).mockReset();
  vi.mocked(showNotice).mockClear();
});

describe('the starter ambience offer', () => {
  it('stands under the ambience root while its sounds are not there, and says its size', async () => {
    await act(async () => rig.mount(host));
    await waitFor(() => expect(offer()).not.toBeNull());
    expect(offer()?.closest('[aria-label="Ambience"]')).not.toBeNull();
    expect(offer()?.getAttribute('aria-label')).toMatch(/^Download the starter ambience: \d+ sounds, \d+ MB$/);
  });

  it('is gone where the pack lies already', async () => {
    rig.locations.ambience.addFile(`${STARTER_FOLDER}/${STARTER_FILES[0].name}`);
    await act(async () => rig.mount(host));
    await act(async () => { await rig.library.reread('ambience'); });
    expect(offer()).toBeNull();
  });

  it('says how far it got, and comes back with a notice when the download fails', async () => {
    let fail: (error: Error) => void = () => undefined;
    vi.mocked(requestUrl).mockImplementation(() => new Promise((_, reject) => { fail = reject; }) as ReturnType<typeof requestUrl>);
    await act(async () => rig.mount(host));
    await waitFor(() => expect(offer()).not.toBeNull());
    await act(async () => offer()?.click());
    expect(offer()?.disabled).toBe(true);
    expect(offer()?.textContent).toBe('Downloading… 0%');
    expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ url: `https://assets.atlas-vtt.dev/starter/ambience-1/${STARTER_FILES[0].key}` });
    await act(async () => fail(new Error('offline')));
    await waitFor(() => expect(offer()?.disabled).toBe(false));
    expect(showNotice).toHaveBeenCalledWith('Could not download the starter ambience. Check your connection and try again.', 12_000);
    expect(await rig.locations.ambience.exists(`${STARTER_FOLDER}/${STARTER_FILES[0].name}`)).toBe(false);
  });
});
