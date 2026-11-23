// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { requestUrl } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadManager } from '../../../src/app/downloads/DownloadManager';
import { t } from '../../../src/app/i18n';
import { showAtlasToast, type AtlasToastAction } from '../../../src/app/react/components/AtlasToast';
import { SettingsService } from '../../../src/app/services/SettingsService';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { memoryPluginData } from '../../mocks/pluginData';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));
vi.mock('../../../src/app/react/components/AtlasToast', () => ({ showAtlasToast: vi.fn(() => ({ dismiss: () => undefined })) }));

let rig: LibraryRig;
let host: HTMLElement;
let data: ReturnType<typeof memoryPluginData>;

const section = (name: string): HTMLElement => {
  const found = host.querySelector<HTMLElement>(`section[aria-label="${name}"]`);
  if (!found) throw new Error(`no ${name} root`);
  return found;
};
const ambienceOffer = (): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>('section[aria-label="Ambience"] .atlas-sound-lib__starter');
const musicOffer = (): HTMLButtonElement | null => host.querySelector<HTMLButtonElement>('section[aria-label="Music"] .atlas-sound-lib__starter');

function lastToastAction(): AtlasToastAction {
  const action = vi.mocked(showAtlasToast).mock.calls.at(-1)?.[2];
  if (!action) throw new Error('No toast with an action');
  return action;
}

beforeEach(async () => {
  data = memoryPluginData({});
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' }, data });
  rig.locations.music.addFile('Theme.ogg');
  rig.locations.ambience.addFile('Rain.ogg');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
  vi.mocked(requestUrl).mockImplementation(() => new Promise(() => undefined) as ReturnType<typeof requestUrl>);
  vi.mocked(showAtlasToast).mockClear();
});

afterEach(() => {
  rig.unmount();
  host.remove();
  vi.mocked(requestUrl).mockReset();
});

async function mounted(): Promise<void> {
  await act(async () => rig.mount(host));
  await waitFor(() => expect(ambienceOffer()).not.toBeNull());
  await waitFor(() => expect(musicOffer()).not.toBeNull());
}

describe('dismissing the Sound page offers', () => {
  it('hides the offer, says so with Undo, and keeps the choice in the settings', async () => {
    await mounted();
    await act(async () => within(section('Ambience')).getByRole('button', { name: t('audio.library.offerHide') }).click());
    await waitFor(() => expect(ambienceOffer()).toBeNull());
    expect(musicOffer()).not.toBeNull();
    expect(rig.settings.isSoundOfferHidden('starter-ambience')).toBe(true);
    expect(showAtlasToast).toHaveBeenCalledWith(t('audio.library.offerHidden', { root: 'Ambience' }), expect.any(Number), expect.objectContaining({ label: t('history.undo') }));

    await rig.settings.saveSettingsNow();
    expect(data.stored()).toMatchObject({ hiddenSoundOffers: ['starter-ambience'] });
    const reread = new SettingsService(createInMemoryApp().app, undefined, data);
    await reread.initialize();
    expect(reread.isSoundOfferHidden('starter-ambience')).toBe(true);
  });

  it('comes back with Undo, and the file no longer lists it', async () => {
    await mounted();
    await act(async () => within(section('Music')).getByRole('button', { name: t('audio.library.offerHide') }).click());
    await waitFor(() => expect(musicOffer()).toBeNull());
    await act(async () => lastToastAction().run());
    await waitFor(() => expect(musicOffer()).not.toBeNull());
    await rig.settings.saveSettingsNow();
    expect(JSON.parse(JSON.stringify(data.stored()))).not.toHaveProperty('hiddenSoundOffers');
  });

  it('follows a change another device saved', async () => {
    await mounted();
    data.set({ hiddenSoundOffers: ['starter-music'] });
    await act(async () => rig.settings.reload());
    await waitFor(() => expect(musicOffer()).toBeNull());
    expect(ambienceOffer()).not.toBeNull();
  });

  it('reads anything but a list of ids as nothing dismissed', async () => {
    const settings = new SettingsService(createInMemoryApp().app, undefined, memoryPluginData({ hiddenSoundOffers: 'all' }));
    await settings.initialize();
    expect(settings.isSoundOfferHidden('starter-ambience')).toBe(false);
  });

  it('still offers both downloads in their root\'s ⋯ menu, and a running download of a dismissed offer stays in the downloads', async () => {
    await mounted();
    await act(async () => within(section('Ambience')).getByRole('button', { name: t('audio.library.offerHide') }).click());
    await act(async () => within(section('Music')).getByRole('button', { name: t('audio.library.offerHide') }).click());
    await waitFor(() => expect(ambienceOffer()).toBeNull());
    await waitFor(() => expect(musicOffer()).toBeNull());

    await act(async () => within(section('Ambience')).getByRole('button', { name: t('audio.library.rootMenu', { name: 'Ambience' }) }).click());
    await act(async () => screen.getByRole('menuitem', { name: /^Get starter ambience/ }).click());
    expect(DownloadManager.forApp(rig.app).job('starter-ambience')?.state).toBe('downloading');
    await waitFor(() => expect(host.querySelector('.atlas-sound-dl')).not.toBeNull());

    await act(async () => within(section('Music')).getByRole('button', { name: t('audio.library.rootMenu', { name: 'Music' }) }).click());
    expect(screen.getByRole('menuitem', { name: /Get starter music/ }).getAttribute('aria-haspopup')).toBe('menu');
  });
});
